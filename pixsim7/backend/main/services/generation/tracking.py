"""
GenerationTrackingService - Read-only facade for unified generation provenance

Aggregates data across three models:
- Generation: job lifecycle (status, timing, provider, params)
- ProviderSubmission: attempt-level telemetry/audit
- GenerationBatchItemManifest: durable asset/run provenance

This service is the single entry point for product code that needs to join
generation data across these models. Direct cross-table joins outside this
facade should be avoided to prevent drift.
"""

import logging
from typing import Any, Dict, List, Optional
from uuid import UUID

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from pixsim7.backend.main.domain import (
    Asset,
    Generation,
    GenerationBatchItemManifest,
    User,
)
from pixsim7.backend.main.domain.providers import ProviderSubmission

logger = logging.getLogger(__name__)


class GenerationTrackingService:
    """
    Read-only facade that unifies generation lifecycle, provider submissions,
    and batch-item manifests into stable DTOs.

    All methods return plain dicts matching the Pydantic response schemas
    defined in the API layer.
    """

    def __init__(self, db: AsyncSession):
        self.db = db

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    async def get_asset_tracking(
        self, asset_id: int, user: User
    ) -> Dict[str, Any]:
        """
        Unified tracking view for a single asset.

        Returns generation summary, manifest summary, latest provider
        submission summary, and any consistency warnings.
        """
        # 1. Verify asset ownership
        asset = await self._get_owned_asset(asset_id, user)
        if asset is None:
            return None

        warnings: List[str] = []

        # 2. Load manifest (keyed by asset_id)
        manifest = await self._get_manifest_for_asset(asset_id)

        # 3. Load generation (via manifest or direct lookup on asset)
        generation = None
        generation_id = manifest.generation_id if manifest else None

        if generation_id:
            generation = await self.db.get(Generation, generation_id)
            if generation is None:
                warnings.append(
                    f"manifest.generation_id={generation_id} references a missing generation row"
                )

        # 4. Cross-check: asset might have a generation pointing to it
        if generation is None:
            generation = await self._find_generation_for_asset(asset_id)

        # 5. Consistency checks
        if generation and manifest:
            if generation.asset_id and generation.asset_id != asset_id:
                warnings.append(
                    f"generation.asset_id={generation.asset_id} differs from manifest asset_id={asset_id}"
                )
            if manifest.generation_id and manifest.generation_id != generation.id:
                warnings.append(
                    f"manifest.generation_id={manifest.generation_id} differs from resolved generation.id={generation.id}"
                )

        # 6. Latest provider submission
        latest_sub = None
        if generation:
            latest_sub = await self._get_latest_submission(generation.id)

        return {
            "asset_id": asset_id,
            "generation": self._generation_summary(generation) if generation else None,
            "manifest": self._manifest_summary(manifest) if manifest else None,
            "latest_submission": self._submission_summary(latest_sub) if latest_sub else None,
            "consistency_warnings": warnings,
        }

    async def get_run_tracking(
        self, run_id: UUID, user: User
    ) -> Optional[Dict[str, Any]]:
        """
        Unified tracking view for an entire generation run (batch).

        Returns run-level summary, ordered items with generation status
        and latest submission, and consistency warnings.
        """
        warnings: List[str] = []

        # 1. Load all manifests for this batch, scoped to user
        manifests = await self._get_manifests_for_run(run_id, user)
        if not manifests:
            return None

        # 2. Collect generation_ids and load generations in batch
        gen_ids = [m.generation_id for m in manifests if m.generation_id]
        generations_map = await self._load_generations(gen_ids)

        # 3. Load latest submissions for all generations in batch
        submissions_map = await self._load_latest_submissions(gen_ids)

        # 4. Build ordered items
        items: List[Dict[str, Any]] = []
        for manifest in manifests:
            item_warnings: List[str] = []
            gen = generations_map.get(manifest.generation_id) if manifest.generation_id else None

            if manifest.generation_id and manifest.generation_id not in generations_map:
                item_warnings.append(
                    f"manifest.generation_id={manifest.generation_id} references a missing generation"
                )

            if gen and gen.asset_id and gen.asset_id != manifest.asset_id:
                item_warnings.append(
                    f"generation.asset_id={gen.asset_id} differs from manifest.asset_id={manifest.asset_id}"
                )

            sub = submissions_map.get(manifest.generation_id) if manifest.generation_id else None

            items.append({
                **self._manifest_summary(manifest),
                "generation_status": gen.status.value if gen else None,
                "generation_provider_id": gen.provider_id if gen else None,
                "generation_operation_type": gen.operation_type.value if gen else None,
                "latest_submission": self._submission_summary(sub) if sub else None,
                "item_warnings": item_warnings,
            })

        # 5. Run-level warnings
        item_indices = [m.item_index for m in manifests]
        if item_indices != sorted(item_indices):
            warnings.append("Item indices are not in ascending order")

        expected_indices = list(range(min(item_indices), max(item_indices) + 1))
        if sorted(item_indices) != expected_indices:
            warnings.append(
                f"Item index gap detected: expected {expected_indices}, got {sorted(item_indices)}"
            )

        created_at = max(m.created_at for m in manifests)

        return {
            "run": {
                "run_id": str(run_id),
                "item_count": len(manifests),
                "created_at": created_at.isoformat() if created_at else None,
                "first_item_index": min(item_indices),
                "last_item_index": max(item_indices),
            },
            "items": items,
            "consistency_warnings": warnings,
        }

    async def get_generation_tracking(
        self, generation_id: int, user: User
    ) -> Optional[Dict[str, Any]]:
        """
        Unified tracking view for a single generation.

        Returns generation details, latest submission, linked manifest,
        and consistency warnings.
        """
        warnings: List[str] = []

        # 1. Load generation with auth check
        generation = await self.db.get(Generation, generation_id)
        if generation is None:
            return None

        if generation.user_id != user.id and not user.is_admin():
            return None

        # 2. Latest submission
        latest_sub = await self._get_latest_submission(generation_id)

        # 3. Linked manifest (via generation.asset_id if present)
        manifest = None
        if generation.asset_id:
            manifest = await self._get_manifest_for_asset(generation.asset_id)

        # 4. Consistency checks
        if manifest and manifest.generation_id and manifest.generation_id != generation_id:
            warnings.append(
                f"manifest.generation_id={manifest.generation_id} does not match queried generation_id={generation_id}"
            )

        if generation.asset_id and manifest is None:
            warnings.append(
                f"generation.asset_id={generation.asset_id} exists but no manifest found for that asset"
            )

        return {
            "generation": self._generation_summary(generation),
            "manifest": self._manifest_summary(manifest) if manifest else None,
            "latest_submission": self._submission_summary(latest_sub) if latest_sub else None,
            "consistency_warnings": warnings,
        }

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    async def _get_owned_asset(self, asset_id: int, user: User) -> Optional[Asset]:
        """Load asset and verify ownership."""
        asset = await self.db.get(Asset, asset_id)
        if asset is None:
            return None
        if asset.user_id != user.id and not user.is_admin():
            return None
        return asset

    async def _get_manifest_for_asset(self, asset_id: int) -> Optional[GenerationBatchItemManifest]:
        """Load manifest by asset_id (PK)."""
        return await self.db.get(GenerationBatchItemManifest, asset_id)

    async def _find_generation_for_asset(self, asset_id: int) -> Optional[Generation]:
        """Find generation that produced this asset (via Generation.asset_id)."""
        result = await self.db.execute(
            select(Generation)
            .where(Generation.asset_id == asset_id)
            .order_by(Generation.created_at.desc())
            .limit(1)
        )
        return result.scalars().first()

    async def _get_manifests_for_run(
        self, run_id: UUID, user: User
    ) -> List[GenerationBatchItemManifest]:
        """Load all manifests for a batch, scoped to user via asset ownership."""
        result = await self.db.execute(
            select(GenerationBatchItemManifest)
            .join(Asset, Asset.id == GenerationBatchItemManifest.asset_id)
            .where(GenerationBatchItemManifest.batch_id == run_id)
            .where(Asset.user_id == user.id)
            .order_by(
                GenerationBatchItemManifest.item_index.asc(),
                GenerationBatchItemManifest.created_at.asc(),
                GenerationBatchItemManifest.asset_id.asc(),
            )
        )
        return list(result.scalars().all())

    async def _get_latest_submission(self, generation_id: int) -> Optional[ProviderSubmission]:
        """Get the latest provider submission for a generation."""
        result = await self.db.execute(
            select(ProviderSubmission)
            .where(ProviderSubmission.generation_id == generation_id)
            .where(ProviderSubmission.analysis_id.is_(None))
            .order_by(
                ProviderSubmission.retry_attempt.desc(),
                ProviderSubmission.id.desc(),
            )
            .limit(1)
        )
        return result.scalars().first()

    async def _load_generations(self, generation_ids: List[int]) -> Dict[int, Generation]:
        """Batch-load generations by ID."""
        if not generation_ids:
            return {}
        result = await self.db.execute(
            select(Generation).where(Generation.id.in_(generation_ids))
        )
        return {g.id: g for g in result.scalars().all()}

    async def _load_latest_submissions(
        self, generation_ids: List[int]
    ) -> Dict[int, ProviderSubmission]:
        """Batch-load latest provider submission per generation."""
        if not generation_ids:
            return {}

        result = await self.db.execute(
            select(ProviderSubmission)
            .where(ProviderSubmission.generation_id.in_(generation_ids))
            .where(ProviderSubmission.analysis_id.is_(None))
            .order_by(
                ProviderSubmission.generation_id.asc(),
                ProviderSubmission.retry_attempt.desc(),
                ProviderSubmission.id.desc(),
            )
        )

        submissions: Dict[int, ProviderSubmission] = {}
        for sub in result.scalars().all():
            if sub.generation_id not in submissions:
                submissions[sub.generation_id] = sub
        return submissions

    # ------------------------------------------------------------------
    # DTO projections
    # ------------------------------------------------------------------

    @staticmethod
    def _generation_summary(gen: Generation) -> Dict[str, Any]:
        """Project Generation into a lightweight summary dict."""
        return {
            "id": gen.id,
            "status": gen.status.value if gen.status else None,
            "operation_type": gen.operation_type.value if gen.operation_type else None,
            "provider_id": gen.provider_id,
            "asset_id": gen.asset_id,
            "priority": gen.priority,
            "retry_count": gen.retry_count,
            "error_message": gen.error_message,
            "error_code": gen.error_code,
            "final_prompt": gen.final_prompt,
            "prompt_source_type": gen.prompt_source_type,
            "created_at": gen.created_at.isoformat() if gen.created_at else None,
            "started_at": gen.started_at.isoformat() if gen.started_at else None,
            "completed_at": gen.completed_at.isoformat() if gen.completed_at else None,
            "duration_seconds": gen.duration_seconds,
        }

    @staticmethod
    def _manifest_summary(manifest: GenerationBatchItemManifest) -> Dict[str, Any]:
        """Project GenerationBatchItemManifest into a lightweight summary dict."""
        meta = manifest.manifest_metadata or {}
        return {
            "asset_id": manifest.asset_id,
            "batch_id": str(manifest.batch_id) if manifest.batch_id else None,
            "item_index": manifest.item_index,
            "generation_id": manifest.generation_id,
            "block_template_id": str(manifest.block_template_id) if manifest.block_template_id else None,
            "template_slug": manifest.template_slug,
            "roll_seed": manifest.roll_seed,
            "selected_block_ids": manifest.selected_block_ids or [],
            "slot_results": manifest.slot_results or [],
            "assembled_prompt": manifest.assembled_prompt,
            "prompt_version_id": str(manifest.prompt_version_id) if manifest.prompt_version_id else None,
            "mode": meta.get("mode"),
            "strategy": meta.get("strategy"),
            "input_asset_ids": meta.get("input_asset_ids", []),
            "created_at": manifest.created_at.isoformat() if manifest.created_at else None,
        }

    @staticmethod
    def _submission_summary(sub: ProviderSubmission) -> Dict[str, Any]:
        """Project ProviderSubmission into a lightweight summary dict."""
        return {
            "submission_id": sub.id,
            "provider_id": sub.provider_id,
            "provider_job_id": sub.provider_job_id,
            "retry_attempt": sub.retry_attempt,
            "status": sub.status,
            "submitted_at": sub.submitted_at.isoformat() if sub.submitted_at else None,
            "responded_at": sub.responded_at.isoformat() if sub.responded_at else None,
            "duration_ms": sub.duration_ms,
        }
