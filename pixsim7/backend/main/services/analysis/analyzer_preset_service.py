"""
Analyzer Preset Service

Handles user presets and admin approval workflow.
Approved presets are merged into analyzer registry configuration.
"""
from __future__ import annotations

import logging
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from pixsim7.backend.main.domain.analyzer_preset import AnalyzerPreset
from pixsim7.backend.main.domain.enums import ReviewStatus
from pixsim7.backend.main.shared.presets.review import (
    PresetReviewError,
    ReviewWorkflow,
)
from pixsim7.backend.main.services.prompt.parser import analyzer_registry
from pixsim7.backend.main.shared.datetime_utils import utcnow

logger = logging.getLogger(__name__)


class AnalyzerPresetError(PresetReviewError):
    """Raised when analyzer preset validation fails."""


review_workflow = ReviewWorkflow(error_cls=AnalyzerPresetError)


class AnalyzerPresetService:
    """
    Service for managing analyzer presets.
    """

    def __init__(self, session: AsyncSession):
        self.session = session

    async def list_presets(
        self,
        *,
        owner_user_id: Optional[int],
        analyzer_id: Optional[str] = None,
        status: Optional[ReviewStatus] = None,
        include_public: bool = False,
        include_all: bool = False,
    ) -> list[AnalyzerPreset]:
        stmt = select(AnalyzerPreset)

        if not include_all:
            if include_public and owner_user_id is not None:
                stmt = stmt.where(
                    (AnalyzerPreset.owner_user_id == owner_user_id)
                    | (AnalyzerPreset.status == ReviewStatus.APPROVED)
                )
            elif include_public:
                stmt = stmt.where(AnalyzerPreset.status == ReviewStatus.APPROVED)
            else:
                if owner_user_id is None:
                    raise AnalyzerPresetError("Owner user ID required")
                stmt = stmt.where(AnalyzerPreset.owner_user_id == owner_user_id)

        if analyzer_id:
            stmt = stmt.where(AnalyzerPreset.analyzer_id == analyzer_id)

        if status:
            stmt = stmt.where(AnalyzerPreset.status == status)

        result = await self.session.execute(stmt.order_by(AnalyzerPreset.updated_at.desc()))
        return list(result.scalars().all())

    async def get_preset(self, preset_entry_id: int) -> Optional[AnalyzerPreset]:
        return await self.session.get(AnalyzerPreset, preset_entry_id)

    async def get_user_preset(
        self,
        *,
        owner_user_id: int,
        analyzer_id: str,
        preset_id: str,
    ) -> Optional[AnalyzerPreset]:
        result = await self.session.execute(
            select(AnalyzerPreset).where(
                AnalyzerPreset.owner_user_id == owner_user_id,
                AnalyzerPreset.analyzer_id == analyzer_id,
                AnalyzerPreset.preset_id == preset_id,
            )
        )
        return result.scalar_one_or_none()

    async def create_preset(
        self,
        *,
        owner_user_id: int,
        analyzer_id: str,
        preset_id: str,
        name: str,
        description: Optional[str],
        config: dict,
    ) -> AnalyzerPreset:
        if not analyzer_registry.get(analyzer_id):
            raise AnalyzerPresetError("Analyzer ID not found", status_code=404)
        if not preset_id:
            raise AnalyzerPresetError("Preset ID is required")
        if not isinstance(config, dict):
            raise AnalyzerPresetError("Config must be a dictionary")

        existing = await self.get_user_preset(
            owner_user_id=owner_user_id,
            analyzer_id=analyzer_id,
            preset_id=preset_id,
        )
        if existing:
            raise AnalyzerPresetError("Preset ID already exists", status_code=409)

        preset = AnalyzerPreset(
            analyzer_id=analyzer_id,
            preset_id=preset_id,
            name=name,
            description=description,
            config=config,
            status=ReviewStatus.DRAFT,
            owner_user_id=owner_user_id,
            created_at=utcnow(),
            updated_at=utcnow(),
        )

        self.session.add(preset)
        await self.session.flush()
        return preset

    async def update_preset(
        self,
        *,
        preset_entry_id: int,
        owner_user_id: int,
        name: Optional[str],
        description: Optional[str],
        preset_id: Optional[str],
        config: Optional[dict],
    ) -> Optional[AnalyzerPreset]:
        preset = await self.get_preset(preset_entry_id)
        if not preset:
            return None
        if preset.owner_user_id != owner_user_id:
            raise AnalyzerPresetError("Not allowed", status_code=403)
        review_workflow.ensure_editable(preset.status)

        if preset_id is not None:
            if not preset_id:
                raise AnalyzerPresetError("Preset ID cannot be empty")
            existing = await self.get_user_preset(
                owner_user_id=owner_user_id,
                analyzer_id=preset.analyzer_id,
                preset_id=preset_id,
            )
            if existing and existing.id != preset.id:
                raise AnalyzerPresetError("Preset ID already exists", status_code=409)
            preset.preset_id = preset_id

        if name is not None:
            preset.name = name
        if description is not None:
            preset.description = description
        if config is not None:
            if not isinstance(config, dict):
                raise AnalyzerPresetError("Config must be a dictionary")
            preset.config = config

        preset.updated_at = utcnow()
        await self.session.flush()
        return preset

    async def delete_preset(
        self,
        *,
        preset_entry_id: int,
        owner_user_id: int,
    ) -> bool:
        preset = await self.get_preset(preset_entry_id)
        if not preset:
            return False
        if preset.owner_user_id != owner_user_id:
            raise AnalyzerPresetError("Not allowed", status_code=403)
        review_workflow.ensure_deletable(preset.status)

        await self.session.delete(preset)
        await self.session.flush()
        return True

    async def submit_preset(self, *, preset_entry_id: int, owner_user_id: int) -> AnalyzerPreset:
        preset = await self.get_preset(preset_entry_id)
        if not preset:
            raise AnalyzerPresetError("Preset not found", status_code=404)
        if preset.owner_user_id != owner_user_id:
            raise AnalyzerPresetError("Not allowed", status_code=403)
        review_workflow.submit(preset)
        await self.session.flush()
        return preset

    async def approve_preset(
        self,
        *,
        preset_entry_id: int,
        admin_user_id: int,
    ) -> AnalyzerPreset:
        preset = await self.get_preset(preset_entry_id)
        if not preset:
            raise AnalyzerPresetError("Preset not found", status_code=404)
        conflict = await self.session.execute(
            select(AnalyzerPreset).where(
                AnalyzerPreset.analyzer_id == preset.analyzer_id,
                AnalyzerPreset.preset_id == preset.preset_id,
                AnalyzerPreset.status == ReviewStatus.APPROVED,
            )
        )
        existing = conflict.scalar_one_or_none()
        if existing and existing.id != preset.id:
            raise AnalyzerPresetError("Preset ID already approved", status_code=409)

        if _registry_has_preset(preset.analyzer_id, preset.preset_id):
            raise AnalyzerPresetError(
                "Preset ID already exists in analyzer definition",
                status_code=409,
            )

        review_workflow.approve(preset, admin_user_id=admin_user_id)
        await self.session.flush()

        _apply_preset_to_registry(preset)

        return preset

    async def reject_preset(
        self,
        *,
        preset_entry_id: int,
        admin_user_id: int,
        reason: Optional[str],
    ) -> AnalyzerPreset:
        preset = await self.get_preset(preset_entry_id)
        if not preset:
            raise AnalyzerPresetError("Preset not found", status_code=404)
        review_workflow.reject(preset, admin_user_id=admin_user_id, reason=reason)
        await self.session.flush()
        return preset


