"""Characterization tests for ``process_analysis`` terminal outcomes.

Pins the observable contract of the analysis worker's arq entrypoint — the dict
it returns (or the exception it raises) for each terminal branch — before the
embedding-analysis orchestration is carved out of the worker into a host-agnostic
service (plan ``worker-thin-host-canon``, checkpoint ``analysis-worker-audit``).

Everything is routed through ``process_analysis(ctx, analysis_id)`` so the tests
survive the extraction: after ``_process_embedding_analysis`` moves to
``services/analysis``, the entrypoint still dispatches to it and these assertions
stay identical. Style follows the generation-worker characterization suite
(SimpleNamespace fakes + monkeypatched module globals, no real DB).
"""
from __future__ import annotations

from types import SimpleNamespace
from typing import Any

import pytest

from pixsim7.backend.main.shared.errors import (
    NoAccountAvailableError,
    ProviderError,
)
from pixsim7.embedding.protocol import EmbeddingServiceError
from pixsim7.backend.main.workers import analysis_processor

# Where the embedding collaborators are patched. After the extraction this flips
# to the new service module (the entrypoint keeps delegating), mirroring how the
# generation suite retargeted from job_processor -> processing.service.
EMBED_HOST = analysis_processor


class _NoopLogger:
    def info(self, *a, **k) -> None: ...
    def warning(self, *a, **k) -> None: ...
    def error(self, *a, **k) -> None: ...
    def debug(self, *a, **k) -> None: ...


class _NoopDebug:
    def worker(self, *a, **k) -> None: ...
    def provider(self, *a, **k) -> None: ...


class _Health:
    def __init__(self) -> None:
        self.processed = 0
        self.failed = 0

    def increment_processed(self) -> None:
        self.processed += 1

    def increment_failed(self) -> None:
        self.failed += 1


class _FakeDB:
    def __init__(self, assets: dict[int, Any]) -> None:
        self._assets = assets
        self.closed = 0

    async def get(self, model, entity_id):
        return self._assets.get(entity_id)

    async def commit(self) -> None: ...
    async def close(self) -> None:
        self.closed += 1


def _make_analysis(**over) -> SimpleNamespace:
    base = dict(
        id=555,
        user_id=9,
        status="pending",
        analyzer_id="asset:embedding",
        asset_id=42,
        embedder_id="siglip2",
        model_id="siglip2-large",
        params={},
        provider_id="pixverse",
        account_id=None,
    )
    base.update(over)
    return SimpleNamespace(**base)


def _make_asset(**over) -> SimpleNamespace:
    base = dict(
        id=42,
        user_id=9,
        media_type="image",
        stored_key="k",
        thumbnail_key=None,
        preview_key=None,
        local_path=None,
        duration_sec=None,
        media_metadata={},
    )
    base.update(over)
    return SimpleNamespace(**base)


