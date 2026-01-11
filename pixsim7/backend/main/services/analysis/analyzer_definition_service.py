"""
Analyzer Definition Service

Manages CRUD operations for analyzer definitions stored in the database and
syncs them with the in-memory analyzer registry.
"""
from __future__ import annotations

import logging
from typing import Optional

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from pixsim7.backend.main.domain.analyzer_definition import AnalyzerDefinition
from pixsim7.backend.main.services.prompt.parser import (
    analyzer_registry,
    AnalyzerInfo,
    AnalyzerKind,
    AnalyzerTarget,
)
from pixsim7.backend.main.shared.datetime_utils import utcnow

logger = logging.getLogger(__name__)


class AnalyzerDefinitionError(Exception):
    """Raised when analyzer definition validation fails."""
    def __init__(self, message: str, status_code: int = 400):
        self.message = message
        self.status_code = status_code
        super().__init__(message)


def _merge_definition_config(
    base_config: Optional[dict],
    override_config: Optional[dict],
) -> dict:
    merged: dict = {}
    base_config = base_config or {}
    override_config = override_config or {}

    base_presets = base_config.get("presets")
    override_presets = override_config.get("presets")
    if isinstance(base_presets, dict) or isinstance(override_presets, dict):
        merged_presets: dict = {}
        if isinstance(base_presets, dict):
            merged_presets.update(base_presets)
        if isinstance(override_presets, dict):
            merged_presets.update(override_presets)
        merged["presets"] = merged_presets

    for key, value in base_config.items():
        if key == "presets":
            continue
        merged[key] = value

    for key, value in override_config.items():
        if key == "presets":
            continue
        merged[key] = value

    return merged


def _definition_to_info(definition: AnalyzerDefinition) -> Optional[AnalyzerInfo]:
    try:
        kind = AnalyzerKind(definition.kind)
        target = AnalyzerTarget(definition.target)
    except ValueError:
        logger.warning(
            "invalid_analyzer_definition",
            analyzer_id=definition.analyzer_id,
            kind=definition.kind,
            target=definition.target,
        )
        return None

    config = definition.config or {}
    if definition.preset_id:
        config = {**config, "preset_id": definition.preset_id}

    return AnalyzerInfo(
        id=definition.analyzer_id,
        name=definition.name,
        description=definition.description or "",
        kind=kind,
        target=target,
        provider_id=definition.provider_id,
        model_id=definition.model_id,
        source_plugin_id=definition.source_plugin_id,
        config=config,
        enabled=definition.enabled,
        is_default=definition.is_default,
        is_legacy=definition.is_legacy,
    )


def _resolve_definition_info(
    definition: AnalyzerDefinition,
    definitions_by_id: dict[str, AnalyzerDefinition],
    resolving: set[str],
) -> AnalyzerInfo:
    if definition.analyzer_id in resolving:
        raise AnalyzerDefinitionError("Circular base analyzer reference")

    resolving.add(definition.analyzer_id)

    info = _definition_to_info(definition)
    if not info:
        raise AnalyzerDefinitionError("Invalid analyzer definition")

    if definition.base_analyzer_id:
        base_id = definition.base_analyzer_id
        base_definition = definitions_by_id.get(base_id)
        if base_definition:
            base_info = _resolve_definition_info(base_definition, definitions_by_id, resolving)
        else:
            base_info = analyzer_registry.get(base_id)
            if not base_info:
                raise AnalyzerDefinitionError(f"Base analyzer '{base_id}' not found")

        if base_info.kind != info.kind or base_info.target != info.target:
            raise AnalyzerDefinitionError(
                "Base analyzer kind/target mismatch"
            )

        info.provider_id = info.provider_id or base_info.provider_id
        info.model_id = info.model_id or base_info.model_id
        merged_config = _merge_definition_config(base_info.config, info.config)
        if definition.preset_id:
            merged_config["preset_id"] = definition.preset_id
        info.config = merged_config

    resolving.discard(definition.analyzer_id)
    return info


