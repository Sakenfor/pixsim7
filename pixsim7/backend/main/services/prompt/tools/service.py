"""Prompt tool catalog and execution dispatch service."""
from __future__ import annotations

from typing import Any, Mapping

from fastapi import HTTPException

from pixsim7.backend.main.services.ownership.user_owned import (
    assert_can_write_user_owned,
    resolve_user_owned_list_scope,
)

from .builtins import execute_builtin_prompt_tool, get_builtin_prompt_tool, list_builtin_prompt_tools
from .types import PromptToolCatalogScope, PromptToolPresetRecord


def _resolve_self_scope(current_user: Any) -> None:
    resolve_user_owned_list_scope(
        current_user=current_user,
        requested_owner_user_id=None,
        requested_is_public=None,
        mine=True,
        include_public_when_mine=False,
        mine_requires_auth_detail="Authentication required for scope=self",
        mine_forbidden_cross_owner_detail="Not allowed to query another user's presets with scope=self",
        private_owner_forbidden_detail="Not allowed to query private presets of another user",
    )


def _resolve_shared_scope(current_user: Any) -> None:
    resolve_user_owned_list_scope(
        current_user=current_user,
        requested_owner_user_id=None,
        requested_is_public=True,
        mine=False,
        include_public_when_mine=False,
        mine_requires_auth_detail="Authentication required for scope=shared",
        mine_forbidden_cross_owner_detail="Not allowed to query another user's shared presets",
        private_owner_forbidden_detail="Not allowed to query private presets of another user",
    )


def list_prompt_tool_catalog(
    *,
    scope: PromptToolCatalogScope,
    current_user: Any,
) -> list[PromptToolPresetRecord]:
    """
    List prompt tool presets by scope.

    Phase 1 currently exposes builtins only:
    - builtin: builtin presets
    - all: builtin presets (plus future self/shared when implemented)
    - self/shared: empty until user/shared preset storage exists
    """
    if scope == "builtin":
        return list_builtin_prompt_tools()
    if scope == "self":
        _resolve_self_scope(current_user)
        return []
    if scope == "shared":
        _resolve_shared_scope(current_user)
        return []
    if scope == "all":
        _resolve_self_scope(current_user)
        _resolve_shared_scope(current_user)
        return list_builtin_prompt_tools()
    raise HTTPException(status_code=400, detail=f"Unsupported scope '{scope}'")


def resolve_prompt_tool_preset(
    *,
    preset_id: str,
    current_user: Any,
) -> PromptToolPresetRecord | None:
    """Resolve prompt tool preset by ID."""
    del current_user
    return get_builtin_prompt_tool(preset_id)


def assert_can_execute_prompt_tool(
    *,
    preset: PromptToolPresetRecord,
    current_user: Any,
) -> None:
    """Enforce write/execution access for non-builtin presets."""
    if preset.source == "builtin":
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
    raise HTTPException(
        status_code=501,
        detail="Execution for non-builtin prompt tools is not implemented yet",
    )