def _install(
    monkeypatch: pytest.MonkeyPatch,
    *,
    analysis: SimpleNamespace,
    asset: SimpleNamespace | None = None,
    embed_paths: list[str] | None = None,
    input_kind: str = "image",
    vectors: list[list[float]] | None = None,
    dim: int = 2,
    embed_raises: BaseException | None = None,
    aggregate_raises: BaseException | None = None,
    execute_analysis=None,
    select_raises: BaseException | None = None,
) -> SimpleNamespace:
    """Wire every collaborator ``process_analysis`` + the embedding path touch."""
    calls: dict[str, list] = {}

    def _rec(name, *a, **k) -> None:
        calls.setdefault(name, []).append((a, k))

    db = _FakeDB({asset.id: asset} if asset else {})
    health = _Health()

    class _FakeUserService:
        def __init__(self, db) -> None: ...
        async def get_user(self, uid):
            return SimpleNamespace(id=uid)

    class _FakeAnalysisService:
        def __init__(self, db) -> None: ...
        async def get_analysis(self, aid):
            return analysis
        async def mark_started(self, aid):
            _rec("mark_started", aid)
        async def mark_completed(self, aid, result):
            _rec("mark_completed", aid, result)
        async def mark_failed(self, aid, message):
            _rec("mark_failed", aid, message)

    class _FakeAccountService:
        def __init__(self, db) -> None: ...
        async def select_and_reserve_account(self, **k):
            _rec("select_and_reserve_account", **k)
            if select_raises is not None:
                raise select_raises
            return SimpleNamespace(id=100, provider_id=analysis.provider_id)
        async def release_account(self, account_id):
            _rec("release_account", account_id)

    class _FakeProviderService:
        def __init__(self, db) -> None: ...
        async def execute_analysis(self, *, analysis, account):
            _rec("execute_analysis", account_id=account.id)
            if execute_analysis is not None:
                return execute_analysis(analysis=analysis, account=account)
            return SimpleNamespace(provider_job_id="an_job_1")

    monkeypatch.setattr(analysis_processor, "_init_worker_debug_flags", lambda: None)
    monkeypatch.setattr(analysis_processor, "bind_job_context", lambda *a, **k: _NoopLogger())
    monkeypatch.setattr(analysis_processor, "get_global_debug_logger", lambda: _NoopDebug())
    monkeypatch.setattr(analysis_processor, "DebugLogger", lambda *a, **k: _NoopDebug())
    monkeypatch.setattr(analysis_processor, "get_health_tracker", lambda: health)

    async def _fake_get_db():
        yield db

    monkeypatch.setattr(analysis_processor, "get_db", _fake_get_db)
    monkeypatch.setattr(analysis_processor, "UserService", lambda db: _FakeUserService(db))
    monkeypatch.setattr(analysis_processor, "AnalysisService", lambda db: _FakeAnalysisService(db))
    monkeypatch.setattr(analysis_processor, "AccountService", lambda db: _FakeAccountService(db))
    monkeypatch.setattr(analysis_processor, "ProviderService", lambda db: _FakeProviderService(db))

    # --- embedding-path collaborators ---
    monkeypatch.setattr(EMBED_HOST, "get_storage_service", lambda: SimpleNamespace())
    monkeypatch.setattr(EMBED_HOST, "resolve_embedding_input_config", lambda params: SimpleNamespace())

    async def _fake_resolve_paths(*, asset, storage, config, log):
        return (embed_paths if embed_paths is not None else ["/tmp/a.jpg"], ["/tmp/a.jpg"], input_kind)

    monkeypatch.setattr(EMBED_HOST, "resolve_embedding_input_paths", _fake_resolve_paths)
    monkeypatch.setattr(
        EMBED_HOST, "aggregate_embedding_vectors",
        (lambda *a, **k: (_ for _ in ()).throw(aggregate_raises)) if aggregate_raises
        else (lambda *a, **k: [0.5, 0.5]),
    )
    monkeypatch.setattr(EMBED_HOST, "cleanup_embedding_input_paths", lambda *a, **k: None)

    class _FakeEmbeddingService:
        async def embed_images(self, request):
            _rec("embed_images", paths=list(request.paths))
            if embed_raises is not None:
                raise embed_raises
            vecs = vectors if vectors is not None else [[0.1, 0.2]]
            return SimpleNamespace(vectors=vecs, dim=dim, model_id="siglip2-large")

    monkeypatch.setattr(
        "pixsim7.embedding.locator.get_embedding_service", lambda: _FakeEmbeddingService()
    )

    return SimpleNamespace(db=db, health=health, calls=calls)


async def _run(analysis: SimpleNamespace) -> dict:
    return await analysis_processor.process_analysis({"job_try": 1}, analysis.id)


# --------------------------------------------------------------------------- #
# Dispatch
# --------------------------------------------------------------------------- #
@pytest.mark.asyncio
async def test_skip_when_not_pending(monkeypatch: pytest.MonkeyPatch) -> None:
    analysis = _make_analysis(status="processing")
    _install(monkeypatch, analysis=analysis)
    result = await _run(analysis)
    assert result == {"status": "skipped", "reason": "Analysis status is processing"}


# --------------------------------------------------------------------------- #
# Provider (non-embedding) path
# --------------------------------------------------------------------------- #
@pytest.mark.asyncio
async def test_provider_analysis_submitted(monkeypatch: pytest.MonkeyPatch) -> None:
    analysis = _make_analysis(analyzer_id="pixverse:caption")
    env = _install(monkeypatch, analysis=analysis)
    result = await _run(analysis)
    assert result == {
        "status": "submitted",
        "provider_job_id": "an_job_1",
        "analysis_id": analysis.id,
    }
    assert env.health.processed == 1
    assert "mark_started" in env.calls


