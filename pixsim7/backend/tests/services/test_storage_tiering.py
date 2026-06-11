"""
Storage tiering — roots registry + TieredStorageService routing.

Covers the Phase A/B surface of plan ``media-storage-tiering``:
- roots registry parsing (default local-only; S3 spec; bad-entry skips)
- per-root routing + root-scoped content-addressed dedup
- get_path / ensure_local_copy behavior for local vs non-local backends
- S3StorageService presigned-URL signing (local, no server) + get_path raising
- default get_storage_service() == single local root (no behavior change)

No live S3 server is needed: routing is exercised with two LocalStorageService
backends in temp dirs, and a small non-local stub validates ensure_local_copy's
download path.
"""
from __future__ import annotations

import os
import tempfile

import pytest

from pixsim7.backend.main.services.storage import roots as roots_mod
from pixsim7.backend.main.services.storage.placement import (
    ARCHIVE_ROOT_ID,
    resolve_storage_root_id,
    should_archive,
)
from pixsim7.backend.main.services.storage.roots import (
    LOCAL_ROOT_ID,
    get_root_specs,
    reset_root_specs_cache,
)
from pixsim7.backend.main.services.storage.storage_service import (
    LocalStorageService,
    S3StorageService,
    StorageService,
    TieredStorageService,
    get_storage_service,
    set_storage_service,
)


# --------------------------------------------------------------------------- #
# roots registry
# --------------------------------------------------------------------------- #

def _set_roots_json(monkeypatch, value):
    monkeypatch.setattr(roots_mod.settings, "media_storage_roots", value, raising=False)
    reset_root_specs_cache()


def test_roots_default_local_only(monkeypatch):
    _set_roots_json(monkeypatch, None)
    specs = get_root_specs()
    assert set(specs) == {LOCAL_ROOT_ID}
    assert specs[LOCAL_ROOT_ID].kind == "local"
    reset_root_specs_cache()


def test_roots_parse_s3(monkeypatch):
    _set_roots_json(
        monkeypatch,
        '[{"id":"archive","kind":"s3","endpoint_url":"http://10.243.1.2:9000",'
        '"bucket":"pixsim-archive","access_key":"ak","secret_key":"sk"}]',
    )
    specs = get_root_specs()
    assert set(specs) == {LOCAL_ROOT_ID, "archive"}
    archive = specs["archive"]
    assert archive.kind == "s3"
    assert archive.config["bucket"] == "pixsim-archive"
    assert "id" not in archive.config and "kind" not in archive.config
    reset_root_specs_cache()


@pytest.mark.parametrize(
    "raw",
    [
        "not json",
        '{"id":"x"}',  # not a list
        '[{"kind":"s3"}]',  # missing id
        '[{"id":"archive"}]',  # missing kind
        '[{"id":"local","kind":"local"}]',  # reserved id
        '[{"id":"weird","kind":"ftp"}]',  # unknown kind
    ],
)
def test_roots_skips_bad_entries(monkeypatch, raw):
    _set_roots_json(monkeypatch, raw)
    specs = get_root_specs()
    # Bad entries are dropped; 'local' always survives, nothing else slips in.
    assert set(specs) == {LOCAL_ROOT_ID}
    reset_root_specs_cache()


# --------------------------------------------------------------------------- #
# TieredStorageService routing + dedup
# --------------------------------------------------------------------------- #

def _two_root_tier():
    local = LocalStorageService(root_path=tempfile.mkdtemp())
    archive = LocalStorageService(root_path=tempfile.mkdtemp())
    return TieredStorageService({LOCAL_ROOT_ID: local, "archive": archive})


@pytest.mark.asyncio
async def test_routing_and_root_scoped_dedup():
    tier = _two_root_tier()
    key = await tier.store_with_hash(
        1, "a" * 64, b"video-bytes", extension=".mp4", root_id="archive"
    )
    # Stored only on archive — local must NOT see it (dedup/existence is per-root).
    assert await tier.exists(key, root_id="archive") is True
    assert await tier.exists(key, root_id="local") is False
    # Default root_id resolves to local.
    assert await tier.exists(key) is False
    assert await tier.get(key, root_id="archive") == b"video-bytes"


@pytest.mark.asyncio
async def test_same_content_can_live_on_two_roots():
    tier = _two_root_tier()
    sha = "c" * 64
    k1 = await tier.store_with_hash(1, sha, b"dup", extension=".mp4", root_id="local")
    k2 = await tier.store_with_hash(1, sha, b"dup", extension=".mp4", root_id="archive")
    assert k1 == k2  # root-agnostic key
    assert await tier.exists(k1, root_id="local") is True
    assert await tier.exists(k2, root_id="archive") is True


@pytest.mark.asyncio
async def test_unknown_root_falls_back_to_local():
    tier = _two_root_tier()
    await tier.store_with_hash(1, "d" * 64, b"x", extension=".mp4", root_id="local")
    key = tier.get_content_addressed_key(1, "d" * 64, ".mp4")
    # Unknown root id degrades to local rather than raising.
    assert await tier.exists(key, root_id="does-not-exist") is True


def test_get_path_routes_to_correct_root():
    tier = _two_root_tier()
    key = "u/1/content/ab/" + "b" * 64 + ".mp4"
    p_local = tier.get_path(key, root_id="local")
    p_archive = tier.get_path(key, root_id="archive")
    assert p_local != p_archive
    assert p_local.endswith(os.path.join("ab", "b" * 64 + ".mp4"))


def test_content_addressed_key_is_root_agnostic():
    tier = _two_root_tier()
    assert (
        tier.get_content_addressed_key(7, "e" * 64, ".mp4")
        == "u/7/content/ee/" + "e" * 64 + ".mp4"
    )


