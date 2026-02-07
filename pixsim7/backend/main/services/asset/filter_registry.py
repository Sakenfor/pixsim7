"""
Asset filter registry for dynamic filter metadata.

Provides a central place to define filters and option sources, so
clients can render filters without hard-coded values.
"""
from __future__ import annotations

from dataclasses import dataclass, replace
from typing import Any, Awaitable, Callable, Iterable, Optional

from sqlalchemy import select, func, distinct, true, cast
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.dialects.postgresql import JSONB

from pixsim7.backend.main.lib.registry import SimpleRegistry
from pixsim7.backend.main.domain.assets.models import Asset
from pixsim7.backend.main.domain.assets.upload_attribution import UPLOAD_METHOD_LABELS
from pixsim7.backend.main.shared.upload_context_schema import get_upload_context_filter_specs
from pixsim_logging import get_logger

logger = get_logger()


# ===== MAIN FILTER SPECS =====

@dataclass(frozen=True)
class FilterSpec:
    key: str
    type: str
    label: Optional[str] = None
    description: Optional[str] = None
    option_source: Optional[str] = None  # "distinct", "static", "custom"
    column: Any | None = None
    jsonb_path: tuple[str, ...] | None = None
    label_map: dict[str, str] | None = None
    depends_on: dict[str, set[str]] | None = None
    option_loader: Callable[
        [AsyncSession, Any, bool, dict[str, Any] | None, Optional[int]],
        Awaitable[list[tuple[str, Optional[str], Optional[int]]]],
    ] | None = None
    multi: bool = False
    match_modes: set[str] | None = None


class AssetFilterRegistry(SimpleRegistry[str, FilterSpec]):
    def __init__(self) -> None:
        super().__init__(name="asset_filters", allow_overwrite=True, log_operations=False)

    def _get_item_key(self, spec: FilterSpec) -> str:
        return spec.key

    def register(self, spec: FilterSpec) -> None:
        super().register(spec.key, spec)

    def list_filters(
        self,
        *,
        include: Iterable[str] | None = None,
        context: dict[str, Any] | None = None,
    ) -> list[FilterSpec]:
        if not include:
            specs = self.values()
        else:
            include_set = {key for key in include if key}
            specs = [spec for spec in self.values() if spec.key in include_set]
        if context is None:
            return specs
        return [spec for spec in specs if _matches_depends_on(spec, context)]

    def get_spec(self, key: str) -> FilterSpec | None:
        return self.get_or_none(key)

    async def build_options(
        self,
        db: AsyncSession,
        *,
        user: Any,
        include_counts: bool,
        include: Iterable[str] | None = None,
        context: dict[str, Any] | None = None,
        limit: Optional[int] = None,
    ) -> dict[str, list[tuple[str, Optional[str], Optional[int]]]]:
        options: dict[str, list[tuple[str, Optional[str], Optional[int]]]] = {}
        for spec in self.list_filters(include=include, context=context):
            if spec.option_source is None:
                continue
            try:
                if spec.option_source == "static":
                    options[spec.key] = [
                        (value, label, None)
                        for value, label in (spec.label_map or {}).items()
                    ]
                    continue
                if spec.option_source == "custom" and spec.option_loader:
                    options[spec.key] = await spec.option_loader(db, user, include_counts, context, limit)
                    continue
                if spec.option_source == "distinct":
                    column = _resolve_filter_column(spec)
                    if column is None:
                        continue
                    options[spec.key] = await _load_distinct_options(
                        db,
                        user=user,
                        column=column,
                        label_map=spec.label_map,
                        include_counts=include_counts,
                        extra_filters=self.build_filter_conditions(context or {}, exclude_key=spec.key),
                        exclude_empty=spec.jsonb_path is not None,
                        limit=limit,
                    )
            except Exception as exc:
                logger.warning(
                    "asset_filter_options_failed",
                    key=spec.key,
                    error=str(exc),
                )
                options.setdefault(spec.key, [])
        return options

    def build_filter_conditions(
        self,
        context: dict[str, Any],
        *,
        exclude_key: str | None = None,
    ) -> list[Any]:
        conditions: list[Any] = []
        for key, value in context.items():
            if exclude_key and key == exclude_key:
                continue
            spec = self.get_spec(key)
            if not spec:
                continue
            column = _resolve_filter_column(spec)
            if column is None:
                continue
            if isinstance(value, (list, tuple, set)):
                values = [entry for entry in value if entry is not None]
                if not values:
                    continue
                conditions.append(column.in_(values))
            else:
                conditions.append(column == value)
        return conditions


