"""
Tag service - business logic for tag management

Handles:
- Tag CRUD operations
- Canonical tag resolution
- Auto-creation of tags
- Tag hierarchy
- Tag aliasing
"""
from typing import Optional, List
from sqlmodel import Session, select, or_, func
from pixsim7.backend.main.domain.tag import (
    Tag,
    AssetTag,
    normalize_namespace,
    normalize_name,
    make_slug,
    parse_slug,
    validate_slug,
    normalize_slug,
)
from pixsim7.backend.main.shared.errors import ResourceNotFoundError, InvalidOperationError


class TagService:
    """Service for managing tags and asset-tag associations."""

    def __init__(self, db: Session):
        self.db = db

    # ===== TAG CRUD =====

    async def get_tag_by_id(self, tag_id: int) -> Tag:
        """Get tag by ID."""
        tag = self.db.get(Tag, tag_id)
        if not tag:
            raise ResourceNotFoundError(f"Tag {tag_id} not found")
        return tag

    async def get_tag_by_slug(self, slug: str, resolve_canonical: bool = True) -> Optional[Tag]:
        """
        Get tag by slug.

        Args:
            slug: Tag slug (will be normalized)
            resolve_canonical: If True and tag is an alias, return canonical tag

        Returns:
            Tag or None if not found
        """
        # Normalize slug
        try:
            normalized_slug = normalize_slug(slug)
        except ValueError as e:
            raise InvalidOperationError(f"Invalid slug format: {e}")

        # Find tag
        stmt = select(Tag).where(Tag.slug == normalized_slug)
        tag = self.db.exec(stmt).first()

        if not tag:
            return None

        # Resolve canonical if needed
        if resolve_canonical and tag.canonical_tag_id:
            canonical = self.db.get(Tag, tag.canonical_tag_id)
            return canonical or tag

        return tag

    async def create_tag(
        self,
        namespace: str,
        name: str,
        display_name: Optional[str] = None,
        parent_tag_id: Optional[int] = None,
        meta: Optional[dict] = None,
    ) -> Tag:
        """
        Create a new tag.

        Args:
            namespace: Tag namespace (will be normalized)
            name: Tag name (will be normalized)
            display_name: Display name (preserves casing)
            parent_tag_id: Parent tag ID for hierarchy
            meta: Plugin/provider metadata

        Returns:
            Created tag

        Raises:
            InvalidOperationError: If slug is invalid or already exists
        """
        # Normalize
        namespace = normalize_namespace(namespace)
        name = normalize_name(name)
        slug = make_slug(namespace, name)

        # Validate
        if not validate_slug(slug):
            raise InvalidOperationError(f"Invalid slug: {slug}")

        # Check for duplicates
        existing = await self.get_tag_by_slug(slug, resolve_canonical=False)
        if existing:
            raise InvalidOperationError(f"Tag with slug '{slug}' already exists")

        # Validate parent exists
        if parent_tag_id:
            parent = self.db.get(Tag, parent_tag_id)
            if not parent:
                raise InvalidOperationError(f"Parent tag {parent_tag_id} not found")

        # Create tag
        tag = Tag(
            namespace=namespace,
            name=name,
            slug=slug,
            display_name=display_name or f"{namespace}:{name}",
            parent_tag_id=parent_tag_id,
            meta=meta,
        )

        self.db.add(tag)
        self.db.commit()
        self.db.refresh(tag)

        return tag

    async def get_or_create_tag(
        self,
        slug: str,
        display_name: Optional[str] = None,
    ) -> Tag:
        """
        Get existing tag or create if not exists.

        This is useful for auto-creating tags when assigning to assets.

        Args:
            slug: Tag slug (will be normalized)
            display_name: Display name if creating (optional)

        Returns:
            Existing or newly created tag (canonical if exists)
        """
        # Try to get existing
        tag = await self.get_tag_by_slug(slug, resolve_canonical=True)
        if tag:
            return tag

        # Create new
        try:
            normalized_slug = normalize_slug(slug)
            namespace, name = parse_slug(normalized_slug)
        except ValueError as e:
            raise InvalidOperationError(f"Invalid slug format: {e}")

        return await self.create_tag(
            namespace=namespace,
            name=name,
            display_name=display_name,
        )

    async def update_tag(
        self,
        tag_id: int,
        display_name: Optional[str] = None,
        parent_tag_id: Optional[int] = None,
        meta: Optional[dict] = None,
    ) -> Tag:
        """Update tag fields."""
        tag = await self.get_tag_by_id(tag_id)

        # Update fields
        if display_name is not None:
            tag.display_name = display_name

        if parent_tag_id is not None:
            # Validate parent exists and isn't the tag itself
            if parent_tag_id == tag_id:
                raise InvalidOperationError("Tag cannot be its own parent")

            parent = self.db.get(Tag, parent_tag_id)
            if not parent:
                raise InvalidOperationError(f"Parent tag {parent_tag_id} not found")

            tag.parent_tag_id = parent_tag_id

        if meta is not None:
            tag.meta = meta

        tag.updated_at = func.now()

        self.db.commit()
        self.db.refresh(tag)

        return tag

    async def create_alias(
        self,
        canonical_tag_id: int,
        alias_slug: str,
        display_name: Optional[str] = None,
    ) -> Tag:
        """
        Create an alias tag pointing to a canonical tag.

        Args:
            canonical_tag_id: ID of canonical tag
            alias_slug: New alias slug (e.g., 'char:alice')
            display_name: Display name for alias

        Returns:
            Created alias tag
        """
        # Validate canonical exists
        canonical = await self.get_tag_by_id(canonical_tag_id)

        # Ensure canonical isn't itself an alias
        if canonical.canonical_tag_id:
            raise InvalidOperationError(
                f"Cannot create alias to an alias tag. Use canonical tag {canonical.canonical_tag_id} instead."
            )

        # Normalize alias slug
        try:
            normalized_slug = normalize_slug(alias_slug)
            namespace, name = parse_slug(normalized_slug)
        except ValueError as e:
            raise InvalidOperationError(f"Invalid alias slug: {e}")

        # Check for duplicates
        existing = await self.get_tag_by_slug(normalized_slug, resolve_canonical=False)
        if existing:
            raise InvalidOperationError(f"Tag with slug '{normalized_slug}' already exists")

        # Create alias
        alias_tag = Tag(
            namespace=namespace,
            name=name,
            slug=normalized_slug,
            display_name=display_name or f"{namespace}:{name}",
            canonical_tag_id=canonical_tag_id,
        )

        self.db.add(alias_tag)
        self.db.commit()
        self.db.refresh(alias_tag)

        return alias_tag

    async def list_tags(
        self,
        namespace: Optional[str] = None,
        q: Optional[str] = None,
        limit: int = 50,
        offset: int = 0,
    ) -> List[Tag]:
        """
        List tags with optional filters.

        Args:
            namespace: Filter by namespace
            q: Search query (matches slug or name)
            limit: Max results
            offset: Pagination offset

        Returns:
            List of tags
        """
        stmt = select(Tag)

        # Filter by namespace
        if namespace:
            namespace_normalized = normalize_namespace(namespace)
            stmt = stmt.where(Tag.namespace == namespace_normalized)

        # Search query
        if q:
            q_lower = q.lower()
            stmt = stmt.where(
                or_(
                    Tag.slug.ilike(f"%{q_lower}%"),
                    Tag.name.ilike(f"%{q_lower}%"),
                    Tag.display_name.ilike(f"%{q_lower}%"),
                )
            )

        # Order by namespace, name
        stmt = stmt.order_by(Tag.namespace, Tag.name)

        # Pagination
        stmt = stmt.limit(limit).offset(offset)

        tags = self.db.exec(stmt).all()
        return list(tags)

    async def get_tag_usage_count(self, tag_id: int) -> int:
        """Get number of assets using this tag."""
        stmt = select(func.count(AssetTag.asset_id)).where(AssetTag.tag_id == tag_id)
        count = self.db.exec(stmt).first()
        return count or 0

    # ===== ASSET TAG ASSIGNMENT =====

    async def assign_tags_to_asset(
        self,
        asset_id: int,
        tag_slugs: List[str],
        auto_create: bool = True,
    ) -> List[Tag]:
        """
        Assign tags to an asset.

        Args:
            asset_id: Asset ID
            tag_slugs: List of tag slugs to assign
            auto_create: If True, create tags that don't exist

        Returns:
            List of assigned tags (canonical)
        """
        assigned_tags = []

        for slug in tag_slugs:
            # Get or create tag
            if auto_create:
                tag = await self.get_or_create_tag(slug)
            else:
                tag = await self.get_tag_by_slug(slug, resolve_canonical=True)
                if not tag:
                    raise ResourceNotFoundError(f"Tag '{slug}' not found")

            # Check if already assigned
            stmt = select(AssetTag).where(
                AssetTag.asset_id == asset_id,
                AssetTag.tag_id == tag.id,
            )
            existing = self.db.exec(stmt).first()

            if not existing:
                # Create assignment
                asset_tag = AssetTag(asset_id=asset_id, tag_id=tag.id)
                self.db.add(asset_tag)
                assigned_tags.append(tag)

        self.db.commit()

        return assigned_tags

    async def remove_tags_from_asset(
        self,
        asset_id: int,
        tag_slugs: List[str],
    ) -> List[Tag]:
        """
        Remove tags from an asset.

        Args:
            asset_id: Asset ID
            tag_slugs: List of tag slugs to remove

        Returns:
            List of removed tags
        """
        removed_tags = []

        for slug in tag_slugs:
            # Resolve tag
            tag = await self.get_tag_by_slug(slug, resolve_canonical=True)
            if not tag:
                continue  # Silently skip non-existent tags

            # Find and delete assignment
            stmt = select(AssetTag).where(
                AssetTag.asset_id == asset_id,
                AssetTag.tag_id == tag.id,
            )
            asset_tag = self.db.exec(stmt).first()

            if asset_tag:
                self.db.delete(asset_tag)
                removed_tags.append(tag)

        self.db.commit()

        return removed_tags

    async def get_asset_tags(self, asset_id: int) -> List[Tag]:
        """
        Get all tags for an asset.

        Returns:
            List of tags (sorted by namespace, name)
        """
        stmt = (
            select(Tag)
            .join(AssetTag, AssetTag.tag_id == Tag.id)
            .where(AssetTag.asset_id == asset_id)
            .order_by(Tag.namespace, Tag.name)
        )

        tags = self.db.exec(stmt).all()
        return list(tags)

    async def replace_asset_tags(
        self,
        asset_id: int,
        tag_slugs: List[str],
        auto_create: bool = True,
    ) -> List[Tag]:
        """
        Replace all tags for an asset.

        Args:
            asset_id: Asset ID
            tag_slugs: New list of tag slugs
            auto_create: If True, create tags that don't exist

        Returns:
            List of assigned tags
        """
        # Remove all existing tags
        stmt = select(AssetTag).where(AssetTag.asset_id == asset_id)
        existing_assignments = self.db.exec(stmt).all()

        for assignment in existing_assignments:
            self.db.delete(assignment)

        self.db.commit()

        # Assign new tags
        return await self.assign_tags_to_asset(asset_id, tag_slugs, auto_create=auto_create)
