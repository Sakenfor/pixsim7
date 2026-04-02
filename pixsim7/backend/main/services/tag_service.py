"""
Tag service - business logic for tag management

Handles:
- Tag CRUD operations
- Canonical tag resolution
- Auto-creation of tags
- Tag hierarchy
- Tag aliasing
"""
from dataclasses import dataclass
from typing import Optional, List, Literal
from uuid import UUID
from sqlmodel import select, or_, func
from sqlalchemy.ext.asyncio import AsyncSession
from pixsim7.backend.main.domain.assets.tag import (
    Tag,
    AssetTag,
    normalize_namespace,
    normalize_name,
    make_slug,
    parse_slug,
    validate_slug,
    normalize_slug,
)
from pixsim7.backend.main.domain.prompt.tag_assertions import PromptVersionTagAssertion
from pixsim7.backend.main.shared.errors import ResourceNotFoundError, InvalidOperationError


TagSource = Literal["manual", "system", "analyzer", "unknown"]


@dataclass(frozen=True)
class TagTargetSpec:
    """
    Typed target descriptor for tag assertions.

    Each tagged entity (asset, prompt_version, future game types) provides:
    - assertion_model: SQLModel table class
    - target_field: FK field name on assertion table
    - supports_confidence: whether assertion model stores confidence
    """

    assertion_model: type
    target_field: str
    supports_confidence: bool = False


