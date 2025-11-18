"""Character Instance Service

Manages character instances - world-specific versions of character templates.

Use Cases:
- Same character appears in multiple worlds with different states
- Character evolves independently per world
- Each world has its own character version/history
"""
from typing import List, Optional, Dict, Any
from uuid import UUID, uuid4
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, or_

from pixsim7_backend.domain.character import Character
from pixsim7_backend.domain.character_integrations import CharacterInstance
from pixsim7_backend.services.characters.character_service import CharacterService


class CharacterInstanceService:
    """Service for managing character instances"""

    def __init__(self, db: AsyncSession):
        self.db = db
        self.character_service = CharacterService(db)

    async def create_instance(
        self,
        character_id: UUID,
        world_id: Optional[int] = None,
        character_version: Optional[int] = None,
        instance_name: Optional[str] = None,
        visual_overrides: Optional[Dict[str, Any]] = None,
        personality_overrides: Optional[Dict[str, Any]] = None,
        behavioral_overrides: Optional[Dict[str, Any]] = None,
        current_state: Optional[Dict[str, Any]] = None
    ) -> CharacterInstance:
        """Create a character instance in a world

        Args:
            character_id: Character template to instantiate
            world_id: World this instance belongs to
            character_version: Which version of character template (default: latest)
            instance_name: Override name (e.g., "Koba the Wounded")
            visual_overrides: Override visual traits
            personality_overrides: Override personality traits
            behavioral_overrides: Override behavioral patterns
            current_state: Initial state

        Returns:
            Created CharacterInstance
        """
        # Get character template
        character = await self.character_service.get_character(character_id)
        if not character:
            raise ValueError(f"Character {character_id} not found")

        # Use latest version if not specified
        if character_version is None:
            character_version = character.version

        # Create instance
        instance = CharacterInstance(
            id=uuid4(),
            character_id=character_id,
            world_id=world_id,
            character_version=character_version,
            instance_name=instance_name,
            visual_overrides=visual_overrides or {},
            personality_overrides=personality_overrides or {},
            behavioral_overrides=behavioral_overrides or {},
            current_state=current_state or {},
            instance_metadata={},
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow()
        )

        self.db.add(instance)
        await self.db.commit()
        await self.db.refresh(instance)

        return instance

    async def get_instance(self, instance_id: UUID) -> Optional[CharacterInstance]:
        """Get character instance by ID"""
        result = await self.db.execute(
            select(CharacterInstance).where(
                and_(
                    CharacterInstance.id == instance_id,
                    CharacterInstance.is_active == True
                )
            )
        )
        return result.scalar_one_or_none()

    async def list_instances(
        self,
        character_id: Optional[UUID] = None,
        world_id: Optional[int] = None,
        limit: int = 100
    ) -> List[CharacterInstance]:
        """List character instances with filters"""
        query = select(CharacterInstance).where(CharacterInstance.is_active == True)

        if character_id:
            query = query.where(CharacterInstance.character_id == character_id)
        if world_id:
            query = query.where(CharacterInstance.world_id == world_id)

        query = query.limit(limit)

        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def get_merged_traits(
        self,
        instance_id: UUID
    ) -> Dict[str, Any]:
        """Get merged traits (template + overrides)

        Returns the final traits by merging character template with instance overrides.
        Instance overrides take precedence.

        Returns:
            {
                "visual_traits": {...},
                "personality_traits": {...},
                "behavioral_patterns": {...},
                "voice_profile": {...}
            }
        """
        instance = await self.get_instance(instance_id)
        if not instance:
            raise ValueError(f"Instance {instance_id} not found")

        # Get character template
        character = await self.character_service.get_character(instance.character_id)
        if not character:
            raise ValueError(f"Character {instance.character_id} not found")

        # Merge traits (instance overrides take precedence)
        def merge_dicts(base: Dict, override: Dict) -> Dict:
            result = base.copy()
            for key, value in override.items():
                if key in result and isinstance(result[key], dict) and isinstance(value, dict):
                    result[key] = merge_dicts(result[key], value)
                else:
                    result[key] = value
            return result

        visual_traits = merge_dicts(character.visual_traits, instance.visual_overrides)
        personality_traits = merge_dicts(character.personality_traits, instance.personality_overrides)
        behavioral_patterns = merge_dicts(character.behavioral_patterns, instance.behavioral_overrides)

        return {
            "visual_traits": visual_traits,
            "personality_traits": personality_traits,
            "behavioral_patterns": behavioral_patterns,
            "voice_profile": character.voice_profile,
            "current_state": instance.current_state
        }

    async def update_instance_state(
        self,
        instance_id: UUID,
        state_updates: Dict[str, Any]
    ) -> CharacterInstance:
        """Update instance state (e.g., health, mood, location)

        Args:
            instance_id: Instance to update
            state_updates: State changes to apply

        Returns:
            Updated instance
        """
        instance = await self.get_instance(instance_id)
        if not instance:
            raise ValueError(f"Instance {instance_id} not found")

        # Merge state updates
        current = instance.current_state.copy()
        current.update(state_updates)
        instance.current_state = current
        instance.updated_at = datetime.utcnow()

        await self.db.commit()
        await self.db.refresh(instance)

        return instance

    async def update_instance_overrides(
        self,
        instance_id: UUID,
        visual_overrides: Optional[Dict[str, Any]] = None,
        personality_overrides: Optional[Dict[str, Any]] = None,
        behavioral_overrides: Optional[Dict[str, Any]] = None
    ) -> CharacterInstance:
        """Update instance overrides (appearance/personality changes)

        Args:
            instance_id: Instance to update
            visual_overrides: New visual overrides
            personality_overrides: New personality overrides
            behavioral_overrides: New behavioral overrides

        Returns:
            Updated instance
        """
        instance = await self.get_instance(instance_id)
        if not instance:
            raise ValueError(f"Instance {instance_id} not found")

        if visual_overrides is not None:
            current = instance.visual_overrides.copy()
            current.update(visual_overrides)
            instance.visual_overrides = current

        if personality_overrides is not None:
            current = instance.personality_overrides.copy()
            current.update(personality_overrides)
            instance.personality_overrides = current

        if behavioral_overrides is not None:
            current = instance.behavioral_overrides.copy()
            current.update(behavioral_overrides)
            instance.behavioral_overrides = current

        instance.updated_at = datetime.utcnow()

        await self.db.commit()
        await self.db.refresh(instance)

        return instance

    async def get_instances_for_character(
        self,
        character_id: UUID
    ) -> List[Dict[str, Any]]:
        """Get all instances of a character across all worlds

        Returns summary of where this character exists.

        Returns:
            List of instance summaries with world info
        """
        instances = await self.list_instances(character_id=character_id)

        summaries = []
        for inst in instances:
            summary = {
                "instance_id": str(inst.id),
                "world_id": inst.world_id,
                "character_version": inst.character_version,
                "instance_name": inst.instance_name,
                "current_state": inst.current_state,
                "has_visual_overrides": len(inst.visual_overrides) > 0,
                "has_personality_overrides": len(inst.personality_overrides) > 0,
                "has_behavioral_overrides": len(inst.behavioral_overrides) > 0,
                "created_at": inst.created_at.isoformat(),
                "updated_at": inst.updated_at.isoformat()
            }
            summaries.append(summary)

        return summaries

    async def clone_instance_to_world(
        self,
        source_instance_id: UUID,
        target_world_id: int,
        instance_name: Optional[str] = None
    ) -> CharacterInstance:
        """Clone an instance to another world

        Use case: Copy character from one world to another with same state.

        Args:
            source_instance_id: Instance to clone
            target_world_id: Destination world
            instance_name: Name for new instance

        Returns:
            New instance in target world
        """
        source = await self.get_instance(source_instance_id)
        if not source:
            raise ValueError(f"Instance {source_instance_id} not found")

        # Create new instance with same data
        new_instance = await self.create_instance(
            character_id=source.character_id,
            world_id=target_world_id,
            character_version=source.character_version,
            instance_name=instance_name or source.instance_name,
            visual_overrides=source.visual_overrides.copy(),
            personality_overrides=source.personality_overrides.copy(),
            behavioral_overrides=source.behavioral_overrides.copy(),
            current_state=source.current_state.copy()
        )

        return new_instance

    async def delete_instance(
        self,
        instance_id: UUID,
        soft: bool = True
    ) -> bool:
        """Delete character instance

        Args:
            instance_id: Instance to delete
            soft: Soft delete (set is_active=False) or hard delete

        Returns:
            Success
        """
        instance = await self.get_instance(instance_id)
        if not instance:
            return False

        if soft:
            instance.is_active = False
            instance.updated_at = datetime.utcnow()
            await self.db.commit()
        else:
            await self.db.delete(instance)
            await self.db.commit()

        return True
