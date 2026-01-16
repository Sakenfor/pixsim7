"""
Asset filter registry for dynamic filter metadata.

Provides a central place to define filters and option sources, so
clients can render filters without hard-coded values.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Awaitable, Callable, Iterable, Optional

from sqlalchemy import select, func, distinct
from sqlalchemy.ext.asyncio import AsyncSession

from pixsim7.backend.main.lib.registry import SimpleRegistry
from pixsim7.backend.main.domain.assets.models import Asset
from pixsim7.backend.main.domain.assets.upload_attribution import UPLOAD_METHOD_LABELS
from pixsim7.backend.main.shared.upload_context_schema import get_upload_context_filter_specs


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
        [AsyncSession, Any, bool, dict[str, Any] | None],
        Awaitable[list[tuple[str, Optional[str], Optional[int]]]],
    ] | None = None


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
            if spec.option_source == "static":
                options[spec.key] = [
                    (value, label, None)
                    for value, label in (spec.label_map or {}).items()
                ]
                continue
            if spec.option_source == "custom" and spec.option_loader:
                options[spec.key] = await spec.option_loader(db, user, include_counts, context)
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
            if not _matches_depends_on(spec, context):
                continue
            column = _resolve_filter_column(spec)
            if column is None:
                continue
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


asset_filter_registry = AssetFilterRegistry()


def register_default_asset_filters() -> None:
    asset_filter_registry.register(
        FilterSpec(key="media_type", type="enum", label="Media Type", option_source="distinct", column=Asset.media_type)
    )
    asset_filter_registry.register(
        FilterSpec(key="provider_id", type="enum", label="Provider", option_source="distinct", column=Asset.provider_id)
    )
    asset_filter_registry.register(
        FilterSpec(
            key="upload_method",
            type="enum",
            label="Source",
            option_source="distinct",
            column=Asset.upload_method,
            label_map=UPLOAD_METHOD_LABELS,
        )
    )
    for spec in get_upload_context_filter_specs():
        asset_filter_registry.register(
            FilterSpec(
                key=spec["key"],
                type="enum",
                label=spec.get("label"),
                description=spec.get("description"),
                option_source="distinct",
                jsonb_path=(spec["key"],),
                depends_on={"upload_method": {spec["upload_method"]}},
            )
        )
    asset_filter_registry.register(
        FilterSpec(key="include_archived", type="boolean", label="Show Archived")
    )
    asset_filter_registry.register(
        FilterSpec(key="tag", type="autocomplete", label="Tag")
    )
    asset_filter_registry.register(
        FilterSpec(key="q", type="search", label="Search")
    )


register_default_asset_filters()
