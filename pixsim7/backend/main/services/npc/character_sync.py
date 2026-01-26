"""Character-NPC Sync Service

Handles bidirectional synchronization between character instances and game NPCs
using the generic ObjectLink system.

Sync Patterns:
1. One Character Instance → Multiple NPCs (e.g., Koba controls 2 NPCs in same world)
2. One NPC → Multiple Character Instances (NPC switches appearance based on time/location)
3. Bidirectional sync with configurable field mappings

Use Cases:
- NPC health drops in game → Character instance state updates
- Character evolves (gets scars) → NPC appearance updates
- Context-based appearance (day vs night, location-based)

Field authority guidance (for future delta-based sync):
- CharacterInstance -> GameNPC: name (when not overridden at runtime), base/visual traits, long-lived personality settings.
- GameNPC -> CharacterInstance: runtime state (location, health/mood) when checkpointing.
- Two-way/conditional: link.sync_field_mappings can opt specific paths into two-way sync; caller decides direction when invoking sync_link().
"""
from typing import List, Optional, Dict, Any
from uuid import UUID
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession

from pixsim7.backend.main.domain.links import ObjectLink
from pixsim7.backend.main.domain.game import GameNPC, NPCState
from pixsim7.backend.main.services.characters.instance import CharacterInstanceService
from pixsim7.backend.main.services.links.link_service import LinkService
from pixsim7.backend.main.services.links.object_link_resolver import ObjectLinkResolver
from pixsim7.backend.main.services.links.link_types import (
    get_link_type_registry,
    link_type_id,
    register_default_link_types,
)
from pixsim7.backend.main.services.prompt.context.mapping import get_nested_value, set_nested_value