# --------------------------------------------------------------------------- #
# placement policy
# --------------------------------------------------------------------------- #

_ARCHIVE_JSON = (
    '[{"id":"archive","kind":"s3","endpoint_url":"http://x:9000",'
    '"bucket":"b","access_key":"ak","secret_key":"sk"}]'
)


def test_placement_video_local_when_no_archive(monkeypatch):
    _set_roots_json(monkeypatch, None)
    assert resolve_storage_root_id("video") == LOCAL_ROOT_ID
    reset_root_specs_cache()


def test_placement_video_to_archive_when_configured(monkeypatch):
    _set_roots_json(monkeypatch, _ARCHIVE_JSON)
    assert resolve_storage_root_id("video") == ARCHIVE_ROOT_ID
    reset_root_specs_cache()


def test_placement_image_stays_local_even_with_archive(monkeypatch):
    _set_roots_json(monkeypatch, _ARCHIVE_JSON)
    assert resolve_storage_root_id("image") == LOCAL_ROOT_ID
    reset_root_specs_cache()


def test_placement_accepts_enum_like(monkeypatch):
    class _MT:
        value = "video"

    _set_roots_json(monkeypatch, _ARCHIVE_JSON)
    assert resolve_storage_root_id(_MT()) == ARCHIVE_ROOT_ID
    reset_root_specs_cache()


def test_should_archive(monkeypatch):
    _set_roots_json(monkeypatch, _ARCHIVE_JSON)
    # local video should move; already-archived video should not; image never.
    assert should_archive("video", LOCAL_ROOT_ID) is True
    assert should_archive("video", None) is True
    assert should_archive("video", ARCHIVE_ROOT_ID) is False
    assert should_archive("image", LOCAL_ROOT_ID) is False
    reset_root_specs_cache()


# --------------------------------------------------------------------------- #
# ensure_local_copy + local_path_if_local
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_local_path_if_local():
    local = LocalStorageService(root_path=tempfile.mkdtemp())
    tier = TieredStorageService({LOCAL_ROOT_ID: local, "archive": _NonLocalStub()})
    key = "u/1/content/ab/" + "b" * 64 + ".mp4"
    # Local root → a real path; non-local root → None.
    assert tier.local_path_if_local(key, LOCAL_ROOT_ID) is not None
    assert tier.local_path_if_local(key, "archive") is None

@pytest.mark.asyncio
async def test_ensure_local_copy_local_returns_real_path():
    tier = _two_root_tier()
    key = await tier.store_with_hash(1, "a" * 64, b"hi", extension=".mp4", root_id="local")
    path, is_temp = await tier.ensure_local_copy(key, root_id="local")
    assert is_temp is False
    assert os.path.exists(path)


class _NonLocalStub(StorageService):
    """Minimal non-local backend that serves bytes from memory."""

    def __init__(self):
        self._data: dict[str, bytes] = {}

    async def store(self, key, content, content_type=None):
        self._data[key] = content if isinstance(content, bytes) else content.read()
        return key

    async def get(self, key):
        return self._data.get(key)

    async def exists(self, key):
        return key in self._data

    async def delete(self, key):
        return self._data.pop(key, None) is not None

    def get_path(self, key):
        raise NotImplementedError


@pytest.mark.asyncio
async def test_ensure_local_copy_nonlocal_downloads_to_temp():
    stub = _NonLocalStub()
    await stub.store("u/1/content/ab/" + "f" * 64 + ".mp4", b"remote-bytes")
    tier = TieredStorageService(
        {LOCAL_ROOT_ID: LocalStorageService(root_path=tempfile.mkdtemp()), "archive": stub}
    )
    key = "u/1/content/ab/" + "f" * 64 + ".mp4"
    path, is_temp = await tier.ensure_local_copy(key, root_id="archive")
    try:
        assert is_temp is True
        assert path.endswith(".mp4")
        with open(path, "rb") as f:
            assert f.read() == b"remote-bytes"
    finally:
        if is_temp and os.path.exists(path):
            os.unlink(path)


@pytest.mark.asyncio
async def test_ensure_local_copy_missing_raises():
    tier = TieredStorageService(
        {LOCAL_ROOT_ID: LocalStorageService(root_path=tempfile.mkdtemp()), "archive": _NonLocalStub()}
    )
    with pytest.raises(FileNotFoundError):
        await tier.ensure_local_copy("u/1/content/ab/missing.mp4", root_id="archive")


# --------------------------------------------------------------------------- #
# S3StorageService (no live server)
# --------------------------------------------------------------------------- #

def _s3():
    return S3StorageService(
        endpoint_url="http://10.243.1.2:9000",
        bucket="pixsim-archive",
        access_key="ak",
        secret_key="sk",
    )


def test_s3_presigned_url_is_local_signed():
    url = _s3().get_url("u/1/content/ab/" + "b" * 64 + ".mp4")
    assert url.startswith("http://10.243.1.2:9000/pixsim-archive/")
    assert "X-Amz-Signature" in url
    assert "X-Amz-Expires" in url


def test_s3_get_path_raises():
    with pytest.raises(NotImplementedError):
        _s3().get_path("anything")


def test_s3_client_has_bounded_timeouts_and_retries():
    """Every S3 client must carry bounded connect/read timeouts + retries so a
    connection that never establishes (the worker-relocation hang, cp-k) fails
    fast and retryably instead of stalling the job silently."""
    svc = S3StorageService(
        endpoint_url="http://10.243.1.2:9000",
        bucket="pixsim-archive",
        access_key="ak",
        secret_key="sk",
        connect_timeout_seconds=7.0,
        read_timeout_seconds=123.0,
        max_attempts=4,
    )
    cfg = svc._client_config
    assert cfg.connect_timeout == 7.0
    assert cfg.read_timeout == 123.0
    assert cfg.retries == {"max_attempts": 4, "mode": "standard"}
    # The sync presign client inherits the same timeouts (signing is local, but
    # a misconfigured endpoint shouldn't hang the serve path either).
    presign = svc._get_presign_client()
    assert presign.meta.config.connect_timeout == 7.0
    assert presign.meta.config.read_timeout == 123.0


