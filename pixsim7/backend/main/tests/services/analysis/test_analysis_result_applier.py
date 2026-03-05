from types import SimpleNamespace

import pytest

from pixsim7.backend.main.domain import Asset
from pixsim7.backend.main.services.analysis.analysis_result_applier import (
    AnalysisResultApplier,
)
from pixsim7.backend.main.services.prompt.parser import AnalyzerTaskFamily, analyzer_registry


class _FakeDb:
    def __init__(self, asset):
        self._asset = asset

    async def get(self, model, model_id):
        if model is Asset and self._asset and self._asset.id == model_id:
            return self._asset
        return None


def _embedding_vector(size: int = 768) -> list[float]:
    return [float(i) for i in range(size)]


@pytest.mark.asyncio
async def test_applier_sets_asset_embedding_from_embeddings_matrix():
    asset = SimpleNamespace(id=10, embedding=None, embedding_generated_at=None)
    analysis = SimpleNamespace(
        id=100,
        analyzer_id="asset:embedding",
        asset_id=asset.id,
        result={"embeddings": [_embedding_vector()]},
    )
    applier = AnalysisResultApplier(_FakeDb(asset))

    await applier.apply_completion(analysis)

    assert asset.embedding == _embedding_vector()
    assert asset.embedding_generated_at is not None


@pytest.mark.asyncio
async def test_applier_sets_asset_embedding_from_nested_result():
    asset = SimpleNamespace(id=11, embedding=None, embedding_generated_at=None)
    analysis = SimpleNamespace(
        id=101,
        analyzer_id="asset:embedding",
        asset_id=asset.id,
        result={"result": {"output": {"embedding": _embedding_vector()}}},
    )
    applier = AnalysisResultApplier(_FakeDb(asset))

    await applier.apply_completion(analysis)

    assert asset.embedding == _embedding_vector()
    assert asset.embedding_generated_at is not None


@pytest.mark.asyncio
async def test_applier_ignores_non_embedding_analyzer():
    asset = SimpleNamespace(id=12, embedding=None, embedding_generated_at=None)
    analysis = SimpleNamespace(
        id=102,
        analyzer_id="asset:ocr",
        asset_id=asset.id,
        result={"embeddings": [_embedding_vector()]},
    )
    applier = AnalysisResultApplier(_FakeDb(asset))

    await applier.apply_completion(analysis)

    assert asset.embedding is None
    assert asset.embedding_generated_at is None


@pytest.mark.asyncio
async def test_applier_ignores_invalid_embedding_dimensions():
    asset = SimpleNamespace(id=13, embedding=None, embedding_generated_at=None)
    analysis = SimpleNamespace(
        id=103,
        analyzer_id="asset:embedding",
        asset_id=asset.id,
        result={"embeddings": [_embedding_vector(size=10)]},
    )
    applier = AnalysisResultApplier(_FakeDb(asset))

    await applier.apply_completion(analysis)

    assert asset.embedding is None
    assert asset.embedding_generated_at is None


@pytest.mark.asyncio
async def test_applier_uses_task_family_for_custom_embedding_analyzer(monkeypatch):
    original_get = analyzer_registry.get

    def _patched_get(analyzer_id: str):
        if analyzer_id == "asset:custom-embed":
            return SimpleNamespace(task_family=AnalyzerTaskFamily.EMBEDDING)
        return original_get(analyzer_id)

    monkeypatch.setattr(analyzer_registry, "get", _patched_get)

    asset = SimpleNamespace(id=14, embedding=None, embedding_generated_at=None)
    analysis = SimpleNamespace(
        id=104,
        analyzer_id="asset:custom-embed",
        asset_id=asset.id,
        result={"embedding": _embedding_vector()},
    )
    applier = AnalysisResultApplier(_FakeDb(asset))

    await applier.apply_completion(analysis)

    assert asset.embedding == _embedding_vector()
    assert asset.embedding_generated_at is not None
