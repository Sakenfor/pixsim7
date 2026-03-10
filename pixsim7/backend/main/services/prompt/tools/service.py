"""Prompt tool catalog, preset CRUD, and execution dispatch service."""
from __future__ import annotations

from typing import Any, Mapping, Optional
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from pixsim7.backend.main.domain.enums import ReviewStatus
from pixsim7.backend.main.domain.prompt import PromptToolPreset
from pixsim7.backend.main.services.ownership.user_owned import (
    assert_can_write_user_owned,
    resolve_user_owned_list_scope,
)

from .builtins import execute_builtin_prompt_tool, get_builtin_prompt_tool, list_builtin_prompt_tools
from .preset_service import PromptToolPresetError, PromptToolPresetService
from .types import PromptToolCatalogScope, PromptToolPresetRecord


def _normalize_text(value: Any) -> str:
    if isinstance(value, str):
        return value.strip()
    return ""


def _as_mapping(value: Any) -> Mapping[str, Any]:
    if isinstance(value, Mapping):
        return value
    return {}


class _TemplateValues(dict[str, str]):
    """format_map helper that leaves unknown placeholders unchanged."""

    def __missing__(self, key: str) -> str:  # pragma: no cover - defensive fallback
        return f"{{{key}}}"


def _render_template(template: str, values: Mapping[str, Any]) -> str:
    normalized_values = _TemplateValues(
        {
            key: str(value)
            for key, value in values.items()
            if isinstance(key, str)
        }
    )
    try:
        return template.format_map(normalized_values).strip()
    except Exception:  # pragma: no cover - formatting errors
        return template.strip()


def _execute_user_prompt_tool(
    *,
    preset: PromptToolPresetRecord,
    prompt_text: str,
    params: Mapping[str, Any] | None,
    run_context: Mapping[str, Any] | None,
) -> Mapping[str, Any]:
    merged_config: dict[str, Any] = dict(preset.defaults or {})
    merged_config.update(dict(_as_mapping(params)))
    context = _as_mapping(run_context)

    mode = _normalize_text(merged_config.get("mode")).lower() or "append"
    text_template = _normalize_text(merged_config.get("text_template"))
    directive = _normalize_text(merged_config.get("directive")) or _normalize_text(preset.description) or _normalize_text(preset.label)

    generated_text = directive
    warnings: list[str] = []
    if text_template:
        generated_text = _render_template(
            text_template,
            {
                **merged_config,
                **context,
                "prompt_text": prompt_text,
            },
        )

    if mode == "replace":
        next_prompt_text = generated_text or prompt_text
    elif mode == "prepend":
        next_prompt_text = generated_text if not prompt_text else f"{generated_text}\n\n{prompt_text}"
    elif mode == "append":
        next_prompt_text = generated_text if not prompt_text else f"{prompt_text}\n\n{generated_text}"
    else:
        warnings.append(f"Unsupported mode '{mode}', defaulted to append")
        next_prompt_text = generated_text if not prompt_text else f"{prompt_text}\n\n{generated_text}"

    return {
        "prompt_text": next_prompt_text,
        "warnings": warnings,
        "provenance": {"model_id": "user-preset/simple-v1"},
    }


def _resolve_self_scope(current_user: Any):
    return resolve_user_owned_list_scope(
        current_user=current_user,
        requested_owner_user_id=None,
        requested_is_public=None,
        mine=True,
        include_public_when_mine=False,
        mine_requires_auth_detail="Authentication required for scope=self",
        mine_forbidden_cross_owner_detail="Not allowed to query another user's presets with scope=self",
        private_owner_forbidden_detail="Not allowed to query private presets of another user",
    )


def _resolve_shared_scope(current_user: Any):
    return resolve_user_owned_list_scope(
        current_user=current_user,
        requested_owner_user_id=None,
        requested_is_public=True,
        mine=False,
        include_public_when_mine=False,
        mine_requires_auth_detail="Authentication required for scope=shared",
        mine_forbidden_cross_owner_detail="Not allowed to query another user's shared presets",
        private_owner_forbidden_detail="Not allowed to query private presets of another user",
    )


