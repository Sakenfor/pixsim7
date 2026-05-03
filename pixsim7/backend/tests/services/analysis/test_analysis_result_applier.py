from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest

from pixsim7.backend.main.domain import Asset
from pixsim7.backend.main.domain.assets.embedding import AssetEmbedding
from pixsim7.backend.main.services.analysis.analysis_result_applier import (
    AnalysisResultApplier,
)
from pixsim7.backend.main.services.prompt.parser import AnalyzerTaskFamily, analyzer_registry


class _FakeDb:
    """Minimal stand-in for AsyncSession used by the applier."""

    def __init__(self, asset):
        self._asset = asset
        self.added: list = []

    async def get(self, model, model_id):
        if model is Asset and self._asset and self._asset.id == model_id:
            return self._asset
        return None

    async def execute(self, *_args, **_kwargs):
        # No existing AssetEmbedding row — applier will add a new one
        result = MagicMock()
        result.scalar_one_or_none.return_value = None
        return result

    def add(self, instance):
        self.added.append(instance)


def _embedding_vector(size: int = 1024) -> list[float]:
    return [float(i) for i in range(size)]


def _added_embedding(db) -> AssetEmbedding | None:
    for inst in db.added:
        if isinstance(inst, AssetEmbedding):
            return inst
    return None


@pytest.mark.asyncio
async def test_applier_writes_asset_embedding_from_embeddings_matrix():
    asset = SimpleNamespace(id=10)
    analysis = SimpleNamespace(
        id=100,
        analyzer_id="asset:embedding",
        asset_id=asset.id,
        embedder_id="siglip2-large",
        model_id="google/siglip2-large-patch16-384",
        result={"embeddings": [_embedding_vector()]},
    )
    db = _FakeDb(asset)

    await AnalysisResultApplier(db).apply_completion(analysis)

    row = _added_embedding(db)
    assert row is not None
    assert row.asset_id == asset.id
    assert row.embedder_id == "siglip2-large"
    assert row.vector == _embedding_vector()


@pytest.mark.asyncio
async def test_applier_writes_asset_embedding_from_nested_result():
    asset = SimpleNamespace(id=11)
    analysis = SimpleNamespace(
        id=101,
        analyzer_id="asset:embedding",
        asset_id=asset.id,
        embedder_id="siglip2-large",
        model_id="google/siglip2-large-patch16-384",
        result={"result": {"output": {"embedding": _embedding_vector()}}},
    )
    db = _FakeDb(asset)

    await AnalysisResultApplier(db).apply_completion(analysis)

    row = _added_embedding(db)
    assert row is not None
    assert row.vector == _embedding_vector()


@pytest.mark.asyncio
async def test_applier_ignores_non_embedding_analyzer():
    asset = SimpleNamespace(id=12)
    analysis = SimpleNamespace(
        id=102,
        analyzer_id="asset:ocr",
        asset_id=asset.id,
        embedder_id=None,
        model_id=None,
        result={"embeddings": [_embedding_vector()]},
    )
    db = _FakeDb(asset)

    await AnalysisResultApplier(db).apply_completion(analysis)

    assert _added_embedding(db) is None


@pytest.mark.asyncio
async def test_applier_ignores_invalid_embedding_dimensions():
    asset = SimpleNamespace(id=13)
    analysis = SimpleNamespace(
        id=103,
        analyzer_id="asset:embedding",
        asset_id=asset.id,
        embedder_id="siglip2-large",
        model_id="google/siglip2-large-patch16-384",
        result={"embeddings": [_embedding_vector(size=10)]},
    )
    db = _FakeDb(asset)

    await AnalysisResultApplier(db).apply_completion(analysis)

    assert _added_embedding(db) is None


@pytest.mark.asyncio
async def test_applier_uses_task_family_for_custom_embedding_analyzer(monkeypatch):
    original_get = analyzer_registry.get

    def _patched_get(analyzer_id: str):
        if analyzer_id == "asset:custom-embed":
            return SimpleNamespace(task_family=AnalyzerTaskFamily.EMBEDDING)
        return original_get(analyzer_id)

    monkeypatch.setattr(analyzer_registry, "get", _patched_get)

    asset = SimpleNamespace(id=14)
    analysis = SimpleNamespace(
        id=104,
        analyzer_id="asset:custom-embed",
        asset_id=asset.id,
        embedder_id="custom-space",
        model_id="some-model",
        result={"embedding": _embedding_vector()},
    )
    db = _FakeDb(asset)

    await AnalysisResultApplier(db).apply_completion(analysis)

    row = _added_embedding(db)
    assert row is not None
    assert row.embedder_id == "custom-space"
    assert row.vector == _embedding_vector()
