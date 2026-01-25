"""
Interaction target adapters.

Encapsulates target-specific context, gating, and outcome handling.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any, Dict, List, Optional, Tuple, Union, TYPE_CHECKING
import time

from sqlalchemy.ext.asyncio import AsyncSession

from pixsim7.backend.main.domain.game.core.models import GameSession, GameWorld, GameNPC
from pixsim7.backend.main.domain.game.interactions.interaction_availability import (
    check_behavior_gating,
    check_mood_gating,
)
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
    format_entity_ref,
)
from pixsim7.backend.main.lib.registry.simple import SimpleRegistry
from pixsim7.backend.main.services.links.template_resolver import resolve_template_to_runtime

if TYPE_CHECKING:
    from pixsim7.backend.main.infrastructure.plugins.context import PluginContext


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


class NpcInteractionTargetAdapter(InteractionTargetAdapter):
    """NPC-specific interaction behavior."""

    @property
    def kind(self) -> str:
        return "npc"

    def normalize_target_id(self, target_id: Union[int, str]) -> int:
        if isinstance(target_id, int):
            return target_id
        if isinstance(target_id, str) and target_id.isdigit():
            return int(target_id)
        raise ValueError("NPC target_id must be an int")

    async def load_target(
        self,
        ctx: "PluginContext",
        target_id: Union[int, str],
    ) -> Optional[Dict[str, Any]]:
        npc_id = self.normalize_target_id(target_id)
        return await ctx.world.get_npc(npc_id)

    def get_target_roles(self, world: Dict[str, Any], target_id: Union[int, str]) -> List[str]:
        npc_id = self.normalize_target_id(target_id)
        target_roles = []
        world_meta = world.get("meta") or {}
        npc_mappings = world_meta.get("npcs")
        if isinstance(npc_mappings, dict):
            for role, mapped_id in npc_mappings.items():
                if mapped_id == npc_id:
                    target_roles.append(role)
        return target_roles

    def build_context(
        self,
        session: Dict[str, Any],
        target_id: Union[int, str],
        location_id: Optional[int] = None,
        participants: Optional[List["InteractionParticipant"]] = None,
        primary_role: Optional[str] = None,
    ) -> InteractionContext:
        npc_id = self.normalize_target_id(target_id)
        stats_snapshot = session.get("stats") or {}
        flags = session.get("flags", {})
        current_activity = None
        state_tags = []
        mood_tags = []
        last_used_at = {}

        npc_key = f"npc:{npc_id}"
        npc_flags = flags.get("npcs", {}).get(npc_key, {})
        if "state" in npc_flags:
            state = npc_flags["state"]
            current_activity = state.get("currentActivity") or state.get("activity")
            state_tags = state.get("stateTags", [])

        mood_tags = npc_flags.get("moodTags", [])

        target_ref = format_entity_ref("npc", npc_id).to_string()
        interaction_state = flags.get("interactions", {}).get(target_ref, {})
        last_used_at = interaction_state.get("lastUsedAt", {})

        world_time = session.get("world_time", 0)

        return InteractionContext(
            locationId=location_id,
            currentActivityId=current_activity,
            stateTags=state_tags,
            moodTags=mood_tags,
            statsSnapshot=stats_snapshot or None,
            worldTime=int(world_time) if world_time is not None else None,
            sessionFlags=flags,
            lastUsedAt=last_used_at,
            participants=participants,
            primaryRole=primary_role,
        )

    def check_behavior_gating(
        self,
        gating: BehaviorGating,
        context: InteractionContext,
        target_id: Union[int, str],
    ) -> Tuple[bool, Optional[str]]:
        npc_id = self.normalize_target_id(target_id)
        npc_state = None
        if context.session_flags:
            npc_state = context.session_flags.get("npcs", {}).get(f"npc:{npc_id}", {}).get("state")
        return check_behavior_gating(gating, npc_state)

    def check_mood_gating(
        self,
        gating: MoodGating,
        context: InteractionContext,
        target_id: Union[int, str],
    ) -> Tuple[bool, Optional[str]]:
        return check_mood_gating(
            gating,
            context.mood_tags,
            None,
        )

    def normalize_stat_deltas(
        self,
        deltas: List[StatDelta],
        target_id: Union[int, str],
    ) -> List[StatDelta]:
        npc_id = self.normalize_target_id(target_id)
        updated = []
        for delta in deltas:
            if delta.entity_ref is None and delta.entity_type == "npc":
                resolved_id = delta.npc_id or npc_id
                delta = delta.model_copy(update={
                    "npc_id": resolved_id,
                    "entity_ref": format_entity_ref("npc", resolved_id),
                })
            updated.append(delta)
        return updated

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
        npc_id = self.normalize_target_id(target_id)
        timestamp = int(world_time) if world_time is not None else int(time.time())

        if effects.create_memory:
            npc_key = f"npc:{npc_id}"
            npcs = session.flags.get("npcs", {})
            if npc_key not in npcs:
                npcs[npc_key] = {}

            memories = npcs[npc_key].get("memories", [])
            memories.append({
                "topic": effects.create_memory.topic,
                "summary": effects.create_memory.summary,
                "importance": effects.create_memory.importance or "normal",
                "memoryType": effects.create_memory.memory_type or "short_term",
                "tags": effects.create_memory.tags or [],
                "createdAt": timestamp,
            })
            npcs[npc_key]["memories"] = memories
            session.flags["npcs"] = npcs

        if effects.trigger_emotion:
            npc_key = f"npc:{npc_id}"
            npcs = session.flags.get("npcs", {})
            if npc_key not in npcs:
                npcs[npc_key] = {}

            emotions = npcs[npc_key].get("emotions", {})
            emotions[effects.trigger_emotion.emotion] = {
                "intensity": effects.trigger_emotion.intensity,
                "triggeredAt": timestamp,
                "durationSeconds": effects.trigger_emotion.duration_seconds,
            }
            npcs[npc_key]["emotions"] = emotions
            session.flags["npcs"] = npcs

        if effects.register_world_event:
            world_events = session.flags.get("worldEvents", [])
            world_events.append({
                "eventType": effects.register_world_event.event_type,
                "eventName": effects.register_world_event.event_name,
                "description": effects.register_world_event.description,
                "relevanceScore": effects.register_world_event.relevance_score or 0.5,
                "npcId": npc_id,
                "timestamp": timestamp,
            })
            session.flags["worldEvents"] = world_events

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
        npc_id = self.normalize_target_id(target_id)
        if launch.dialogue_request:
            from pixsim7.backend.main.domain.narrative import NarrativeEngine

            request_id = f"dialogue:{npc_id}:{int(time.time())}"
            engine = NarrativeEngine()

            npc = await db.get(GameNPC, npc_id)
            if not npc:
                return None

            world = await db.get(GameWorld, session.world_id) if session.world_id else None
            world_data = {
                "id": world.id if world else 0,
                "name": world.name if world else "Default World",
                "meta": world.meta if world and world.meta else {},
            }

            npc_data = {
                "id": npc.id,
                "name": npc.name,
                "personality": npc.personality or {},
                "home_location_id": npc.home_location_id,
            }

            session_data = {
                "id": session.id,
                "world_time": session.world_time,
                "flags": session.flags,
                "relationships": session.stats.get("relationships", {}),
            }

            context = engine.build_context(
                world_id=world_data["id"],
                session_id=session.id,
                npc_id=npc_id,
                world_data=world_data,
                session_data=session_data,
                npc_data=npc_data,
                location_data=None,
                scene_data=None,
                player_input=player_input,
            )

            program_id = launch.dialogue_request.program_id or "default_dialogue"
            result = engine.build_dialogue_request(
                context=context,
                program_id=program_id,
            )

            pending = session.flags.get("pendingDialogue", [])
            pending.append({
                "requestId": request_id,
                "npcId": npc_id,
                "programId": program_id,
                "systemPrompt": launch.dialogue_request.system_prompt,
                "llmPrompt": result["llm_prompt"],
                "visualPrompt": result.get("visual_prompt"),
                "playerInput": player_input,
                "branchIntent": launch.branch_intent,
                "createdAt": int(time.time()),
                "metadata": result.get("metadata", {}),
            })
            session.flags["pendingDialogue"] = pending
            return request_id

        if launch.action_block_ids:
            request_id = f"action_blocks:{npc_id}:{int(time.time())}"
            pending = session.flags.get("pendingActionBlocks", [])
            pending.append({
                "requestId": request_id,
                "npcId": npc_id,
                "blockIds": launch.action_block_ids,
                "branchIntent": launch.branch_intent,
                "createdAt": int(time.time()),
            })
            session.flags["pendingActionBlocks"] = pending
            return request_id

        return None

    async def launch_narrative_program(
        self,
        db: AsyncSession,
        session: GameSession,
        target_id: Union[int, str],
        program_id: str,
        participants: Optional[List[InteractionParticipant]] = None,
        primary_role: Optional[str] = None,
    ) -> Optional[Dict[str, Any]]:
        npc_id = self.normalize_target_id(target_id)
        if not session.world_id:
            return None
        world = await db.get(GameWorld, session.world_id)
        if not world:
            return None
        from pixsim7.backend.main.domain.narrative.integration_helpers import (
            launch_narrative_program_from_interaction
        )
        return await launch_narrative_program_from_interaction(
            session=session,
            world=world,
            npc_id=npc_id,
            program_id=program_id,
            db=db,
        )

    async def track_interaction_cooldown(
        self,
        session: GameSession,
        target_id: Union[int, str],
        interaction_id: str,
        world_time: Optional[float] = None,
        participants: Optional[List[InteractionParticipant]] = None,
        primary_role: Optional[str] = None,
    ) -> None:
        npc_id = self.normalize_target_id(target_id)
        timestamp = int(world_time) if world_time is not None else int(time.time())

        target_ref = format_entity_ref("npc", npc_id).to_string()
        interactions = session.flags.get("interactions", {})
        if not isinstance(interactions, dict):
            interactions = {}
        target_state = interactions.get(target_ref, {})
        if not isinstance(target_state, dict):
            target_state = {}
        last_used = target_state.get("lastUsedAt", {})
        last_used[interaction_id] = timestamp
        target_state["lastUsedAt"] = last_used
        interactions[target_ref] = target_state
        session.flags["interactions"] = interactions


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
        self.register_item(NpcInteractionTargetAdapter())


target_adapter_registry = InteractionTargetAdapterRegistry()


def get_target_adapter(kind: str) -> Optional[InteractionTargetAdapter]:
    return target_adapter_registry.get_or_none(kind)