def _map_row_to_record(
    row: PromptToolPreset,
    *,
    current_user: Any,
    force_source: Optional[str] = None,
) -> PromptToolPresetRecord:
    owner_payload = row.owner_payload if isinstance(row.owner_payload, dict) else {}
    current_user_id = getattr(current_user, "id", None)
    source = force_source or ("shared" if row.is_public and row.owner_user_id != current_user_id else "user")
    return PromptToolPresetRecord(
        id=row.preset_id,
        label=row.label,
        description=row.description or "",
        source=source,  # type: ignore[arg-type]
        category=row.category,  # type: ignore[arg-type]
        enabled=bool(row.enabled),
        requires=tuple(value for value in (row.requires or []) if isinstance(value, str)),
        defaults=dict(row.defaults or {}),
        owner_user_id=row.owner_user_id,
        owner_payload=owner_payload,
    )


def _created_by_from_row(row: PromptToolPreset) -> Optional[str]:
    owner_payload = row.owner_payload if isinstance(row.owner_payload, dict) else {}
    created_by = owner_payload.get("username") or owner_payload.get("name")
    return created_by if isinstance(created_by, str) else None


def _is_admin_user(user: Any) -> bool:
    admin_attr = getattr(user, "is_admin", None)
    if callable(admin_attr):
        return bool(admin_attr())
    return bool(admin_attr)


async def list_prompt_tool_catalog(
    *,
    scope: PromptToolCatalogScope,
    current_user: Any,
    db: AsyncSession,
) -> list[PromptToolPresetRecord]:
    """
    List prompt tool presets by scope.

    Builtin presets are always included for `builtin` and `all` scopes.
    """
    if scope == "builtin":
        return list_builtin_prompt_tools()

    preset_service = PromptToolPresetService(db)

    if scope == "self":
        self_scope = _resolve_self_scope(current_user)
        owner_user_id = self_scope.owner_user_id if self_scope.owner_user_id is not None else getattr(current_user, "id", None)
        rows = await preset_service.list_presets(
            owner_user_id=owner_user_id,
            is_public=self_scope.is_public,
            include_public_for_owner=self_scope.include_public_for_owner,
            status=None,
            limit=200,
            offset=0,
        )
        return [_map_row_to_record(row, current_user=current_user, force_source="user") for row in rows]

    if scope == "shared":
        shared_scope = _resolve_shared_scope(current_user)
        rows = await preset_service.list_presets(
            owner_user_id=shared_scope.owner_user_id,
            is_public=True,
            include_public_for_owner=shared_scope.include_public_for_owner,
            status=ReviewStatus.APPROVED,
            limit=200,
            offset=0,
        )
        return [_map_row_to_record(row, current_user=current_user, force_source="shared") for row in rows]

    if scope == "all":
        builtins = list_builtin_prompt_tools()
        self_scope = _resolve_self_scope(current_user)
        shared_scope = _resolve_shared_scope(current_user)
        owner_user_id = self_scope.owner_user_id if self_scope.owner_user_id is not None else getattr(current_user, "id", None)

        self_rows = await preset_service.list_presets(
            owner_user_id=owner_user_id,
            is_public=self_scope.is_public,
            include_public_for_owner=self_scope.include_public_for_owner,
            status=None,
            limit=200,
            offset=0,
        )
        shared_rows = await preset_service.list_presets(
            owner_user_id=shared_scope.owner_user_id,
            is_public=True,
            include_public_for_owner=shared_scope.include_public_for_owner,
            status=ReviewStatus.APPROVED,
            limit=200,
            offset=0,
        )

        seen_keys: set[tuple[str, Optional[int]]] = set()
        catalog: list[PromptToolPresetRecord] = []
        for preset in builtins:
            seen_keys.add((preset.id, None))
            catalog.append(preset)
        for row in self_rows:
            key = (row.preset_id, row.owner_user_id)
            if key in seen_keys:
                continue
            seen_keys.add(key)
            catalog.append(_map_row_to_record(row, current_user=current_user, force_source="user"))
        for row in shared_rows:
            key = (row.preset_id, row.owner_user_id)
            if key in seen_keys:
                continue
            seen_keys.add(key)
            catalog.append(_map_row_to_record(row, current_user=current_user, force_source="shared"))
        return catalog

    raise HTTPException(status_code=400, detail=f"Unsupported scope '{scope}'")