def test_s3_defaults_are_bounded():
    """Defaults (no per-root override) are still bounded, not botocore's open-ended
    behavior — the registry path (_build_backend) relies on these defaults."""
    cfg = _s3()._client_config
    assert cfg.connect_timeout == 10.0
    assert cfg.read_timeout == 300.0
    assert cfg.retries["max_attempts"] == 3


# --------------------------------------------------------------------------- #
# Phase E — ingestion pulls archived originals to a temp working copy
# --------------------------------------------------------------------------- #

@pytest.mark.asyncio
async def test_ensure_local_file_pulls_archived_original_to_temp():
    from types import SimpleNamespace

    from pixsim7.backend.main.services.asset.ingestion import AssetIngestionService

    stub = _NonLocalStub()
    key = "u/1/content/ab/" + "f" * 64 + ".mp4"
    await stub.store(key, b"archived-video-bytes")
    tier = TieredStorageService(
        {LOCAL_ROOT_ID: LocalStorageService(root_path=tempfile.mkdtemp()), "archive": stub}
    )

    # Build the service without __init__ (avoids DB/settings) and inject storage.
    svc = AssetIngestionService.__new__(AssetIngestionService)
    svc.db = None
    svc.storage = tier
    svc.settings = None
    svc._temp_paths = []

    asset = SimpleNamespace(
        id=1, local_path=None, storage_root_id="archive", stored_key=key, remote_url=None
    )
    path = await svc._ensure_local_file(asset)
    try:
        assert path is not None and os.path.exists(path)
        assert path in svc._temp_paths  # tracked for cleanup
        with open(path, "rb") as f:
            assert f.read() == b"archived-video-bytes"
    finally:
        svc._cleanup_temp_files()
    assert not os.path.exists(path)  # cleaned up
    assert svc._temp_paths == []


@pytest.mark.asyncio
async def test_ensure_local_file_archived_missing_returns_none():
    from types import SimpleNamespace

    from pixsim7.backend.main.services.asset.ingestion import AssetIngestionService

    tier = TieredStorageService(
        {LOCAL_ROOT_ID: LocalStorageService(root_path=tempfile.mkdtemp()), "archive": _NonLocalStub()}
    )
    svc = AssetIngestionService.__new__(AssetIngestionService)
    svc.db = None
    svc.storage = tier
    svc.settings = None
    svc._temp_paths = []

    asset = SimpleNamespace(
        id=1, local_path=None, storage_root_id="archive",
        stored_key="u/1/content/ab/missing.mp4", remote_url=None,
    )
    # Archived original not present and no remote_url -> None, nothing tracked.
    assert await svc._ensure_local_file(asset) is None
    assert svc._temp_paths == []


# --------------------------------------------------------------------------- #
# mover — relocate_blob core (DB-free; archive stand-in is a 2nd local backend)
# --------------------------------------------------------------------------- #

def _local_to_archive_tier():
    local = LocalStorageService(root_path=tempfile.mkdtemp())
    archive = LocalStorageService(root_path=tempfile.mkdtemp())
    return TieredStorageService({LOCAL_ROOT_ID: local, "archive": archive})


@pytest.mark.asyncio
async def test_relocate_blob_uploads_verifies_and_is_idempotent(tmp_path):
    from tools.relocate_media import relocate_blob

    tier = _local_to_archive_tier()
    src = tmp_path / "vid.mp4"
    src.write_bytes(b"x" * 1000)
    key = "u/1/content/ab/" + "a" * 64 + ".mp4"

    size = await relocate_blob(tier, key, str(src), "archive")
    assert size == 1000
    assert await tier.exists(key, root_id="archive") is True

    # Re-run resumes cleanly (object already there) — no error, same size.
    assert await relocate_blob(tier, key, str(src), "archive") == 1000


@pytest.mark.asyncio
async def test_relocate_blob_size_mismatch_raises(tmp_path):
    from tools.relocate_media import relocate_blob

    tier = _local_to_archive_tier()
    key = "u/1/content/ab/" + "a" * 64 + ".mp4"
    # Pre-seed the archive with a wrong-size object so the verify step trips.
    await tier.store(key, b"short", root_id="archive")
    src = tmp_path / "vid.mp4"
    src.write_bytes(b"x" * 1000)

    with pytest.raises(RuntimeError):
        await relocate_blob(tier, key, str(src), "archive")


# --------------------------------------------------------------------------- #
# Phase D — serve-path resolution + streaming
# --------------------------------------------------------------------------- #


class _FakeResult:
    def __init__(self, value):
        self._value = value

    def scalar_one_or_none(self):
        return self._value


class _FakeDB:
    def __init__(self, value):
        self._value = value
        self.executed = False

    async def execute(self, *a, **k):
        self.executed = True
        return _FakeResult(self._value)


@pytest.mark.asyncio
async def test_resolve_root_derivative_fastpath_no_db():
    from pixsim7.backend.main.api.v1.media import _resolve_storage_root_id

    db = _FakeDB("archive")  # would return archive IF queried
    assert await _resolve_storage_root_id(db, 1, "u/1/thumbnails/ab/x.jpg") == LOCAL_ROOT_ID
    assert await _resolve_storage_root_id(db, 1, "u/1/previews/x.jpg") == LOCAL_ROOT_ID
    assert db.executed is False  # fast-path never hit the DB


