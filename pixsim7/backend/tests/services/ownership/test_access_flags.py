"""Tests for the composable AccessFlag axis on OwnershipPolicy.

Covers the four new flag-aware helpers (apply_visibility_filter,
assert_can_view, assert_can_edit, gate_admin_only_writes) end-to-end
against a tiny in-memory model so we don't need a real DB. The helpers
themselves are domain-agnostic — see pixsim7/common/ownership.py.
"""
from __future__ import annotations

from dataclasses import dataclass
from types import SimpleNamespace
from typing import Optional

import pytest
from fastapi import HTTPException
from sqlalchemy import Boolean, Column, Integer, String, select
from sqlalchemy.orm import declarative_base

from pixsim7.common.ownership import (
    AccessFlag,
    OwnershipPolicy,
    OwnershipScope,
    PUBLIC_FLAG,
    SHARED_FLAG,
    SYSTEM_FLAG,
    apply_visibility_filter,
    assert_can_edit,
    assert_can_view,
    gate_admin_only_writes,
)

TEST_SUITE = {
    "id": "ownership-access-flags",
    "label": "Ownership AccessFlag Composition Tests",
    "kind": "unit",
    "category": "backend/ownership",
    "subcategory": "access-flags",
    "covers": [
        "pixsim7/common/ownership.py",
    ],
    "order": 32,
}


# A throwaway SQL model — just enough columns for the visibility filter to
# generate clauses against. Never bound to an engine.
Base = declarative_base()


class _ToyEntity(Base):  # type: ignore[misc, valid-type]
    __tablename__ = "_toy_entities_for_ownership_test"
    id = Column(Integer, primary_key=True)
    owner_id = Column(Integer)
    is_system = Column(Boolean, default=False)
    is_shared = Column(Boolean, default=False)
    is_public = Column(Boolean, default=False)
    name = Column(String)


def _user(user_id: int, *, admin: bool = False) -> SimpleNamespace:
    return SimpleNamespace(id=user_id, is_admin=lambda: admin)


_POLICY = OwnershipPolicy(
    scope=OwnershipScope.USER,
    owner_field="owner_id",
    access_flags=(SYSTEM_FLAG, SHARED_FLAG),
)


# -----------------------------------------------------------------------------
# apply_visibility_filter — list-query widening
# -----------------------------------------------------------------------------


def test_visibility_filter_admin_sees_unfiltered() -> None:
    stmt = apply_visibility_filter(
        select(_ToyEntity), model=_ToyEntity, policy=_POLICY, user=_user(1, admin=True)
    )
    # No WHERE clause should have been added for admins.
    assert stmt.whereclause is None


def test_visibility_filter_non_admin_ors_owner_and_widening_flags() -> None:
    stmt = apply_visibility_filter(
        select(_ToyEntity), model=_ToyEntity, policy=_POLICY, user=_user(42)
    )
    # Inspect the WHERE clause specifically — the SELECT list mentions the
    # flag columns regardless of filtering, so we'd get false positives if
    # we grep'd the whole SQL.
    where_sql = str(stmt.whereclause.compile(compile_kwargs={"literal_binds": True}))
    assert "owner_id = 42" in where_sql
    assert "is_system" in where_sql and "is_shared" in where_sql
    assert " OR " in where_sql.upper()


def test_visibility_filter_anonymous_principal_rejected() -> None:
    with pytest.raises(HTTPException) as exc:
        apply_visibility_filter(
            select(_ToyEntity), model=_ToyEntity, policy=_POLICY, user=None
        )
    assert exc.value.status_code == 401


# -----------------------------------------------------------------------------
# assert_can_view — single-row read gate
# -----------------------------------------------------------------------------


def test_can_view_owner_passes() -> None:
    entity = SimpleNamespace(owner_id=1, is_system=False, is_shared=False)
    assert_can_view(entity, user=_user(1), policy=_POLICY)


def test_can_view_non_owner_blocked_when_no_widening_flag() -> None:
    entity = SimpleNamespace(owner_id=1, is_system=False, is_shared=False)
    with pytest.raises(HTTPException) as exc:
        assert_can_view(entity, user=_user(2), policy=_POLICY)
    assert exc.value.status_code == 403


def test_can_view_non_owner_passes_via_system_flag() -> None:
    entity = SimpleNamespace(owner_id=1, is_system=True, is_shared=False)
    assert_can_view(entity, user=_user(99), policy=_POLICY)


def test_can_view_admin_always_passes() -> None:
    entity = SimpleNamespace(owner_id=1, is_system=False, is_shared=False)
    assert_can_view(entity, user=_user(2, admin=True), policy=_POLICY)


# -----------------------------------------------------------------------------
# assert_can_edit — write gate with admin override + flag locking
# -----------------------------------------------------------------------------


def test_can_edit_owner_passes_on_own_normal_entity() -> None:
    entity = SimpleNamespace(owner_id=1, is_system=False, is_shared=False)
    assert_can_edit(entity, user=_user(1), policy=_POLICY)


def test_can_edit_owner_blocked_when_locked_flag_set() -> None:
    """is_system locks_write_to_admin=True → even owner can't edit."""
    entity = SimpleNamespace(owner_id=1, is_system=True, is_shared=False)
    with pytest.raises(HTTPException) as exc:
        assert_can_edit(entity, user=_user(1), policy=_POLICY)
    assert exc.value.status_code == 403


