"""
Interaction target adapters.

Encapsulates target-specific context, gating, and outcome handling.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
import importlib
import logging
import os
from typing import Any, Dict, List, Optional, Tuple, Union, TYPE_CHECKING

from sqlalchemy.ext.asyncio import AsyncSession

from pixsim7.backend.main.domain.game.core.models import GameSession
from pixsim7.backend.main.domain.game.interactions.interactions import (
    BehaviorGating,
    GenerationLaunch,
    InteractionContext,
    InteractionParticipant,
    InteractionTarget,
    MoodGating,
    StatDelta,
    TargetEffects,
    parse_entity_ref,
    coerce_entity_id,
)
from pixsim7.backend.main.lib.registry.simple import SimpleRegistry
from pixsim7.backend.main.services.links.template_resolver import resolve_template_to_runtime

if TYPE_CHECKING:
    from pixsim7.backend.main.infrastructure.plugins.context import PluginContext


logger = logging.getLogger(__name__)


async def resolve_target_id(
    target: InteractionTarget,
    db: Optional[AsyncSession],
) -> Union[int, str]:
    """
    Resolve a target ID from an explicit ID or template reference.

    Raises:
        ValueError: If resolution is not possible without a database or target info is missing.
    """
    if target.id is not None:
        return target.id
    if target.ref:
        _, raw_id = parse_entity_ref(target.ref)
        return coerce_entity_id(raw_id)
    if target.template_kind and target.template_id:
        if not db:
            raise ValueError("Database required for template resolution")
        return await resolve_template_to_runtime(
            db,
            target.template_kind,
            target.template_id,
            link_id=target.link_id,
        )
    raise ValueError("target.id or template reference is required")


class InteractionTargetAdapter(ABC):
    """Target-specific behavior for interactions."""

    supports_behavior_gating: bool = False
    supports_mood_gating: bool = False
    supports_target_effects: bool = False
    supports_generation_launch: bool = False
    supports_narrative_program: bool = False
    supports_cooldown_tracking: bool = False

    @property
    @abstractmethod
    def kind(self) -> str:
        """Target kind identifier (e.g., "npc")."""
        raise NotImplementedError

    def normalize_target_id(self, target_id: Union[int, str]) -> Union[int, str]:
        """Normalize target identifiers into the adapter's canonical type."""
        return target_id

    @abstractmethod
    async def load_target(
        self,
        ctx: "PluginContext",
        target_id: Union[int, str],
    ) -> Optional[Dict[str, Any]]:
        """Load target data using capability APIs."""
        raise NotImplementedError

    def get_target_roles(self, world: Dict[str, Any], target_id: Union[int, str]) -> List[str]:
        """Return world role bindings for this target."""
        return []

    def build_context(
        self,
        session: Dict[str, Any],
        target_id: Union[int, str],
        location_id: Optional[int] = None,
        participants: Optional[List["InteractionParticipant"]] = None,
        primary_role: Optional[str] = None,
    ) -> InteractionContext:
        """Build an interaction context snapshot for gating."""
        stats_snapshot = session.get("stats") or {}
        flags = session.get("flags") or {}
        world_time = session.get("world_time", 0)
        return InteractionContext(
            locationId=location_id,
            statsSnapshot=stats_snapshot or None,
            worldTime=int(world_time) if world_time is not None else None,
            sessionFlags=flags,
            participants=participants,
            primaryRole=primary_role,
        )

    def check_behavior_gating(
        self,
        gating: BehaviorGating,
        context: InteractionContext,
        target_id: Union[int, str],
    ) -> Tuple[bool, Optional[str]]:
        return False, "Target kind not supported for behavior gating"

    def check_mood_gating(
        self,
        gating: MoodGating,
        context: InteractionContext,
        target_id: Union[int, str],
    ) -> Tuple[bool, Optional[str]]:
        return False, "Target kind not supported for mood gating"

    def normalize_stat_deltas(
        self,
        deltas: List[StatDelta],
        target_id: Union[int, str],
    ) -> List[StatDelta]:
        return deltas

    async def apply_target_effects(
        self,
        db: AsyncSession,
        session: GameSession,
        target_id: Union[int, str],
        effects: TargetEffects,
        world_time: Optional[float] = None,
        participants: Optional[List[InteractionParticipant]] = None,
        primary_role: Optional[str] = None,
    ) -> None:
        raise ValueError(f"Target kind '{self.kind}' does not support target effects")

    async def prepare_generation_launch(
        self,
        db: AsyncSession,
        session: GameSession,
        target_id: Union[int, str],
        launch: GenerationLaunch,
        player_input: Optional[str] = None,
        participants: Optional[List[InteractionParticipant]] = None,
        primary_role: Optional[str] = None,
    ) -> Optional[str]:
        raise ValueError(f"Target kind '{self.kind}' does not support generation launches")

    async def launch_narrative_program(
        self,
        db: AsyncSession,
        session: GameSession,
        target_id: Union[int, str],
        program_id: str,
        participants: Optional[List[InteractionParticipant]] = None,
        primary_role: Optional[str] = None,
    ) -> Optional[Dict[str, Any]]:
        raise ValueError(f"Target kind '{self.kind}' does not support narrative programs")

    async def track_interaction_cooldown(
        self,
        session: GameSession,
        target_id: Union[int, str],
        interaction_id: str,
        world_time: Optional[float] = None,
        participants: Optional[List[InteractionParticipant]] = None,
        primary_role: Optional[str] = None,
    ) -> None:
        raise ValueError(f"Target kind '{self.kind}' does not support cooldown tracking")


DEFAULT_ADAPTER_MODULES = (
    "pixsim7.backend.main.domain.game.interactions.adapters.npc",
)


def _resolve_adapter_modules() -> List[str]:
    # Supports comma-separated module paths or short names via INTERACTION_ADAPTERS.
    raw = os.getenv("INTERACTION_ADAPTERS")
    if not raw:
        return list(DEFAULT_ADAPTER_MODULES)

    modules = []
    for entry in raw.split(","):
        name = entry.strip()
        if not name:
            continue
        if "." in name:
            modules.append(name)
        else:
            modules.append(f"pixsim7.backend.main.domain.game.interactions.adapters.{name}")
    return modules or list(DEFAULT_ADAPTER_MODULES)


class InteractionTargetAdapterRegistry(SimpleRegistry[str, InteractionTargetAdapter]):
    """Registry for target adapters keyed by target kind."""

    def __init__(self):
        super().__init__(
            name="InteractionTargetAdapterRegistry",
            allow_overwrite=False,
            seed_on_init=True,
            log_operations=False,
        )

    def _get_item_key(self, item: InteractionTargetAdapter) -> str:
        return item.kind

    def _seed_defaults(self) -> None:
        for module_name in _resolve_adapter_modules():
            try:
                module = importlib.import_module(module_name)
            except Exception as exc:
                logger.warning("Failed to load interaction adapter module %s: %s", module_name, exc)
                continue
            register = getattr(module, "register_adapters", None)
            if not register:
                logger.warning("Interaction adapter module %s missing register_adapters", module_name)
                continue
            register(self)


target_adapter_registry = InteractionTargetAdapterRegistry()


def get_target_adapter(kind: str) -> Optional[InteractionTargetAdapter]:
    return target_adapter_registry.get_or_none(kind)