@pytest.mark.asyncio
async def test_resolve_root_content_key_from_db():
    from pixsim7.backend.main.api.v1.media import _resolve_storage_root_id

    assert await _resolve_storage_root_id(_FakeDB("archive"), 1, "u/1/content/ab/x.mp4") == "archive"
    # NULL placement -> local
    assert await _resolve_storage_root_id(_FakeDB(None), 1, "u/1/content/ab/x.mp4") == LOCAL_ROOT_ID


def test_archive_serve_mode_default_and_override(monkeypatch):
    from pixsim7.backend.main.api.v1 import media as media_mod

    monkeypatch.setattr(media_mod.app_settings, "media_archive_serve_mode", "redirect", raising=False)
    assert media_mod._archive_serve_mode() == "redirect"
    monkeypatch.setattr(media_mod.app_settings, "media_archive_serve_mode", "proxy", raising=False)
    assert media_mod._archive_serve_mode() == "proxy"
    monkeypatch.setattr(media_mod.app_settings, "media_archive_serve_mode", "garbage", raising=False)
    assert media_mod._archive_serve_mode() == "redirect"  # invalid -> safe default


@pytest.mark.asyncio
async def test_tiered_open_stream_routes_and_guards():
    class _StreamBackend(StorageService):
        async def open_stream(self, key, range_header=None):
            async def _it():
                yield b"abc"
            return (206 if range_header else 200), {"Accept-Ranges": "bytes"}, "video/mp4", _it()

    tier = TieredStorageService(
        {LOCAL_ROOT_ID: LocalStorageService(root_path=tempfile.mkdtemp()), "archive": _StreamBackend()}
    )
    status, headers, ct, body = await tier.open_stream("k", root_id="archive", range_header="bytes=0-9")
    assert status == 206 and ct == "video/mp4"
    assert b"".join([chunk async for chunk in body]) == b"abc"
    # local backend has no open_stream -> NotImplementedError
    with pytest.raises(NotImplementedError):
        await tier.open_stream("k", root_id=LOCAL_ROOT_ID)


@pytest.mark.asyncio
async def test_proxy_archive_stream_returns_streaming_response():
    from starlette.responses import StreamingResponse

    from pixsim7.backend.main.api.v1.media import _proxy_archive_stream

    class _Req:
        headers = {"range": "bytes=0-"}

    class _Storage:
        async def open_stream(self, key, root_id=None, range_header=None):
            async def _it():
                yield b"x"
            return 206, {"Content-Range": "bytes 0-0/1"}, "video/mp4", _it()

    resp = await _proxy_archive_stream(_Storage(), "u/1/content/ab/x.mp4", "archive", _Req())
    assert isinstance(resp, StreamingResponse)
    assert resp.status_code == 206


@pytest.mark.asyncio
async def test_relocate_blob_hash_verify(tmp_path):
    """verify_hash checks archive-bytes == LOCAL-bytes (upload integrity), and is
    independent of asset.sha256 — a stale/mismatched sha256 must not fail an
    otherwise-intact upload."""
    import hashlib

    from tools.relocate_media import relocate_blob

    tier = _local_to_archive_tier()
    data = b"y" * 500
    sha = hashlib.sha256(data).hexdigest()
    src = tmp_path / "v.mp4"
    src.write_bytes(data)
    key = "u/1/content/cd/" + sha + ".mp4"
    # relocate_blob hashes the LOCAL copy via the storage key, so seed it there.
    await tier.store(key, data, root_id="local")

    # Intact upload (archive == local) passes regardless of any asset.sha256.
    await relocate_blob(tier, key, str(src), "archive", verify_hash=True)

    # A corrupt archive object (same size, different bytes) trips verification.
    await tier.store(key, b"z" * 500, root_id="archive")  # overwrite, upload skipped
    with pytest.raises(RuntimeError):
        await relocate_blob(tier, key, str(src), "archive", verify_hash=True)


# --------------------------------------------------------------------------- #
# default service — no behavior change when only local is configured
# --------------------------------------------------------------------------- #

def test_default_service_is_single_local_tier(monkeypatch):
    _set_roots_json(monkeypatch, None)
    set_storage_service(None)  # force rebuild from registry
    try:
        svc = get_storage_service()
        assert isinstance(svc, TieredStorageService)
        assert svc.has_root(LOCAL_ROOT_ID)
        assert not svc.has_root("archive")
        assert svc.is_local() is True
    finally:
        set_storage_service(None)
        reset_root_specs_cache()


# --------------------------------------------------------------------------- #
# Phase H — health probe (offline vs deleted) + relocation module canonicality
# --------------------------------------------------------------------------- #

@pytest.mark.asyncio
async def test_probe_root_local_online():
    tier = TieredStorageService(
        {LOCAL_ROOT_ID: LocalStorageService(root_path=tempfile.mkdtemp())}
    )
    probe = await tier.probe_root(LOCAL_ROOT_ID)
    assert probe["online"] is True and probe["error"] is None


@pytest.mark.asyncio
async def test_probe_root_nonlocal_health_check_pass_and_fail():
    class _HealthyStub(_NonLocalStub):
        async def health_check(self):
            return None

    class _DownStub(_NonLocalStub):
        async def health_check(self):
            raise ConnectionError("connection refused")

    tier = TieredStorageService(
        {
            LOCAL_ROOT_ID: LocalStorageService(root_path=tempfile.mkdtemp()),
            "healthy": _HealthyStub(),
            "down": _DownStub(),
        }
    )
    assert (await tier.probe_root("healthy"))["online"] is True
    down = await tier.probe_root("down")
    assert down["online"] is False
    assert "refused" in down["error"]


