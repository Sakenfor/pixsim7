"""
Generic tag assignment — links any entity type to tags via a join table.

Usage:
    # Assets
    asset_tags = TagAssignment(db, AssetTag, "asset_id")
    await asset_tags.assign(asset_id, ["character:alice", "style:anime"])

    # Prompts (once PromptTag join table exists)
    prompt_tags = TagAssignment(db, PromptTag, "prompt_id")
    await prompt_tags.assign(prompt_id, ["has:character", "location:park"])

The join model must have two columns:
    - entity FK column (named via entity_fk, e.g. "asset_id")
    - tag_id (FK to tag.id)
"""
from typing import List
from sqlmodel import select, func
from sqlalchemy import distinct
from sqlalchemy.ext.asyncio import AsyncSession

from pixsim7.backend.main.domain.assets.tag import Tag
from pixsim7.backend.main.shared.errors import ResourceNotFoundError
from pixsim7.backend.main.services.tag.registry import TagRegistry


class TagAssignment:
    """
    Manages tag assignment between a specific entity type and the tag catalog.

    Parameterized by:
        join_model  — the SQLModel join table (e.g. AssetTag, PromptTag)
        entity_fk   — name of the entity ID column on that table (e.g. "asset_id")
    """

    def __init__(self, db: AsyncSession, join_model, entity_fk: str):
        self.db = db
        self.join_model = join_model
        self._entity_col = getattr(join_model, entity_fk)
        self._registry = TagRegistry(db)

    # ===== ASSIGN / REMOVE =====

    async def assign(
        self,
        entity_id: int,
        tag_slugs: List[str],
        auto_create: bool = True,
    ) -> List[Tag]:
        """
        Assign tags to an entity.

        Args:
            entity_id:   ID of the entity being tagged.
            tag_slugs:   Slugs to assign (normalized + canonical-resolved).
            auto_create: Create tags that don't exist yet if True.

        Returns:
            Newly assigned tags (already-assigned ones are silently skipped).
        """
        assigned: List[Tag] = []

        for slug in tag_slugs:
            if auto_create:
                tag = await self._registry.get_or_create_tag(slug)
            else:
                tag = await self._registry.get_tag_by_slug(slug, resolve_canonical=True)
                if not tag:
                    raise ResourceNotFoundError(f"Tag '{slug}' not found")

            stmt = select(self.join_model).where(
                self._entity_col == entity_id,
                self.join_model.tag_id == tag.id,
            )
            result = await self.db.execute(stmt)
            if not result.scalars().first():
                row = self.join_model(**{self._entity_col.key: entity_id, "tag_id": tag.id})
                self.db.add(row)
                assigned.append(tag)

        await self.db.commit()
        return assigned

    async def remove(
        self,
        entity_id: int,
        tag_slugs: List[str],
    ) -> List[Tag]:
        """
        Remove tags from an entity. Non-existent slugs are silently skipped.

        Returns:
            Tags that were actually removed.
        """
        removed: List[Tag] = []

        for slug in tag_slugs:
            tag = await self._registry.get_tag_by_slug(slug, resolve_canonical=True)
            if not tag:
                continue

            stmt = select(self.join_model).where(
                self._entity_col == entity_id,
                self.join_model.tag_id == tag.id,
            )
            result = await self.db.execute(stmt)
            row = result.scalars().first()
            if row:
                await self.db.delete(row)
                removed.append(tag)

        await self.db.commit()
        return removed

    async def replace(
        self,
        entity_id: int,
        tag_slugs: List[str],
        auto_create: bool = True,
    ) -> List[Tag]:
        """Replace all tags for an entity with the given set."""
        stmt = select(self.join_model).where(self._entity_col == entity_id)
        result = await self.db.execute(stmt)
        for row in result.scalars().all():
            await self.db.delete(row)
        await self.db.commit()

        return await self.assign(entity_id, tag_slugs, auto_create=auto_create)

    # ===== QUERY =====

    async def get_tags(self, entity_id: int) -> List[Tag]:
        """Get all tags for a single entity, sorted by namespace + name."""
        stmt = (
            select(Tag)
            .join(self.join_model, self.join_model.tag_id == Tag.id)
            .where(self._entity_col == entity_id)
            .order_by(Tag.namespace, Tag.name)
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def get_tags_batch(self, entity_ids: List[int]) -> dict[int, List[Tag]]:
        """
        Batch-load tags for multiple entities in a single query.

        Returns:
            Dict mapping entity_id → list of tags (sorted by namespace, name).
        """
        if not entity_ids:
            return {}

        stmt = (
            select(self._entity_col.label("entity_id"), Tag)
            .join(Tag, self.join_model.tag_id == Tag.id)
            .where(self._entity_col.in_(entity_ids))
            .order_by(self._entity_col, Tag.namespace, Tag.name)
        )
        result = await self.db.execute(stmt)
        tags_map: dict[int, List[Tag]] = {eid: [] for eid in entity_ids}
        for entity_id, tag in result.all():
            tags_map[entity_id].append(tag)
        return tags_map

    async def usage_count(self, tag_id: int) -> int:
        """Count distinct entities that have this tag assigned."""
        stmt = select(func.count(distinct(self._entity_col))).where(
            self.join_model.tag_id == tag_id
        )
        result = await self.db.execute(stmt)
        return result.scalar() or 0