async def load_analyzer_presets(session: AsyncSession) -> int:
    """
    Load approved presets and apply them to analyzer registry.
    """
    result = await session.execute(
        select(AnalyzerPreset).where(AnalyzerPreset.status == ReviewStatus.APPROVED)
    )
    presets = list(result.scalars().all())

    count = 0
    for preset in presets:
        if _apply_preset_to_registry(preset):
            count += 1

    logger.info("analyzer_presets_loaded", count=count)
    return count


def _registry_has_preset(analyzer_id: str, preset_id: str) -> bool:
    analyzer = analyzer_registry.get(analyzer_id)
    if not analyzer:
        return False
    config = analyzer.config or {}
    presets = config.get("presets")
    return isinstance(presets, dict) and preset_id in presets


def _apply_preset_to_registry(preset: AnalyzerPreset) -> bool:
    analyzer = analyzer_registry.get(preset.analyzer_id)
    if not analyzer:
        logger.warning(
            "analyzer_preset_missing_analyzer",
            analyzer_id=preset.analyzer_id,
            preset_id=preset.preset_id,
        )
        return False

    config = dict(analyzer.config or {})
    presets = config.get("presets")
    if not isinstance(presets, dict):
        presets = {}
    presets[preset.preset_id] = preset.config or {}
    config["presets"] = presets
    analyzer.config = config
    analyzer_registry.register(analyzer)
    return True
