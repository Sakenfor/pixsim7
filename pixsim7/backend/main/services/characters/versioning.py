"""Character versioning service.

Handles git-like versioning for characters:
- Family creation and management
- HEAD management
- Evolve (create new version)
- Version chain queries

Extends the shared VersioningServiceBase, following the AssetVersioningService pattern.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, Optional
from uuid import UUID, uuid4

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from pixsim7.backend.main.domain.game.entities.character import Character
from pixsim7.backend.main.domain.game.entities.character_versioning import (
    CharacterVersionFamily,
)
from pixsim7.backend.main.services.versioning import VersioningServiceBase


class CharacterVersioningService(
    VersioningServiceBase[CharacterVersionFamily, Character]
):
    """
    Service for managing character version families.

    Extends VersioningServiceBase with character-specific operations:
    - HEAD management
    - Evolve: create a new version of a character
    - Family auto-creation on first evolve

    Concurrency:
    - Uses SELECT FOR UPDATE on family row to prevent duplicate version numbers
    - Version numbers derived from MAX(version_number) within transaction
    """

    family_model = CharacterVersionFamily
    entity_model = Character
    parent_id_attr = "parent_character_id"
    head_id_attr = "head_character_id"

    def __init__(self, db: AsyncSession):
        super().__init__(db)

    # =========================================================================
    # ENTITY-SPECIFIC METADATA
    # =========================================================================

    def get_timeline_metadata(self, entity: Character) -> Dict[str, Any]:
        return {
            "character_id": entity.character_id,
            "name": entity.name,
            "display_name": entity.display_name,
            "category": entity.category,
        }

    # =========================================================================
    # FAMILY MANAGEMENT
    # =========================================================================

    async def create_family(
        self, character: Character
    ) -> CharacterVersionFamily:
        """
        Create a version family and upgrade the character to v1.

        Args:
            character: The character to become v1 of the new family.

        Returns:
            The newly created family.
        """
        family = CharacterVersionFamily(
            name=character.display_name or character.name or character.character_id,
            head_character_id=character.id,
        )
        self.db.add(family)
        await self.db.flush()

        # Upgrade character to v1
        await self.upgrade_entity_to_v1(family, character)
        return family

    # =========================================================================
    # EVOLVE — create a new version of a character
    # =========================================================================

    async def evolve(
        self,
        character: Character,
        updates: Dict[str, Any],
        message: Optional[str] = None,
    ) -> Character:
        """
        Create a new version of a character with the given updates.

        If the character is not yet in a family, a family is created and the
        character is upgraded to v1 first.

        Args:
            character: The current HEAD character to evolve from.
            updates: Field updates for the new version.
            message: Version message describing what changed.

        Returns:
            The newly created character version (now HEAD).
        """
        # Ensure character is in a family
        if not character.version_family_id:
            family = await self.create_family(character)
        else:
            family = await self.get_family(character.version_family_id)
            if not family:
                raise ValueError(
                    f"Version family {character.version_family_id} not found"
                )

        # Get next version number with lock
        next_version = await self.get_next_version_number(
            family.id, lock=True
        )

        # Build new character from old + updates
        now = datetime.now(timezone.utc)
        new_character = Character(
            id=uuid4(),
            character_id=character.character_id,
            name=updates.get("name", character.name),
            display_name=updates.get("display_name", character.display_name),
            category=updates.get("category", character.category),
            species=updates.get("species", character.species),
            archetype=updates.get("archetype", character.archetype),
            visual_traits=updates.get(
                "visual_traits",
                character.visual_traits.copy() if character.visual_traits else {},
            ),
            personality_traits=updates.get(
                "personality_traits",
                character.personality_traits.copy()
                if character.personality_traits
                else {},
            ),
            behavioral_patterns=updates.get(
                "behavioral_patterns",
                character.behavioral_patterns.copy()
                if character.behavioral_patterns
                else {},
            ),
            voice_profile=updates.get(
                "voice_profile",
                character.voice_profile.copy()
                if character.voice_profile
                else {},
            ),
            render_style=updates.get("render_style", character.render_style),
            render_instructions=updates.get(
                "render_instructions", character.render_instructions
            ),
            reference_images=updates.get(
                "reference_images",
                character.reference_images.copy()
                if character.reference_images
                else [],
            ),
            reference_assets=updates.get(
                "reference_assets",
                character.reference_assets.copy()
                if character.reference_assets
                else [],
            ),
            surface_assets=updates.get(
                "surface_assets",
                character.surface_assets.copy()
                if character.surface_assets
                else [],
            ),
            game_npc_id=updates.get("game_npc_id", character.game_npc_id),
            sync_with_game=updates.get(
                "sync_with_game", character.sync_with_game
            ),
            game_metadata=updates.get(
                "game_metadata",
                character.game_metadata.copy()
                if character.game_metadata
                else {},
            ),
            tags=updates.get(
                "tags",
                character.tags.copy() if character.tags else {},
            ),
            character_metadata=updates.get(
                "character_metadata",
                character.character_metadata.copy()
                if character.character_metadata
                else {},
            ),
            created_by=character.created_by,
            # Versioning fields
            version_family_id=family.id,
            version_number=next_version,
            parent_character_id=character.id,
            version_message=message,
            created_at=now,
            updated_at=now,
        )

        self.db.add(new_character)
        await self.db.flush()

        # Update family HEAD
        old_head_id = family.head_character_id
        family.head_character_id = new_character.id
        family.updated_at = now
        await self.db.flush()

        await self.on_head_changed(family, old_head_id, new_character.id)

        return new_character

    # =========================================================================
    # CONVENIENCE METHODS
    # =========================================================================

    async def get_head_character(
        self, character_id_slug: str
    ) -> Optional[Character]:
        """
        Get the HEAD character for a character_id slug.

        If multiple versions share the same character_id, returns the one
        that is HEAD of its family. For standalone (unversioned) characters,
        returns the character directly.
        """
        # Try family HEAD first
        result = await self.db.execute(
            select(Character)
            .join(
                CharacterVersionFamily,
                CharacterVersionFamily.head_character_id == Character.id,
            )
            .where(
                Character.character_id == character_id_slug,
                Character.is_active == True,  # noqa: E712
            )
        )
        head = result.scalar_one_or_none()
        if head:
            return head

        # Fallback: standalone (no family)
        result = await self.db.execute(
            select(Character).where(
                Character.character_id == character_id_slug,
                Character.is_active == True,  # noqa: E712
                Character.version_family_id.is_(None),
            )
        )
        return result.scalar_one_or_none()

    async def get_family_for_character_slug(
        self, character_id_slug: str
    ) -> Optional[CharacterVersionFamily]:
        """
        Find the version family for a character_id slug.
        """
        result = await self.db.execute(
            select(Character.version_family_id).where(
                Character.character_id == character_id_slug,
                Character.version_family_id.isnot(None),
                Character.is_active == True,  # noqa: E712
            ).limit(1)
        )
        family_id_raw = result.scalar_one_or_none()
        if not family_id_raw:
            return None
        return await self.get_family(self._coerce_uuid(family_id_raw))