@pytest.mark.asyncio
async def test_probe_root_times_out_offline(monkeypatch):
    """A slow/hung health_check must report offline within the probe ceiling, not
    block the storage-overview tab (the off-network unreachable-archive case)."""
    import asyncio as _asyncio

    import pixsim7.backend.main.services.storage.storage_service as ss

    monkeypatch.setattr(ss, "_PROBE_TIMEOUT_SECONDS", 0.1)

    class _HangingStub(_NonLocalStub):
        async def health_check(self):
            await _asyncio.sleep(5.0)  # never completes within the ceiling

    tier = TieredStorageService(
        {LOCAL_ROOT_ID: LocalStorageService(root_path=tempfile.mkdtemp()), "archive": _HangingStub()}
    )
    probe = await tier.probe_root("archive")
    assert probe["online"] is False
    assert "timed out" in probe["error"]


@pytest.mark.asyncio
async def test_probe_root_no_health_check_is_unknown():
    # _NonLocalStub has no health_check() -> online is None (unknown), not False.
    tier = TieredStorageService(
        {LOCAL_ROOT_ID: LocalStorageService(root_path=tempfile.mkdtemp()), "archive": _NonLocalStub()}
    )
    probe = await tier.probe_root("archive")
    assert probe["online"] is None and probe["error"] is None


@pytest.mark.asyncio
async def test_archive_miss_classifies_offline_vs_deleted():
    from pixsim7.backend.main.api.v1.media import _archive_miss

    class _OfflineStorage:
        async def probe_root(self, root_id):
            return {"online": False, "error": "unreachable"}

    class _UpStorage:
        async def probe_root(self, root_id):
            return {"online": True, "error": None}

    offline = await _archive_miss(_OfflineStorage(), "u/1/content/ab/x.mp4", "archive")
    assert offline.status_code == 503
    assert offline.headers.get("X-Media-State") == "archived-offline"

    deleted = await _archive_miss(_UpStorage(), "u/1/content/ab/x.mp4", "archive")
    assert deleted.status_code == 404


def test_s3_has_health_check():
    # head_bucket-based probe exists on the real S3 backend (no live call here).
    assert callable(getattr(_s3(), "health_check"))


def test_relocation_module_is_canonical_source():
    # The tool re-exports from the shared backend module, not vice-versa.
    import tools.relocate_media as tool
    from pixsim7.backend.main.services.storage import relocation

    assert tool.relocate_blob is relocation.relocate_blob
    assert tool.relocate_one is relocation.relocate_one


# --------------------------------------------------------------------------- #
# DB/UI roots override (apply_storage_roots) — UI-managed archive root
# --------------------------------------------------------------------------- #

def test_apply_storage_roots_overrides_env(monkeypatch):
    from pixsim7.backend.main.services.storage.roots import set_roots_override
    from pixsim7.backend.main.services.storage.storage_service import (
        apply_storage_roots,
        set_storage_service,
    )

    # Env declares no extra roots; a DB/UI override should add one and take over.
    _set_roots_json(monkeypatch, None)
    set_storage_service(None)
    try:
        assert set(get_root_specs()) == {LOCAL_ROOT_ID}

        apply_storage_roots({"roots": [{
            "id": "archive", "kind": "s3", "endpoint_url": "http://10.0.0.1:9000",
            "bucket": "b", "access_key": "ak", "secret_key": "sk",
        }]})
        specs = get_root_specs()
        assert set(specs) == {LOCAL_ROOT_ID, "archive"}
        assert specs["archive"].config["bucket"] == "b"

        # Clearing to an empty set is authoritative (env stays ignored).
        apply_storage_roots({"roots": []})
        assert set(get_root_specs()) == {LOCAL_ROOT_ID}

        # Dropping the override entirely falls back to env.
        set_roots_override(None)
        assert set(get_root_specs()) == {LOCAL_ROOT_ID}
    finally:
        set_roots_override(None)
        set_storage_service(None)
        reset_root_specs_cache()


def test_storage_roots_applier_registered():
    from pixsim7.backend.main.services.system_config import appliers  # noqa: F401
    from pixsim7.backend.main.services.system_config.service import _appliers

    assert "storage_roots" in _appliers


def test_candidate_query_criteria():
    from pixsim7.backend.main.domain.enums import MediaType
    from pixsim7.backend.main.services.storage.relocation import (
        _normalize_media_types,
        candidate_query,
    )

    # media-type normalization: default video, strings -> enums, junk dropped.
    assert _normalize_media_types(None) == [MediaType.VIDEO]
    assert _normalize_media_types(["image", "video"]) == [MediaType.IMAGE, MediaType.VIDEO]
    assert _normalize_media_types(["nope"]) == [MediaType.VIDEO]

    # default (no criteria) is still video-only on the local root.
    default_sql = str(candidate_query(0, None))
    assert "media_type IN" in default_sql

    # Always-on base guards: gallery-content only + skip in-flight ingests.
    assert "asset_kind" in default_sql
    assert "ingest_status" in default_sql

    # all criteria AND into the WHERE clause.
    sql = str(candidate_query(
        10 * 1024 * 1024, 1,
        media_types=["image", "video"],
        older_than_days=30,
        content_ratings=["adult", "explicit"],
    ))
    assert "media_type IN" in sql
    assert "file_size_bytes" in sql
    assert "created_at" in sql
    assert "content_rating IN" in sql

    # exclude_tag_slugs adds a NOT EXISTS guard over the asset_tag/tag join; the
    # default query carries no such clause. Empty / falsy slugs are a no-op.
    assert "NOT (EXISTS" not in default_sql
    assert str(candidate_query(0, None, exclude_tag_slugs=[])) == default_sql
    assert str(candidate_query(0, None, exclude_tag_slugs=[None, ""])) == default_sql

    from pixsim7.backend.main.services.storage.relocation import FAVORITE_TAG_SLUG

    fav_sql = str(candidate_query(0, None, exclude_tag_slugs=[FAVORITE_TAG_SLUG]))
    assert "NOT (EXISTS" in fav_sql
    assert "asset_tag" in fav_sql
    assert "tag.slug IN" in fav_sql

    # Set-membership guards (i3): exclude_set_ids -> NOT EXISTS over
    # asset_set_member (pin a set's members to local); include_set_ids -> a
    # positive EXISTS (restrict to members). Empty/None is a no-op, like tags.
    assert "asset_set_member" not in default_sql
    assert str(candidate_query(0, None, exclude_set_ids=[])) == default_sql
    assert str(candidate_query(0, None, include_set_ids=[])) == default_sql

    excl_set_sql = str(candidate_query(0, None, exclude_set_ids=[5, 6]))
    assert "NOT (EXISTS" in excl_set_sql
    assert "asset_set_member" in excl_set_sql

    incl_set_sql = str(candidate_query(0, None, include_set_ids=[7]))
    assert "asset_set_member" in incl_set_sql
    assert "EXISTS" in incl_set_sql
    # include is a positive EXISTS, not the negated (exclude) form.
    assert "NOT (EXISTS" not in incl_set_sql

    # exclude + include compose: both membership guards present.
    both_set_sql = str(candidate_query(0, None, exclude_set_ids=[5], include_set_ids=[7]))
    assert both_set_sql.count("asset_set_member") >= 2
    assert "NOT (EXISTS" in both_set_sql