async def list_prompt_tool_presets(
    *,
    current_user: Any,
    db: AsyncSession,
    owner_user_id: Optional[int],
    mine: bool,
    is_public: Optional[bool],
    status: Optional[ReviewStatus],
    limit: int,
    offset: int,
) -> list[PromptToolPreset]:
    scope = resolve_user_owned_list_scope(
        current_user=current_user,
        requested_owner_user_id=owner_user_id,
        requested_is_public=is_public,
        mine=mine,
        include_public_when_mine=False,
        mine_requires_auth_detail="Authentication required for mine=true",
        mine_forbidden_cross_owner_detail="Not allowed to query another user's presets with mine=true",
        private_owner_forbidden_detail="Not allowed to query private presets of another user",
    )
    effective_owner = scope.owner_user_id if scope.owner_user_id is not None else getattr(current_user, "id", None)
    preset_service = PromptToolPresetService(db)
    return await preset_service.list_presets(
        owner_user_id=effective_owner,
        is_public=scope.is_public,
        include_public_for_owner=scope.include_public_for_owner,
        status=status,
        limit=limit,
        offset=offset,
    )


async def get_prompt_tool_preset(
    *,
    current_user: Any,
    db: AsyncSession,
    entry_id: UUID,
) -> Optional[PromptToolPreset]:
    preset_service = PromptToolPresetService(db)
    row = await preset_service.get_preset(entry_id)
    if row is None:
        return None
    if row.is_public:
        return row
    assert_can_write_user_owned(
        user=current_user,
        owner_user_id=row.owner_user_id,
        created_by=_created_by_from_row(row),
        denied_detail="Not allowed to access this preset",
    )
    return row


async def create_prompt_tool_preset(
    *,
    current_user: Any,
    db: AsyncSession,
    preset_id: str,
    label: str,
    description: Optional[str],
    category: str,
    enabled: bool,
    requires: list[str],
    defaults: dict[str, Any],
) -> PromptToolPreset:
    preset_service = PromptToolPresetService(db)
    try:
        row = await preset_service.create_preset(
            owner_user_id=getattr(current_user, "id"),
            preset_id=preset_id,
            label=label,
            description=description,
            category=category,
            enabled=enabled,
            requires=requires,
            defaults=defaults,
            owner_payload={"username": getattr(current_user, "username", None)},
        )
    except PromptToolPresetError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message)
    return row


async def update_prompt_tool_preset(
    *,
    current_user: Any,
    db: AsyncSession,
    entry_id: UUID,
    preset_id: Optional[str] = None,
    label: Optional[str] = None,
    description: Optional[str] = None,
    category: Optional[str] = None,
    enabled: Optional[bool] = None,
    requires: Optional[list[str]] = None,
    defaults: Optional[dict[str, Any]] = None,
) -> Optional[PromptToolPreset]:
    preset_service = PromptToolPresetService(db)
    existing = await preset_service.get_preset(entry_id)
    if existing is None:
        return None

    assert_can_write_user_owned(
        user=current_user,
        owner_user_id=existing.owner_user_id,
        created_by=_created_by_from_row(existing),
        denied_detail="Not allowed to update this preset",
    )

    try:
        updated = await preset_service.update_preset(
            entry_id=entry_id,
            preset_id=preset_id,
            label=label,
            description=description,
            category=category,
            enabled=enabled,
            requires=requires,
            defaults=defaults,
            owner_payload={"username": getattr(current_user, "username", None)},
        )
    except PromptToolPresetError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message)
    return updated


