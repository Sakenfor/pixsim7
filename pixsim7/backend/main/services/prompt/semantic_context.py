"""
Prompt Semantic Context

Builds prompt-specific semantic context from semantic packs:
- Dynamic role registry (roles + parser hints)
- Operation profiles (intent mapping overrides)
"""
from dataclasses import dataclass, field
from typing import Dict, Iterable, List, Optional

from sqlalchemy.ext.asyncio import AsyncSession

from pixsim7.backend.main.domain.semantic_pack import SemanticPackDB
from pixsim7.backend.main.services.prompt.intent_service import PromptIntentService
from pixsim7.backend.main.services.prompt.role_registry import PromptRoleRegistry
from pixsim7.backend.main.services.prompt.parser.hints import ParserHintProvider


@dataclass(frozen=True)
class PromptSemanticContext:
    """Semantic context derived from packs for prompt parsing + intent mapping."""
    role_registry: PromptRoleRegistry
    operation_profiles: Dict[str, Dict[str, str]] = field(default_factory=dict)
    packs: List[SemanticPackDB] = field(default_factory=list)

    def build_intent_service(self) -> PromptIntentService:
        """Create a PromptIntentService configured with this context."""
        intent_service = PromptIntentService(role_registry=self.role_registry)
        if self.operation_profiles:
            intent_service.register_operation_profiles(self.operation_profiles)
        return intent_service


def _merge_operation_profiles(
    packs: Iterable[SemanticPackDB],
) -> Dict[str, Dict[str, str]]:
    """Merge operation profile overrides from pack metadata (last pack wins)."""
    merged: Dict[str, Dict[str, str]] = {}

    for pack in packs:
        extra = pack.extra or {}
        profiles = extra.get("operation_profiles")
        if not isinstance(profiles, dict):
            continue
        for mode, mapping in profiles.items():
            if not isinstance(mapping, dict):
                continue
            merged[mode] = {str(role): str(intent) for role, intent in mapping.items()}

    return merged


def build_prompt_semantic_context_from_packs(
    packs: List[SemanticPackDB],
    *,
    base_registry: Optional[PromptRoleRegistry] = None,
    pack_ids: Optional[List[str]] = None,
) -> PromptSemanticContext:
    """Build semantic context from already-loaded packs."""
    ordered_packs = packs
    if pack_ids:
        pack_map = {pack.id: pack for pack in packs}
        ordered_packs = [pack_map[pack_id] for pack_id in pack_ids if pack_id in pack_map]

    role_registry = ParserHintProvider.build_role_registry(
        ordered_packs,
        base_registry=base_registry,
    )
    operation_profiles = _merge_operation_profiles(ordered_packs)

    return PromptSemanticContext(
        role_registry=role_registry,
        operation_profiles=operation_profiles,
        packs=ordered_packs,
    )


async def build_prompt_semantic_context(
    db: AsyncSession,
    *,
    pack_ids: Optional[List[str]] = None,
    status: str = "published",
    base_registry: Optional[PromptRoleRegistry] = None,
) -> PromptSemanticContext:
    """Load packs from the DB and build a PromptSemanticContext."""
    packs = await ParserHintProvider.get_active_packs(db, pack_ids=pack_ids, status=status)
    return build_prompt_semantic_context_from_packs(
        packs,
        base_registry=base_registry,
        pack_ids=pack_ids,
    )
