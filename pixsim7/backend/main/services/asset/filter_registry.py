"""
Asset filter registry for dynamic filter metadata.

Provides a central place to define filters and option sources, so
clients can render filters without hard-coded values.
"""
from __future__ import annotations

from dataclasses import dataclass, replace
from typing import Any, Awaitable, Callable, Iterable, Optional

from sqlalchemy import select, func, distinct, true, cast, case, literal, or_, and_, exists, tuple_, text, String, Integer, Float
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.dialects.postgresql import JSONB  # still used by provider_uploads cast

from pixsim7.common.naming import humanize_label

from pixsim7.backend.main.lib.registry import SimpleRegistry
from pixsim7.backend.main.domain.assets.models import Asset
from pixsim7.backend.main.domain.assets.upload_attribution import UPLOAD_METHOD_LABELS
from pixsim7.backend.main.shared.actor import resolve_effective_user_id
from pixsim7.backend.main.shared.upload_context_schema import get_upload_context_filter_specs
from pixsim_logging import get_logger

logger = get_logger()

ANALYSIS_TAG_OPTION_DEFAULT_LIMIT = 150
NULLISH_OPTION_TOKENS = {"null", "(null)", "undefined", "(undefined)"}

EFFECTIVE_PROVIDER_BY_UPLOAD_METHOD: dict[str, str] = {
    "pixverse_sync": "pixverse",
}


def _effective_provider_upload_methods(provider_id: str) -> list[str]:
    target = str(provider_id or "").strip()
    if not target:
        return []
    return [
        upload_method
        for upload_method, mapped_provider in EFFECTIVE_PROVIDER_BY_UPLOAD_METHOD.items()
        if mapped_provider == target
    ]


def _build_effective_provider_expr() -> Any:
    normalized_provider = func.lower(func.nullif(func.btrim(Asset.provider_id), ""))
    mapped_provider = case(
        *[
            (Asset.upload_method == upload_method, literal(provider_id))
            for upload_method, provider_id in EFFECTIVE_PROVIDER_BY_UPLOAD_METHOD.items()
        ],
        else_=None,
    )
    # Prefer explicit provider_id (normalized), fall back to provider inferred from upload route.
    return func.coalesce(normalized_provider, mapped_provider)


def _provider_uploads_jsonb() -> Any:
    return cast(Asset.provider_uploads, JSONB)


