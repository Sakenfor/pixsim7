"""
Analysis result projection helpers.

Projects structured analysis outputs onto first-class domain models.
Embedding analyzers write to asset_embedding keyed by (asset_id, embedder_id).
"""
from __future__ import annotations

import logging
import math
from typing import Any, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from pixsim7.backend.main.domain import Asset
from pixsim7.backend.main.domain.assets.analysis import AssetAnalysis
from pixsim7.backend.main.domain.assets.embedding import AssetEmbedding
from pixsim7.backend.main.services.prompt.parser import (
    AnalyzerTaskFamily,
    analyzer_registry,
)

logger = logging.getLogger(__name__)

_EMBEDDING_DIMENSIONS = 1024
_NESTED_RESULT_KEYS = ("result", "data", "output", "attributes")
_VECTOR_KEYS = ("embedding", "vector")
_MATRIX_KEYS = ("embeddings",)


class AnalysisResultApplier:
    """Apply analysis result projections to domain models."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def apply_completion(
        self,
        analysis: AssetAnalysis,
    ) -> None:
        if not self._is_embedding_analysis(analysis.analyzer_id):
            return

        embedding = self._extract_embedding_vector(analysis.result)
        if not embedding:
            return

        asset = await self.db.get(Asset, analysis.asset_id)
        if not asset:
            logger.warning(
                "analysis_result_apply_missing_asset analysis_id=%s asset_id=%s",
                analysis.id,
                analysis.asset_id,
            )
            return

        embedder_id = analysis.embedder_id or analysis.model_id or "primary"

        existing = await self.db.execute(
            select(AssetEmbedding).where(
                AssetEmbedding.asset_id == analysis.asset_id,
                AssetEmbedding.embedder_id == embedder_id,
            )
        )
        row = existing.scalar_one_or_none()

        if row is None:
            row = AssetEmbedding(
                asset_id=analysis.asset_id,
                embedder_id=embedder_id,
                vector=embedding,
                model_id=analysis.model_id,
            )
            self.db.add(row)
        else:
            row.vector = embedding
            row.model_id = analysis.model_id

        logger.info(
            "analysis_result_embedding_applied analysis_id=%s asset_id=%s embedder_id=%s dims=%s",
            analysis.id,
            analysis.asset_id,
            embedder_id,
            len(embedding),
        )

    def _is_embedding_analysis(self, analyzer_id: str) -> bool:
        canonical_id = analyzer_registry.resolve_legacy(analyzer_id)
        analyzer = analyzer_registry.get(canonical_id)
        if analyzer and analyzer.task_family == AnalyzerTaskFamily.EMBEDDING:
            return True
        return canonical_id == "asset:embedding"

    @classmethod
    def _extract_embedding_vector(
        cls,
        payload: Any,
    ) -> Optional[list[float]]:
        vector = cls._find_embedding_candidate(payload, depth=0)
        if vector is None:
            return None
        normalized = cls._normalize_vector(vector)
        if normalized is None:
            return None
        if len(normalized) != _EMBEDDING_DIMENSIONS:
            return None
        return normalized

    @classmethod
    def _find_embedding_candidate(
        cls,
        payload: Any,
        *,
        depth: int,
    ) -> Optional[Any]:
        if depth > 4:
            return None
        if not isinstance(payload, dict):
            return None

        for key in _VECTOR_KEYS:
            value = payload.get(key)
            if isinstance(value, list):
                return value

        for key in _MATRIX_KEYS:
            value = payload.get(key)
            if (
                isinstance(value, list)
                and len(value) > 0
                and isinstance(value[0], list)
            ):
                return value[0]

        for key in _NESTED_RESULT_KEYS:
            nested = payload.get(key)
            found = cls._find_embedding_candidate(nested, depth=depth + 1)
            if found is not None:
                return found

        return None

    @staticmethod
    def _normalize_vector(raw: Any) -> Optional[list[float]]:
        if not isinstance(raw, list):
            return None

        normalized: list[float] = []
        for value in raw:
            if not isinstance(value, (int, float)):
                return None
            numeric = float(value)
            if not math.isfinite(numeric):
                return None
            normalized.append(numeric)

        return normalized