class AnalyzerDefinitionService:
    """
    Service for managing analyzer definitions (custom analyzers).
    """

    def __init__(self, session: AsyncSession):
        self.session = session

    async def list_definitions(self, *, include_disabled: bool = True) -> list[AnalyzerDefinition]:
        stmt = select(AnalyzerDefinition)
        if not include_disabled:
            stmt = stmt.where(AnalyzerDefinition.enabled == True)
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def get_definition(self, analyzer_id: str) -> Optional[AnalyzerDefinition]:
        result = await self.session.execute(
            select(AnalyzerDefinition).where(AnalyzerDefinition.analyzer_id == analyzer_id)
        )
        return result.scalar_one_or_none()

    async def create_definition(
        self,
        *,
        analyzer_id: str,
        name: str,
        description: Optional[str],
        kind: AnalyzerKind,
        target: AnalyzerTarget,
        provider_id: Optional[str],
        model_id: Optional[str],
        config: Optional[dict],
        base_analyzer_id: Optional[str],
        preset_id: Optional[str],
        enabled: bool,
        is_default: bool,
        created_by_user_id: Optional[int],
    ) -> AnalyzerDefinition:
        existing = await self.get_definition(analyzer_id)
        if existing:
            raise AnalyzerDefinitionError("Analyzer ID already exists", status_code=409)

        if analyzer_registry.get(analyzer_id):
            raise AnalyzerDefinitionError(
                "Analyzer ID already registered in memory",
                status_code=409,
            )

        if config is not None and not isinstance(config, dict):
            raise AnalyzerDefinitionError("Config must be a dictionary")

        if base_analyzer_id == analyzer_id:
            raise AnalyzerDefinitionError("Base analyzer cannot reference itself")

        definition = AnalyzerDefinition(
            analyzer_id=analyzer_id,
            base_analyzer_id=base_analyzer_id,
            preset_id=preset_id,
            name=name,
            description=description,
            kind=kind.value,
            target=target.value,
            provider_id=provider_id,
            model_id=model_id,
            config=config or {},
            source_plugin_id="api",
            enabled=enabled,
            is_default=is_default,
            is_legacy=False,
            created_by_user_id=created_by_user_id,
            created_at=utcnow(),
            updated_at=utcnow(),
        )

        definitions_by_id = await self._get_definitions_map(extra=definition)
        info = _resolve_definition_info(definition, definitions_by_id, set())

        if info.kind in (AnalyzerKind.LLM, AnalyzerKind.VISION) and not info.provider_id:
            raise AnalyzerDefinitionError("Provider ID is required for LLM/Vision analyzers")

        self.session.add(definition)
        await self.session.flush()

        analyzer_registry.register(info)
        if definition.is_default:
            await self._apply_default(definition)

        return definition

    async def update_definition(
        self,
        analyzer_id: str,
        *,
        name: Optional[str] = None,
        description: Optional[str] = None,
        kind: Optional[AnalyzerKind] = None,
        target: Optional[AnalyzerTarget] = None,
        provider_id: Optional[str] = None,
        model_id: Optional[str] = None,
        config: Optional[dict] = None,
        base_analyzer_id: Optional[str] = None,
        preset_id: Optional[str] = None,
        enabled: Optional[bool] = None,
        is_default: Optional[bool] = None,
    ) -> Optional[AnalyzerDefinition]:
        definition = await self.get_definition(analyzer_id)
        if not definition:
            return None

        if enabled is False and is_default is True:
            raise AnalyzerDefinitionError("Disabled analyzers cannot be default")

        if name is not None:
            definition.name = name
        if description is not None:
            definition.description = description
        if kind is not None:
            definition.kind = kind.value
        if target is not None:
            definition.target = target.value
        if provider_id is not None:
            definition.provider_id = provider_id
        if model_id is not None:
            definition.model_id = model_id
        if config is not None:
            if not isinstance(config, dict):
                raise AnalyzerDefinitionError("Config must be a dictionary")
            definition.config = config
        if base_analyzer_id is not None:
            if base_analyzer_id == analyzer_id:
                raise AnalyzerDefinitionError("Base analyzer cannot reference itself")
            definition.base_analyzer_id = base_analyzer_id
        if preset_id is not None:
            definition.preset_id = preset_id
        if enabled is not None:
            definition.enabled = enabled
            if enabled is False:
                definition.is_default = False
        if is_default is not None:
            definition.is_default = is_default

        definition.updated_at = utcnow()

        definitions_by_id = await self._get_definitions_map()
        definitions_by_id[definition.analyzer_id] = definition
        info = _resolve_definition_info(definition, definitions_by_id, set())

        if info.kind in (AnalyzerKind.LLM, AnalyzerKind.VISION) and not info.provider_id:
            raise AnalyzerDefinitionError("Provider ID is required for LLM/Vision analyzers")

        await self.session.flush()

        analyzer_registry.register(info)
        if definition.is_default:
            await self._apply_default(definition)

        return definition

    async def delete_definition(self, analyzer_id: str) -> bool:
        definition = await self.get_definition(analyzer_id)
        if not definition:
            return False

        registry_entry = analyzer_registry.get(analyzer_id)
        if registry_entry and registry_entry.source_plugin_id == definition.source_plugin_id:
            analyzer_registry.unregister(analyzer_id)

        await self.session.delete(definition)
        await self.session.flush()
        return True

    async def _get_definitions_map(
        self,
        *,
        extra: Optional[AnalyzerDefinition] = None,
    ) -> dict[str, AnalyzerDefinition]:
        result = await self.session.execute(select(AnalyzerDefinition))
        definitions = list(result.scalars().all())
        definitions_by_id = {definition.analyzer_id: definition for definition in definitions}
        if extra:
            definitions_by_id[extra.analyzer_id] = extra
        return definitions_by_id

    async def _apply_default(self, definition: AnalyzerDefinition) -> None:
        await self.session.execute(
            update(AnalyzerDefinition)
            .where(
                AnalyzerDefinition.target == definition.target,
                AnalyzerDefinition.id != definition.id,
            )
            .values(is_default=False)
        )
        analyzer_registry.set_default(definition.analyzer_id)


async def load_analyzer_definitions(session: AsyncSession) -> int:
    """
    Load analyzer definitions from database into analyzer registry.

    Returns count of loaded definitions.
    """
    result = await session.execute(select(AnalyzerDefinition))
    definitions = list(result.scalars().all())
    count = 0

    definitions_by_id = {definition.analyzer_id: definition for definition in definitions}

    for definition in definitions:
        try:
            info = _resolve_definition_info(definition, definitions_by_id, set())
        except AnalyzerDefinitionError as e:
            logger.error(
                "analyzer_definition_load_failed",
                analyzer_id=definition.analyzer_id,
                error=e.message,
            )
            continue
        analyzer_registry.register(info)
        count += 1

    # Ensure defaults are applied after all registrations
    for definition in definitions:
        if definition.is_default:
            analyzer_registry.set_default(definition.analyzer_id)

    logger.info("analyzer_definitions_loaded", count=count)
    return count