class CharacterNPCSyncService:
    """
    Service for syncing character instances with NPCs via ObjectLink.

    Field Authority (who owns what):

    CharacterInstance → GameNPC (push):
    - name (if not overridden)
    - personality.base_traits
    - personality.background
    - personality.conversationStyle
    - visual_traits (appearance, clothing)

    GameNPC → CharacterInstance (pull/checkpoint):
    - state (runtime state flags)
    - stats (via stat engine)
    - location (current_location_id from NPCState)
    - relationship_snapshots (if checkpointing)

    Two-way (configurable via ObjectLink.sync_field_mappings):
    - personality.mood (can drift in runtime, can be reset from template)
    - custom fields defined in link.sync_field_mappings

    Note: Sync is selective and declarative. Only fields in sync_field_mappings
    are synchronized. Direction and priority are controlled per-link.
    """

    def __init__(self, db: AsyncSession):
        self.db = db
        self.instance_service = CharacterInstanceService(db)
        self.link_service = LinkService(db)
        self.link_resolver = ObjectLinkResolver(db)

    async def create_link(
        self,
        character_instance_id: UUID,
        npc_id: int,
        sync_enabled: bool = True,
        sync_direction: str = "bidirectional",
        sync_field_mappings: Optional[Dict[str, str]] = None,
        priority: int = 0,
        activation_conditions: Optional[Dict[str, Any]] = None
    ) -> ObjectLink:
        """Create a link between character instance and NPC

        Args:
            character_instance_id: Character instance to link
            npc_id: NPC to link
            sync_enabled: Enable automatic sync
            sync_direction: "bidirectional", "template_to_runtime", or "runtime_to_template"
            sync_field_mappings: Map character fields to NPC fields (source_path -> target_path)
            priority: Link priority (higher = takes precedence)
            activation_conditions: When this link is active

        Returns:
            Created ObjectLink
        """
        # Validate instance and NPC exist
        instance = await self.instance_service.get_instance(character_instance_id)
        if not instance:
            raise ValueError(f"Instance {character_instance_id} not found")

        # Load NPC via loader registry
        npc = await self.link_resolver.load_entity('npc', npc_id)
        if not npc:
            raise ValueError(f"NPC {npc_id} not found")

        # Default field mappings
        if sync_field_mappings is None:
            sync_field_mappings = self._get_default_field_mappings()

        # Create link via LinkService
        register_default_link_types()
        spec = get_link_type_registry().get_by_kinds("characterInstance", "npc")
        mapping_id = spec.mapping_id if spec else link_type_id("characterInstance", "npc")

        link = await self.link_service.create_link(
            template_kind='characterInstance',
            template_id=str(character_instance_id),
            runtime_kind='npc',
            runtime_id=npc_id,
            mapping_id=mapping_id,
            sync_enabled=sync_enabled,
            sync_direction=sync_direction,
            priority=priority,
            activation_conditions=activation_conditions,
            sync_field_mappings=sync_field_mappings
        )

        # Perform initial sync
        if sync_enabled:
            await self.sync_link(link.link_id, direction="template_to_runtime")

        return link

    def _get_default_field_mappings(self) -> Dict[str, str]:
        """Get default field mappings

        Maps character instance fields to NPC fields.

        Returns:
            Field mapping dict
        """
        return {
            # Visual traits → NPC personality.appearance
            "visual_traits.scars": "personality.appearance.scars",
            "visual_traits.build": "personality.appearance.build",
            "visual_traits.clothing": "personality.appearance.clothing",

            # State → NPC state
            "current_state.health": "state.health",
            "current_state.mood": "state.mood",
            "current_state.status": "state.status",

            # Personality → NPC personality
            "personality_traits.demeanor": "personality.demeanor",
            "personality_traits.temperament": "personality.temperament",

            # Behavioral patterns → NPC state behaviors
            "behavioral_patterns.movement_style": "state.movement_style",
            "behavioral_patterns.quirks": "state.quirks"
        }

    async def get_link(self, link_id: UUID) -> Optional[ObjectLink]:
        """Get link by ID"""
        return await self.link_service.get_link(link_id)

    async def get_links_for_instance(
        self,
        character_instance_id: UUID
    ) -> List[ObjectLink]:
        """Get all NPC links for a character instance"""
        return await self.link_service.get_links_for_template(
            'characterInstance',
            str(character_instance_id)
        )

    async def get_links_for_npc(
        self,
        npc_id: int,
        context: Optional[Dict[str, Any]] = None
    ) -> List[ObjectLink]:
        """Get all character links for an NPC

        Args:
            npc_id: NPC to get links for
            context: Current context (location, time, etc) for activation checks.
                     Supports dot-notation keys (e.g., 'location.zone').

        Returns:
            List of active links, sorted by priority
        """
        return await self.link_service.get_links_for_runtime(
            'npc',
            npc_id,
            active_only=context is not None,
            context=context
        )

    async def sync_link(
        self,
        link_id: UUID,
        direction: Optional[str] = None
    ) -> Dict[str, Any]:
        """Sync a character-NPC link

        Args:
            link_id: Link to sync
            direction: Override sync direction (or use link's default)

        Returns:
            Sync result with changes made
        """
        link = await self.get_link(link_id)
        if not link or not link.sync_enabled:
            return {"synced": False, "reason": "Link not found or sync disabled"}

        sync_dir = direction or link.sync_direction

        changes = {}

        if sync_dir in ["bidirectional", "template_to_runtime"]:
            char_to_npc_changes = await self._sync_template_to_runtime(link)
            changes["template_to_runtime"] = char_to_npc_changes

        if sync_dir in ["bidirectional", "runtime_to_template"]:
            npc_to_char_changes = await self._sync_runtime_to_template(link)
            changes["runtime_to_template"] = npc_to_char_changes

        # Update link metadata
        link.last_synced_at = datetime.utcnow()
        link.last_sync_direction = sync_dir
        await self.db.flush()

        return {
            "synced": True,
            "direction": sync_dir,
            "changes": changes
        }

    async def _sync_template_to_runtime(
        self,
        link: ObjectLink
    ) -> Dict[str, Any]:
        """Sync character instance data to NPC

        Reads character instance traits and updates NPC fields.
        """
        # Get merged character traits
        character_instance_id = UUID(link.template_id)
        merged_traits = await self.instance_service.get_merged_traits(
            character_instance_id
        )

        # Get NPC via loader registry
        npc = await self.link_resolver.load_entity('npc', link.runtime_id)
        if not npc:
            return {"error": "NPC not found"}

        # Get or create NPC state
        npc_state = await self.db.get(NPCState, link.runtime_id)
        if not npc_state:
            npc_state = NPCState(
                npc_id=link.runtime_id,
                state={},
                version=0,
                updated_at=datetime.utcnow()
            )
            self.db.add(npc_state)

        changes = {}

        # Get field mappings (use link-specific or defaults)
        field_mappings = (
            link.sync_field_mappings
            if link.sync_field_mappings is not None
            else self._get_default_field_mappings()
        )

        # Apply field mappings
        for char_field, npc_field in field_mappings.items():
            # Get character value
            char_value = get_nested_value(merged_traits, char_field)
            if char_value is None:
                continue

            # Determine target (npc.personality or npc_state.state)
            if npc_field.startswith("personality."):
                target = npc.personality or {}
                field_path = npc_field[len("personality."):]
                set_nested_value(target, field_path, char_value)
                npc.personality = target
                changes[npc_field] = char_value
            elif npc_field.startswith("state."):
                target = npc_state.state or {}
                field_path = npc_field[len("state."):]
                set_nested_value(target, field_path, char_value)
                npc_state.state = target
                changes[npc_field] = char_value

        if npc_state:
            npc_state.version += 1
            npc_state.updated_at = datetime.utcnow()

        await self.db.flush()

        return changes

    async def _sync_runtime_to_template(
        self,
        link: ObjectLink
    ) -> Dict[str, Any]:
        """Sync NPC data to character instance

        Reads NPC state and updates character instance current_state.
        """
        # Get NPC and state
        npc = await self.db.get(GameNPC, link.runtime_id)
        if not npc:
            return {"error": "NPC not found"}

        npc_state = await self.db.get(NPCState, link.runtime_id)

        # Get character instance
        character_instance_id = UUID(link.template_id)
        instance = await self.instance_service.get_instance(
            character_instance_id
        )
        if not instance:
            return {"error": "Instance not found"}

        changes = {}

        # Get field mappings (use link-specific or defaults)
        field_mappings = (
            link.sync_field_mappings
            if link.sync_field_mappings is not None
            else self._get_default_field_mappings()
        )

        # Reverse field mappings (NPC → Character)
        for char_field, npc_field in field_mappings.items():
            # Get NPC value
            if npc_field.startswith("personality."):
                field_path = npc_field[len("personality."):]
                npc_value = get_nested_value(npc.personality or {}, field_path)
            elif npc_field.startswith("state.") and npc_state:
                field_path = npc_field[len("state."):]
                npc_value = get_nested_value(npc_state.state or {}, field_path)
            else:
                continue

            if npc_value is None:
                continue

            # Update character instance (goes into current_state)
            # We don't modify overrides, only current_state
            set_nested_value(instance.current_state, char_field, npc_value)
            changes[char_field] = npc_value

        instance.updated_at = datetime.utcnow()
        await self.db.flush()

        return changes

    async def sync_all_links_for_instance(
        self,
        character_instance_id: UUID
    ) -> Dict[str, Any]:
        """Sync all NPC links for a character instance

        Use case: Character evolved, sync to all linked NPCs
        """
        links = await self.get_links_for_instance(character_instance_id)

        results = []
        for link in links:
            if link.sync_enabled:
                result = await self.sync_link(link.link_id)
                results.append({
                    "link_id": str(link.link_id),
                    "npc_id": link.runtime_id,
                    "result": result
                })

        return {
            "total_links": len(links),
            "synced": len(results),
            "results": results
        }

    async def sync_all_links_for_npc(
        self,
        npc_id: int,
        context: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """Sync all character links for an NPC

        Use case: NPC state changed in game, sync to linked characters
        """
        links = await self.get_links_for_npc(npc_id, context)

        results = []
        for link in links:
            if link.sync_enabled:
                result = await self.sync_link(link.link_id)
                results.append({
                    "link_id": str(link.link_id),
                    "character_instance_id": link.template_id,
                    "result": result
                })

        return {
            "total_links": len(links),
            "synced": len(results),
            "results": results
        }

    async def delete_link(self, link_id: UUID) -> bool:
        """Delete a character-NPC link"""
        return await self.link_service.delete_link(link_id)

    async def get_active_character_for_npc(
        self,
        npc_id: int,
        context: Dict[str, Any]
    ) -> Optional[UUID]:
        """Get active character instance for NPC given context

        Use case: NPC appearance changes based on time/location
        Returns highest-priority active character instance.

        Args:
            npc_id: NPC to check
            context: Current context (location, time, etc)

        Returns:
            Active character instance ID or None
        """
        link = await self.link_service.get_active_link_for_runtime('npc', npc_id, context)

        if not link:
            return None

        # Return character instance ID from link
        return UUID(link.template_id)
