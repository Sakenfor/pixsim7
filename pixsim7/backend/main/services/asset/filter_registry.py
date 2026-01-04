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

from pixsim7.backend.main.domain.assets.models import Asset
from pixsim7.backend.main.domain.assets.upload_attribution import UPLOAD_METHOD_LABELS


@dataclass(frozen=True)
class FilterSpec:
    key: str
    type: str
    label: Optional[str] = None
    option_source: Optional[str] = None  # "distinct", "static", "custom"
    column: Any | None = None
    label_map: dict[str, str] | None = None
    option_loader: Callable[
        [AsyncSession, Any, bool],
        Awaitable[list[tuple[str, Optional[str], Optional[int]]]],
    ] | None = None


class AssetFilterRegistry:
    def __init__(self) -> None:
        self._filters: dict[str, FilterSpec] = {}

    def register(self, spec: FilterSpec) -> None:
        self._filters[spec.key] = spec

    def list_filters(self, include: Iterable[str] | None = None) -> list[FilterSpec]:
        if not include:
            return list(self._filters.values())
        include_set = {key for key in include if key}
        return [spec for key, spec in self._filters.items() if key in include_set]

    async def build_options(
        self,
        db: AsyncSession,
        *,
        user: Any,
        include_counts: bool,
        include: Iterable[str] | None = None,
    ) -> dict[str, list[tuple[str, Optional[str], Optional[int]]]]:
        options: dict[str, list[tuple[str, Optional[str], Optional[int]]]] = {}
        for spec in self.list_filters(include=include):
            if spec.option_source is None:
                continue
            if spec.option_source == "static":
                options[spec.key] = [
                    (value, label, None)
                    for value, label in (spec.label_map or {}).items()
                ]
                continue
            if spec.option_source == "custom" and spec.option_loader:
                options[spec.key] = await spec.option_loader(db, user, include_counts)
                continue
            if spec.option_source == "distinct" and spec.column is not None:
                options[spec.key] = await _load_distinct_options(
                    db,
                    user=user,
                    column=spec.column,
                    label_map=spec.label_map,
                    include_counts=include_counts,
                )
        return options


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
) -> list[tuple[str, Optional[str], Optional[int]]]:
    if include_counts:
        stmt = (
            select(column, func.count(Asset.id).label("count"))
            .where(
                Asset.user_id == user.id,
                Asset.is_archived == False,
                column.isnot(None),
            )
            .group_by(column)
        )
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
        .where(
            Asset.user_id == user.id,
            Asset.is_archived == False,
            column.isnot(None),
        )
    )
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
