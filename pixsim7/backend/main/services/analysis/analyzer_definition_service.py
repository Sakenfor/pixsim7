"""
Analyzer Definition Service

Manages CRUD operations for analyzer definitions stored in the database and
syncs them with the in-memory analyzer registry.
"""
from __future__ import annotations

from typing import Optional

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from pixsim_logging import configure_logging
from pixsim7.backend.main.domain.analyzer_definition import AnalyzerDefinition
from pixsim7.backend.main.services.prompt.parser import (
    analyzer_registry,
    AnalyzerInfo,
    AnalyzerKind,
    AnalyzerTarget,
    AnalyzerInputModality,
    AnalyzerTaskFamily,
    InstanceOptionDescriptor,
    infer_input_modality,
    infer_task_family,
)
from pixsim7.backend.main.shared.datetime_utils import utcnow

logger = configure_logging("service.analysis.definition")


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

    try:
        input_modality = (
            AnalyzerInputModality(definition.input_modality)
            if definition.input_modality
            else infer_input_modality(definition.analyzer_id, target, kind)
        )
    except ValueError:
        input_modality = infer_input_modality(definition.analyzer_id, target, kind)

    try:
        task_family = (
            AnalyzerTaskFamily(definition.task_family)
            if definition.task_family
            else infer_task_family(definition.analyzer_id, target, kind)
        )
    except ValueError:
        task_family = infer_task_family(definition.analyzer_id, target, kind)

    config = definition.config or {}
    if definition.preset_id:
        config = {**config, "preset_id": definition.preset_id}

    instance_options = [
        InstanceOptionDescriptor(**opt) if isinstance(opt, dict) else opt
        for opt in (definition.instance_options or [])
    ]

    return AnalyzerInfo(
        id=definition.analyzer_id,
        name=definition.name,
        description=definition.description or "",
        kind=kind,
        target=target,
        input_modality=input_modality,
        task_family=task_family,
        provider_id=definition.provider_id,
        model_id=definition.model_id,
        source_plugin_id=definition.source_plugin_id,
        config=config,
        enabled=definition.enabled,
        is_default=definition.is_default,
        is_legacy=definition.is_legacy,
        instance_options=instance_options,
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
        input_modality: Optional[AnalyzerInputModality],
        task_family: Optional[AnalyzerTaskFamily],
        provider_id: Optional[str],
        model_id: Optional[str],
        config: Optional[dict],
        base_analyzer_id: Optional[str],
        preset_id: Optional[str],
        enabled: bool,
        is_default: bool,
        created_by_user_id: Optional[int],
        instance_options: Optional[list] = None,
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
            input_modality=(
                input_modality.value
                if input_modality is not None
                else infer_input_modality(analyzer_id, target, kind).value
            ),
            task_family=(
                task_family.value
                if task_family is not None
                else infer_task_family(analyzer_id, target, kind).value
            ),
            provider_id=provider_id,
            model_id=model_id,
            config=config or {},
            instance_options=instance_options or [],
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
        input_modality: Optional[AnalyzerInputModality] = None,
        task_family: Optional[AnalyzerTaskFamily] = None,
        provider_id: Optional[str] = None,
        model_id: Optional[str] = None,
        config: Optional[dict] = None,
        base_analyzer_id: Optional[str] = None,
        preset_id: Optional[str] = None,
        enabled: Optional[bool] = None,
        is_default: Optional[bool] = None,
        instance_options: Optional[list] = None,
    ) -> Optional[AnalyzerDefinition]:
        definition = await self.get_definition(analyzer_id)
        if not definition:
            return None

        if enabled is False and is_default is True:
            raise AnalyzerDefinitionError("Disabled analyzers cannot be default")

        changed = False

        if name is not None:
            definition.name = name
            changed = True
        if description is not None:
            definition.description = description
            changed = True
        if kind is not None:
            definition.kind = kind.value
            changed = True
        if target is not None:
            definition.target = target.value
            changed = True
        metadata_should_recompute = kind is not None or target is not None
        if input_modality is not None:
            definition.input_modality = input_modality.value
            changed = True
        elif metadata_should_recompute or not definition.input_modality:
            inferred_modality = infer_input_modality(
                definition.analyzer_id,
                AnalyzerTarget(definition.target),
                AnalyzerKind(definition.kind),
            )
            definition.input_modality = inferred_modality.value
            changed = True
        if task_family is not None:
            definition.task_family = task_family.value
            changed = True
        elif metadata_should_recompute or not definition.task_family:
            inferred_task = infer_task_family(
                definition.analyzer_id,
                AnalyzerTarget(definition.target),
                AnalyzerKind(definition.kind),
            )
            definition.task_family = inferred_task.value
            changed = True
        if provider_id is not None:
            definition.provider_id = provider_id
            changed = True
        if model_id is not None:
            definition.model_id = model_id
            changed = True
        if config is not None:
            if not isinstance(config, dict):
                raise AnalyzerDefinitionError("Config must be a dictionary")
            definition.config = config
            changed = True
        if base_analyzer_id is not None:
            if base_analyzer_id == analyzer_id:
                raise AnalyzerDefinitionError("Base analyzer cannot reference itself")
            definition.base_analyzer_id = base_analyzer_id
            changed = True
        if preset_id is not None:
            definition.preset_id = preset_id
            changed = True
        if instance_options is not None:
            definition.instance_options = instance_options
            changed = True
        if enabled is not None:
            definition.enabled = enabled
            if enabled is False:
                definition.is_default = False
            changed = True
        if is_default is not None:
            definition.is_default = is_default
            changed = True

        if changed:
            definition.version = max(1, definition.version or 1) + 1
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