def test_can_edit_owner_passes_when_only_non_locking_flag_set() -> None:
    """is_shared has locks_write_to_admin=False → owner still edits."""
    entity = SimpleNamespace(owner_id=1, is_system=False, is_shared=True)
    assert_can_edit(entity, user=_user(1), policy=_POLICY)


def test_can_edit_non_owner_blocked() -> None:
    entity = SimpleNamespace(owner_id=1, is_system=False, is_shared=True)
    with pytest.raises(HTTPException):
        assert_can_edit(entity, user=_user(2), policy=_POLICY)


def test_can_edit_admin_passes_on_locked_flag() -> None:
    entity = SimpleNamespace(owner_id=1, is_system=True, is_shared=False)
    assert_can_edit(entity, user=_user(99, admin=True), policy=_POLICY)


# -----------------------------------------------------------------------------
# gate_admin_only_writes — body sanitiser for create + update
# -----------------------------------------------------------------------------


def test_gate_create_forces_admin_only_flag_to_false_for_non_admin() -> None:
    payload = SimpleNamespace(is_system=True, is_shared=True, owner_id=42)
    gate_admin_only_writes(payload, user=_user(42), policy=_POLICY, existing=None)
    assert payload.is_system is False
    # is_shared has admin_only_to_toggle=False → unchanged.
    assert payload.is_shared is True


def test_gate_update_preserves_existing_admin_only_flag_for_non_admin() -> None:
    existing = SimpleNamespace(is_system=True, is_shared=False, owner_id=42)
    payload = SimpleNamespace(is_system=False, is_shared=True, owner_id=42)
    gate_admin_only_writes(payload, user=_user(42), policy=_POLICY, existing=existing)
    # Non-admin tried to demote — reverted to existing True.
    assert payload.is_system is True
    assert payload.is_shared is True


def test_gate_admin_can_toggle_admin_only_flag() -> None:
    payload = SimpleNamespace(is_system=True, is_shared=False, owner_id=42)
    gate_admin_only_writes(payload, user=_user(99, admin=True), policy=_POLICY, existing=None)
    assert payload.is_system is True


# -----------------------------------------------------------------------------
# Backward compatibility — empty access_flags reproduces pre-flag behaviour
# -----------------------------------------------------------------------------


# -----------------------------------------------------------------------------
# PUBLIC_FLAG canon — same shape as SHARED_FLAG, different column name
# -----------------------------------------------------------------------------


_PUBLIC_POLICY = OwnershipPolicy(
    scope=OwnershipScope.USER,
    owner_field="owner_id",
    access_flags=(PUBLIC_FLAG,),
)


def test_public_flag_has_canonical_shape() -> None:
    """Lock the canonical instance against drift. is_public widens read,
    leaves writes to the owner, and isn't admin-only-to-toggle."""
    assert PUBLIC_FLAG.field == "is_public"
    assert PUBLIC_FLAG.grants_read_to_all is True
    assert PUBLIC_FLAG.locks_write_to_admin is False
    assert PUBLIC_FLAG.admin_only_to_toggle is False


def test_public_flag_widens_read_for_non_owner() -> None:
    entity = SimpleNamespace(owner_id=1, is_public=True)
    assert_can_view(entity, user=_user(2), policy=_PUBLIC_POLICY)


def test_public_flag_does_not_lock_writes() -> None:
    """is_public widens read but the original owner can still edit
    (unlike SYSTEM_FLAG, which locks writes to admin)."""
    entity = SimpleNamespace(owner_id=1, is_public=True)
    assert_can_edit(entity, user=_user(1), policy=_PUBLIC_POLICY)


def test_public_flag_blocks_non_owner_writes() -> None:
    entity = SimpleNamespace(owner_id=1, is_public=True)
    with pytest.raises(HTTPException):
        assert_can_edit(entity, user=_user(2), policy=_PUBLIC_POLICY)


def test_public_flag_visibility_filter_ors_owner_and_public() -> None:
    stmt = apply_visibility_filter(
        select(_ToyEntity), model=_ToyEntity, policy=_PUBLIC_POLICY, user=_user(42)
    )
    where_sql = str(stmt.whereclause.compile(compile_kwargs={"literal_binds": True}))
    assert "owner_id = 42" in where_sql
    assert "is_public" in where_sql
    assert " OR " in where_sql.upper()


def test_empty_access_flags_does_not_widen_visibility() -> None:
    """Existing OwnershipPolicy() callers (no access_flags) keep working
    as before: pure ownership filter, no flag-driven OR clauses."""
    bare_policy = OwnershipPolicy(scope=OwnershipScope.USER, owner_field="owner_id")
    stmt = apply_visibility_filter(
        select(_ToyEntity), model=_ToyEntity, policy=bare_policy, user=_user(7)
    )
    where_sql = str(stmt.whereclause.compile(compile_kwargs={"literal_binds": True}))
    assert "owner_id = 7" in where_sql
    # No flag columns or OR clauses should leak into the WHERE.
    assert "is_system" not in where_sql and "is_shared" not in where_sql
    assert " OR " not in where_sql.upper()
