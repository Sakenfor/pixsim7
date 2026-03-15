"""
Asset Search Groups Mixin

Handles asset grouping, group metadata, and scoped ID subqueries.
Split from _search.py for maintainability.
"""
from __future__ import annotations

from typing import TYPE_CHECKING, Optional, Any, List
from datetime import datetime

from sqlalchemy import select, func, and_, or_

from pixsim7.backend.main.domain import (
    Asset,
    User,
    SyncStatus,
)
from pixsim7.backend.main.services.asset._search import AssetSearchMixin, AssetGroupResult

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession
    from pixsim7.backend.main.services.user.user_service import UserService


class AssetGroupsMixin(AssetSearchMixin):
    """Mixin providing asset grouping methods. Extends AssetSearchMixin."""

    def build_scoped_asset_ids_subquery(
        self,
        *,
        user: User,
        filters: Optional[dict[str, Any]] = None,
        sync_status: Optional[SyncStatus] = None,
        provider_status: Optional[str] = None,
        tag: Optional[str | list[str]] = None,
        q: Optional[str] = None,
        include_archived: bool = False,
        searchable: Optional[bool] = True,
        created_from: Optional[datetime] = None,
        created_to: Optional[datetime] = None,
        min_width: Optional[int] = None,
        max_width: Optional[int] = None,
        min_height: Optional[int] = None,
        max_height: Optional[int] = None,
        content_domain: Optional[Any] = None,
        content_category: Optional[str] = None,
        content_rating: Optional[str] = None,
        source_generation_id: Optional[int] = None,
        source_asset_id: Optional[int] = None,
        prompt_version_id: Optional[Any] = None,
        operation_type: Optional[Any] = None,
        has_parent: Optional[bool] = None,
        has_children: Optional[bool] = None,
        group_path: Optional[list[dict[str, Any]]] = None,
    ):
        """
        Public wrapper for the canonical user-scoped asset-id subquery.

        Use this when follow-up queries (metadata, aggregations, joins to other
        tables) must be guaranteed to operate on the exact same visible asset set.
        """
        return self._build_filtered_asset_id_subquery(
            user=user,
            filters=filters,
            sync_status=sync_status,
            provider_status=provider_status,
            tag=tag,
            q=q,
            include_archived=include_archived,
            searchable=searchable,
            created_from=created_from,
            created_to=created_to,
            min_width=min_width,
            max_width=max_width,
            min_height=min_height,
            max_height=max_height,
            content_domain=content_domain,
            content_category=content_category,
            content_rating=content_rating,
            source_generation_id=source_generation_id,
            source_asset_id=source_asset_id,
            prompt_version_id=prompt_version_id,
            operation_type=operation_type,
            has_parent=has_parent,
            has_children=has_children,
            group_path=group_path,
        )

    async def build_group_meta_payloads(
        self,
        *,
        user: User,
        group_by: str,
        group_keys: list[str],
        filters: Optional[dict[str, Any]] = None,
        sync_status: Optional[SyncStatus] = None,
        provider_status: Optional[str] = None,
        tag: Optional[str | list[str]] = None,
        q: Optional[str] = None,
        include_archived: bool = False,
        searchable: Optional[bool] = True,
        created_from: Optional[datetime] = None,
        created_to: Optional[datetime] = None,
        min_width: Optional[int] = None,
        max_width: Optional[int] = None,
        min_height: Optional[int] = None,
        max_height: Optional[int] = None,
        content_domain: Optional[Any] = None,
        content_category: Optional[str] = None,
        content_rating: Optional[str] = None,
        source_generation_id: Optional[int] = None,
        source_asset_id: Optional[int] = None,
        prompt_version_id: Optional[Any] = None,
        operation_type: Optional[Any] = None,
        has_parent: Optional[bool] = None,
        has_children: Optional[bool] = None,
        group_path: Optional[list[dict[str, Any]]] = None,
    ) -> dict[str, dict[str, Any]]:
        """
        Build metadata payloads for grouped results using the canonical scoped asset set.

        Every metadata query is anchored to the same user/filter visibility scope
        as list/group queries to avoid accidental cross-user lookups.
        """
        if not group_keys:
            return {}

        from pixsim7.backend.main.domain import Asset

        meta_map: dict[str, dict[str, Any]] = {}
        scoped_asset_ids = self.build_scoped_asset_ids_subquery(
            user=user,
            filters=filters,
            sync_status=sync_status,
            provider_status=provider_status,
            tag=tag,
            q=q,
            include_archived=include_archived,
            searchable=searchable,
            created_from=created_from,
            created_to=created_to,
            min_width=min_width,
            max_width=max_width,
            min_height=min_height,
            max_height=max_height,
            content_domain=content_domain,
            content_category=content_category,
            content_rating=content_rating,
            source_generation_id=source_generation_id,
            source_asset_id=source_asset_id,
            prompt_version_id=prompt_version_id,
            operation_type=operation_type,
            has_parent=has_parent,
            has_children=has_children,
            group_path=group_path,
        )

        if group_by == "source":
            from pixsim7.backend.main.shared.schemas.asset_schemas import AssetResponse

            source_ids: list[int] = []
            for key in group_keys:
                try:
                    source_ids.append(int(key))
                except (TypeError, ValueError):
                    continue

            if source_ids:
                result = await self.db.execute(
                    select(Asset)
                    .join(scoped_asset_ids, scoped_asset_ids.c.id == Asset.id)
                    .where(Asset.id.in_(source_ids))
                )
                for asset in result.scalars().all():
                    asset_response = AssetResponse.model_validate(asset)
                    media_type = (
                        asset_response.media_type.value
                        if hasattr(asset_response.media_type, "value")
                        else str(asset_response.media_type)
                    )
                    meta_map[str(asset.id)] = {
                        "kind": "source",
                        "asset_id": asset.id,
                        "media_type": media_type,
                        "created_at": asset.created_at,
                        "description": asset.description,
                        "thumbnail_url": asset_response.thumbnail_url,
                        "preview_url": asset_response.preview_url,
                        "remote_url": asset_response.remote_url,
                        "width": asset_response.width,
                        "height": asset_response.height,
                    }

        elif group_by == "generation":
            generation_ids: list[int] = []
            for key in group_keys:
                try:
                    generation_ids.append(int(key))
                except (TypeError, ValueError):
                    continue

            if generation_ids:
                from pixsim7.backend.main.domain.generation.models import Generation

                scoped_gen_ids = (
                    select(Asset.source_generation_id)
                    .join(scoped_asset_ids, scoped_asset_ids.c.id == Asset.id)
                    .where(Asset.source_generation_id.in_(generation_ids))
                    .distinct()
                    .subquery()
                )
                result = await self.db.execute(
                    select(Generation).where(
                        Generation.id.in_(select(scoped_gen_ids.c.source_generation_id))
                    )
                )
                for gen in result.scalars().all():
                    prompt_snippet = None
                    if gen.prompt:
                        text = gen.prompt.strip()
                        prompt_snippet = text[:80] + ("..." if len(text) > 80 else "")
                    meta_map[str(gen.id)] = {
                        "kind": "generation",
                        "generation_id": gen.id,
                        "provider_id": gen.provider_id,
                        "operation_type": (
                            gen.operation_type.value
                            if hasattr(gen.operation_type, "value")
                            else str(gen.operation_type)
                        ) if gen.operation_type else None,
                        "status": (
                            gen.status.value
                            if hasattr(gen.status, "value")
                            else str(gen.status)
                        ) if gen.status else None,
                        "created_at": gen.created_at,
                        "prompt_snippet": prompt_snippet,
                    }

        elif group_by == "prompt":
            from uuid import UUID

            version_ids: list[UUID] = []
            for key in group_keys:
                try:
                    version_ids.append(UUID(key))
                except (TypeError, ValueError):
                    continue

            if version_ids:
                from pixsim7.backend.main.domain.prompt.models import PromptVersion, PromptFamily

                scoped_prompt_ids = (
                    select(Asset.prompt_version_id)
                    .join(scoped_asset_ids, scoped_asset_ids.c.id == Asset.id)
                    .where(Asset.prompt_version_id.in_(version_ids))
                    .distinct()
                    .subquery()
                )
                result = await self.db.execute(
                    select(PromptVersion, PromptFamily)
                    .outerjoin(PromptFamily, PromptFamily.id == PromptVersion.family_id)
                    .where(
                        PromptVersion.id.in_(select(scoped_prompt_ids.c.prompt_version_id)),
                    )
                )
                for version, family in result.all():
                    meta_map[str(version.id)] = {
                        "kind": "prompt",
                        "prompt_version_id": version.id,
                        "prompt_text": version.prompt_text,
                        "commit_message": version.commit_message,
                        "author": version.author,
                        "version_number": version.version_number,
                        "family_id": version.family_id,
                        "family_title": family.title if family else None,
                        "family_slug": family.slug if family else None,
                        "created_at": version.created_at,
                        "tags": list(version.tags or []),
                    }

        elif group_by == "sibling":
            hash_keys = [k for k in group_keys if k]
            if hash_keys:
                ranked = (
                    select(
                        Asset.reproducible_hash.label("hash"),
                        Asset.id.label("asset_id"),
                        func.row_number()
                        .over(
                            partition_by=Asset.reproducible_hash,
                            order_by=[Asset.created_at.desc(), Asset.id.desc()],
                        )
                        .label("rn"),
                    )
                    .select_from(Asset)
                    .join(scoped_asset_ids, scoped_asset_ids.c.id == Asset.id)
                    .where(Asset.reproducible_hash.in_(hash_keys))
                    .subquery()
                )
                result = await self.db.execute(
                    select(Asset)
                    .join(ranked, Asset.id == ranked.c.asset_id)
                    .where(ranked.c.rn == 1)
                )
                for asset in result.scalars().all():
                    prompt_snippet = None
                    if asset.prompt:
                        text = asset.prompt.strip()
                        prompt_snippet = text[:80] + ("..." if len(text) > 80 else "")
                    meta_map[asset.reproducible_hash] = {
                        "kind": "sibling",
                        "hash": asset.reproducible_hash,
                        "generation_id": asset.source_generation_id,
                        "provider_id": asset.provider_id,
                        "operation_type": asset.operation_type or "text_to_image",
                        "status": "completed",
                        "created_at": asset.created_at,
                        "prompt_snippet": prompt_snippet,
                    }

        return meta_map

    async def list_asset_groups(
        self,
        *,
        user: User,
        group_by: str,
        filters: dict[str, Any] | None = None,
        group_filter: dict[str, Any] | None = None,
        group_path: Optional[list[dict[str, Any]]] = None,
        sync_status: Optional[SyncStatus] = None,
        provider_status: Optional[str] = None,
        tag: Optional[str | list[str]] = None,
        q: Optional[str] = None,
        include_archived: bool = False,
        searchable: Optional[bool] = True,
        created_from: Optional[datetime] = None,
        created_to: Optional[datetime] = None,
        min_width: Optional[int] = None,
        max_width: Optional[int] = None,
        min_height: Optional[int] = None,
        max_height: Optional[int] = None,
        content_domain: Optional[Any] = None,
        content_category: Optional[str] = None,
        content_rating: Optional[str] = None,
        source_generation_id: Optional[int] = None,
        source_asset_id: Optional[int] = None,
        prompt_version_id: Optional[Any] = None,
        operation_type: Optional[Any] = None,
        has_parent: Optional[bool] = None,
        has_children: Optional[bool] = None,
        limit: int = 50,
        offset: int = 0,
        preview_limit: int = 4,
    ) -> tuple[list[AssetGroupResult], int]:
        """
        Group assets for a user using the same filters as list_assets.

        Returns:
            (groups, total_groups)
        """
        from sqlalchemy import select, func, literal

        asset_ids = self._build_filtered_asset_id_subquery(
            user=user,
            filters=filters,
            sync_status=sync_status,
            provider_status=provider_status,
            tag=tag,
            q=q,
            include_archived=include_archived,
            searchable=searchable,
            created_from=created_from,
            created_to=created_to,
            min_width=min_width,
            max_width=max_width,
            min_height=min_height,
            max_height=max_height,
            content_domain=content_domain,
            content_category=content_category,
            content_rating=content_rating,
            source_generation_id=source_generation_id,
            source_asset_id=source_asset_id,
            prompt_version_id=prompt_version_id,
            operation_type=operation_type,
            has_parent=has_parent,
            has_children=has_children,
            group_path=group_path,
        )

        group_key_expr, join_generation, join_lineage, lineage_primary = self._resolve_group_key_expr(group_by)

        if group_key_expr is None:
            return ([], 0)

        group_filter_expr = self._build_group_filter_expr(group_filter)
        path_has_other = False
        if group_path:
            for entry in group_path:
                if isinstance(entry, dict):
                    raw_key = entry.get("group_key")
                else:
                    raw_key = getattr(entry, "group_key", None)
                if raw_key is None:
                    continue
                if str(raw_key).lower() == "other":
                    path_has_other = True
                    break
        effective_group_filter_expr = None
        if group_filter_expr is not None:
            effective_group_filter_expr = (
                ~group_filter_expr if path_has_other else group_filter_expr
            )

        base_query = (
            select(
                group_key_expr.label("group_key"),
                func.count(Asset.id).label("count"),
                func.max(Asset.created_at).label("latest_created_at"),
            )
            .select_from(Asset)
            .join(asset_ids, asset_ids.c.id == Asset.id)
        )
        if effective_group_filter_expr is not None:
            base_query = base_query.where(effective_group_filter_expr)

        if join_generation:
            from pixsim7.backend.main.domain.generation.models import Generation
            base_query = base_query.outerjoin(
                Generation, Generation.id == Asset.source_generation_id
            )
        if join_lineage and lineage_primary is not None:
            base_query = base_query.outerjoin(
                lineage_primary, lineage_primary.c.child_asset_id == Asset.id
            )

        base_query = base_query.group_by(group_key_expr)

        include_other = False
        other_count = 0
        other_latest = None
        if group_filter_expr is not None and not path_has_other:
            other_stats = await self.db.execute(
                select(
                    func.count(Asset.id).label("count"),
                    func.max(Asset.created_at).label("latest_created_at"),
                )
                .select_from(Asset)
                .join(asset_ids, asset_ids.c.id == Asset.id)
                .where(~group_filter_expr)
            )
            other_row = other_stats.one()
            other_count = other_row.count or 0
            other_latest = other_row.latest_created_at
            include_other = other_count > 0 and other_latest is not None

        group_query = base_query
        if include_other:
            other_query = select(
                literal("other").label("group_key"),
                literal(other_count).label("count"),
                literal(other_latest).label("latest_created_at"),
            )
            group_query = base_query.union_all(other_query)

        group_subquery = group_query.subquery()
        total_result = await self.db.execute(
            select(func.count()).select_from(group_subquery)
        )
        total_groups = total_result.scalar_one() or 0

        group_rows = await self.db.execute(
            select(group_subquery)
            .order_by(group_subquery.c.latest_created_at.desc())
            .limit(limit)
            .offset(offset)
        )
        groups_raw = group_rows.all()
        group_keys = [
            str(row.group_key)
            for row in groups_raw
            if str(row.group_key) != "other"
        ]

        preview_map: dict[str, list[Asset]] = {}
        if preview_limit > 0 and group_keys:
            ranked_query = (
                select(
                    Asset.id.label("asset_id"),
                    group_key_expr.label("group_key"),
                    func.row_number()
                    .over(
                        partition_by=group_key_expr,
                        order_by=[Asset.created_at.desc(), Asset.id.desc()],
                    )
                    .label("rn"),
                )
                .select_from(Asset)
                .join(asset_ids, asset_ids.c.id == Asset.id)
                .where(group_key_expr.in_(group_keys))
            )
            if effective_group_filter_expr is not None:
                ranked_query = ranked_query.where(effective_group_filter_expr)
            if join_generation:
                from pixsim7.backend.main.domain.generation.models import Generation
                ranked_query = ranked_query.outerjoin(
                    Generation, Generation.id == Asset.source_generation_id
                )
            if join_lineage and lineage_primary is not None:
                ranked_query = ranked_query.outerjoin(
                    lineage_primary, lineage_primary.c.child_asset_id == Asset.id
                )

            ranked_subquery = ranked_query.subquery()
            preview_query = (
                select(Asset, ranked_subquery.c.group_key)
                .join(ranked_subquery, ranked_subquery.c.asset_id == Asset.id)
                .where(ranked_subquery.c.rn <= preview_limit)
                .order_by(ranked_subquery.c.group_key.asc(), Asset.created_at.desc(), Asset.id.desc())
            )
            preview_rows = await self.db.execute(preview_query)
            for asset, group_key in preview_rows.all():
                preview_map.setdefault(str(group_key), []).append(asset)

        if preview_limit > 0 and include_other and any(str(row.group_key) == "other" for row in groups_raw):
            other_preview_query = (
                select(Asset)
                .join(asset_ids, asset_ids.c.id == Asset.id)
                .where(~group_filter_expr)
                .order_by(Asset.created_at.desc(), Asset.id.desc())
                .limit(preview_limit)
            )
            other_preview_rows = await self.db.execute(other_preview_query)
            preview_map["other"] = list(other_preview_rows.scalars().all())

        groups: list[AssetGroupResult] = []
        for row in groups_raw:
            key = str(row.group_key)
            groups.append(
                AssetGroupResult(
                    key=key,
                    count=row.count,
                    latest_created_at=row.latest_created_at,
                    preview_assets=preview_map.get(key, []),
                )
            )

        return groups, total_groups
