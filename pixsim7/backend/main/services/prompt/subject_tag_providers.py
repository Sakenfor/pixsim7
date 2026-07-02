"""Subject tag providers — pluggable derivation of library tags from a prompt
family's *subject* (what the family is about).

Today the only subject is a Character (``PromptFamily.primary_character_id``).
This registry is the seam that lets other subject types (location, prop, …)
contribute structural tags without touching ``tag_deriver``'s control flow. Add
a new subject type by implementing ``SubjectTagProvider`` and registering it —
no change to the deriver.

Slug helpers live here (not in ``tag_deriver``) so providers can build tags
without importing back into the deriver — keeps the dependency one-directional
(``tag_deriver`` → ``subject_tag_providers``).
"""
from __future__ import annotations

import re
from typing import TYPE_CHECKING, Dict, List, Optional, Protocol
from uuid import UUID

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession


def slugify(value: str) -> str:
    """Lowercase, replace spaces/underscores with hyphens, strip non-slug chars."""
    value = value.lower().strip()
    value = re.sub(r"[\s_]+", "-", value)
    value = re.sub(r"[^a-z0-9-]", "", value)
    return value.strip("-")


def tag(prefix: str, value: Optional[str]) -> Optional[str]:
    """Build a ``prefix:value`` slug, or None if value is empty."""
    if not value:
        return None
    slug = slugify(value)
    return f"{prefix}:{slug}" if slug else None


class SubjectTagProvider(Protocol):
    """Derives structural tags from a family subject of a given type."""

    subject_type: str

    async def derive_tags(self, subject_id: UUID, db: "AsyncSession") -> List[str]:
        ...


class CharacterSubjectProvider:
    """Derives ``character:`` / ``archetype:`` / ``kind:`` tags from the bound
    Character.

    Verbatim port of the former inline block in
    ``tag_deriver.derive_structural_tags`` — never raises; on any lookup failure
    it yields no tags.
    """

    subject_type = "character"

    async def derive_tags(self, subject_id: UUID, db: "AsyncSession") -> List[str]:
        tags: List[str] = []
        try:
            from sqlalchemy import select
            from pixsim7.backend.main.domain.game.entities.character import Character

            result = await db.execute(
                select(Character).where(Character.id == subject_id)
            )
            char = result.scalar_one_or_none()
            if char:
                if t := tag("character", char.species or char.category):
                    tags.append(t)
                if t := tag("archetype", char.archetype):
                    tags.append(t)
                # Surface the broad category only if species is present
                # (avoids duplicate when species==category)
                if char.species and char.category and char.species != char.category:
                    if t := tag("kind", char.category):
                        tags.append(t)
        except Exception:
            pass
        return tags


_PROVIDERS: Dict[str, SubjectTagProvider] = {}


def register_subject_tag_provider(provider: SubjectTagProvider) -> None:
    """Register (or replace) the provider for ``provider.subject_type``."""
    _PROVIDERS[provider.subject_type] = provider


def get_subject_tag_provider(subject_type: str) -> Optional[SubjectTagProvider]:
    return _PROVIDERS.get(subject_type)


# Built-in providers. Location/prop/etc. register alongside this one later.
register_subject_tag_provider(CharacterSubjectProvider())
