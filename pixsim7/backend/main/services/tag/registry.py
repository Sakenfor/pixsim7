"""
Tag registry — tag CRUD, canonical resolution, slug lookup.

Entity-agnostic: knows nothing about assets, prompts, or game objects.
For tag assignment to a specific entity type use TagAssignment.
"""
from typing import Optional, List
from sqlmodel import select, or_, func
from sqlalchemy.ext.asyncio import AsyncSession

from pixsim7.backend.main.domain.assets.tag import (
    Tag,
    normalize_namespace,
    normalize_name,
    make_slug,
    parse_slug,
    validate_slug,
    normalize_slug,
)
from pixsim7.backend.main.shared.errors import ResourceNotFoundError, InvalidOperationError


class TagRegistry:
    """Manages tag definitions: CRUD, lookup, aliases, hierarchy."""

    def __init__(self, db: AsyncSession):
        self.db = db

    # ===== LOOKUP =====

    async def get_tag_by_id(self, tag_id: int) -> Tag:
        """Get tag by ID. Raises ResourceNotFoundError if missing."""
        tag = await self.db.get(Tag, tag_id)
        if not tag:
            raise ResourceNotFoundError(f"Tag {tag_id} not found")
        return tag

    async def get_tag_by_slug(self, slug: str, resolve_canonical: bool = True) -> Optional[Tag]:
        """
        Get tag by slug (normalized).

        If resolve_canonical=True and the tag is an alias, returns the
        canonical tag instead.
        """
        try:
            normalized_slug = normalize_slug(slug)
        except ValueError as e:
            raise InvalidOperationError(f"Invalid slug format: {e}")

        stmt = select(Tag).where(Tag.slug == normalized_slug)
        result = await self.db.execute(stmt)
        tag = result.scalars().first()

        if not tag:
            return None

        if resolve_canonical and tag.canonical_tag_id:
            canonical = await self.db.get(Tag, tag.canonical_tag_id)
            return canonical or tag

        return tag

    # ===== CRUD =====

    async def create_tag(
        self,
        namespace: str,
        name: str,
        display_name: Optional[str] = None,
        parent_tag_id: Optional[int] = None,
        meta: Optional[dict] = None,
    ) -> Tag:
        """Create a new tag. Raises InvalidOperationError on duplicate or bad slug."""
        namespace = normalize_namespace(namespace)
        name = normalize_name(name)
        slug = make_slug(namespace, name)

        if not validate_slug(slug):
            raise InvalidOperationError(f"Invalid slug: {slug}")

        existing = await self.get_tag_by_slug(slug, resolve_canonical=False)
        if existing:
            raise InvalidOperationError(f"Tag with slug '{slug}' already exists")

        if parent_tag_id:
            parent = await self.db.get(Tag, parent_tag_id)
            if not parent:
                raise InvalidOperationError(f"Parent tag {parent_tag_id} not found")

        tag = Tag(
            namespace=namespace,
            name=name,
            slug=slug,
            display_name=display_name or f"{namespace}:{name}",
            parent_tag_id=parent_tag_id,
            meta=meta,
        )
        self.db.add(tag)
        await self.db.commit()
        await self.db.refresh(tag)
        return tag

    async def get_or_create_tag(
        self,
        slug: str,
        display_name: Optional[str] = None,
    ) -> Tag:
        """
        Return existing tag (resolved to canonical) or create it if absent.

        Useful when assigning tags without requiring pre-registration.
        """
        tag = await self.get_tag_by_slug(slug, resolve_canonical=True)
        if tag:
            return tag

        try:
            normalized_slug = normalize_slug(slug)
            namespace, name = parse_slug(normalized_slug)
        except ValueError as e:
            raise InvalidOperationError(f"Invalid slug format: {e}")

        return await self.create_tag(namespace=namespace, name=name, display_name=display_name)

    async def update_tag(
        self,
        tag_id: int,
        display_name: Optional[str] = None,
        parent_tag_id: Optional[int] = None,
        meta: Optional[dict] = None,
    ) -> Tag:
        """Update mutable tag fields."""
        tag = await self.get_tag_by_id(tag_id)

        if display_name is not None:
            tag.display_name = display_name

        if parent_tag_id is not None:
            if parent_tag_id == tag_id:
                raise InvalidOperationError("Tag cannot be its own parent")
            parent = await self.db.get(Tag, parent_tag_id)
            if not parent:
                raise InvalidOperationError(f"Parent tag {parent_tag_id} not found")
            tag.parent_tag_id = parent_tag_id

        if meta is not None:
            tag.meta = meta

        tag.updated_at = func.now()
        await self.db.commit()
        await self.db.refresh(tag)
        return tag

    async def create_alias(
        self,
        canonical_tag_id: int,
        alias_slug: str,
        display_name: Optional[str] = None,
    ) -> Tag:
        """
        Create an alias tag pointing to a canonical tag.

        Example: alias 'char:alice' → canonical 'character:alice'.
        """
        canonical = await self.get_tag_by_id(canonical_tag_id)

        if canonical.canonical_tag_id:
            raise InvalidOperationError(
                f"Cannot alias an alias. Use canonical tag {canonical.canonical_tag_id} instead."
            )

        try:
            normalized_slug = normalize_slug(alias_slug)
            namespace, name = parse_slug(normalized_slug)
        except ValueError as e:
            raise InvalidOperationError(f"Invalid alias slug: {e}")

        existing = await self.get_tag_by_slug(normalized_slug, resolve_canonical=False)
        if existing:
            raise InvalidOperationError(f"Tag with slug '{normalized_slug}' already exists")

        alias_tag = Tag(
            namespace=namespace,
            name=name,
            slug=normalized_slug,
            display_name=display_name or f"{namespace}:{name}",
            canonical_tag_id=canonical_tag_id,
        )
        self.db.add(alias_tag)
        await self.db.commit()
        await self.db.refresh(alias_tag)
        return alias_tag

    # ===== LIST =====

    async def list_tags(
        self,
        namespace: Optional[str] = None,
        q: Optional[str] = None,
        limit: int = 50,
        offset: int = 0,
    ) -> List[Tag]:
        """List tags with optional namespace filter and text search."""
        stmt = select(Tag)

        if namespace:
            stmt = stmt.where(Tag.namespace == normalize_namespace(namespace))

        if q:
            q_lower = q.lower()
            stmt = stmt.where(
                or_(
                    Tag.slug.ilike(f"%{q_lower}%"),
                    Tag.name.ilike(f"%{q_lower}%"),
                    Tag.display_name.ilike(f"%{q_lower}%"),
                )
            )

        stmt = stmt.order_by(Tag.namespace, Tag.name).limit(limit).offset(offset)
        result = await self.db.execute(stmt)
        return list(result.scalars().all())
