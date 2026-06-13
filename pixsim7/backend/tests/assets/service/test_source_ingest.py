"""Unit tests for S3 source-root ingest (plan s3-source-root-ingest, cp-c).

Pure-logic + control-flow coverage with fakes (no DB / no S3). The DB-touching
create/dedup integration path is covered in cp-f.
"""
import pytest

from pixsim7.backend.main.domain.enums import MediaType
from pixsim7.backend.main.services.asset import source_ingest as si
from pixsim7.backend.main.services.storage.roots import RootSpec


# --------------------------------------------------------------------------- #
# pure helpers
# --------------------------------------------------------------------------- #

def test_source_provider_asset_id_stable_and_bounded():
    a = si._source_provider_asset_id("packs", "Susana/x.jpg")
    assert a == si._source_provider_asset_id("packs", "Susana/x.jpg")  # deterministic
    assert a != si._source_provider_asset_id("packs", "Susana/y.jpg")  # per key
    assert a != si._source_provider_asset_id("other", "Susana/x.jpg")  # per root
    assert a.startswith("src_") and len(a) <= 128


def test_media_type_for_key():
    assert si._media_type_for_key("a/b.jpg")[0] == MediaType.IMAGE
    assert si._media_type_for_key("a/b.PNG")[0] == MediaType.IMAGE
    assert si._media_type_for_key("a/b.mp4")[0] == MediaType.VIDEO
    assert si._media_type_for_key("a/notes.txt")[0] is None


def test_build_source_context_strips_prefix_and_derives_subfolder():
    ctx = si._build_source_context("packs", "Susana/sub/img_01.jpg", "Susana/")
    assert ctx["source_relative_path"] == "sub/img_01.jpg"
    assert ctx["source_subfolder"] == "sub"
    assert ctx["source_object_key"] == "Susana/sub/img_01.jpg"
    assert ctx["source_folder_id"] == "packs"
    assert ctx["feature"] == "s3_source"


# --------------------------------------------------------------------------- #
# per-object control flow (fakes)
# --------------------------------------------------------------------------- #

class _Result:
    def __init__(self, value):
        self._value = value

    def scalar_one_or_none(self):
        return self._value


class _DB:
    def __init__(self, scalar=None):
        self._scalar = scalar

    async def execute(self, *a, **k):
        return _Result(self._scalar)


class _NoDownloadStorage:
    """Fails loudly if anything tries to download — proves the skip path is
    free of S3 I/O."""

    async def ensure_local_copy(self, key, root_id=None):
        raise AssertionError("must not download when the object is already ingested")


@pytest.mark.asyncio
async def test_ingest_object_incremental_skip_no_download(monkeypatch):
    monkeypatch.setattr(si, "get_storage_service", lambda: _NoDownloadStorage())
    res = await si.ingest_source_object(
        _DB(scalar=4242),  # provider-tuple query finds an existing asset id
        user_id=1,
        source_root_id="packs",
        object_key="P/a.jpg",
        prefix="P/",
    )
    assert res == {"status": "skipped", "asset_id": 4242, "key": "P/a.jpg"}


@pytest.mark.asyncio
async def test_ingest_object_unsupported_media_type_no_download(monkeypatch):
    monkeypatch.setattr(si, "get_storage_service", lambda: _NoDownloadStorage())
    res = await si.ingest_source_object(
        _DB(scalar=None),  # not previously ingested
        user_id=1,
        source_root_id="packs",
        object_key="P/readme.txt",
        prefix="P/",
    )
    assert res["status"] == "unsupported"
    assert res["asset_id"] is None


# --------------------------------------------------------------------------- #
# enumerate driver (fakes)
# --------------------------------------------------------------------------- #

def _source_roots_stub():
    return {"packs": RootSpec(id="packs", kind="s3", config={"prefix": "P/"}, role="source")}