async def delete_prompt_tool_preset(
    *,
    current_user: Any,
    db: AsyncSession,
    entry_id: UUID,
) -> bool:
    preset_service = PromptToolPresetService(db)
    existing = await preset_service.get_preset(entry_id)
    if existing is None:
        return False

    assert_can_write_user_owned(
        user=current_user,
        owner_user_id=existing.owner_user_id,
        created_by=_created_by_from_row(existing),
        denied_detail="Not allowed to delete this preset",
    )

    return await preset_service.delete_preset(entry_id)


async def submit_prompt_tool_preset(
    *,
    current_user: Any,
    db: AsyncSession,
    entry_id: UUID,
) -> Optional[PromptToolPreset]:
    preset_service = PromptToolPresetService(db)
    existing = await preset_service.get_preset(entry_id)
    if existing is None:
        return None

    assert_can_write_user_owned(
        user=current_user,
        owner_user_id=existing.owner_user_id,
        created_by=_created_by_from_row(existing),
        denied_detail="Not allowed to submit this preset",
    )

    try:
        submitted = await preset_service.submit_preset(
            entry_id=entry_id,
            owner_user_id=getattr(current_user, "id"),
        )
    except PromptToolPresetError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message)
    return submitted


async def approve_prompt_tool_preset(
    *,
    current_user: Any,
    db: AsyncSession,
    entry_id: UUID,
) -> Optional[PromptToolPreset]:
    if not _is_admin_user(current_user):
        raise HTTPException(status_code=403, detail="Admin access required")

    preset_service = PromptToolPresetService(db)
    existing = await preset_service.get_preset(entry_id)
    if existing is None:
        return None

    try:
        approved = await preset_service.approve_preset(
            entry_id=entry_id,
            admin_user_id=getattr(current_user, "id"),
        )
    except PromptToolPresetError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message)
    return approved


async def reject_prompt_tool_preset(
    *,
    current_user: Any,
    db: AsyncSession,
    entry_id: UUID,
    reason: Optional[str],
) -> Optional[PromptToolPreset]:
    if not _is_admin_user(current_user):
        raise HTTPException(status_code=403, detail="Admin access required")

    preset_service = PromptToolPresetService(db)
    existing = await preset_service.get_preset(entry_id)
    if existing is None:
        return None

    try:
        rejected = await preset_service.reject_preset(
            entry_id=entry_id,
            admin_user_id=getattr(current_user, "id"),
            reason=reason,
        )
    except PromptToolPresetError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message)
    return rejected


async def resolve_prompt_tool_preset(
    *,
    preset_id: str,
    current_user: Any,
    db: AsyncSession,
) -> PromptToolPresetRecord | None:
    """Resolve prompt tool preset by ID."""
    builtin = get_builtin_prompt_tool(preset_id)
    if builtin is not None:
        return builtin

    preset_service = PromptToolPresetService(db)
    row = await preset_service.resolve_executable_preset(
        preset_id=preset_id,
        current_user_id=getattr(current_user, "id", None),
    )
    if row is None:
        return None

    return _map_row_to_record(row, current_user=current_user)


def assert_can_execute_prompt_tool(
    *,
    preset: PromptToolPresetRecord,
    current_user: Any,
) -> None:
    """Enforce write/execution access for private non-builtin presets."""
    if preset.source in {"builtin", "shared"}:
        return
    owner_payload = preset.owner_payload if isinstance(preset.owner_payload, dict) else {}
    created_by = owner_payload.get("username") or owner_payload.get("name")
    assert_can_write_user_owned(
        user=current_user,
        owner_user_id=preset.owner_user_id,
        created_by=created_by,
        denied_detail="Not allowed to execute this preset",
    )


def dispatch_prompt_tool_execution(
    *,
    preset: PromptToolPresetRecord,
    prompt_text: str,
    params: Mapping[str, Any] | None,
    run_context: Mapping[str, Any] | None,
) -> Mapping[str, Any]:
    """Dispatch prompt tool execution to preset handler implementation."""
    if preset.source == "builtin":
        return execute_builtin_prompt_tool(
            preset,
            prompt_text=prompt_text,
            params=params,
            run_context=run_context,
        )

    return _execute_user_prompt_tool(
        preset=preset,
        prompt_text=prompt_text,
        params=params,
        run_context=run_context,
    )