def _build_jsonb_expr(root: Any, path: tuple[str, ...]) -> Any:
    jsonb_col = root
    for key in path:
        jsonb_col = jsonb_col[key]
    return jsonb_col.astext


def _resolve_filter_column(spec: FilterSpec) -> Any | None:
    if spec.column is not None:
        return spec.column
    if spec.jsonb_path:
        return _build_jsonb_expr(Asset.upload_context, spec.jsonb_path)
    return None


def _matches_depends_on(spec: FilterSpec, context: dict[str, Any]) -> bool:
    if not spec.depends_on:
        return True
    for key, allowed in spec.depends_on.items():
        value = context.get(key)
        if value is None:
            return False
        if isinstance(value, (list, tuple, set)):
            if not any(str(entry) in allowed for entry in value):
                return False
            continue
        if str(value) not in allowed:
            return False
    return True


def _normalize_option_value(value: Any) -> Optional[str]:
    if value is None:
        return None
    if hasattr(value, "value"):
        value = value.value
    if isinstance(value, str):
        value = value.strip()
    return str(value) if value is not None else None


async def _load_distinct_options(
    db: AsyncSession,
    *,
    user: Any,
    column: Any,
    label_map: dict[str, str] | None,
    include_counts: bool,
    extra_filters: Iterable[Any] | None = None,
    exclude_empty: bool = False,
    limit: Optional[int] = None,
) -> list[tuple[str, Optional[str], Optional[int]]]:
    filters = [
        Asset.user_id == user.id,
        Asset.is_archived == False,
        column.isnot(None),
    ]
    if extra_filters:
        filters.extend(extra_filters)
    if exclude_empty:
        filters.append(column != "")
    if include_counts:
        stmt = (
            select(column, func.count(Asset.id).label("count"))
            .where(*filters)
            .group_by(column)
        )
        if limit:
            stmt = stmt.order_by(func.count(Asset.id).desc()).limit(limit)
        result = await db.execute(stmt)
        rows = result.all()
        out: list[tuple[str, Optional[str], Optional[int]]] = []
        for row in rows:
            value = _normalize_option_value(row[0])
            if value is None:
                continue
            label = (label_map or {}).get(value, value.title())
            out.append((value, label, row.count))
        return out

    stmt = (
        select(distinct(column))
        .where(*filters)
    )
    if limit:
        stmt = stmt.limit(limit)
    result = await db.execute(stmt)
    out: list[tuple[str, Optional[str], Optional[int]]] = []
    for value in result.scalars().all():
        normalized = _normalize_option_value(value)
        if normalized is None:
            continue
        label = (label_map or {}).get(normalized, normalized.title())
        out.append((normalized, label, None))
    return out


async def _load_tag_options(
    db: AsyncSession,
    user: Any,
    include_counts: bool,
    context: dict[str, Any] | None,
    limit: Optional[int],
) -> list[tuple[str, Optional[str], Optional[int]]]:
    from pixsim7.backend.main.domain.assets.tag import Tag, AssetTag

    filters = [
        Asset.user_id == user.id,
        Asset.is_archived == False,
    ]
    if context:
        filters.extend(asset_filter_registry.build_filter_conditions(context, exclude_key="tag"))

    if include_counts:
        stmt = (
            select(Tag.slug, Tag.display_name, func.count(distinct(Asset.id)).label("count"))
            .select_from(Asset)
            .join(AssetTag, AssetTag.asset_id == Asset.id)
            .join(Tag, Tag.id == AssetTag.tag_id)
            .where(*filters)
            .group_by(Tag.slug, Tag.display_name)
            .order_by(func.count(distinct(Asset.id)).desc())
        )
        if limit:
            stmt = stmt.limit(limit)
        result = await db.execute(stmt)
        rows = result.all()
        return [
            (row.slug, row.display_name or row.slug, row.count)
            for row in rows
            if row.slug
        ]

    stmt = (
        select(distinct(Tag.slug), Tag.display_name)
        .select_from(Asset)
        .join(AssetTag, AssetTag.asset_id == Asset.id)
        .join(Tag, Tag.id == AssetTag.tag_id)
        .where(*filters)
        .order_by(Tag.slug.asc())
    )
    if limit:
        stmt = stmt.limit(limit)
    result = await db.execute(stmt)
    rows = result.all()
    return [
        (row[0], row[1] or row[0], None)
        for row in rows
        if row[0]
    ]


