"""Character Service - CRUD operations for character registry"""
from typing import List, Optional, Dict, Any
from uuid import UUID, uuid4
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_, or_, desc
from sqlmodel import col

from pixsim7.backend.main.domain.character import (
    Character,
    CharacterRelationship,
    CharacterUsage
)


class CharacterService:
    """Service for managing characters in the registry"""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def create_character(
        self,
        character_id: str,
        name: Optional[str] = None,
        category: str = "creature",
        species: Optional[str] = None,
        visual_traits: Optional[Dict[str, Any]] = None,
        personality_traits: Optional[Dict[str, Any]] = None,
        behavioral_patterns: Optional[Dict[str, Any]] = None,
        render_style: str = "realistic",
        created_by: Optional[str] = None,
        **kwargs
    ) -> Character:
        """Create a new character

        Args:
            character_id: Unique identifier (e.g., "gorilla_01")
            name: Character name (e.g., "Koba")
            category: Character category
            species: Species/race
            visual_traits: Visual appearance dict
            personality_traits: Personality dict
            behavioral_patterns: Behavior dict
            render_style: Rendering style
            created_by: Creator username

        Returns:
            Created Character
        """
        # Check if character_id already exists
        existing = await self.get_character_by_id(character_id)
        if existing:
            raise ValueError(f"Character '{character_id}' already exists")

        # Generate display name if not provided
        display_name = kwargs.get('display_name')
        if not display_name and name and species:
            display_name = f"{name} the {species.title()}"
        elif not display_name and name:
            display_name = name

        character = Character(
            id=uuid4(),
            character_id=character_id,
            name=name,
            display_name=display_name,
            category=category,
            species=species,
            archetype=kwargs.get('archetype'),
            visual_traits=visual_traits or {},
            personality_traits=personality_traits or {},
            behavioral_patterns=behavioral_patterns or {},
            voice_profile=kwargs.get('voice_profile', {}),
            render_style=render_style,
            render_instructions=kwargs.get('render_instructions'),
            reference_images=kwargs.get('reference_images', []),
            game_npc_id=kwargs.get('game_npc_id'),
            sync_with_game=kwargs.get('sync_with_game', False),
            game_metadata=kwargs.get('game_metadata', {}),
            tags=kwargs.get('tags', {}),
            character_metadata=kwargs.get('character_metadata', {}),
            created_by=created_by,
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow()
        )

        self.db.add(character)
        await self.db.commit()
        await self.db.refresh(character)

        return character

    async def get_character(self, id: UUID) -> Optional[Character]:
        """Get character by UUID"""
        result = await self.db.execute(
            select(Character).where(
                and_(
                    Character.id == id,
                    Character.is_active == True
                )
            )
        )
        return result.scalar_one_or_none()

    async def get_character_by_id(self, character_id: str) -> Optional[Character]:
        """Get character by character_id (e.g., 'gorilla_01')"""
        result = await self.db.execute(
            select(Character).where(
                and_(
                    Character.character_id == character_id,
                    Character.is_active == True
                )
            )
        )
        return result.scalar_one_or_none()

    async def list_characters(
        self,
        category: Optional[str] = None,
        species: Optional[str] = None,
        limit: int = 100,
        offset: int = 0
    ) -> List[Character]:
        """List characters with optional filters"""
        query = select(Character).where(Character.is_active == True)

        if category:
            query = query.where(Character.category == category)
        if species:
            query = query.where(Character.species == species)

        query = query.order_by(desc(Character.created_at))
        query = query.limit(limit).offset(offset)

        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def update_character(
        self,
        character_id: str,
        updates: Dict[str, Any],
        create_version: bool = False
    ) -> Character:
        """Update character

        Args:
            character_id: Character to update
            updates: Fields to update
            create_version: If True, create new version instead of updating

        Returns:
            Updated or new Character
        """
        character = await self.get_character_by_id(character_id)
        if not character:
            raise ValueError(f"Character '{character_id}' not found")

        if create_version:
            # Create new version
            return await self._create_character_version(character, updates)
        else:
            # Update in place
            for key, value in updates.items():
                if hasattr(character, key):
                    setattr(character, key, value)

            character.updated_at = datetime.utcnow()
            await self.db.commit()
            await self.db.refresh(character)

            return character

    async def _create_character_version(
        self,
        old_character: Character,
        updates: Dict[str, Any]
    ) -> Character:
        """Create new version of character"""
        # Create new character with updated fields
        new_character = Character(
            id=uuid4(),
            character_id=old_character.character_id,
            name=updates.get('name', old_character.name),
            display_name=updates.get('display_name', old_character.display_name),
            category=updates.get('category', old_character.category),
            species=updates.get('species', old_character.species),
            archetype=updates.get('archetype', old_character.archetype),
            visual_traits=updates.get('visual_traits', old_character.visual_traits.copy()),
            personality_traits=updates.get('personality_traits', old_character.personality_traits.copy()),
            behavioral_patterns=updates.get('behavioral_patterns', old_character.behavioral_patterns.copy()),
            voice_profile=updates.get('voice_profile', old_character.voice_profile.copy()),
            render_style=updates.get('render_style', old_character.render_style),
            render_instructions=updates.get('render_instructions', old_character.render_instructions),
            reference_images=updates.get('reference_images', old_character.reference_images.copy()),
            game_npc_id=updates.get('game_npc_id', old_character.game_npc_id),
            sync_with_game=updates.get('sync_with_game', old_character.sync_with_game),
            game_metadata=updates.get('game_metadata', old_character.game_metadata.copy()),
            version=old_character.version + 1,
            previous_version_id=old_character.id,
            version_notes=updates.get('version_notes'),
            tags=updates.get('tags', old_character.tags.copy()),
            character_metadata=updates.get('character_metadata', old_character.character_metadata.copy()),
            created_by=old_character.created_by,
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow()
        )

        self.db.add(new_character)
        await self.db.commit()
        await self.db.refresh(new_character)

        return new_character

    async def delete_character(self, character_id: str, soft: bool = True) -> bool:
        """Delete character (soft delete by default)"""
        character = await self.get_character_by_id(character_id)
        if not character:
            return False

        if soft:
            character.is_active = False
            character.deleted_at = datetime.utcnow()
            await self.db.commit()
        else:
            await self.db.delete(character)
            await self.db.commit()

        return True

    async def get_character_history(self, character_id: str) -> List[Character]:
        """Get all versions of a character"""
        # Get current version
        current = await self.get_character_by_id(character_id)
        if not current:
            return []

        versions = [current]

        # Walk back through previous versions
        prev_id = current.previous_version_id
        while prev_id:
            result = await self.db.execute(
                select(Character).where(Character.id == prev_id)
            )
            prev = result.scalar_one_or_none()
            if prev:
                versions.append(prev)
                prev_id = prev.previous_version_id
            else:
                break

        return versions

    async def track_usage(
        self,
        character_id: str,
        usage_type: str,
        prompt_version_id: Optional[UUID] = None,
        action_block_id: Optional[UUID] = None,
        template_reference: Optional[str] = None
    ) -> CharacterUsage:
        """Track where a character is used"""
        character = await self.get_character_by_id(character_id)
        if not character:
            raise ValueError(f"Character '{character_id}' not found")

        usage = CharacterUsage(
            id=uuid4(),
            character_id=character.id,
            usage_type=usage_type,
            prompt_version_id=prompt_version_id,
            action_block_id=action_block_id,
            template_reference=template_reference,
            used_at=datetime.utcnow()
        )

        # Update character usage count
        character.usage_count += 1
        character.last_used_at = datetime.utcnow()

        self.db.add(usage)
        await self.db.commit()

        return usage

    async def get_character_usage(
        self,
        character_id: str,
        usage_type: Optional[str] = None
    ) -> List[CharacterUsage]:
        """Get all usage records for a character"""
        character = await self.get_character_by_id(character_id)
        if not character:
            return []

        query = select(CharacterUsage).where(
            CharacterUsage.character_id == character.id
        )

        if usage_type:
            query = query.where(CharacterUsage.usage_type == usage_type)

        query = query.order_by(desc(CharacterUsage.used_at))

        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def search_characters(
        self,
        query: str,
        limit: int = 20
    ) -> List[Character]:
        """Search characters by name, species, or traits"""
        search_query = select(Character).where(
            and_(
                Character.is_active == True,
                or_(
                    Character.name.ilike(f"%{query}%"),
                    Character.character_id.ilike(f"%{query}%"),
                    Character.species.ilike(f"%{query}%"),
                    Character.category.ilike(f"%{query}%")
                )
            )
        ).limit(limit)

        result = await self.db.execute(search_query)
        return list(result.scalars().all())

    async def get_statistics(self) -> Dict[str, Any]:
        """Get character registry statistics"""
        # Total characters
        total_result = await self.db.execute(
            select(func.count(Character.id)).where(Character.is_active == True)
        )
        total = total_result.scalar()

        # By category
        category_result = await self.db.execute(
            select(
                Character.category,
                func.count(Character.id)
            ).where(
                Character.is_active == True
            ).group_by(Character.category)
        )
        by_category = {cat: count for cat, count in category_result.all()}

        # By species
        species_result = await self.db.execute(
            select(
                Character.species,
                func.count(Character.id)
            ).where(
                and_(
                    Character.is_active == True,
                    Character.species.isnot(None)
                )
            ).group_by(Character.species)
        )
        by_species = {spec: count for spec, count in species_result.all()}

        # Most used
        most_used_result = await self.db.execute(
            select(Character).where(
                Character.is_active == True
            ).order_by(desc(Character.usage_count)).limit(10)
        )
        most_used = [
            {"character_id": c.character_id, "name": c.name, "usage_count": c.usage_count}
            for c in most_used_result.scalars().all()
        ]

        return {
            "total_characters": total,
            "by_category": by_category,
            "by_species": by_species,
            "most_used": most_used
        }