def _effective_provider_condition(value: Any) -> Any | None:
    normalized_provider = func.lower(func.nullif(func.btrim(Asset.provider_id), ""))
    provider_uploads = _provider_uploads_jsonb()

    if value is None:
        return None

    if isinstance(value, (list, tuple, set)):
        selected = [
            str(v).strip().lower()
            for v in value
            if v is not None and str(v).strip()
        ]
        if not selected:
            return None
        upload_methods = [
            upload_method
            for provider_id in selected
            for upload_method in _effective_provider_upload_methods(provider_id)
        ]
        clauses: list[Any] = [normalized_provider.in_(selected)]
        if upload_methods:
            clauses.append(Asset.upload_method.in_(list(set(upload_methods))))
        provider_upload_clauses = [provider_uploads.op("?")(provider_id) for provider_id in selected]
        if provider_upload_clauses:
            clauses.append(or_(*provider_upload_clauses))
        return or_(*clauses)

    provider_id = str(value).strip().lower()
    if not provider_id:
        return None
    upload_methods = _effective_provider_upload_methods(provider_id)
    clauses: list[Any] = [normalized_provider == provider_id]
    if upload_methods:
        clauses.append(Asset.upload_method.in_(upload_methods))
    clauses.append(provider_uploads.op("?")(provider_id))
    return or_(*clauses)


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
    condition_builder: Callable[[Any], Any] | None = None
    multi: bool = False
    match_modes: set[str] | None = None
    # Loose-index-scan recipe for the default (no-context) option load:
    # (key_sql, value_sql, where_sql). key_sql must be a btree-indexed expression
    # so the recursive skip scan does ~O(distinct) seeks instead of a full scan.
    loose_scan: tuple[str, str, str] | None = None


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
        import asyncio

        options: dict[str, list[tuple[str, Optional[str], Optional[int]]]] = {}
        # Separate static (sync) from async option loads
        async_tasks: list[tuple[str, asyncio.Task]] = []

        for spec in self.list_filters(include=include, context=context):
            if spec.option_source is None:
                continue
            if spec.option_source == "static":
                raw_options = [
                    (value, label, None)
                    for value, label in (spec.label_map or {}).items()
                ]
                options[spec.key] = _sanitize_option_rows(raw_options)
                continue
            if spec.option_source == "custom" and spec.option_loader:
                coro = spec.option_loader(db, user, include_counts, context, limit)
            elif spec.option_source == "distinct":
                column = _resolve_filter_column(spec)
                if column is None:
                    continue
                coro = _load_distinct_options(
                    db,
                    user=user,
                    column=column,
                    label_map=spec.label_map,
                    include_counts=include_counts,
                    extra_filters=self.build_filter_conditions(context or {}, exclude_key=spec.key),
                    exclude_empty=spec.jsonb_path is not None,
                    limit=limit,
                    loose_scan=spec.loose_scan,
                )
            else:
                continue
            async_tasks.append((spec.key, coro))

        if async_tasks:
            keys = [key for key, _ in async_tasks]
            coros = [coro for _, coro in async_tasks]
            results = await asyncio.gather(*coros, return_exceptions=True)
            for key, result in zip(keys, results):
                if isinstance(result, BaseException):
                    logger.warning("asset_filter_options_failed", key=key, error=str(result))
                    options[key] = []
                else:
                    options[key] = _sanitize_option_rows(result)

        return options

    def build_filter_conditions(
        self,
        context: dict[str, Any],
        *,
        exclude_key: str | None = None,
    ) -> list[Any]:
        conditions: list[Any] = []
        injected_dep_keys: set[str] = set()
        for key, value in context.items():
            if exclude_key and key == exclude_key:
                continue
            spec = self.get_spec(key)
            if not spec:
                continue
            if spec.condition_builder is not None:
                cond = spec.condition_builder(value)
                if cond is not None:
                    conditions.append(cond)
                continue
            column = _resolve_filter_column(spec)
            if column is None:
                continue
            if isinstance(value, (list, tuple, set)):
                normalized_values: list[Any] = []
                for entry in value:
                    if entry is None:
                        continue
                    if isinstance(entry, str):
                        normalized_entry = _normalize_option_value(entry)
                        if normalized_entry is None:
                            continue
                        normalized_values.append(normalized_entry)
                    else:
                        normalized_values.append(entry)
                if not normalized_values:
                    continue
                conditions.append(column.in_(normalized_values))
            else:
                normalized_value = value
                if isinstance(value, str):
                    normalized_value = _normalize_option_value(value)
                if normalized_value is None:
                    continue
                conditions.append(column == normalized_value)

            # Inject depends_on conditions when the user filters on a key whose
            # spec declares a hard prerequisite (e.g. source_folder_id requires
            # upload_method='local'). Without this, partial indexes whose
            # predicate references the prerequisite cannot fire — see
            # idx_asset_gallery_source_folder_id (495ms → 7ms with upload_method
            # pinned).
            if not spec.depends_on:
                continue
            for dep_key, allowed in spec.depends_on.items():
                if dep_key in context or dep_key in injected_dep_keys:
                    continue
                if exclude_key and dep_key == exclude_key:
                    continue
                dep_spec = self.get_spec(dep_key)
                if dep_spec is None:
                    continue
                dep_column = _resolve_filter_column(dep_spec)
                if dep_column is None:
                    continue
                allowed_values = [v for v in allowed if v is not None and v != ""]
                if not allowed_values:
                    continue
                if len(allowed_values) == 1:
                    conditions.append(dep_column == allowed_values[0])
                else:
                    conditions.append(dep_column.in_(allowed_values))
                injected_dep_keys.add(dep_key)
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
        if value == "":
            return None
        if value.lower() in NULLISH_OPTION_TOKENS:
            return None
    return str(value) if value is not None else None


def _sanitize_option_rows(
    rows: Iterable[tuple[Any, Any, Any]],
) -> list[tuple[str, Optional[str], Optional[int]]]:
    sanitized: list[tuple[str, Optional[str], Optional[int]]] = []
    seen_values: set[str] = set()
    for raw_value, raw_label, raw_count in rows:
        value = _normalize_option_value(raw_value)
        if value is None or value in seen_values:
            continue
        seen_values.add(value)
        if isinstance(raw_label, str):
            label = _normalize_option_value(raw_label)
        elif raw_label is None:
            label = None
        else:
            label = str(raw_label)
        count = int(raw_count) if raw_count is not None else None
        sanitized.append((value, label, count))
    return sanitized


