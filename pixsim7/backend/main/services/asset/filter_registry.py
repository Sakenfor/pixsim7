"""
Asset filter registry for dynamic filter metadata.

Provides a central place to define filters and option sources, so
clients can render filters without hard-coded values.
"""
from __future__ import annotations

from dataclasses import dataclass, replace
from typing import Any, Awaitable, Callable, Iterable, Optional

from sqlalchemy import select, func, distinct, cast, case, literal, or_, exists, true, String
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.dialects.postgresql import JSONB

from pixsim7.backend.main.lib.registry import SimpleRegistry
from pixsim7.backend.main.domain.assets.models import Asset
from pixsim7.backend.main.domain.assets.upload_attribution import UPLOAD_METHOD_LABELS
from pixsim7.backend.main.shared.actor import resolve_effective_user_id
from pixsim7.backend.main.shared.upload_context_schema import get_upload_context_filter_specs
from pixsim_logging import get_logger

logger = get_logger()

ANALYSIS_TAG_OPTION_DEFAULT_LIMIT = 120

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
                options[spec.key] = [
                    (value, label, None)
                    for value, label in (spec.label_map or {}).items()
                ]
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
                    options[key] = result

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
            if spec.condition_builder is not None:
                cond = spec.condition_builder(value)
                if cond is not None:
                    conditions.append(cond)
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
        if value == "":
            return None
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
    filters = [
        Asset.user_id == owner_user_id,
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
    from pixsim7.backend.main.domain.assets.tag import Tag
    from pixsim7.backend.main.domain.prompt.tag_assertions import PromptVersionTagAssertion

    owner_user_id = resolve_effective_user_id(user) or 0
    filters = [
        Asset.user_id == owner_user_id,
        Asset.is_archived == False,
        Asset.searchable == True,
        Asset.asset_kind == "content",
        Asset.prompt_version_id.isnot(None),
    ]
    if context:
        filters.extend(asset_filter_registry.build_filter_conditions(context, exclude_key="analysis_tags"))

    option_limit = limit or ANALYSIS_TAG_OPTION_DEFAULT_LIMIT
    option_limit = max(1, min(option_limit, 500))
    asset_scope = (
        select(
            Asset.id.label("asset_id"),
            Asset.prompt_version_id.label("prompt_version_id"),
        )
        .where(*filters)
        .subquery()
    )

    try:
        if include_counts:
            stmt = (
                select(Tag.slug, Tag.display_name, func.count(distinct(asset_scope.c.asset_id)).label("count"))
                .select_from(asset_scope)
                .join(
                    PromptVersionTagAssertion,
                    PromptVersionTagAssertion.prompt_version_id == asset_scope.c.prompt_version_id,
                )
                .join(Tag, Tag.id == PromptVersionTagAssertion.tag_id)
                .group_by(Tag.slug, Tag.display_name)
                .order_by(func.count(distinct(asset_scope.c.asset_id)).desc())
            )
            stmt = stmt.limit(option_limit)
            result = await db.execute(stmt)
            rows = result.all()
            assertion_options = [
                (row.slug, row.display_name or row.slug, row.count)
                for row in rows
                if row.slug
            ]
            if assertion_options:
                return assertion_options
        else:
            stmt = (
                select(distinct(Tag.slug), Tag.display_name)
                .select_from(asset_scope)
                .join(
                    PromptVersionTagAssertion,
                    PromptVersionTagAssertion.prompt_version_id == asset_scope.c.prompt_version_id,
                )
                .join(Tag, Tag.id == PromptVersionTagAssertion.tag_id)
                .order_by(Tag.slug.asc())
            )
            stmt = stmt.limit(option_limit)
            result = await db.execute(stmt)
            rows = result.all()
            assertion_options = [
                (row[0], row[1] or row[0], None)
                for row in rows
                if row[0]
            ]
            if assertion_options:
                return assertion_options
    except Exception as exc:
        logger.warning("analysis_tag_assertion_options_failed", error=str(exc))

    # Legacy fallback A: derive tags from assets.prompt_analysis.tags_flat.
    legacy_filters_base = [
        Asset.user_id == owner_user_id,
        Asset.is_archived == False,
        Asset.searchable == True,
        Asset.asset_kind == "content",
        Asset.prompt_analysis.isnot(None),
    ]
    if context:
        legacy_filters_base.extend(asset_filter_registry.build_filter_conditions(context, exclude_key="analysis_tags"))

    prompt_analysis_json = cast(Asset.prompt_analysis, JSONB)
    legacy_filters_flat = [
        *legacy_filters_base,
        prompt_analysis_json.op("?")("tags_flat"),
        func.jsonb_typeof(prompt_analysis_json["tags_flat"]) == "array",
    ]
    tag_values = (
        func.jsonb_array_elements_text(prompt_analysis_json["tags_flat"])
        .table_valued("value")
        .alias("analysis_tag")
    )
    slug_expr = func.lower(func.nullif(func.btrim(tag_values.c.value), ""))

    try:
        if include_counts:
            legacy_stmt = (
                select(slug_expr.label("slug"), func.count(distinct(Asset.id)).label("count"))
                .select_from(Asset)
                .join(tag_values, true())
                .where(*legacy_filters_flat, slug_expr.isnot(None))
                .group_by(slug_expr)
                .order_by(func.count(distinct(Asset.id)).desc())
                .limit(option_limit)
            )
            legacy_result = await db.execute(legacy_stmt)
            legacy_rows = legacy_result.all()
            legacy_options = [
                (row.slug, row.slug, row.count)
                for row in legacy_rows
                if row.slug
            ]
        else:
            legacy_stmt = (
                select(distinct(slug_expr).label("slug"))
                .select_from(Asset)
                .join(tag_values, true())
                .where(*legacy_filters_flat, slug_expr.isnot(None))
                .order_by(slug_expr.asc())
                .limit(option_limit)
            )
            legacy_result = await db.execute(legacy_stmt)
            legacy_options = [
                (slug, slug, None)
                for slug in legacy_result.scalars().all()
                if slug
            ]
        if legacy_options:
            return legacy_options
    except Exception as exc:
        logger.warning("analysis_tag_legacy_flat_options_failed", error=str(exc))

    # Legacy fallback B: derive tags from assets.prompt_analysis.tags[*].tag.
    legacy_filters_tags = [
        *legacy_filters_base,
        prompt_analysis_json.op("?")("tags"),
        func.jsonb_typeof(prompt_analysis_json["tags"]) == "array",
    ]
    tag_struct_values = (
        func.jsonb_array_elements(prompt_analysis_json["tags"])
        .table_valued("value")
        .alias("analysis_tag_struct")
    )
    tag_item_json = cast(tag_struct_values.c.value, JSONB)
    tag_item_text = case(
        (func.jsonb_typeof(tag_item_json) == "string", cast(tag_item_json, String)),
        else_=tag_item_json["tag"].astext,
    )
    tag_slug_expr = func.lower(
        func.nullif(func.btrim(func.btrim(tag_item_text), '"'), "")
    )

    try:
        if include_counts:
            legacy_tags_stmt = (
                select(tag_slug_expr.label("slug"), func.count(distinct(Asset.id)).label("count"))
                .select_from(Asset)
                .join(tag_struct_values, true())
                .where(*legacy_filters_tags, tag_slug_expr.isnot(None))
                .group_by(tag_slug_expr)
                .order_by(func.count(distinct(Asset.id)).desc())
                .limit(option_limit)
            )
            legacy_tags_result = await db.execute(legacy_tags_stmt)
            legacy_tags_rows = legacy_tags_result.all()
            return [
                (row.slug, row.slug, row.count)
                for row in legacy_tags_rows
                if row.slug
            ]
        legacy_tags_stmt = (
            select(distinct(tag_slug_expr).label("slug"))
            .select_from(Asset)
            .join(tag_struct_values, true())
            .where(*legacy_filters_tags, tag_slug_expr.isnot(None))
            .order_by(tag_slug_expr.asc())
            .limit(option_limit)
        )
        legacy_tags_result = await db.execute(legacy_tags_stmt)
        return [
            (slug, slug, None)
            for slug in legacy_tags_result.scalars().all()
            if slug
        ]
    except Exception as exc:
        logger.warning("analysis_tag_legacy_struct_options_failed", error=str(exc))
        return []


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

    key_values = (
        func.jsonb_object_keys(_provider_uploads_jsonb())
        .table_valued("provider")
        .alias("provider_upload_key")
    )
    upload_key_expr = func.lower(func.nullif(func.btrim(key_values.c.provider), ""))
    if include_counts:
        upload_key_stmt = (
            select(upload_key_expr.label("provider"), func.count(distinct(Asset.id)).label("count"))
            .select_from(Asset)
            .join(key_values, true())
            .where(*filters, Asset.provider_uploads.isnot(None), upload_key_expr.isnot(None))
            .group_by(upload_key_expr)
        )
    else:
        upload_key_stmt = (
            select(distinct(upload_key_expr).label("provider"))
            .select_from(Asset)
            .join(key_values, true())
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
            option_source="custom",
            option_loader=_load_provider_options,
            condition_builder=_effective_provider_condition,
            multi=True,
        )
    )
    asset_filter_registry.register(
        FilterSpec(
            key="effective_provider_id",
            type="enum",
            label="Upload Provider",
            option_source="custom",
            option_loader=_load_provider_options,
            multi=True,
            condition_builder=_effective_provider_condition,
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
    # -- Missing metadata filters --
    from pixsim7.backend.main.domain.assets.tag import AssetTag as _AssetTag

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
            condition_builder=lambda v: Asset.embedding.is_(None) if v else None,
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


register_default_asset_filters()
