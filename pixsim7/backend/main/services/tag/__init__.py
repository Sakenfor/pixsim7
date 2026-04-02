"""
Tag service package.

Public surface:
    TagRegistry   — tag CRUD, slug lookup, canonical resolution (entity-agnostic)
    TagAssignment — generic assign/remove/query for any entity type via a join table
    TagService    — backward-compatible facade (assets only) over the two above

New code should prefer composing TagRegistry + TagAssignment directly:

    registry = TagRegistry(db)
    asset_tags = TagAssignment(db, AssetTag, "asset_id")
"""
from pixsim7.backend.main.services.tag.registry import TagRegistry
from pixsim7.backend.main.services.tag.assignment import TagAssignment
from pixsim7.backend.main.domain.assets.tag import AssetTag
from typing import Optional, List
from pixsim7.backend.main.domain.assets.tag import Tag


class TagService:
    """
    Backward-compatible facade over TagRegistry + asset-bound TagAssignment.

    Existing callers continue to work without changes. New entity types
    (prompts, game objects) should instantiate TagAssignment directly with
    their own join model instead of extending this class.
    """

    def __init__(self, db):
        self._registry = TagRegistry(db)
        self._assignment = TagAssignment(db, AssetTag, "asset_id")

    # ===== TAG CRUD (delegates to TagRegistry) =====

    async def get_tag_by_id(self, tag_id: int) -> Tag:
        return await self._registry.get_tag_by_id(tag_id)

    async def get_tag_by_slug(self, slug: str, resolve_canonical: bool = True) -> Optional[Tag]:
        return await self._registry.get_tag_by_slug(slug, resolve_canonical)

    async def create_tag(
        self,
        namespace: str,
        name: str,
        display_name: Optional[str] = None,
        parent_tag_id: Optional[int] = None,
        meta: Optional[dict] = None,
    ) -> Tag:
        return await self._registry.create_tag(namespace, name, display_name, parent_tag_id, meta)

    async def get_or_create_tag(self, slug: str, display_name: Optional[str] = None) -> Tag:
        return await self._registry.get_or_create_tag(slug, display_name)

    async def update_tag(
        self,
        tag_id: int,
        display_name: Optional[str] = None,
        parent_tag_id: Optional[int] = None,
        meta: Optional[dict] = None,
    ) -> Tag:
        return await self._registry.update_tag(tag_id, display_name, parent_tag_id, meta)

    async def create_alias(
        self,
        canonical_tag_id: int,
        alias_slug: str,
        display_name: Optional[str] = None,
    ) -> Tag:
        return await self._registry.create_alias(canonical_tag_id, alias_slug, display_name)

    async def list_tags(
        self,
        namespace: Optional[str] = None,
        q: Optional[str] = None,
        limit: int = 50,
        offset: int = 0,
    ) -> List[Tag]:
        return await self._registry.list_tags(namespace, q, limit, offset)

    async def get_tag_usage_count(self, tag_id: int) -> int:
        return await self._assignment.usage_count(tag_id)

    # ===== ASSET TAG ASSIGNMENT (delegates to TagAssignment) =====

    async def assign_tags_to_asset(
        self, asset_id: int, tag_slugs: List[str], auto_create: bool = True
    ) -> List[Tag]:
        return await self._assignment.assign(asset_id, tag_slugs, auto_create)

    async def remove_tags_from_asset(self, asset_id: int, tag_slugs: List[str]) -> List[Tag]:
        return await self._assignment.remove(asset_id, tag_slugs)

    async def get_asset_tags(self, asset_id: int) -> List[Tag]:
        return await self._assignment.get_tags(asset_id)

    async def get_tags_for_assets(self, asset_ids: List[int]) -> dict[int, List[Tag]]:
        return await self._assignment.get_tags_batch(asset_ids)

    async def replace_asset_tags(
        self, asset_id: int, tag_slugs: List[str], auto_create: bool = True
    ) -> List[Tag]:
        return await self._assignment.replace(asset_id, tag_slugs, auto_create)


__all__ = ["TagService", "TagRegistry", "TagAssignment"]