def test_restore_candidate_query():
    from pixsim7.backend.main.services.storage.relocation import restore_candidate_query

    # Reverse selector: targets the archive root, NOT local.
    base = str(restore_candidate_query(1, archive_root="archive"))
    assert "storage_root_id" in base
    assert "stored_key IS NOT NULL" in base
    # No video-only default (unlike candidate_query): media_type filter absent
    # unless requested.
    assert "media_type IN" not in base

    # media_types filter applies only when given.
    assert "media_type IN" in str(
        restore_candidate_query(1, archive_root="archive", media_types=["image", "video"])
    )

    # explicit asset_ids -> id IN; set_ids -> EXISTS over asset_set_member.
    by_ids = str(restore_candidate_query(1, archive_root="archive", asset_ids=[10, 11]))
    assert "assets.id IN" in by_ids
    by_sets = str(restore_candidate_query(1, archive_root="archive", set_ids=[3]))
    assert "asset_set_member" in by_sets
    assert "EXISTS" in by_sets
    assert "NOT (EXISTS" not in by_sets  # include (positive), not exclude


# --------------------------------------------------------------------------- #
# Phase G (cp-g) — mover EXECUTION logic: relocate_one / restore_one.
#
# candidate_query SQL is covered above; this exercises the per-asset state
# machine (dry-run vs apply, placement flip, and the root-scoped sibling-delete
# guard) without a live S3 or the FK-heavy assets table. The archive stands in
# as a 2nd local backend, and a tiny fake session controls the only DB read the
# mover makes (the sibling-count) so both branches are deterministic.
# --------------------------------------------------------------------------- #

class _CountResult:
    def __init__(self, n):
        self._n = n

    def scalar(self):
        return self._n


class _CountSession:
    """Async session stand-in for relocate_one/restore_one.

    commit/rollback are no-ops (the mover mutates the passed asset object in
    place, which is all these tests assert); execute() answers the sole query
    the mover runs — the sibling-count — with a configurable value so the
    delete-vs-keep branch can be driven directly.
    """

    def __init__(self, sibling_count=0):
        self.sibling_count = sibling_count
        self.commits = 0

    async def commit(self):
        self.commits += 1

    async def rollback(self):
        pass

    async def execute(self, *a, **k):
        return _CountResult(self.sibling_count)


def _content_key(ch="a"):
    return "u/1/content/" + ch * 2 + "/" + ch * 64 + ".mp4"


@pytest.mark.asyncio
async def test_relocate_one_dry_run_reports_would_move_without_mutating():
    from pixsim7.backend.main.services.storage.relocation import relocate_one
    from types import SimpleNamespace

    tier = _local_to_archive_tier()
    key = _content_key("a")
    data = b"x" * 800
    await tier.store(key, data, root_id="local")
    asset = SimpleNamespace(
        id=1, stored_key=key, sha256="a" * 64, storage_root_id="local",
        local_path=tier.local_path_if_local(key, "local"),
    )
    res = await relocate_one(
        _CountSession(), tier, asset, archive_root="archive", apply=False, verify_hash=False
    )
    assert res["status"] == "would_move"
    assert res["already_uploaded"] is False  # archive empty
    assert res["bytes"] == 800
    # Nothing moved: placement unchanged, archive empty, local blob intact.
    assert asset.storage_root_id == "local"
    assert await tier.exists(key, root_id="archive") is False
    assert await tier.exists(key, root_id="local") is True


@pytest.mark.asyncio
async def test_relocate_one_apply_flips_placement_and_deletes_sole_local():
    from pixsim7.backend.main.services.storage.relocation import relocate_one
    from types import SimpleNamespace

    tier = _local_to_archive_tier()
    key = _content_key("b")
    data = b"y" * 1234
    await tier.store(key, data, root_id="local")
    asset = SimpleNamespace(
        id=1, stored_key=key, sha256="b" * 64, storage_root_id="local",
        local_path=tier.local_path_if_local(key, "local"),
    )
    session = _CountSession(sibling_count=0)  # no other row references the blob
    res = await relocate_one(
        session, tier, asset, archive_root="archive", apply=True, verify_hash=False
    )
    assert res["status"] == "moved"
    assert res["freed_bytes"] == 1234
    assert res["shared_local"] is False
    assert session.commits == 1
    # Placement flipped; local_path cleared (it's derived for archived files).
    assert asset.storage_root_id == "archive"
    assert asset.local_path is None
    # Bytes now on archive, gone from local.
    assert await tier.exists(key, root_id="archive") is True
    assert await tier.exists(key, root_id="local") is False