async def _load_analysis_tag_options(
    db: AsyncSession,
    user: Any,
    include_counts: bool,
    context: dict[str, Any] | None,
    limit: Optional[int],
) -> list[tuple[str, Optional[str], Optional[int]]]:
    prompt_jsonb = cast(Asset.prompt_analysis, JSONB)
    tag_values = func.jsonb_array_elements_text(prompt_jsonb["tags_flat"]).table_valued("value").lateral()

    filters = [
        Asset.user_id == user.id,
        Asset.is_archived == False,
        Asset.prompt_analysis.isnot(None),
        prompt_jsonb.has_key("tags_flat"),
    ]
    if context:
        filters.extend(asset_filter_registry.build_filter_conditions(context, exclude_key="analysis_tags"))

    if include_counts:
        stmt = (
            select(tag_values.c.value, func.count(distinct(Asset.id)).label("count"))
            .select_from(Asset)
            .join(tag_values, true())
            .where(*filters)
            .group_by(tag_values.c.value)
            .order_by(func.count(distinct(Asset.id)).desc())
        )
        if limit:
            stmt = stmt.limit(limit)
        result = await db.execute(stmt)
        rows = result.all()
        return [
            (row.value, row.value, row.count)
            for row in rows
            if row.value
        ]

    stmt = (
        select(distinct(tag_values.c.value))
        .select_from(Asset)
        .join(tag_values, true())
        .where(*filters)
        .order_by(tag_values.c.value.asc())
    )
    if limit:
        stmt = stmt.limit(limit)
    result = await db.execute(stmt)
    rows = result.all()
    return [
        (row[0], row[0], None)
        for row in rows
        if row[0]
    ]

asset_filter_registry = AssetFilterRegistry()


def register_default_asset_filters() -> None:
    asset_filter_registry.register(
        FilterSpec(
            key="media_type",
            type="enum",
            label="Media Type",
            option_source="distinct",
            column=Asset.media_type,
            multi=True,
        )
    )
    asset_filter_registry.register(
        FilterSpec(
            key="provider_id",
            type="enum",
            label="Provider",
            option_source="distinct",
            column=Asset.provider_id,
            multi=True,
        )
    )
    asset_filter_registry.register(
        FilterSpec(
            key="upload_method",
            type="enum",
            label="Source",
            option_source="distinct",
            column=Asset.upload_method,
            label_map=UPLOAD_METHOD_LABELS,
            multi=True,
        )
    )
    for spec in get_upload_context_filter_specs():
        existing = asset_filter_registry.get_spec(spec["key"])
        if existing:
            merged_depends_on = dict(existing.depends_on or {})
            allowed = set(merged_depends_on.get("upload_method", set()))
            allowed.add(spec["upload_method"])
            merged_depends_on["upload_method"] = allowed
            asset_filter_registry.register(
                replace(
                    existing,
                    label=spec.get("label") or existing.label,
                    description=spec.get("description") or existing.description,
                    depends_on=merged_depends_on,
                )
            )
            continue
        asset_filter_registry.register(
            FilterSpec(
                key=spec["key"],
                type="enum",
                label=spec.get("label"),
                description=spec.get("description"),
                option_source="distinct",
                jsonb_path=(spec["key"],),
                depends_on={"upload_method": {spec["upload_method"]}},
                multi=True,
            )
        )
    asset_filter_registry.register(
        FilterSpec(key="include_archived", type="boolean", label="Show Archived")
    )
    asset_filter_registry.register(
        FilterSpec(
            key="tag",
            type="enum",
            label="Tags",
            option_source="custom",
            option_loader=_load_tag_options,
            multi=True,
            match_modes={"any", "all"},
        )
    )
    asset_filter_registry.register(
        FilterSpec(
            key="analysis_tags",
            type="enum",
            label="Prompt Tags",
            description="Tags derived from prompt analysis",
            option_source="custom",
            option_loader=_load_analysis_tag_options,
            multi=True,
            match_modes={"any", "all"},
        )
    )
    asset_filter_registry.register(
        FilterSpec(key="q", type="search", label="Search")
    )


register_default_asset_filters()