@pytest.mark.asyncio
async def test_provider_error_marks_failed_releases_and_raises(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def _raise(**k):
        raise ProviderError("boom", retryable=True)

    analysis = _make_analysis(analyzer_id="pixverse:caption")
    env = _install(monkeypatch, analysis=analysis, execute_analysis=_raise)
    with pytest.raises(ProviderError):
        await _run(analysis)
    assert "mark_failed" in env.calls
    assert "release_account" in env.calls
    assert env.health.failed >= 1


@pytest.mark.asyncio
async def test_account_unavailable_marks_failed_and_raises(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    analysis = _make_analysis(analyzer_id="pixverse:caption")
    env = _install(
        monkeypatch, analysis=analysis, select_raises=NoAccountAvailableError("pixverse")
    )
    with pytest.raises(NoAccountAvailableError):
        await _run(analysis)
    assert "mark_failed" in env.calls  # generic handler marks failed before re-raising


# --------------------------------------------------------------------------- #
# Embedding path (the extraction target) — terminal outcomes
# --------------------------------------------------------------------------- #
@pytest.mark.asyncio
async def test_embedding_success(monkeypatch: pytest.MonkeyPatch) -> None:
    analysis = _make_analysis()
    asset = _make_asset()
    env = _install(monkeypatch, analysis=analysis, asset=asset, dim=2)
    result = await _run(analysis)
    assert result["status"] == "completed"
    assert result["analysis_id"] == analysis.id
    assert result["dim"] == 2
    assert result["input_kind"] == "image"
    # marked completed with the aggregated vector
    completed = env.calls["mark_completed"][0]
    assert completed[0][1] == {"embedding": [0.5, 0.5]}


@pytest.mark.asyncio
async def test_embedding_missing_asset(monkeypatch: pytest.MonkeyPatch) -> None:
    analysis = _make_analysis(asset_id=999)
    env = _install(monkeypatch, analysis=analysis, asset=None)  # db.get returns None
    result = await _run(analysis)
    assert result == {"status": "failed", "reason": "missing_asset"}
    assert "mark_failed" in env.calls


@pytest.mark.asyncio
async def test_embedding_no_readable_input(monkeypatch: pytest.MonkeyPatch) -> None:
    analysis = _make_analysis()
    asset = _make_asset()
    env = _install(monkeypatch, analysis=analysis, asset=asset, embed_paths=[])
    result = await _run(analysis)
    assert result["status"] == "failed"
    assert result["reason"] == "no_path"
    assert "mark_failed" in env.calls


@pytest.mark.asyncio
async def test_embedding_service_error(monkeypatch: pytest.MonkeyPatch) -> None:
    analysis = _make_analysis()
    asset = _make_asset()
    env = _install(
        monkeypatch, analysis=analysis, asset=asset,
        embed_raises=EmbeddingServiceError("daemon down"),
    )
    result = await _run(analysis)
    assert result == {"status": "failed", "reason": "embedding_service_error"}
    assert "mark_failed" in env.calls


@pytest.mark.asyncio
async def test_embedding_empty_result(monkeypatch: pytest.MonkeyPatch) -> None:
    analysis = _make_analysis()
    asset = _make_asset()
    env = _install(monkeypatch, analysis=analysis, asset=asset, vectors=[])
    result = await _run(analysis)
    assert result == {"status": "failed", "reason": "empty_result"}
    assert "mark_failed" in env.calls


@pytest.mark.asyncio
async def test_embedding_aggregation_error(monkeypatch: pytest.MonkeyPatch) -> None:
    analysis = _make_analysis()
    asset = _make_asset()
    env = _install(
        monkeypatch, analysis=analysis, asset=asset,
        aggregate_raises=ValueError("bad vectors"),
    )
    result = await _run(analysis)
    assert result == {"status": "failed", "reason": "embedding_aggregation_error"}
    assert "mark_failed" in env.calls