@pytest.mark.asyncio
async def test_relocate_one_apply_keeps_shared_local_blob():
    """Root-scoped sibling delete: when another asset row still references the
    same content-addressed key on local, the local blob must NOT be deleted."""
    from pixsim7.backend.main.services.storage.relocation import relocate_one
    from types import SimpleNamespace

    tier = _local_to_archive_tier()
    key = _content_key("c")
    await tier.store(key, b"z" * 500, root_id="local")
    asset = SimpleNamespace(
        id=1, stored_key=key, sha256="c" * 64, storage_root_id="local",
        local_path=tier.local_path_if_local(key, "local"),
    )
    session = _CountSession(sibling_count=1)  # a sibling still points at the blob
    res = await relocate_one(
        session, tier, asset, archive_root="archive", apply=True, verify_hash=False
    )
    assert res["status"] == "moved"
    assert res["freed_bytes"] == 0
    assert res["shared_local"] is True
    # Archive has the copy, but the shared local blob survives.
    assert await tier.exists(key, root_id="archive") is True
    assert await tier.exists(key, root_id="local") is True


@pytest.mark.asyncio
async def test_relocate_one_skips_when_local_missing():
    from pixsim7.backend.main.services.storage.relocation import relocate_one
    from types import SimpleNamespace

    tier = _local_to_archive_tier()
    key = _content_key("d")  # never stored locally
    asset = SimpleNamespace(
        id=1, stored_key=key, sha256="d" * 64, storage_root_id="local", local_path=None
    )
    res = await relocate_one(
        _CountSession(), tier, asset, archive_root="archive", apply=True, verify_hash=False
    )
    assert res["status"] == "skipped"
    assert res["reason"] == "local_missing"


@pytest.mark.asyncio
async def test_restore_one_apply_round_trip_and_deletes_archive():
    from pixsim7.backend.main.services.storage.relocation import restore_one
    from types import SimpleNamespace

    tier = _local_to_archive_tier()
    key = _content_key("e")
    data = b"w" * 999
    await tier.store(key, data, root_id="archive")  # starts archived only
    asset = SimpleNamespace(
        id=1, stored_key=key, sha256="e" * 64, storage_root_id="archive", local_path=None
    )
    session = _CountSession(sibling_count=0)
    res = await restore_one(
        session, tier, asset, archive_root="archive", apply=True,
        verify_hash=False, delete_archive=True,
    )
    assert res["status"] == "restored"
    assert res["restored_bytes"] == 999
    assert res["archive_deleted"] is True
    assert session.commits == 1
    # Placement flipped back; local_path is a real path again.
    assert asset.storage_root_id == LOCAL_ROOT_ID
    assert asset.local_path == tier.local_path_if_local(key, LOCAL_ROOT_ID)
    # Bytes now local; archive copy dropped (delete_archive + no siblings).
    assert await tier.exists(key, root_id="local") is True
    assert await tier.exists(key, root_id="archive") is False


@pytest.mark.asyncio
async def test_restore_one_keeps_archive_by_default():
    """delete_archive defaults False — un-archiving must never destroy the only
    verified copy, so the archive object survives a restore."""
    from pixsim7.backend.main.services.storage.relocation import restore_one
    from types import SimpleNamespace

    tier = _local_to_archive_tier()
    key = _content_key("f")
    await tier.store(key, b"q" * 321, root_id="archive")
    asset = SimpleNamespace(
        id=1, stored_key=key, sha256="f" * 64, storage_root_id="archive", local_path=None
    )
    res = await restore_one(
        _CountSession(), tier, asset, archive_root="archive", apply=True, verify_hash=False
    )
    assert res["status"] == "restored"
    assert res["archive_deleted"] is False
    assert await tier.exists(key, root_id="local") is True
    assert await tier.exists(key, root_id="archive") is True  # backup kept


@pytest.mark.asyncio
async def test_single_local_tier_io_matches_local():
    """g5 regression guard: a tier with only 'local' is a straight passthrough to
    LocalStorageService for the full I/O surface — no behavior change."""
    tier = TieredStorageService(
        {LOCAL_ROOT_ID: LocalStorageService(root_path=tempfile.mkdtemp())}
    )
    assert tier.has_root(LOCAL_ROOT_ID) and not tier.has_root("archive")
    assert tier.is_local() is True

    key = "u/1/content/ab/" + "c" * 64 + ".bin"
    await tier.store(key, b"data")
    assert await tier.exists(key) is True
    assert await tier.get(key) == b"data"
    assert tier.local_path_if_local(key) is not None  # real path for local

    # Content-addressed dedup: identical content -> same key, idempotent.
    k1 = await tier.store_with_hash(1, "d" * 64, b"abc", extension=".bin")
    k2 = await tier.store_with_hash(1, "d" * 64, b"abc", extension=".bin")
    assert k1 == k2

    assert await tier.delete(key) is True
    assert await tier.exists(key) is False


# --------------------------------------------------------------------------- #
# g1 — S3StorageService real I/O (store/get/exists/delete/dedup).
#
# Exercises the actual aiobotocore code path against a live S3-compatible store
# (MinIO). moto can't be used: it pulls a botocore newer than aiobotocore 2.19
# supports, so it can't share the process with our async client. Gated on
# PIXSIM_TEST_S3_* env vars so it self-skips in CI / on machines without a store;
# point it at any S3/MinIO bucket to run. Uses a throwaway key namespace and
# cleans up after itself.
# --------------------------------------------------------------------------- #

