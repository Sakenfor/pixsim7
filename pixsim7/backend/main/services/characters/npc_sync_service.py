"""Character-NPC Sync Service

Handles bidirectional synchronization between character instances and game NPCs.

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
- Two-way/conditional: link.field_mappings can opt specific paths into two-way sync; caller decides direction when invoking sync_link().
"""
from typing import List, Optional, Dict, Any
from uuid import UUID, uuid4
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_

from pixsim7.backend.main.domain.game.entities import CharacterNPCLink, CharacterInstance
# Use domain entry module for cross-domain imports
from pixsim7.backend.main.domain.game import GameNPC, NPCState
from pixsim7.backend.main.services.characters.instance_service import CharacterInstanceService


class CharacterNPCSyncService:
    """
    Service for syncing character instances with NPCs.

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

    Two-way (configurable via CharacterNPCLink):
    - personality.mood (can drift in runtime, can be reset from template)
    - custom fields defined in link.field_mapping

    Note: Sync is selective and declarative. Only fields in CharacterNPCLink.field_mapping
    are synchronized. Direction and priority are controlled per-link.
    """

    def __init__(self, db: AsyncSession):
        self.db = db
        self.instance_service = CharacterInstanceService(db)

    async def create_link(
        self,
        character_instance_id: UUID,
        npc_id: int,
        sync_enabled: bool = True,
        sync_direction: str = "bidirectional",
        field_mappings: Optional[Dict[str, str]] = None,
        priority: int = 0,
        activation_conditions: Optional[Dict[str, Any]] = None
    ) -> CharacterNPCLink:
        """Create a link between character instance and NPC

        Args:
            character_instance_id: Character instance to link
            npc_id: NPC to link
            sync_enabled: Enable automatic sync
            sync_direction: "bidirectional", "character_to_npc", or "npc_to_character"
            field_mappings: Map character fields to NPC fields
            priority: Link priority (higher = takes precedence)
            activation_conditions: When this link is active

        Returns:
            Created link
        """
        # Validate instance and NPC exist
        instance = await self.instance_service.get_instance(character_instance_id)
        if not instance:
            raise ValueError(f"Instance {character_instance_id} not found")

        npc = await self.db.get(GameNPC, npc_id)
        if not npc:
            raise ValueError(f"NPC {npc_id} not found")

        # Default field mappings
        if field_mappings is None:
            field_mappings = self._get_default_field_mappings()

        link = CharacterNPCLink(
            id=uuid4(),
            character_instance_id=character_instance_id,
            npc_id=npc_id,
            sync_enabled=sync_enabled,
            sync_direction=sync_direction,
            field_mappings=field_mappings,
            priority=priority,
            activation_conditions=activation_conditions or {},
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow()
        )

        self.db.add(link)
        await self.db.commit()
        await self.db.refresh(link)

        # Perform initial sync
        if sync_enabled:
            await self.sync_link(link.id, direction="character_to_npc")

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

    async def get_link(self, link_id: UUID) -> Optional[CharacterNPCLink]:
        """Get link by ID"""
        return await self.db.get(CharacterNPCLink, link_id)

    async def get_links_for_instance(
        self,
        character_instance_id: UUID
    ) -> List[CharacterNPCLink]:
        """Get all NPC links for a character instance"""
        result = await self.db.execute(
            select(CharacterNPCLink).where(
                CharacterNPCLink.character_instance_id == character_instance_id
            ).order_by(CharacterNPCLink.priority.desc())
        )
        return list(result.scalars().all())

    async def get_links_for_npc(
        self,
        npc_id: int,
        context: Optional[Dict[str, Any]] = None
    ) -> List[CharacterNPCLink]:
        """Get all character links for an NPC

        Args:
            npc_id: NPC to get links for
            context: Current context (location, time, etc) for activation checks

        Returns:
            List of active links, sorted by priority
        """
        result = await self.db.execute(
            select(CharacterNPCLink).where(
                CharacterNPCLink.npc_id == npc_id
            ).order_by(CharacterNPCLink.priority.desc())
        )
        links = list(result.scalars().all())

        # Filter by activation conditions if context provided
        if context:
            active_links = []
            for link in links:
                if self._check_activation_conditions(link.activation_conditions, context):
                    active_links.append(link)
            return active_links

        return links

    def _check_activation_conditions(
        self,
        conditions: Dict[str, Any],
        context: Dict[str, Any]
    ) -> bool:
        """Check if activation conditions are met

        Args:
            conditions: Activation conditions from link
            context: Current context

        Returns:
            True if conditions met
        """
        if not conditions:
            return True  # No conditions = always active

        for key, expected_value in conditions.items():
            if key not in context:
                return False
            if context[key] != expected_value:
                return False

        return True

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

        if sync_dir in ["bidirectional", "character_to_npc"]:
            char_to_npc_changes = await self._sync_character_to_npc(link)
            changes["character_to_npc"] = char_to_npc_changes

        if sync_dir in ["bidirectional", "npc_to_character"]:
            npc_to_char_changes = await self._sync_npc_to_character(link)
            changes["npc_to_character"] = npc_to_char_changes

        # Update link metadata
        link.last_synced_at = datetime.utcnow()
        link.last_sync_direction = sync_dir
        await self.db.commit()

        return {
            "synced": True,
            "direction": sync_dir,
            "changes": changes
        }

    async def _sync_character_to_npc(
        self,
        link: CharacterNPCLink
    ) -> Dict[str, Any]:
        """Sync character instance data to NPC

        Reads character instance traits and updates NPC fields.
        """
        # Get merged character traits
        merged_traits = await self.instance_service.get_merged_traits(
            link.character_instance_id
        )

        # Get NPC
        npc = await self.db.get(GameNPC, link.npc_id)
        if not npc:
            return {"error": "NPC not found"}

        # Get or create NPC state
        npc_state = await self.db.get(NPCState, link.npc_id)
        if not npc_state:
            npc_state = NPCState(
                npc_id=link.npc_id,
                state={},
                version=0,
                updated_at=datetime.utcnow()
            )
            self.db.add(npc_state)

        changes = {}

        # Apply field mappings
        for char_field, npc_field in link.field_mappings.items():
            # Get character value
            char_value = self._get_nested_value(merged_traits, char_field)
            if char_value is None:
                continue

            # Determine target (npc.personality or npc_state.state)
            if npc_field.startswith("personality."):
                target = npc.personality or {}
                field_path = npc_field[len("personality."):]
                self._set_nested_value(target, field_path, char_value)
                npc.personality = target
                changes[npc_field] = char_value
            elif npc_field.startswith("state."):
                target = npc_state.state or {}
                field_path = npc_field[len("state."):]
                self._set_nested_value(target, field_path, char_value)
                npc_state.state = target
                changes[npc_field] = char_value

        if npc_state:
            npc_state.version += 1
            npc_state.updated_at = datetime.utcnow()

        await self.db.commit()

        return changes

    async def _sync_npc_to_character(
        self,
        link: CharacterNPCLink
    ) -> Dict[str, Any]:
        """Sync NPC data to character instance

        Reads NPC state and updates character instance current_state.
        """
        # Get NPC and state
        npc = await self.db.get(GameNPC, link.npc_id)
        if not npc:
            return {"error": "NPC not found"}

        npc_state = await self.db.get(NPCState, link.npc_id)

        # Get character instance
        instance = await self.instance_service.get_instance(
            link.character_instance_id
        )
        if not instance:
            return {"error": "Instance not found"}

        changes = {}

        # Reverse field mappings (NPC → Character)
        for char_field, npc_field in link.field_mappings.items():
            # Get NPC value
            if npc_field.startswith("personality."):
                field_path = npc_field[len("personality."):]
                npc_value = self._get_nested_value(npc.personality or {}, field_path)
            elif npc_field.startswith("state.") and npc_state:
                field_path = npc_field[len("state."):]
                npc_value = self._get_nested_value(npc_state.state or {}, field_path)
            else:
                continue

            if npc_value is None:
                continue

            # Update character instance (goes into current_state)
            # We don't modify overrides, only current_state
            self._set_nested_value(instance.current_state, char_field, npc_value)
            changes[char_field] = npc_value

        instance.updated_at = datetime.utcnow()
        await self.db.commit()

        return changes

    def _get_nested_value(self, data: Dict, path: str) -> Any:
        """Get value from nested dict using dot notation

        Example: _get_nested_value(data, "appearance.scars")
        """
        keys = path.split(".")
        value = data
        for key in keys:
            if not isinstance(value, dict):
                return None
            value = value.get(key)
            if value is None:
                return None
        return value

    def _set_nested_value(self, data: Dict, path: str, value: Any):
        """Set value in nested dict using dot notation

        Example: _set_nested_value(data, "appearance.scars", ["scar1"])
        """
        keys = path.split(".")
        target = data
        for key in keys[:-1]:
            if key not in target:
                target[key] = {}
            target = target[key]
        target[keys[-1]] = value

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
                result = await self.sync_link(link.id)
                results.append({
                    "link_id": str(link.id),
                    "npc_id": link.npc_id,
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
                result = await self.sync_link(link.id)
                results.append({
                    "link_id": str(link.id),
                    "character_instance_id": str(link.character_instance_id),
                    "result": result
                })

        return {
            "total_links": len(links),
            "synced": len(results),
            "results": results
        }

    async def delete_link(self, link_id: UUID) -> bool:
        """Delete a character-NPC link"""
        link = await self.get_link(link_id)
        if not link:
            return False

        await self.db.delete(link)
        await self.db.commit()
        return True

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
        links = await self.get_links_for_npc(npc_id, context)

        if not links:
            return None

        # Return highest priority link's character instance
        return links[0].character_instance_id

    async def create_link_via_generic_service(
        self,
        character_instance_id: UUID,
        npc_id: int,
        priority: int = 0,
        sync_direction: str = 'bidirectional',
        activation_conditions: Optional[Dict[str, Any]] = None,
        meta: Optional[Dict[str, Any]] = None
    ):
        """Create link using the generic ObjectLink pattern (alternative path)

        This method demonstrates how to use the generic link service for
        character-NPC linking. It's an alternative to create_link() that uses
        the new generic link infrastructure.

        This is additive and non-breaking - the existing create_link() method
        continues to work with CharacterNPCLink.

        Args:
            character_instance_id: Character instance UUID
            npc_id: NPC ID
            priority: Link priority (higher wins)
            sync_direction: 'bidirectional', 'template_to_runtime', 'runtime_to_template'
            activation_conditions: Context-based activation (e.g., location, time)
            meta: Extensible metadata

        Returns:
            Created ObjectLink instance

        Example:
            link = await service.create_link_via_generic_service(
                character_instance_id=uuid4(),
                npc_id=123,
                priority=10,
                activation_conditions={'location.zone': 'downtown'}
            )
        """
        from services.links.link_service import LinkService

        # Validate instance and NPC exist
        instance = await self.instance_service.get_instance(character_instance_id)
        if not instance:
            raise ValueError(f"Instance {character_instance_id} not found")

        npc = await self.db.get(GameNPC, npc_id)
        if not npc:
            raise ValueError(f"NPC {npc_id} not found")

        # Create link using generic service
        link_service = LinkService(self.db)

        return await link_service.create_link(
            template_kind='character',
            template_id=str(character_instance_id),
            runtime_kind='npc',
            runtime_id=npc_id,
            mapping_id='character->npc',  # Format: "templateKind->runtimeKind"
            sync_enabled=True,
            sync_direction=sync_direction,
            priority=priority,
            activation_conditions=activation_conditions,
            meta=meta
        )