async def _loose_distinct(
    db: AsyncSession,
    *,
    key_sql: str,
    where_sql: str,
    value_sql: str | None = None,
) -> list[str]:
    """Loose index scan (recursive skip scan) over a low-cardinality key.

    Returns the distinct ``value_sql`` outputs (defaulting to ``key_sql``) among
    ``assets`` rows matching ``where_sql``, navigating by ``key_sql`` — ~O(distinct)
    index seeks instead of a full DISTINCT/GROUP scan. ``key_sql`` MUST be backed
    by a btree index (else each seek degrades to a seq scan and this is slower
    than a plain scan). Navigation uses ``key_sql`` so the index drives it while
    ``value_sql`` can reshape the output (e.g. lowercase an enum) without losing
    the index. All fragments are trusted, code-defined SQL — never interpolate
    user input here.
    """
    value_sql = value_sql or key_sql
    stmt = text(
        f"""
        WITH RECURSIVE loose AS (
            (SELECT ({key_sql}) AS k, ({value_sql}) AS v
               FROM assets WHERE {where_sql} ORDER BY 1 LIMIT 1)
            UNION ALL
            SELECT nxt.k, nxt.v
              FROM loose
              CROSS JOIN LATERAL (
                  SELECT ({key_sql}) AS k, ({value_sql}) AS v
                    FROM assets
                   WHERE {where_sql} AND ({key_sql}) > loose.k
                   ORDER BY 1 LIMIT 1
              ) nxt
        )
        SELECT v FROM loose
        """
    )
    result = await db.execute(stmt)
    return [row[0] for row in result.all()]


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
    loose_scan: tuple[str, str, str] | None = None,
) -> list[tuple[str, Optional[str], Optional[int]]]:
    owner_user_id = resolve_effective_user_id(user) or 0
    filters = [
        Asset.user_id == owner_user_id,
        Asset.is_archived == False,
        column.isnot(None),
    ]
    if extra_filters:
        filters.extend(extra_filters)
    if exclude_empty:
        filters.append(column != "")

    # Default load (no active context, no counts): enumerate distinct values with
    # a loose index scan instead of a full DISTINCT scan over every asset row.
    # The owner/archived predicate is dropped here (single-user library — it
    # removes nothing) so the scan rides the column's own btree index; it stays
    # in force on the counts / active-context paths below. See the tag loaders
    # for the same default-load trade-off.
    if loose_scan is not None and not include_counts and not extra_filters:
        key_sql, value_sql, where_sql = loose_scan
        out: list[tuple[str, Optional[str], Optional[int]]] = []
        for raw in await _loose_distinct(db, key_sql=key_sql, value_sql=value_sql, where_sql=where_sql):
            value = _normalize_option_value(raw)
            if value is None:
                continue
            label = (label_map or {}).get(value, value.title())
            out.append((value, label, None))
        if limit:
            out = out[:limit]
        return out

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

    owner_user_id = resolve_effective_user_id(user) or 0
    # Exclude namespaces covered by content_elements / style_tags filters
    excluded_ns = CONTENT_ELEMENT_NAMESPACES | STYLE_TAG_NAMESPACES | AUTO_METADATA_NAMESPACES
    filters = [
        Asset.user_id == owner_user_id,
        Asset.is_archived == False,
        Tag.namespace.notin_(excluded_ns),
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

    # Distinct slugs via correlated EXISTS — avoids DISTINCT-ing a full
    # Asset×AssetTag×Tag join just to surface the tag set (see the namespace
    # loader for the same optimization and why the join shape is pathological).
    # Default load (no context) tests bare existence in asset_tag (index-only,
    # ~ms); a narrowed gallery (context) keeps the owner/archived-scoped join.
    if context:
        asset_filters = [Asset.user_id == owner_user_id, Asset.is_archived == False]
        asset_filters.extend(asset_filter_registry.build_filter_conditions(context, exclude_key="tag"))
        tag_has_asset = exists(
            select(AssetTag.asset_id)
            .select_from(AssetTag)
            .join(Asset, Asset.id == AssetTag.asset_id)
            .where(AssetTag.tag_id == Tag.id, *asset_filters)
        )
    else:
        tag_has_asset = exists(
            select(AssetTag.asset_id).where(AssetTag.tag_id == Tag.id)
        )
    stmt = (
        select(Tag.slug, Tag.display_name)
        .where(Tag.namespace.notin_(excluded_ns), tag_has_asset)
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


def _label_from_slug(slug: str, display_name: str | None) -> str:
    """Derive a display label: use display_name if set, otherwise strip namespace and title-case."""
    if display_name:
        return display_name
    # "has:character" → "Character", "operation:image-to-image" → "Image To Image"
    _, _, name = slug.partition(":")
    return humanize_label(name or slug)


def _make_namespace_tag_loader(
    namespaces: set[str],
    *,
    exclude: bool = False,
    filter_key: str = "analysis_tags",
    min_count: int = 0,
):
    """Factory for namespace-filtered tag option loaders.

    Args:
        namespaces: Tag namespaces to include (or exclude if ``exclude=True``).
        exclude: If True, load tags whose namespace is NOT in ``namespaces``.
        filter_key: The filter registry key (used for exclude_key on context).
        min_count: Minimum asset count for a tag to appear (filters noise).
    """

    async def _loader(
        db: AsyncSession,
        user: Any,
        include_counts: bool,
        context: dict[str, Any] | None,
        limit: Optional[int],
    ) -> list[tuple[str, Optional[str], Optional[int]]]:
        from pixsim7.backend.main.domain.assets.tag import Tag, AssetTag

        owner_user_id = resolve_effective_user_id(user) or 0
        option_limit = limit or ANALYSIS_TAG_OPTION_DEFAULT_LIMIT
        option_limit = max(1, min(option_limit, 500))

        ns_filter = Tag.namespace.notin_(namespaces) if exclude else Tag.namespace.in_(namespaces)
        # Asset-scoped conditions (owner, archive, live context) live separately
        # from the Tag-scoped namespace filter so the no-counts path can push them
        # into a correlated EXISTS instead of a DISTINCT-over-join. See below.
        asset_filters = [
            Asset.user_id == owner_user_id,
            Asset.is_archived == False,
        ]
        if context:
            asset_filters.extend(asset_filter_registry.build_filter_conditions(context, exclude_key=filter_key))
        filters = [*asset_filters, ns_filter]

        if include_counts:
            count_expr = func.count(distinct(Asset.id))
            stmt = (
                select(Tag.slug, Tag.display_name, count_expr.label("count"))
                .select_from(Asset)
                .join(AssetTag, AssetTag.asset_id == Asset.id)
                .join(Tag, Tag.id == AssetTag.tag_id)
                .where(*filters)
                .group_by(Tag.slug, Tag.display_name)
                .order_by(count_expr.desc())
                .limit(option_limit)
            )
            if min_count > 0:
                stmt = stmt.having(count_expr >= min_count)
            result = await db.execute(stmt)
            return [
                (row.slug, _label_from_slug(row.slug, row.display_name), row.count)
                for row in result.all()
                if row.slug
            ]

        if min_count > 0:
            # Use a count subquery to enforce minimum threshold
            count_expr = func.count(distinct(Asset.id))
            stmt = (
                select(Tag.slug, Tag.display_name)
                .select_from(Asset)
                .join(AssetTag, AssetTag.asset_id == Asset.id)
                .join(Tag, Tag.id == AssetTag.tag_id)
                .where(*filters)
                .group_by(Tag.slug, Tag.display_name)
                .having(count_expr >= min_count)
                .order_by(Tag.slug.asc())
                .limit(option_limit)
            )
        else:
            # Enumerate distinct slugs via a correlated EXISTS rather than
            # DISTINCT-ing a full Asset×AssetTag×Tag join. The join shape scanned
            # every asset_tag row in the namespace (e.g. ~341k for `has:`) just to
            # surface ~7 slugs — 22s on the gallery's default load.
            #
            # On the default load (no active context) we drop the owner/archived
            # join entirely and test bare existence in asset_tag — an index-only
            # scan that short-circuits per tag (~12ms even for the 9-namespace
            # style_tags set). The join is only inherently cheap for small
            # namespaces; for ones whose tags span many rows the planner flips to
            # a 1.1M×141k hash join (~4s), yet in a single-user library the
            # owner/archived predicate removes nothing. When the user HAS narrowed
            # the gallery (context present) we keep the scoped join so options
            # reflect the active filter set.
            # NOTE: scoping the default path per-user cheaply (multi-user) would
            # need a tag-usage index/denormalization carrying user_id on asset_tag.
            if context:
                tag_has_asset = exists(
                    select(AssetTag.asset_id)
                    .select_from(AssetTag)
                    .join(Asset, Asset.id == AssetTag.asset_id)
                    .where(AssetTag.tag_id == Tag.id, *asset_filters)
                )
            else:
                tag_has_asset = exists(
                    select(AssetTag.asset_id).where(AssetTag.tag_id == Tag.id)
                )
            stmt = (
                select(Tag.slug, Tag.display_name)
                .where(ns_filter, tag_has_asset)
                .order_by(Tag.slug.asc())
                .limit(option_limit)
            )
        result = await db.execute(stmt)
        return [
            (row[0], _label_from_slug(row[0], row[1]), None)
            for row in result.all()
            if row[0]
        ]

    return _loader


# Namespaces produced by prompt analysis (role presence tags)
CONTENT_ELEMENT_NAMESPACES = {"has"}

# Namespaces produced by ontology/style analysis
STYLE_TAG_NAMESPACES = {"mood", "tone", "camera", "spatial", "pose", "rating", "location", "part", "sequence"}

# Auto-assigned metadata namespaces (have their own dedicated filters)
AUTO_METADATA_NAMESPACES = {"provider", "operation", "source"}


async def _load_provider_options(
    db: AsyncSession,
    user: Any,
    include_counts: bool,
    context: dict[str, Any] | None,
    limit: Optional[int],
) -> list[tuple[str, Optional[str], Optional[int]]]:
    owner_user_id = resolve_effective_user_id(user) or 0
    filters = [
        Asset.user_id == owner_user_id,
        Asset.is_archived == False,
    ]
    if context:
        context_no_provider = dict(context)
        context_no_provider.pop("provider_id", None)
        context_no_provider.pop("effective_provider_id", None)
        filters.extend(asset_filter_registry.build_filter_conditions(context_no_provider))

    option_limit = max(1, min(limit or 120, 500))
    option_counts: dict[str, int | None] = {}
    provider_expr = _build_effective_provider_expr()

    if include_counts:
        provider_stmt = (
            select(provider_expr.label("provider"), func.count(distinct(Asset.id)).label("count"))
            .where(*filters, provider_expr.isnot(None))
            .group_by(provider_expr)
        )
    else:
        provider_stmt = (
            select(distinct(provider_expr).label("provider"))
            .where(*filters, provider_expr.isnot(None))
        )
    provider_result = await db.execute(provider_stmt)
    provider_rows = provider_result.all() if include_counts else [(value,) for value in provider_result.scalars().all()]
    for row in provider_rows:
        provider = _normalize_option_value(row[0])
        if not provider:
            continue
        count = int(row[1]) if include_counts and len(row) > 1 and row[1] is not None else None
        option_counts[provider] = count if include_counts else None

    upload_key_values = (
        func.jsonb_object_keys(_provider_uploads_jsonb())
        .table_valued("provider")
        .alias("provider_upload_key")
    )
    upload_key_expr = func.lower(func.nullif(func.btrim(upload_key_values.c.provider), ""))
    if include_counts:
        upload_key_stmt = (
            select(upload_key_expr.label("provider"), func.count(distinct(Asset.id)).label("count"))
            .select_from(Asset)
            .join(upload_key_values, true())
            .where(*filters, Asset.provider_uploads.isnot(None), upload_key_expr.isnot(None))
            .group_by(upload_key_expr)
        )
    else:
        upload_key_stmt = (
            select(distinct(upload_key_expr).label("provider"))
            .select_from(Asset)
            .join(upload_key_values, true())
            .where(*filters, Asset.provider_uploads.isnot(None), upload_key_expr.isnot(None))
        )
    upload_key_result = await db.execute(upload_key_stmt)
    upload_key_rows = (
        upload_key_result.all()
        if include_counts
        else [(value,) for value in upload_key_result.scalars().all()]
    )
    for row in upload_key_rows:
        provider = _normalize_option_value(row[0])
        if not provider:
            continue
        count = int(row[1]) if include_counts and len(row) > 1 and row[1] is not None else None
        if include_counts:
            option_counts[provider] = max(option_counts.get(provider) or 0, count or 0)
        else:
            option_counts.setdefault(provider, None)

    mapped_methods = list(EFFECTIVE_PROVIDER_BY_UPLOAD_METHOD.keys())
    if mapped_methods:
        mapped_stmt = (
            select(Asset.upload_method, func.count(distinct(Asset.id)).label("count"))
            .where(*filters, Asset.upload_method.in_(mapped_methods))
            .group_by(Asset.upload_method)
        )
        mapped_result = await db.execute(mapped_stmt)
        for row in mapped_result.all():
            provider = EFFECTIVE_PROVIDER_BY_UPLOAD_METHOD.get(str(row.upload_method), "")
            provider = _normalize_option_value(provider)
            if not provider:
                continue
            count = int(row.count) if include_counts and row.count is not None else None
            if include_counts:
                option_counts[provider] = max(option_counts.get(provider) or 0, count or 0)
            else:
                option_counts.setdefault(provider, None)

    if include_counts:
        items = sorted(option_counts.items(), key=lambda item: (-(item[1] or 0), item[0]))
    else:
        items = sorted(option_counts.items(), key=lambda item: item[0])

    return [
        (provider, provider.title(), count if include_counts else None)
        for provider, count in items[:option_limit]
    ]

def _build_source_path_expr() -> Any:
    """Computed expression: folder/subfolder (or just folder if no subfolder)."""
    folder = Asset.upload_context["source_folder"].astext
    subfolder = Asset.upload_context["source_subfolder"].astext
    return case(
        (
            (subfolder.isnot(None)) & (subfolder != ""),
            folder + literal("/") + subfolder,
        ),
        else_=folder,
    )


async def _load_source_path_options(
    db: AsyncSession,
    user: Any,
    include_counts: bool,
    context: dict[str, Any] | None,
    limit: Optional[int],
) -> list[tuple[str, Optional[str], Optional[int]]]:
    path_expr = _build_source_path_expr()
    owner_user_id = resolve_effective_user_id(user) or 0
    filters = [
        Asset.user_id == owner_user_id,
        Asset.is_archived == False,
        Asset.upload_method == "local",
        Asset.upload_context["source_folder"].astext.isnot(None),
        Asset.upload_context["source_folder"].astext != "",
    ]
    if context:
        filters.extend(asset_filter_registry.build_filter_conditions(context, exclude_key="source_path"))

    if include_counts:
        stmt = (
            select(path_expr.label("path"), func.count(Asset.id).label("count"))
            .where(*filters)
            .group_by(path_expr)
            .order_by(func.count(Asset.id).desc())
        )
        if limit:
            stmt = stmt.limit(limit)
        result = await db.execute(stmt)
        return [
            (row.path, row.path, row.count)
            for row in result.all()
            if row.path
        ]

    stmt = (
        select(distinct(path_expr).label("path"))
        .where(*filters)
        .order_by(path_expr.asc())
    )
    if limit:
        stmt = stmt.limit(limit)
    result = await db.execute(stmt)
    return [
        (row.path, row.path, None)
        for row in result.all()
        if row.path
    ]


def _build_source_video_expr() -> Any:
    """Computed expression: folder/filename (or just filename if no folder)."""
    folder = Asset.upload_context["source_folder"].astext
    filename = Asset.upload_context["source_filename"].astext
    return case(
        (
            (folder.isnot(None)) & (folder != ""),
            folder + literal("/") + filename,
        ),
        else_=filename,
    )


async def _load_source_video_options(
    db: AsyncSession,
    user: Any,
    include_counts: bool,
    context: dict[str, Any] | None,
    limit: Optional[int],
) -> list[tuple[str, Optional[str], Optional[int]]]:
    video_expr = _build_source_video_expr()
    owner_user_id = resolve_effective_user_id(user) or 0
    filters = [
        Asset.user_id == owner_user_id,
        Asset.is_archived == False,
        Asset.upload_method == "video_capture",
        Asset.upload_context["source_filename"].astext.isnot(None),
        Asset.upload_context["source_filename"].astext != "",
    ]
    if context:
        filters.extend(asset_filter_registry.build_filter_conditions(context, exclude_key="source_filename"))

    if include_counts:
        stmt = (
            select(video_expr.label("video"), func.count(Asset.id).label("count"))
            .where(*filters)
            .group_by(video_expr)
            .order_by(func.count(Asset.id).desc())
        )
        if limit:
            stmt = stmt.limit(limit)
        result = await db.execute(stmt)
        return [
            (row.video, row.video, row.count)
            for row in result.all()
            if row.video
        ]

    stmt = (
        select(distinct(video_expr).label("video"))
        .where(*filters)
        .order_by(video_expr.asc())
    )
    if limit:
        stmt = stmt.limit(limit)
    result = await db.execute(stmt)
    return [
        (row.video, row.video, None)
        for row in result.all()
        if row.video
    ]


async def _load_provider_model_options(
    db: AsyncSession,
    user: Any,
    include_counts: bool,
    context: dict[str, Any] | None,
    limit: Optional[int],
) -> list[tuple[str, Optional[str], Optional[int]]]:
    """Options for the model filter as ``<provider>:<model>`` (e.g. ``pixverse:v6``).

    Values carry the provider so the frontend can namespace-group them and so two
    providers exposing the same model name (e.g. a shared ``gemini`` image model)
    stay distinct. The label is the bare model id (the provider is the group header).
    """
    provider_expr = _build_effective_provider_expr()
    owner_user_id = resolve_effective_user_id(user) or 0
    filters = [
        Asset.user_id == owner_user_id,
        Asset.is_archived == False,
        Asset.model.isnot(None),
        Asset.model != "",
        provider_expr.isnot(None),
    ]
    if context:
        filters.extend(asset_filter_registry.build_filter_conditions(context, exclude_key="model"))

    value_expr = provider_expr + literal(":") + Asset.model

    if include_counts:
        stmt = (
            select(
                value_expr.label("value"),
                Asset.model.label("model"),
                func.count(Asset.id).label("count"),
            )
            .where(*filters)
            .group_by(value_expr, Asset.model)
            .order_by(func.count(Asset.id).desc())
        )
        if limit:
            stmt = stmt.limit(limit)
        result = await db.execute(stmt)
        return [
            (row.value, row.model, row.count)
            for row in result.all()
            if row.value
        ]

    # Default load (no context): loose index scan over the indexed
    # `<provider>:<model>` value (idx_asset_provider_model_value) — ~12 seeks vs
    # a 140k-row GROUP BY. Only rows with a real provider_id are indexed; no row
    # in the data lacks one, so the upload_method→provider fallback (kept in the
    # counts / context paths via value_expr) never matters here.
    if not context:
        out: list[tuple[str, Optional[str], Optional[int]]] = []
        for raw in await _loose_distinct(
            db,
            key_sql="lower(btrim(provider_id)) || ':' || model",
            where_sql="provider_id IS NOT NULL AND btrim(provider_id) <> '' "
            "AND model IS NOT NULL AND model <> ''",
        ):
            value = _normalize_option_value(raw)
            if value is None:
                continue
            model = value.split(":", 1)[1] if ":" in value else value
            out.append((value, model, None))
        if limit:
            out = out[:limit]
        return out

    stmt = (
        select(value_expr.label("value"), Asset.model.label("model"))
        .where(*filters)
        .group_by(value_expr, Asset.model)
        .order_by(value_expr.asc())
    )
    if limit:
        stmt = stmt.limit(limit)
    result = await db.execute(stmt)
    return [
        (row.value, row.model, None)
        for row in result.all()
        if row.value
    ]


def _build_model_condition(value: Any) -> Any | None:
    """Translate selected ``<provider>:<model>`` tokens into a query condition.

    Each token becomes ``effective_provider == provider AND model == model``;
    multiple selections are OR'd. A bare ``model`` token (no provider prefix)
    matches on model alone for resilience to hand-built filters.
    """
    entries = value if isinstance(value, (list, tuple, set)) else [value]
    provider_expr = _build_effective_provider_expr()
    clauses: list[Any] = []
    for entry in entries:
        if entry is None:
            continue
        token = str(entry).strip()
        if not token:
            continue
        if ":" in token:
            raw_provider, _, raw_model = token.partition(":")
            provider = raw_provider.strip().lower()
            model = raw_model.strip()
            if not model:
                continue
            if provider:
                clauses.append(and_(provider_expr == provider, Asset.model == model))
            else:
                clauses.append(Asset.model == model)
        else:
            clauses.append(Asset.model == token)
    if not clauses:
        return None
    return or_(*clauses)


def _build_prompt_success_rate_condition(value: Any) -> Any | None:
    """Keep only assets whose prompt cleared a success-rate threshold.

    "Success rate" is computed over the asset's source-generation prompt
    (grouped by the indexed ``prompt_text_hash``) using the SAME definition as
    the prompt-box moderation chip (``/generations/prompt-stats``):
    ``passed`` = COMPLETED, ``filtered`` = ``FILTERED_OUTCOME_ERROR_CODES``,
    ``rate = passed / (passed + filtered)`` — all OTHER outcomes (quota, timeout,
    param errors) are excluded from the denominator. ``value`` is a minimum
    percentage (0-100); 0/blank is a no-op. Assets without a source generation
    (uploads) have no rate and drop out once the filter is on.

    The rate is scoped per-owner: it groups generations by
    ``(prompt_text_hash, user_id)`` and matches an asset on its source
    generation's own pair, so one user's attempts never dilute another's even
    when two users run the identical prompt text. (The prompt-box chip still
    aggregates by hash alone — harmless while single-user, but it'll want the
    same ``user_id`` scoping when multi-user lands.)
    """
    try:
        threshold_pct = float(value)
    except (TypeError, ValueError):
        return None
    if threshold_pct <= 0:
        return None
    threshold = max(0.0, min(1.0, threshold_pct / 100.0))

    from pixsim7.backend.main.domain.generation.models import Generation
    from pixsim7.backend.main.domain.enums import (
        GenerationStatus,
        FILTERED_OUTCOME_ERROR_CODES,
    )

    filtered_values = [code.value for code in FILTERED_OUTCOME_ERROR_CODES]
    passed = func.count().filter(Generation.status == GenerationStatus.COMPLETED)
    filtered = func.count().filter(Generation.error_code.in_(filtered_values))
    denom = passed + filtered

    # (prompt_text_hash, user_id) pairs whose pass-rate clears the threshold.
    # The rate lives in the generations table (which spans all users) and is
    # computed independently of the outer asset-visibility filter, so ownership
    # has to enter HERE — grouping by user_id keeps each owner's rate separate.
    # An asset's source generation carries its own owner's user_id, so matching
    # on the pair self-scopes the rate to that asset's owner (no current-user
    # param needed). nullif guards divide-by-zero for groups with no
    # passed/filtered attempts (→ NULL → excluded, since NULL >= threshold is
    # not true).
    qualifying = (
        select(Generation.prompt_text_hash, Generation.user_id)
        .where(Generation.prompt_text_hash.isnot(None))
        .group_by(Generation.prompt_text_hash, Generation.user_id)
        .having(cast(passed, Float) / func.nullif(denom, 0) >= threshold)
    )
    source_generation_ids = (
        select(Generation.id)
        .where(tuple_(Generation.prompt_text_hash, Generation.user_id).in_(qualifying))
    )
    return Asset.source_generation_id.in_(source_generation_ids)


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
            # Navigate by the enum (idx_asset_media_type); output lowercased to
            # match the ORM enum value form ('VIDEO' → 'video').
            loose_scan=(
                "media_type",
                "lower(media_type::text)",
                "media_type IS NOT NULL",
            ),
        )
    )
    _provider_tag_loader = _make_namespace_tag_loader({"provider"}, filter_key="provider_id")
    asset_filter_registry.register(
        FilterSpec(
            key="provider_id",
            type="enum",
            label="Provider",
            option_source="custom",
            option_loader=_provider_tag_loader,
            multi=True,
        )
    )
    # Alias: frontend SmartFilterEditor uses effective_provider_id extensively
    asset_filter_registry.register(
        FilterSpec(
            key="effective_provider_id",
            type="enum",
            label="Provider",
            option_source="custom",
            option_loader=_provider_tag_loader,
            multi=True,
        )
    )
    asset_filter_registry.register(
        FilterSpec(
            key="operation_type",
            type="enum",
            label="Operation",
            option_source="custom",
            option_loader=_make_namespace_tag_loader({"operation"}, filter_key="operation_type"),
            multi=True,
        )
    )
    asset_filter_registry.register(
        FilterSpec(
            key="model",
            type="enum",
            label="Model",
            description="Generation model, grouped by provider (e.g. pixverse:v6)",
            option_source="custom",
            option_loader=_load_provider_model_options,
            condition_builder=_build_model_condition,
            multi=True,
        )
    )
    asset_filter_registry.register(
        FilterSpec(
            key="prompt_success_rate",
            type="range",
            label="Prompt success",
            description="Keep assets whose prompt lands ≥ N% of attempts (completed vs fast-filtered / content-filtered). Same rate as the prompt-box chip.",
            condition_builder=_build_prompt_success_rate_condition,
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
            loose_scan=(  # idx_asset_upload_method
                "upload_method",
                "upload_method",
                "upload_method IS NOT NULL",
            ),
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
        FilterSpec(
            key="source_path",
            type="enum",
            label="Folder",
            description="Unified folder path (folder/subfolder)",
            option_source="custom",
            column=_build_source_path_expr(),
            option_loader=_load_source_path_options,
            depends_on={"upload_method": {"local"}},
            multi=True,
        )
    )
    asset_filter_registry.register(
        FilterSpec(
            key="source_filename",
            type="enum",
            label="Source Video",
            description="Source video grouped by folder",
            option_source="custom",
            column=_build_source_video_expr(),
            option_loader=_load_source_video_options,
            depends_on={"upload_method": {"video_capture"}},
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
            key="content_elements",
            type="enum",
            label="Content",
            description="Content elements detected in prompts (character, setting, action, ...)",
            option_source="custom",
            option_loader=_make_namespace_tag_loader(CONTENT_ELEMENT_NAMESPACES, filter_key="content_elements"),
            multi=True,
            match_modes={"any", "all"},
        )
    )
    asset_filter_registry.register(
        FilterSpec(
            key="style_tags",
            type="enum",
            label="Style",
            description="Mood, camera, pose, and other style tags from prompt analysis",
            option_source="custom",
            option_loader=_make_namespace_tag_loader(STYLE_TAG_NAMESPACES, filter_key="style_tags"),
            multi=True,
            match_modes={"any", "all"},
        )
    )
    # -- Missing metadata filters --
    from pixsim7.backend.main.domain.assets.tag import AssetTag as _AssetTag
    from pixsim7.backend.main.domain.assets.embedding import AssetEmbedding as _AssetEmbedding

    asset_filter_registry.register(
        FilterSpec(
            key="missing_prompt",
            type="boolean",
            label="Missing Prompt",
            condition_builder=lambda v: or_(
                Asset.prompt.is_(None), Asset.prompt == ""
            ) if v else None,
        )
    )
    asset_filter_registry.register(
        FilterSpec(
            key="missing_analysis",
            type="boolean",
            label="Missing Analysis",
            condition_builder=lambda v: Asset.prompt_analysis.is_(None) if v else None,
        )
    )
    asset_filter_registry.register(
        FilterSpec(
            key="missing_embedding",
            type="boolean",
            label="Missing Embedding",
            condition_builder=lambda v: ~exists(
                select(_AssetEmbedding.asset_id).where(_AssetEmbedding.asset_id == Asset.id)
            ) if v else None,
        )
    )
    asset_filter_registry.register(
        FilterSpec(
            key="missing_tags",
            type="boolean",
            label="Missing Tags",
            condition_builder=lambda v: ~exists(
                select(_AssetTag.asset_id).where(_AssetTag.asset_id == Asset.id)
            ) if v else None,
        )
    )
    asset_filter_registry.register(
        FilterSpec(key="q", type="search", label="Search")
    )
    asset_filter_registry.register(
        FilterSpec(
            key="provider_status",
            type="enum",
            label="Provider Status",
            option_source="static",
            label_map={
                "ok": "OK",
                "local_only": "Local Only",
                "flagged": "Flagged",
                "unknown": "Unknown",
            },
        )
    )

    # -- Signal-based quality filters (populated by the ingest scanner and the
    # `scan-suspicious-videos` diagnostic at /dev/testing/diagnostics) --
    # media_metadata is JSON (not JSONB) — cast then use the -> / ->> operators.
    # SQLAlchemy subscript on cast() emits raw [] which Postgres rejects, so use op().
    _signal_metrics = cast(Asset.media_metadata, JSONB).op("->")("signal_metrics")
    _signal_score = _signal_metrics.op("->>")("score").cast(Integer)
    _signal_override = _signal_metrics.op("->>")("user_override")  # 'clean' | 'broken' | NULL
    # Only surface scores from the CURRENT heuristic. The signal_score JSON/column
    # persists across re-scans, so without this gate a bumped SCANNER_VERSION leaves
    # stale prior-version flags (e.g. v2) polluting the triage queues and disagreeing
    # with the version-scoped /signal-scan-stats dashboard. See plan
    # signal-scan-recalibration.
    from pixsim7.backend.main.services.asset.signal_analysis import SCANNER_VERSION
    _signal_current = Asset.signal_scanner_version == SCANNER_VERSION

    asset_filter_registry.register(
        FilterSpec(
            key="signal_likely_broken",
            type="boolean",
            label="Likely broken",
            description="Heuristic flag: low audio + low visual divergence (current-version score ≥ 3). Excludes user-marked Keep.",
            # current-version score >= 3 AND override IS NOT 'clean' (NULL is fine)
            condition_builder=lambda v: (
                _signal_current & (_signal_score >= 3) & (func.coalesce(_signal_override, "") != "clean")
            ) if v else None,
        )
    )
    asset_filter_registry.register(
        FilterSpec(
            key="signal_likely_clean",
            type="boolean",
            label="Likely clean",
            description="Current-version signal score == 0. Excludes user-marked broken.",
            condition_builder=lambda v: (
                _signal_current & (_signal_score == 0) & (func.coalesce(_signal_override, "") != "broken")
            ) if v else None,
        )
    )
    asset_filter_registry.register(
        FilterSpec(
            key="signal_borderline",
            type="boolean",
            label="Borderline",
            description="Current-version signal score 1–2 (one weak/corroborating axis only) and not yet user-decided. The undecided middle to triage.",
            # current-version 1 <= score <= 2 AND no user_override yet
            condition_builder=lambda v: (
                _signal_current & (_signal_score >= 1) & (_signal_score <= 2) & _signal_override.is_(None)
            ) if v else None,
        )
    )
    asset_filter_registry.register(
        FilterSpec(
            key="signal_overridden",
            type="boolean",
            label="Signal: overridden",
            description="Assets where you manually marked Keep or Flag (audit your own decisions)",
            condition_builder=lambda v: _signal_override.isnot(None) if v else None,
        )
    )


register_default_asset_filters()
