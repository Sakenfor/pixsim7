"""
AnalysisService - Asset analysis creation and lifecycle management

Handles the full lifecycle of asset analysis jobs:
- Creation with validation
- Status transitions
- Result storage
- ARQ job queueing
"""
import logging
import hashlib
import json
from dataclasses import dataclass
from typing import Optional, Dict, Any, List
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from pixsim7.backend.main.domain import (
    User,
    Asset,
)
from pixsim7.backend.main.domain.analyzer_definition import AnalyzerDefinition
from pixsim7.backend.main.domain.assets.analysis import (
    AssetAnalysis,
    AnalysisStatus,
)
from pixsim7.backend.main.services.analysis.analyzer_defaults import (
    resolve_asset_default_analyzer_id,
    resolve_asset_default_analyzer_ids,
)
from pixsim7.backend.main.services.analysis.analyzer_pipeline import (
    AnalyzerExecutionRequest,
    AnalyzerPipelineError,
    resolve_analyzer_execution,
)
from pixsim7.backend.main.services.analysis.chain_executor import execute_first_success
from pixsim7.backend.main.services.analysis.observability import log_analyzer_run
from pixsim7.backend.main.services.analysis.result_envelope import build_provenance
from pixsim7.backend.main.services.analysis.analyzer_instance_service import AnalyzerInstanceService
from pixsim7.backend.main.services.analysis.analysis_result_applier import AnalysisResultApplier
from pixsim7.backend.main.services.prompt.parser import analyzer_registry, AnalyzerTarget
from pixsim7.backend.main.shared.errors import (
    ResourceNotFoundError,
    InvalidOperationError,
)
from pixsim7.backend.main.infrastructure.events.bus import event_bus

logger = logging.getLogger(__name__)

# Event types for analysis lifecycle
ANALYSIS_CREATED = "analysis.created"
ANALYSIS_STARTED = "analysis.started"
ANALYSIS_COMPLETED = "analysis.completed"
ANALYSIS_FAILED = "analysis.failed"


@dataclass(frozen=True)
class ResolvedAnalysisExecution:
    analyzer_id: str
    provider_id: str
    model_id: Optional[str]
    analyzer_definition_version: str
    effective_config_hash: str