class _ListStorage:
    def __init__(self, keys):
        self._keys = keys

    async def list_objects(self, prefix, root_id=None, page_size=1000):
        assert prefix == "P/" and root_id == "packs"
        for k in self._keys:
            yield {"key": k}


@pytest.mark.asyncio
async def test_ingest_source_root_aggregates_stats(monkeypatch):
    monkeypatch.setattr(si, "get_source_roots", _source_roots_stub)
    monkeypatch.setattr(
        si, "get_storage_service",
        lambda: _ListStorage(["P/a.jpg", "P/b.jpg", "P/c.jpg", "P/d.txt", "P/boom.jpg"]),
    )

    canned = {
        "P/a.jpg": "created",
        "P/b.jpg": "deduped",
        "P/c.jpg": "skipped",
        "P/d.txt": "unsupported",
    }

    async def _fake_obj(db, *, user_id, source_root_id, object_key, prefix=""):
        if object_key == "P/boom.jpg":
            raise RuntimeError("transient S3 error")
        return {"status": canned[object_key], "asset_id": 1, "key": object_key}

    monkeypatch.setattr(si, "ingest_source_object", _fake_obj)

    stats = await si.ingest_source_root(_DB(), user_id=1, source_root_id="packs")
    # unsupported folds into skipped; the raising object counts as an error and
    # does not abort the run.
    assert stats == {"scanned": 5, "created": 1, "deduped": 1, "skipped": 2, "errors": 1}


@pytest.mark.asyncio
async def test_ingest_source_root_limit_caps_scan(monkeypatch):
    monkeypatch.setattr(si, "get_source_roots", _source_roots_stub)
    monkeypatch.setattr(si, "get_storage_service", lambda: _ListStorage(["P/1.jpg", "P/2.jpg", "P/3.jpg"]))

    async def _ok(db, *, user_id, source_root_id, object_key, prefix=""):
        return {"status": "created", "asset_id": 1, "key": object_key}

    monkeypatch.setattr(si, "ingest_source_object", _ok)
    stats = await si.ingest_source_root(_DB(), user_id=1, source_root_id="packs", limit=2)
    assert stats["scanned"] == 2


@pytest.mark.asyncio
async def test_ingest_source_root_unknown_root_raises(monkeypatch):
    monkeypatch.setattr(si, "get_source_roots", _source_roots_stub)
    with pytest.raises(ValueError):
        await si.ingest_source_root(_DB(), user_id=1, source_root_id="not-a-source")


# --------------------------------------------------------------------------- #
# trigger endpoint (cp-d)
# --------------------------------------------------------------------------- #

@pytest.mark.asyncio
async def test_ingest_endpoint_returns_stats(monkeypatch):
    from types import SimpleNamespace

    from pixsim7.backend.main.api.v1 import assets_storage_overview as so

    async def _fake(db, *, user_id, source_root_id, limit=None):
        assert source_root_id == "packs" and user_id == 7 and limit == 500
        return {"scanned": 3, "created": 2, "deduped": 1, "skipped": 0, "errors": 0}

    monkeypatch.setattr(si, "ingest_source_root", _fake)

    resp = await so.ingest_storage_source_root(
        "packs", SimpleNamespace(id=7), object(), limit=500
    )
    assert resp.root_id == "packs"
    assert (resp.scanned, resp.created, resp.deduped) == (3, 2, 1)


@pytest.mark.asyncio
async def test_ingest_endpoint_unknown_root_404(monkeypatch):
    from types import SimpleNamespace

    from fastapi import HTTPException

    from pixsim7.backend.main.api.v1 import assets_storage_overview as so

    async def _raise(db, *, user_id, source_root_id, limit=None):
        raise ValueError("'nope' is not a configured source root")

    monkeypatch.setattr(si, "ingest_source_root", _raise)

    with pytest.raises(HTTPException) as ei:
        await so.ingest_storage_source_root("nope", SimpleNamespace(id=1), object(), limit=500)
    assert ei.value.status_code == 404
