"""
Prompt API helper functions.

Mirrors the pattern of api/v1/assets_helpers.py — centralises
PromptFamilyResponse construction so tag loading always goes through
the prompt_family_tag join table.
"""
from typing import List, Optional
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession

from pixsim7.backend.main.services.tag import TagAssignment
from pixsim7.backend.main.domain.prompt.tag import PromptFamilyTag
from .schemas import PromptFamilyResponse


async def build_family_response(
    family,
    db: AsyncSession,
    *,
    version_count: Optional[int] = None,
) -> PromptFamilyResponse:
    """
    Build PromptFamilyResponse with tags loaded from the join table.

    Args:
        family:        PromptFamily model instance.
        db:            Active async DB session.
        version_count: Optional pre-computed version count to include.
    """
    tag_slugs = [
        t.slug
        for t in await TagAssignment(db, PromptFamilyTag, "family_id").get_tags(family.id)
    ]
    return PromptFamilyResponse(
        id=family.id,
        slug=family.slug,
        title=family.title,
        description=family.description,
        prompt_type=family.prompt_type,
        category=family.category,
        tags=tag_slugs,
        is_active=family.is_active,
        version_count=version_count,
    )


async def build_family_responses(
    families,
    db: AsyncSession,
) -> List[PromptFamilyResponse]:
    """
    Build PromptFamilyResponse list with tags batch-loaded in a single query.
    """
    if not families:
        return []
    tags_map = await TagAssignment(db, PromptFamilyTag, "family_id").get_tags_batch(
        [f.id for f in families]
    )
    return [
        PromptFamilyResponse(
            id=f.id,
            slug=f.slug,
            title=f.title,
            description=f.description,
            prompt_type=f.prompt_type,
            category=f.category,
            tags=[t.slug for t in tags_map.get(f.id, [])],
            is_active=f.is_active,
        )
        for f in families
    ]