class AnalysisService:
    """
    Asset analysis service.

    Handles:
    - Analysis creation with asset validation
    - Status transitions with event publishing
    - Result storage
    - ARQ job queueing
    """

    def __init__(self, db: AsyncSession):
        self.db = db

    # ===== CREATION =====

    async def create_analysis(
        self,
        user: User,
        asset_id: int,
        analyzer_id: Optional[str] = None,
        analyzer_intent: Optional[str] = None,
        analysis_point: Optional[str] = None,
        prompt: Optional[str] = None,
        params: Optional[Dict[str, Any]] = None,
        priority: int = 5,
        enqueue: bool = True,
    ) -> AssetAnalysis:
        """
        Create a new asset analysis job.

        Args:
            user: User creating the analysis
            asset_id: ID of the asset to analyze
            analyzer_id: Analyzer ID to execute. If omitted, resolves from
                user analyzer preferences by media type.
            analyzer_intent: Optional intent key for resolving a more specific
                asset analyzer default (e.g. character_ingest_face).
            prompt: Optional prompt for the analysis
            params: Optional additional parameters
            priority: Job priority (0=highest, 10=lowest)

        Returns:
            Created AssetAnalysis record

        Raises:
            ResourceNotFoundError: Asset not found
            InvalidOperationError: Invalid parameters
        """
        analysis, _ = await self.create_analysis_with_meta(
            user=user,
            asset_id=asset_id,
            analyzer_id=analyzer_id,
            analyzer_intent=analyzer_intent,
            analysis_point=analysis_point,
            prompt=prompt,
            params=params,
            priority=priority,
            enqueue=enqueue,
        )
        return analysis

    async def create_analysis_with_meta(
        self,
        *,
        user: User,
        asset_id: int,
        analyzer_id: Optional[str] = None,
        analyzer_intent: Optional[str] = None,
        analysis_point: Optional[str] = None,
        prompt: Optional[str] = None,
        params: Optional[Dict[str, Any]] = None,
        priority: int = 5,
        enqueue: bool = True,
    ) -> tuple[AssetAnalysis, bool]:
        """
        Create analysis and return `(analysis, created)` where `created=False`
        indicates idempotent dedupe hit.
        """
        asset = await self._get_asset(asset_id)
        if asset.user_id != user.id:
            raise InvalidOperationError("Cannot analyze assets owned by other users")

        normalized_params = params or {}
        resolved_analysis_point = self._resolve_analysis_point(
            asset=asset,
            analyzer_intent=analyzer_intent,
            analysis_point=analysis_point,
        )
        input_fingerprint = self._compute_input_fingerprint(
            asset=asset,
            prompt=prompt,
            params=normalized_params,
            analysis_point=resolved_analysis_point,
        )

        explicit_analyzer_id = analyzer_id.strip() if isinstance(analyzer_id, str) else None
        chain_result = None
        candidate_count = 1
        if explicit_analyzer_id:
            resolved_execution = await self._resolve_execution_config(
                user_id=user.id,
                asset=asset,
                analyzer_id=explicit_analyzer_id,
            )
        else:
            media_type = asset.media_type.value if hasattr(asset.media_type, "value") else asset.media_type
            candidate_analyzer_ids = resolve_asset_default_analyzer_ids(
                getattr(user, "preferences", None),
                media_type=media_type,
                intent=analyzer_intent,
                analysis_point=resolved_analysis_point,
            )
            candidate_count = len(candidate_analyzer_ids)

            chain_result = await execute_first_success(
                candidates=candidate_analyzer_ids,
                step_fn=lambda aid: self._resolve_execution_config(
                    user_id=user.id,
                    asset=asset,
                    analyzer_id=aid,
                ),
            )

            if chain_result.success:
                resolved_execution = chain_result.result
            else:
                fallback_id = resolve_asset_default_analyzer_id(
                    getattr(user, "preferences", None),
                    media_type=media_type,
                    intent=analyzer_intent,
                    analysis_point=resolved_analysis_point,
                )
                raise InvalidOperationError(
                    "No executable analyzer resolved from defaults. "
                    f"First default candidate: {fallback_id}. "
                    f"Details: {chain_result.error_summary}"
                )

        # Build provenance envelope
        if chain_result is not None:
            provenance = build_provenance(
                chain_result,
                provider_id=resolved_execution.provider_id,
                model_id=resolved_execution.model_id,
            )
        else:
            # Explicit analyzer — no chain, build minimal provenance
            from pixsim7.backend.main.services.analysis.result_envelope import AnalyzerProvenance
            provenance = AnalyzerProvenance(
                analyzer_id=resolved_execution.analyzer_id,
                provider_id=resolved_execution.provider_id,
                model_id=resolved_execution.model_id,
            )

        dedupe_key = self._compute_dedupe_key(
            asset_id=asset.id,
            analysis_point=resolved_analysis_point,
            analyzer_id=resolved_execution.analyzer_id,
            effective_config_hash=resolved_execution.effective_config_hash,
            input_fingerprint=input_fingerprint,
        )

        existing = await self._find_existing_analysis(
            asset_id=asset.id,
            analysis_point=resolved_analysis_point,
            analyzer_id=resolved_execution.analyzer_id,
            effective_config_hash=resolved_execution.effective_config_hash,
            input_fingerprint=input_fingerprint,
        )
        if existing is not None:
            logger.info(
                "analysis_deduped analysis_id=%s asset_id=%s analyzer_id=%s analysis_point=%s",
                existing.id,
                asset.id,
                resolved_execution.analyzer_id,
                resolved_analysis_point,
            )
            if enqueue and existing.status == AnalysisStatus.PENDING:
                await self._enqueue_analysis_job(existing.id)
            return existing, False

        analysis = AssetAnalysis(
            user_id=user.id,
            asset_id=asset_id,
            analyzer_id=resolved_execution.analyzer_id,
            model_id=resolved_execution.model_id,
            provider_id=resolved_execution.provider_id,
            prompt=prompt,
            params=normalized_params,
            analysis_point=resolved_analysis_point,
            analyzer_definition_version=resolved_execution.analyzer_definition_version,
            effective_config_hash=resolved_execution.effective_config_hash,
            input_fingerprint=input_fingerprint,
            dedupe_key=dedupe_key,
            status=AnalysisStatus.PENDING,
            priority=priority,
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
        )

        self.db.add(analysis)
        await self.db.commit()
        await self.db.refresh(analysis)

        # Emit structured observability log
        log_analyzer_run(
            provenance,
            path="asset",
            success=True,
            candidate_count=candidate_count,
            extra={
                "analysis_id": analysis.id,
                "asset_id": asset_id,
                "analysis_point": resolved_analysis_point,
            },
        )

        await event_bus.publish(
            ANALYSIS_CREATED,
            {
                "analysis_id": analysis.id,
                "asset_id": asset_id,
                "user_id": user.id,
                "analyzer_id": resolved_execution.analyzer_id,
                "provider_id": resolved_execution.provider_id,
                "analysis_point": resolved_analysis_point,
                "analyzer_definition_version": resolved_execution.analyzer_definition_version,
                "effective_config_hash": resolved_execution.effective_config_hash,
                "dedupe_key": dedupe_key,
                "provenance": provenance.to_dict(),
            },
        )

        if enqueue:
            await self._enqueue_analysis_job(analysis.id)

        return analysis, True

    # ===== LIFECYCLE =====

    async def mark_started(self, analysis_id: int) -> AssetAnalysis:
        """Mark analysis as started/processing"""
        analysis = await self._get_analysis(analysis_id)
        analysis.status = AnalysisStatus.PROCESSING
        analysis.started_at = datetime.now(timezone.utc)
        analysis.updated_at = datetime.now(timezone.utc)

        await self.db.commit()
        await self.db.refresh(analysis)

        await event_bus.publish(ANALYSIS_STARTED, {
            "analysis_id": analysis_id,
            "user_id": analysis.user_id,
            "asset_id": analysis.asset_id,
        })

        return analysis

    async def mark_completed(
        self,
        analysis_id: int,
        result: Dict[str, Any]
    ) -> AssetAnalysis:
        """
        Mark analysis as completed with result.

        Args:
            analysis_id: Analysis ID
            result: Analysis result data

        Returns:
            Updated analysis
        """
        analysis = await self._get_analysis(analysis_id)
        analysis.status = AnalysisStatus.COMPLETED
        analysis.completed_at = datetime.now(timezone.utc)
        analysis.updated_at = datetime.now(timezone.utc)
        analysis.result = result

        applier = AnalysisResultApplier(self.db)
        await applier.apply_completion(analysis)

        await self.db.commit()
        await self.db.refresh(analysis)

        logger.info(f"Analysis {analysis_id} completed")

        await event_bus.publish(ANALYSIS_COMPLETED, {
            "analysis_id": analysis_id,
            "user_id": analysis.user_id,
            "asset_id": analysis.asset_id,
        })

        return analysis

    async def mark_failed(
        self,
        analysis_id: int,
        error_message: str
    ) -> AssetAnalysis:
        """Mark analysis as failed"""
        analysis = await self._get_analysis(analysis_id)
        analysis.status = AnalysisStatus.FAILED
        analysis.completed_at = datetime.now(timezone.utc)
        analysis.updated_at = datetime.now(timezone.utc)
        analysis.error_message = error_message

        await self.db.commit()
        await self.db.refresh(analysis)

        logger.warning(f"Analysis {analysis_id} failed: {error_message}")

        await event_bus.publish(ANALYSIS_FAILED, {
            "analysis_id": analysis_id,
            "user_id": analysis.user_id,
            "asset_id": analysis.asset_id,
            "error": error_message,
        })

        return analysis

    async def cancel_analysis(
        self,
        analysis_id: int,
        user: User
    ) -> AssetAnalysis:
        """Cancel a pending or processing analysis"""
        analysis = await self._get_analysis(analysis_id)

        # Check authorization
        if analysis.user_id != user.id:
            raise InvalidOperationError("Cannot cancel other users' analyses")

        # Check if can be cancelled
        if analysis.is_terminal:
            raise InvalidOperationError(f"Analysis already {analysis.status.value}")

        analysis.status = AnalysisStatus.CANCELLED
        analysis.completed_at = datetime.now(timezone.utc)
        analysis.updated_at = datetime.now(timezone.utc)

        await self.db.commit()
        await self.db.refresh(analysis)

        logger.info(f"Analysis {analysis_id} cancelled by user {user.id}")

        return analysis

    # ===== QUERIES =====

    async def get_analysis(self, analysis_id: int) -> AssetAnalysis:
        """Get analysis by ID"""
        return await self._get_analysis(analysis_id)

    async def get_analyses_for_asset(
        self,
        asset_id: int,
        user: User,
        analyzer_id: Optional[str] = None,
        status: Optional[AnalysisStatus] = None,
        limit: int = 50,
    ) -> List[AssetAnalysis]:
        """
        Get analyses for an asset.

        Args:
            asset_id: Asset ID
            user: User requesting (for authorization)
            analyzer_id: Optional filter by analyzer ID
            status: Optional filter by status
            limit: Maximum results to return

        Returns:
            List of analyses
        """
        # Validate asset exists and user has access
        asset = await self._get_asset(asset_id)
        if asset.user_id != user.id:
            raise InvalidOperationError("Cannot view analyses for assets owned by other users")

        query = (
            select(AssetAnalysis)
            .where(AssetAnalysis.asset_id == asset_id)
            .order_by(AssetAnalysis.created_at.desc())
            .limit(limit)
        )

        if analyzer_id:
            query = query.where(AssetAnalysis.analyzer_id == analyzer_id)
        if status:
            query = query.where(AssetAnalysis.status == status)

        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def get_pending_analyses(self, limit: int = 10) -> List[AssetAnalysis]:
        """Get pending analyses for requeue processing"""
        result = await self.db.execute(
            select(AssetAnalysis)
            .where(AssetAnalysis.status == AnalysisStatus.PENDING)
            .order_by(AssetAnalysis.priority, AssetAnalysis.created_at)
            .limit(limit)
        )
        return list(result.scalars().all())

    async def get_processing_analyses(self) -> List[AssetAnalysis]:
        """Get all processing analyses for status polling"""
        result = await self.db.execute(
            select(AssetAnalysis)
            .where(AssetAnalysis.status == AnalysisStatus.PROCESSING)
            .order_by(AssetAnalysis.started_at)
        )
        return list(result.scalars().all())

    # ===== PRIVATE HELPERS =====

    async def _get_analysis(self, analysis_id: int) -> AssetAnalysis:
        """Get analysis by ID or raise ResourceNotFoundError"""
        analysis = await self.db.get(AssetAnalysis, analysis_id)
        if not analysis:
            raise ResourceNotFoundError(f"Analysis {analysis_id} not found")
        return analysis

    async def _get_asset(self, asset_id: int) -> Asset:
        """Get asset by ID or raise ResourceNotFoundError"""
        asset = await self.db.get(Asset, asset_id)
        if not asset:
            raise ResourceNotFoundError(f"Asset {asset_id} not found")
        return asset

    async def _resolve_execution_config(
        self,
        *,
        user_id: int,
        asset: Asset,
        analyzer_id: str,
    ) -> ResolvedAnalysisExecution:
        """Resolve canonical analyzer and reproducible execution metadata."""
        canonical_id = analyzer_registry.resolve_legacy(analyzer_id)

        instance_service = AnalyzerInstanceService(self.db)
        instances = await instance_service.list_instances(
            owner_user_id=user_id,
            analyzer_id=canonical_id,
            enabled_only=True,
        )

        selected_instance = max(
            instances,
            key=lambda item: (item.priority, item.id or 0),
            default=None,
        )

        try:
            resolved = resolve_analyzer_execution(
                AnalyzerExecutionRequest(
                    analyzer_id=canonical_id,
                    target=AnalyzerTarget.ASSET,
                    require_enabled=True,
                    explicit_provider_id=(
                        selected_instance.provider_id if selected_instance is not None else None
                    ),
                    explicit_model_id=(
                        selected_instance.model_id if selected_instance is not None else None
                    ),
                    fallback_provider_id=(
                        None if selected_instance is not None else asset.provider_id
                    ),
                    require_provider=True,
                )
            )
        except AnalyzerPipelineError as e:
            raise InvalidOperationError(e.message)

        if not resolved.provider_id:
            raise InvalidOperationError(
                f"Analyzer '{resolved.analyzer_id}' has no resolved provider"
            )

        analyzer_definition_version = await self._resolve_analyzer_definition_version(
            resolved.analyzer_id,
            resolved.analyzer,
        )
        effective_config_hash = self._compute_effective_config_hash(
            analyzer_id=resolved.analyzer_id,
            provider_id=resolved.provider_id,
            model_id=resolved.model_id,
            analyzer_definition_version=analyzer_definition_version,
            analyzer_config=resolved.analyzer.config or {},
            instance_id=selected_instance.id if selected_instance is not None else None,
            instance_config=selected_instance.config if selected_instance is not None else {},
        )

        return ResolvedAnalysisExecution(
            analyzer_id=resolved.analyzer_id,
            provider_id=resolved.provider_id,
            model_id=resolved.model_id,
            analyzer_definition_version=analyzer_definition_version,
            effective_config_hash=effective_config_hash,
        )

    def _resolve_analysis_point(
        self,
        *,
        asset: Asset,
        analyzer_intent: Optional[str],
        analysis_point: Optional[str],
    ) -> str:
        if isinstance(analysis_point, str) and analysis_point.strip():
            return analysis_point.strip()
        if isinstance(analyzer_intent, str) and analyzer_intent.strip():
            return analyzer_intent.strip()
        media_type = asset.media_type.value if hasattr(asset.media_type, "value") else str(asset.media_type)
        return f"manual_analysis_{media_type}"

    def _compute_input_fingerprint(
        self,
        *,
        asset: Asset,
        prompt: Optional[str],
        params: Dict[str, Any],
        analysis_point: str,
    ) -> str:
        asset_fingerprint = asset.sha256 or f"asset-id:{asset.id}"
        payload = {
            "asset_fingerprint": asset_fingerprint,
            "analysis_point": analysis_point,
            "prompt": prompt or "",
            "params": params or {},
        }
        return self._stable_hash(payload)

    def _compute_dedupe_key(
        self,
        *,
        asset_id: int,
        analysis_point: str,
        analyzer_id: str,
        effective_config_hash: str,
        input_fingerprint: str,
    ) -> str:
        return self._stable_hash(
            {
                "asset_id": asset_id,
                "analysis_point": analysis_point,
                "analyzer_id": analyzer_id,
                "effective_config_hash": effective_config_hash,
                "input_fingerprint": input_fingerprint,
            }
        )

    async def _find_existing_analysis(
        self,
        *,
        asset_id: int,
        analysis_point: str,
        analyzer_id: str,
        effective_config_hash: str,
        input_fingerprint: str,
    ) -> Optional[AssetAnalysis]:
        result = await self.db.execute(
            select(AssetAnalysis)
            .where(AssetAnalysis.asset_id == asset_id)
            .where(AssetAnalysis.analysis_point == analysis_point)
            .where(AssetAnalysis.analyzer_id == analyzer_id)
            .where(AssetAnalysis.effective_config_hash == effective_config_hash)
            .where(AssetAnalysis.input_fingerprint == input_fingerprint)
            .where(
                AssetAnalysis.status.in_(
                    [
                        AnalysisStatus.PENDING,
                        AnalysisStatus.PROCESSING,
                        AnalysisStatus.COMPLETED,
                    ]
                )
            )
            .order_by(AssetAnalysis.created_at.desc())
            .limit(1)
        )
        return result.scalar_one_or_none()

    async def _resolve_analyzer_definition_version(
        self,
        analyzer_id: str,
        analyzer,
    ) -> str:
        result = await self.db.execute(
            select(AnalyzerDefinition).where(AnalyzerDefinition.analyzer_id == analyzer_id).limit(1)
        )
        definition = result.scalar_one_or_none()
        if definition is not None:
            version = definition.version if definition.version and definition.version > 0 else 1
            return f"db:{definition.id}:v{version}"

        registry_signature = self._stable_hash(
            {
                "id": analyzer.id,
                "name": analyzer.name,
                "kind": analyzer.kind.value if hasattr(analyzer.kind, "value") else str(analyzer.kind),
                "target": analyzer.target.value if hasattr(analyzer.target, "value") else str(analyzer.target),
                "provider_id": analyzer.provider_id,
                "model_id": analyzer.model_id,
                "config": analyzer.config or {},
                "source_plugin_id": analyzer.source_plugin_id,
            }
        )
        return f"registry:{registry_signature[:16]}"

    def _compute_effective_config_hash(
        self,
        *,
        analyzer_id: str,
        provider_id: str,
        model_id: Optional[str],
        analyzer_definition_version: str,
        analyzer_config: Dict[str, Any],
        instance_id: Optional[int],
        instance_config: Dict[str, Any],
    ) -> str:
        payload = {
            "analyzer_id": analyzer_id,
            "provider_id": provider_id,
            "model_id": model_id,
            "analyzer_definition_version": analyzer_definition_version,
            "analyzer_config": analyzer_config or {},
            "instance_id": instance_id,
            "instance_config": instance_config or {},
        }
        return self._stable_hash(payload)

    def _stable_hash(self, payload: Dict[str, Any]) -> str:
        normalized = json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=True, default=str)
        return hashlib.sha256(normalized.encode("utf-8")).hexdigest()

    async def _enqueue_analysis_job(self, analysis_id: int) -> None:
        try:
            from pixsim7.backend.main.infrastructure.redis import get_arq_pool

            arq_pool = await get_arq_pool()
            await arq_pool.enqueue_job(
                "process_analysis",
                analysis_id=analysis_id,
            )
            logger.info("analysis_queued analysis_id=%s", analysis_id)
        except Exception as e:
            logger.error("analysis_queue_failed analysis_id=%s error=%s", analysis_id, str(e))
