"""
Default tags seeded on startup.

These tags provide built-in organizational primitives for the asset gallery.
Users can create additional tags freely via the API.
"""
from sqlalchemy.ext.asyncio import AsyncSession

DEFAULT_TAGS = [
    {"slug": "user:favorite", "display_name": "Favorite"},
]


async def seed_default_tags(db: AsyncSession) -> int:
    """
    Seed default tags into database if they don't exist.

    Returns:
        Number of newly created tags.
    """
    from pixsim7.backend.main.services.tag_service import TagService

    tag_service = TagService(db)
    created = 0

    for tag_def in DEFAULT_TAGS:
        existing = await tag_service.get_tag_by_slug(
            tag_def["slug"], resolve_canonical=False
        )
        if not existing:
            await tag_service.get_or_create_tag(
                slug=tag_def["slug"],
                display_name=tag_def.get("display_name"),
            )
            created += 1

    await db.commit()
    return created
