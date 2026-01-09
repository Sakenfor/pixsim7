"""
Asset filter registry for dynamic filter metadata.

Provides a central place to define filters and option sources, so
clients can render filters without hard-coded values.

Also includes nested filter registry for upload-method-specific sub-filters.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Awaitable, Callable, Iterable, Optional

from sqlalchemy import select, func, distinct
from sqlalchemy.ext.asyncio import AsyncSession

from pixsim7.backend.main.domain.assets.models import Asset
from pixsim7.backend.main.domain.assets.upload_attribution import UPLOAD_METHOD_LABELS


# ===== NESTED FILTER SPECS (for upload-method-specific sub-filters) =====

@dataclass(frozen=True)
class NestedFilterSpec:
    """Specification for a nested filter within an upload method."""
    key: str  # e.g., "source_filename"
    label: str  # e.g., "Source Video"
    jsonb_path: tuple[str, ...]  # Path in upload_context, e.g., ("source_filename",)
    description: Optional[str] = None


class NestedFilterRegistry:
    """Registry for upload-method-specific nested filters."""

    def __init__(self) -> None:
        self._specs: dict[str, list[NestedFilterSpec]] = {}

    def register(self, upload_method: str, spec: NestedFilterSpec) -> None:
        """Register a nested filter for an upload method."""
        if upload_method not in self._specs:
            self._specs[upload_method] = []
        self._specs[upload_method].append(spec)

    def get_specs(self, upload_method: str) -> list[NestedFilterSpec]:
        """Get nested filter specs for an upload method."""
        return self._specs.get(upload_method, [])

    def has_nested_filters(self, upload_method: str) -> bool:
        """Check if an upload method has nested filters."""
        return upload_method in self._specs and len(self._specs[upload_method]) > 0

    def list_upload_methods_with_nested(self) -> list[str]:
        """List upload methods that have nested filters defined."""
        return [k for k, v in self._specs.items() if v]

    async def build_options(
        self,
        db: AsyncSession,
        *,
        user: Any,
        upload_method: str,
        include_counts: bool = False,
    ) -> dict[str, list[tuple[str, Optional[str], Optional[int]]]]:
        """
        Build nested filter options for a specific upload method.

        Returns dict of filter_key -> [(value, label, count), ...]
        """
        specs = self.get_specs(upload_method)
        if not specs:
            return {}

        options: dict[str, list[tuple[str, Optional[str], Optional[int]]]] = {}

        for spec in specs:
            values = await _load_jsonb_distinct_options(
                db,
                user=user,
                upload_method=upload_method,
                jsonb_path=spec.jsonb_path,
                include_counts=include_counts,
            )
            if values:
                options[spec.key] = values

        return options


async def _load_jsonb_distinct_options(
    db: AsyncSession,
    *,
    user: Any,
    upload_method: str,
    jsonb_path: tuple[str, ...],
    include_counts: bool,
) -> list[tuple[str, Optional[str], Optional[int]]]:
    """Load distinct values from a JSONB path in upload_context."""
    # Build the JSONB accessor for the path
    jsonb_col = Asset.upload_context
    for key in jsonb_path:
        jsonb_col = jsonb_col[key]
    jsonb_text = jsonb_col.astext

    if include_counts:
        stmt = (
            select(jsonb_text.label("value"), func.count(Asset.id).label("count"))
            .where(
                Asset.user_id == user.id,
                Asset.is_archived == False,
                Asset.upload_method == upload_method,
                jsonb_text.isnot(None),
                jsonb_text != "",
            )
            .group_by(jsonb_text)
            .order_by(func.count(Asset.id).desc())
        )
        result = await db.execute(stmt)
        return [(row.value, row.value, row.count) for row in result.all() if row.value]
    else:
        stmt = (
            select(distinct(jsonb_text).label("value"))
            .where(
                Asset.user_id == user.id,
                Asset.is_archived == False,
                Asset.upload_method == upload_method,
                jsonb_text.isnot(None),
                jsonb_text != "",
            )
            .order_by(jsonb_text)
        )
        result = await db.execute(stmt)
        return [(row.value, row.value, None) for row in result.all() if row.value]


nested_filter_registry = NestedFilterRegistry()


def register_default_nested_filters() -> None:
    """Register default nested filters for known upload methods."""
    # Video capture: group by source filename
    nested_filter_registry.register(
        "video_capture",
        NestedFilterSpec(
            key="source_filename",
            label="Source Video",
            jsonb_path=("source_filename",),
            description="Filter by the source video file name",
        )
    )

    # Web uploads: group by source site (domain)
    nested_filter_registry.register(
        "web",
        NestedFilterSpec(
            key="source_site",
            label="Domain",
            jsonb_path=("source_site",),
            description="Filter by the website domain",
        )
    )

    # Pixverse sync: group by pixverse media type (i2i, t2v, etc.)
    # This would require querying media_metadata instead of upload_context
    # Could add later if needed


# ===== MAIN FILTER SPECS =====

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
register_default_nested_filters()