_LIVE_S3_ENDPOINT = os.environ.get("PIXSIM_TEST_S3_ENDPOINT")


@pytest.mark.asyncio
@pytest.mark.skipif(
    not _LIVE_S3_ENDPOINT,
    reason="set PIXSIM_TEST_S3_ENDPOINT/_BUCKET/_ACCESS_KEY/_SECRET_KEY to run live-S3 I/O",
)
async def test_s3_store_get_exists_delete_dedup_live():
    import hashlib
    import uuid

    svc = S3StorageService(
        endpoint_url=_LIVE_S3_ENDPOINT,
        bucket=os.environ["PIXSIM_TEST_S3_BUCKET"],
        access_key=os.environ["PIXSIM_TEST_S3_ACCESS_KEY"],
        secret_key=os.environ["PIXSIM_TEST_S3_SECRET_KEY"],
        region=os.environ.get("PIXSIM_TEST_S3_REGION", "us-east-1"),
    )
    data = b"pixsim-tiering-live-" + uuid.uuid4().hex.encode()
    sha = hashlib.sha256(data).hexdigest()
    key = f"u/0/test/{uuid.uuid4().hex}/{sha}.bin"
    dedup_key = svc.get_content_addressed_key(0, sha, ".bin")
    try:
        # store / exists / get / metadata round-trip.
        assert await svc.exists(key) is False
        await svc.store(key, data, content_type="application/octet-stream")
        assert await svc.exists(key) is True
        assert await svc.get(key) == data
        meta = await svc.get_metadata(key)
        assert meta is not None and meta["size"] == len(data)
        # get() on a missing key is None (not an error).
        assert await svc.get(f"u/0/test/{uuid.uuid4().hex}.bin") is None

        # content-addressed dedup: a second store for the same hash is a no-op
        # and returns the same key (root-scoped existence check).
        k1 = await svc.store_with_hash(0, sha, data, extension=".bin")
        k2 = await svc.store_with_hash(0, sha, data, extension=".bin")
        assert k1 == k2 == dedup_key
        assert await svc.exists(dedup_key) is True
    finally:
        await svc.delete(key)
        await svc.delete(dedup_key)
    # delete is effective (and idempotent — a 2nd delete still "succeeds").
    assert await svc.exists(key) is False
    assert await svc.delete(key) is True


# --------------------------------------------------------------------------- #
# g2 — serve handler redirects an archived original to a presigned URL.
#
# Phase D tests cover root resolution + serve-mode selection + proxy streaming;
# this asserts the end-to-end redirect decision in serve_media itself.
# --------------------------------------------------------------------------- #

@pytest.mark.asyncio
async def test_serve_media_redirects_archived_original_to_presigned(monkeypatch):
    from types import SimpleNamespace

    from starlette.responses import RedirectResponse

    from pixsim7.backend.main.api.v1 import media as media_mod

    class _ArchiveStub(_NonLocalStub):
        def get_url(self, key):
            return "http://minio.test/pixsim7-archive/" + key + "?X-Amz-Signature=deadbeef"

    archive = _ArchiveStub()
    key = "u/1/content/ab/" + "a" * 64 + ".mp4"
    await archive.store(key, b"video")  # present, so the health probe passes
    tier = TieredStorageService(
        {LOCAL_ROOT_ID: LocalStorageService(root_path=tempfile.mkdtemp()), "archive": archive}
    )
    set_storage_service(tier)
    monkeypatch.setattr(media_mod, "get_media_settings", lambda: SimpleNamespace(), raising=True)
    monkeypatch.setattr(
        media_mod.app_settings, "media_archive_serve_mode", "redirect", raising=False
    )
    try:
        resp = await media_mod.serve_media(
            key,
            SimpleNamespace(id=1),
            _FakeDB("archive"),  # content key resolves to the archive root
            request=SimpleNamespace(headers={}),
            response=SimpleNamespace(),
        )
        assert isinstance(resp, RedirectResponse)
        assert resp.status_code == 307
        loc = resp.headers["location"]
        assert loc.startswith("http://minio.test/pixsim7-archive/")
        assert "X-Amz-Signature" in loc
    finally:
        set_storage_service(None)


@pytest.mark.asyncio
async def test_serve_media_archive_offline_returns_503(monkeypatch):
    """When the health probe can't confirm the object (store unreachable), serve
    returns the clear archived-offline 503 instead of a doomed redirect."""
    from types import SimpleNamespace

    from fastapi import HTTPException

    from pixsim7.backend.main.api.v1 import media as media_mod

    class _OfflineArchive(_NonLocalStub):
        async def exists(self, key):
            raise ConnectionError("unreachable")

        async def health_check(self):
            raise ConnectionError("unreachable")

    tier = TieredStorageService(
        {LOCAL_ROOT_ID: LocalStorageService(root_path=tempfile.mkdtemp()), "archive": _OfflineArchive()}
    )
    set_storage_service(tier)
    monkeypatch.setattr(media_mod, "get_media_settings", lambda: SimpleNamespace(), raising=True)
    monkeypatch.setattr(
        media_mod.app_settings, "media_archive_serve_mode", "redirect", raising=False
    )
    try:
        with pytest.raises(HTTPException) as ei:
            await media_mod.serve_media(
                "u/1/content/ab/" + "a" * 64 + ".mp4",
                SimpleNamespace(id=1),
                _FakeDB("archive"),
                request=SimpleNamespace(headers={}),
                response=SimpleNamespace(),
            )
        assert ei.value.status_code == 503
        assert ei.value.headers.get("X-Media-State") == "archived-offline"
    finally:
        set_storage_service(None)