class TagService:
    """Service for managing tags and typed tag assertions."""

    TAG_SOURCES = ("unknown", "system", "analyzer", "manual")
    SOURCE_PRIORITY = {
        "unknown": 0,
        "system": 1,
        "analyzer": 2,
        "manual": 3,
    }
    ASSET_TARGET = TagTargetSpec(
        assertion_model=AssetTag,
        target_field="asset_id",
        supports_confidence=False,
    )
    PROMPT_VERSION_TARGET = TagTargetSpec(
        assertion_model=PromptVersionTagAssertion,
        target_field="prompt_version_id",
        supports_confidence=True,
    )

    def __init__(self, db: AsyncSession):
        self.db = db

    # ===== TAG CRUD =====

    async def get_tag_by_id(self, tag_id: int) -> Tag:
        """Get tag by ID."""
        tag = await self.db.get(Tag, tag_id)
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
        result = await self.db.execute(stmt)
        tag = result.scalars().first()

        if not tag:
            return None

        # Resolve canonical if needed
        if resolve_canonical and tag.canonical_tag_id:
            canonical = await self.db.get(Tag, tag.canonical_tag_id)
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
            parent = await self.db.get(Tag, parent_tag_id)
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
        await self.db.commit()
        await self.db.refresh(tag)

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
        await self.db.commit()
        await self.db.refresh(alias_tag)

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

        result = await self.db.execute(stmt)
        tags = result.scalars().all()
        return list(tags)

    async def get_tag_usage_count(self, tag_id: int) -> int:
        """Get number of assets using this tag."""
        stmt = select(func.count(AssetTag.asset_id)).where(AssetTag.tag_id == tag_id)
        result = await self.db.execute(stmt)
        count = result.scalar()
        return count or 0

    # ===== Assertion Helpers =====

    @staticmethod
    def _normalize_confidence(confidence: float | None) -> float | None:
        if confidence is None:
            return None
        return max(0.0, min(1.0, float(confidence)))

    def _assert_valid_source(self, source: TagSource) -> None:
        if source not in self.TAG_SOURCES:
            raise InvalidOperationError(f"Invalid tag source '{source}'")

    @staticmethod
    def _normalize_slug_list(tag_slugs: List[str]) -> list[str]:
        normalized: list[str] = []
        seen: set[str] = set()
        for raw in tag_slugs:
            if raw is None:
                continue
            value = str(raw).strip()
            if not value:
                continue
            if value in seen:
                continue
            seen.add(value)
            normalized.append(value)
        return normalized

    async def _resolve_tag_for_assignment(self, slug: str, auto_create: bool) -> Tag:
        if auto_create:
            return await self.get_or_create_tag(slug)
        tag = await self.get_tag_by_slug(slug, resolve_canonical=True)
        if not tag:
            raise ResourceNotFoundError(f"Tag '{slug}' not found")
        return tag

    async def _find_existing_assertion(
        self,
        *,
        spec: TagTargetSpec,
        target_id: int | UUID,
        tag_id: int,
    ):
        target_column = getattr(spec.assertion_model, spec.target_field)
        stmt = select(spec.assertion_model).where(
            target_column == target_id,
            spec.assertion_model.tag_id == tag_id,
        )
        result = await self.db.execute(stmt)
        return result.scalars().first()

    def _maybe_upgrade_source(self, assertion: object, source: TagSource) -> None:
        current_source = getattr(assertion, "source", None) or "unknown"
        if current_source not in self.TAG_SOURCES:
            current_source = "unknown"
        if self.SOURCE_PRIORITY[source] > self.SOURCE_PRIORITY[current_source]:
            setattr(assertion, "source", source)

    async def _assign_tags(
        self,
        *,
        spec: TagTargetSpec,
        target_id: int | UUID,
        tag_slugs: List[str],
        auto_create: bool,
        source: TagSource,
        confidence: float | None = None,
    ) -> List[Tag]:
        self._assert_valid_source(source)
        normalized_confidence = self._normalize_confidence(confidence)
        normalized_slugs = self._normalize_slug_list(tag_slugs)
        if not normalized_slugs:
            return []

        assigned_tags: list[Tag] = []
        changed = False

        for slug in normalized_slugs:
            tag = await self._resolve_tag_for_assignment(slug, auto_create=auto_create)
            existing = await self._find_existing_assertion(
                spec=spec,
                target_id=target_id,
                tag_id=tag.id,
            )

            if not existing:
                payload = {
                    spec.target_field: target_id,
                    "tag_id": tag.id,
                    "source": source,
                }
                if spec.supports_confidence:
                    payload["confidence"] = normalized_confidence
                assertion = spec.assertion_model(**payload)
                self.db.add(assertion)
                assigned_tags.append(tag)
                changed = True
                continue

            previous_source = getattr(existing, "source", None)
            self._maybe_upgrade_source(existing, source)
            if getattr(existing, "source", None) != previous_source:
                changed = True
            if spec.supports_confidence and normalized_confidence is not None:
                existing_confidence = getattr(existing, "confidence", None)
                if existing_confidence is None or normalized_confidence > existing_confidence:
                    setattr(existing, "confidence", normalized_confidence)
                    changed = True

        if changed:
            await self.db.commit()
        return assigned_tags

    async def _remove_tags(
        self,
        *,
        spec: TagTargetSpec,
        target_id: int | UUID,
        tag_slugs: List[str],
    ) -> List[Tag]:
        removed_tags: list[Tag] = []
        normalized_slugs = self._normalize_slug_list(tag_slugs)
        if not normalized_slugs:
            return removed_tags
        target_column = getattr(spec.assertion_model, spec.target_field)

        for slug in normalized_slugs:
            tag = await self.get_tag_by_slug(slug, resolve_canonical=True)
            if not tag:
                continue
            stmt = select(spec.assertion_model).where(
                target_column == target_id,
                spec.assertion_model.tag_id == tag.id,
            )
            result = await self.db.execute(stmt)
            assertion = result.scalars().first()
            if assertion:
                await self.db.delete(assertion)
                removed_tags.append(tag)

        if removed_tags:
            await self.db.commit()
        return removed_tags

    async def _replace_tags(
        self,
        *,
        spec: TagTargetSpec,
        target_id: int | UUID,
        tag_slugs: List[str],
        auto_create: bool,
        source: TagSource,
        confidence: float | None = None,
    ) -> List[Tag]:
        normalized_slugs = self._normalize_slug_list(tag_slugs)
        target_column = getattr(spec.assertion_model, spec.target_field)
        stmt = select(spec.assertion_model).where(target_column == target_id)
        result = await self.db.execute(stmt)
        existing_assertions = result.scalars().all()
        changed = False
        for assertion in existing_assertions:
            await self.db.delete(assertion)
            changed = True
        if changed:
            await self.db.commit()
        return await self._assign_tags(
            spec=spec,
            target_id=target_id,
            tag_slugs=normalized_slugs,
            auto_create=auto_create,
            source=source,
            confidence=confidence,
        )

    async def _get_target_tags(
        self,
        *,
        spec: TagTargetSpec,
        target_id: int | UUID,
    ) -> List[Tag]:
        target_column = getattr(spec.assertion_model, spec.target_field)
        stmt = (
            select(Tag)
            .join(spec.assertion_model, spec.assertion_model.tag_id == Tag.id)
            .where(target_column == target_id)
            .order_by(Tag.namespace, Tag.name)
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def _list_assertions(
        self,
        *,
        spec: TagTargetSpec,
        target_id: int | UUID,
    ) -> list[dict]:
        target_column = getattr(spec.assertion_model, spec.target_field)
        stmt = (
            select(Tag, spec.assertion_model)
            .join(spec.assertion_model, spec.assertion_model.tag_id == Tag.id)
            .where(target_column == target_id)
            .order_by(Tag.namespace, Tag.name)
        )
        result = await self.db.execute(stmt)
        rows = result.all()
        out: list[dict] = []
        for tag, assertion in rows:
            out.append(
                {
                    "tag": tag,
                    "source": getattr(assertion, "source", None) or "unknown",
                    "confidence": getattr(assertion, "confidence", None),
                    "created_at": getattr(assertion, "created_at", None),
                }
            )
        return out

    async def _sync_tags_for_source(
        self,
        *,
        spec: TagTargetSpec,
        target_id: int | UUID,
        tag_slugs: List[str],
        source: TagSource,
        auto_create: bool,
        confidence: float | None = None,
    ) -> List[Tag]:
        self._assert_valid_source(source)
        normalized_slugs = self._normalize_slug_list(tag_slugs)

        desired_canonical_slugs: list[str] = []
        desired_tag_ids: set[int] = set()
        for slug in normalized_slugs:
            tag = await self._resolve_tag_for_assignment(slug, auto_create=auto_create)
            if tag.id in desired_tag_ids:
                continue
            desired_tag_ids.add(tag.id)
            desired_canonical_slugs.append(tag.slug)

        target_column = getattr(spec.assertion_model, spec.target_field)
        existing_stmt = select(spec.assertion_model).where(
            target_column == target_id,
            spec.assertion_model.source == source,
        )
        existing_result = await self.db.execute(existing_stmt)
        existing_assertions = existing_result.scalars().all()

        removed = False
        for assertion in existing_assertions:
            if assertion.tag_id in desired_tag_ids:
                continue
            await self.db.delete(assertion)
            removed = True
        if removed:
            await self.db.commit()

        if not desired_canonical_slugs:
            return []

        return await self._assign_tags(
            spec=spec,
            target_id=target_id,
            tag_slugs=desired_canonical_slugs,
            auto_create=False,
            source=source,
            confidence=confidence,
        )

    # ===== ASSET TAG ASSIGNMENT =====

    async def assign_tags_to_asset(
        self,
        asset_id: int,
        tag_slugs: List[str],
        auto_create: bool = True,
        source: TagSource = "manual",
    ) -> List[Tag]:
        """
        Assign tags to an asset.

        Args:
            asset_id: Asset ID
            tag_slugs: List of tag slugs to assign
            auto_create: If True, create tags that don't exist
            source: Provenance of assignment

        Returns:
            List of assigned tags (canonical)
        """
        return await self._assign_tags(
            spec=self.ASSET_TARGET,
            target_id=asset_id,
            tag_slugs=tag_slugs,
            auto_create=auto_create,
            source=source,
        )

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
        return await self._remove_tags(
            spec=self.ASSET_TARGET,
            target_id=asset_id,
            tag_slugs=tag_slugs,
        )

    async def get_asset_tags(self, asset_id: int) -> List[Tag]:
        """
        Get all tags for an asset.

        Returns:
            List of tags (sorted by namespace, name)
        """
        return await self._get_target_tags(
            spec=self.ASSET_TARGET,
            target_id=asset_id,
        )

    async def list_asset_tag_assertions(self, asset_id: int) -> list[dict]:
        """Get asset tag assertions with provenance metadata."""
        return await self._list_assertions(
            spec=self.ASSET_TARGET,
            target_id=asset_id,
        )

    async def get_tags_for_assets(self, asset_ids: List[int]) -> dict[int, List[Tag]]:
        """
        Batch-load tags for multiple assets in a single query.

        Returns:
            Dict mapping asset_id -> list of tags (sorted by namespace, name)
        """
        if not asset_ids:
            return {}

        stmt = (
            select(AssetTag.asset_id, Tag)
            .join(Tag, AssetTag.tag_id == Tag.id)
            .where(AssetTag.asset_id.in_(asset_ids))
            .order_by(AssetTag.asset_id, Tag.namespace, Tag.name)
        )

        result = await self.db.execute(stmt)
        tags_map: dict[int, List[Tag]] = {aid: [] for aid in asset_ids}
        for asset_id, tag in result.all():
            tags_map[asset_id].append(tag)
        return tags_map

    async def replace_asset_tags(
        self,
        asset_id: int,
        tag_slugs: List[str],
        auto_create: bool = True,
        source: TagSource = "manual",
    ) -> List[Tag]:
        """
        Replace all tags for an asset.

        Args:
            asset_id: Asset ID
            tag_slugs: New list of tag slugs
            auto_create: If True, create tags that don't exist
            source: Provenance of assignment

        Returns:
            List of assigned tags
        """
        return await self._replace_tags(
            spec=self.ASSET_TARGET,
            target_id=asset_id,
            tag_slugs=tag_slugs,
            auto_create=auto_create,
            source=source,
        )

    async def sync_asset_tags_by_source(
        self,
        asset_id: int,
        tag_slugs: List[str],
        source: TagSource,
        auto_create: bool = True,
    ) -> List[Tag]:
        """
        Sync asset tags for a single source.

        Existing assertions with the same source are pruned when absent from
        `tag_slugs`; assertions from other sources are preserved.
        """
        return await self._sync_tags_for_source(
            spec=self.ASSET_TARGET,
            target_id=asset_id,
            tag_slugs=tag_slugs,
            source=source,
            auto_create=auto_create,
        )

    # ===== PROMPT VERSION TAG ASSIGNMENT =====

    async def assign_tags_to_prompt_version(
        self,
        prompt_version_id: UUID,
        tag_slugs: List[str],
        auto_create: bool = True,
        source: TagSource = "analyzer",
        confidence: float | None = None,
    ) -> List[Tag]:
        """
        Assign tags to a prompt version.

        Args:
            prompt_version_id: PromptVersion ID
            tag_slugs: List of tag slugs to assign
            auto_create: If True, create tags that don't exist
            source: Provenance of assignment
            confidence: Optional confidence score for analyzer-produced tags

        Returns:
            List of assigned tags (canonical)
        """
        return await self._assign_tags(
            spec=self.PROMPT_VERSION_TARGET,
            target_id=prompt_version_id,
            tag_slugs=tag_slugs,
            auto_create=auto_create,
            source=source,
            confidence=confidence,
        )

    async def remove_tags_from_prompt_version(
        self,
        prompt_version_id: UUID,
        tag_slugs: List[str],
    ) -> List[Tag]:
        """Remove tags from a prompt version."""
        return await self._remove_tags(
            spec=self.PROMPT_VERSION_TARGET,
            target_id=prompt_version_id,
            tag_slugs=tag_slugs,
        )

    async def get_prompt_version_tags(self, prompt_version_id: UUID) -> List[Tag]:
        """Get all tags for a prompt version (sorted by namespace, name)."""
        return await self._get_target_tags(
            spec=self.PROMPT_VERSION_TARGET,
            target_id=prompt_version_id,
        )

    async def list_prompt_version_tag_assertions(self, prompt_version_id: UUID) -> list[dict]:
        """Get prompt-version tag assertions with provenance metadata."""
        return await self._list_assertions(
            spec=self.PROMPT_VERSION_TARGET,
            target_id=prompt_version_id,
        )

    async def replace_prompt_version_tags(
        self,
        prompt_version_id: UUID,
        tag_slugs: List[str],
        auto_create: bool = True,
        source: TagSource = "analyzer",
        confidence: float | None = None,
    ) -> List[Tag]:
        """Replace all prompt-version tag assertions with a new set."""
        return await self._replace_tags(
            spec=self.PROMPT_VERSION_TARGET,
            target_id=prompt_version_id,
            tag_slugs=tag_slugs,
            auto_create=auto_create,
            source=source,
            confidence=confidence,
        )

    async def sync_prompt_version_analyzer_tags(
        self,
        prompt_version_id: UUID,
        tag_slugs: List[str],
        auto_create: bool = True,
        confidence: float | None = None,
    ) -> List[Tag]:
        """
        Sync analyzer tags for a prompt version.

        This prunes stale analyzer assertions while preserving manual/system
        assertions, then upserts the requested analyzer tags.
        """
        return await self._sync_tags_for_source(
            spec=self.PROMPT_VERSION_TARGET,
            target_id=prompt_version_id,
            tag_slugs=tag_slugs,
            auto_create=auto_create,
            source="analyzer",
            confidence=confidence,
        )

    async def sync_prompt_version_tags_by_source(
        self,
        prompt_version_id: UUID,
        tag_slugs: List[str],
        source: TagSource,
        auto_create: bool = True,
        confidence: float | None = None,
    ) -> List[Tag]:
        """Sync prompt-version tags for a specific source."""
        return await self._sync_tags_for_source(
            spec=self.PROMPT_VERSION_TARGET,
            target_id=prompt_version_id,
            tag_slugs=tag_slugs,
            source=source,
            auto_create=auto_create,
            confidence=confidence,
        )
