"""Character Service - CRUD operations for character registry"""
from typing import List, Optional, Dict, Any
from uuid import UUID, uuid4
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_, or_, desc
from sqlmodel import col

from pixsim7.backend.main.domain.game.entities import (
    Character,
    CharacterRelationship,
    CharacterUsage
)
from pixsim7.backend.main.domain.game.entities.character_versioning import (
    CharacterVersionFamily,
)
from pixsim7.backend.main.domain.prompt.models import BlockTemplate
from pixsim7.backend.main.services.characters.versioning import (
    CharacterVersioningService,
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
            reference_assets=kwargs.get('reference_assets', []),
            game_npc_id=kwargs.get('game_npc_id'),
            sync_with_game=kwargs.get('sync_with_game', False),
            game_metadata=kwargs.get('game_metadata', {}),
            tags=kwargs.get('tags', {}),
            character_metadata=kwargs.get('character_metadata', {}),
            created_by=created_by,
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc)
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
        """Get character by character_id slug.

        If multiple versions share the same character_id, returns the HEAD
        of the version family. For standalone (unversioned) characters, returns
        the character directly.
        """
        versioning = CharacterVersioningService(self.db)
        return await versioning.get_head_character(character_id)

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

    async def get_template_binding_usage_counts(
        self,
        character_ids: List[str],
    ) -> Dict[str, int]:
        """
        Count how many template character bindings reference each character_id.

        This complements ``Character.usage_count`` (which tracks explicit
        registry usage events) with prompt block template bindings so UI lists
        reflect actual template usage.
        """
        targets = {str(cid) for cid in (character_ids or []) if cid}
        if not targets:
            return {}

        result = await self.db.execute(select(BlockTemplate.character_bindings))
        counts: Dict[str, int] = {cid: 0 for cid in targets}

        for bindings in result.scalars().all():
            if not isinstance(bindings, dict):
                continue
            for binding in bindings.values():
                if not isinstance(binding, dict):
                    continue
                char_id = binding.get("character_id")
                if not char_id:
                    continue
                key = str(char_id)
                if key in counts:
                    counts[key] += 1

        return counts

    async def apply_template_usage_counts(
        self,
        characters: List[Character],
    ) -> List[Character]:
        """
        Overlay template-binding usage onto ``usage_count`` for display/API use.

        Mutates the in-memory model instances returned by the current session
        without persisting changes.
        """
        if not characters:
            return characters

        counts = await self.get_template_binding_usage_counts(
            [c.character_id for c in characters if getattr(c, "character_id", None)]
        )
        if not counts:
            return characters

        for character in characters:
            template_uses = counts.get(str(character.character_id), 0)
            if template_uses:
                base = int(character.usage_count or 0)
                character.usage_count = base + template_uses
        return characters

    async def apply_template_usage_count(
        self,
        character: Optional[Character],
    ) -> Optional[Character]:
        """Single-character helper for detail/history endpoints."""
        if character is None:
            return None
        await self.apply_template_usage_counts([character])
        return character

    async def update_character(
        self,
        character_id: str,
        updates: Dict[str, Any],
        create_version: bool = False,
        version_message: Optional[str] = None,
    ) -> Character:
        """Update character

        Args:
            character_id: Character to update
            updates: Fields to update
            create_version: If True, create new version instead of updating
            version_message: Message describing what changed (for versioned updates)

        Returns:
            Updated or new Character
        """
        character = await self.get_character_by_id(character_id)
        if not character:
            raise ValueError(f"Character '{character_id}' not found")

        if create_version:
            versioning = CharacterVersioningService(self.db)
            new_char = await versioning.evolve(
                character, updates, message=version_message
            )
            await self.db.commit()
            await self.db.refresh(new_char)
            return new_char
        else:
            # Update in place
            for key, value in updates.items():
                if hasattr(character, key):
                    setattr(character, key, value)

            character.updated_at = datetime.now(timezone.utc)
            await self.db.commit()
            await self.db.refresh(character)

            return character

    async def delete_character(self, character_id: str, soft: bool = True) -> bool:
        """Delete character (soft delete by default)"""
        character = await self.get_character_by_id(character_id)
        if not character:
            return False

        if soft:
            character.is_active = False
            character.deleted_at = datetime.now(timezone.utc)
            await self.db.commit()
        else:
            await self.db.delete(character)
            await self.db.commit()

        return True

    async def get_character_history(self, character_id: str) -> List[Character]:
        """Get all versions of a character, ordered by version number."""
        versioning = CharacterVersioningService(self.db)
        family = await versioning.get_family_for_character_slug(character_id)
        if not family:
            # Standalone character — return just the one
            current = await self.get_character_by_id(character_id)
            return [current] if current else []

        return await versioning.get_versions(family.id, order_asc=True)

    async def track_usage(
        self,
        character_id: str,
        usage_type: str,
        prompt_version_id: Optional[UUID] = None,
        action_block_id: Optional[str] = None,
        template_reference: Optional[str] = None
    ) -> CharacterUsage:
        """Track where a character is used"""
        from sqlalchemy import update

        character = await self.get_character_by_id(character_id)
        if not character:
            raise ValueError(f"Character '{character_id}' not found")

        now = datetime.now(timezone.utc)
        normalized_action_block_id: Optional[str] = None
        if action_block_id is not None:
            text = str(action_block_id).strip()
            if text:
                normalized_action_block_id = text

        usage = CharacterUsage(
            id=uuid4(),
            character_id=character.id,
            usage_type=usage_type,
            prompt_version_id=prompt_version_id,
            action_block_id=normalized_action_block_id,
            template_reference=template_reference,
            used_at=now
        )
        self.db.add(usage)

        # Atomic increment — avoids race conditions from concurrent usage tracking
        await self.db.execute(
            update(Character)
            .where(Character.id == character.id)
            .values(
                usage_count=Character.usage_count + 1,
                last_used_at=now,
            )
        )

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
