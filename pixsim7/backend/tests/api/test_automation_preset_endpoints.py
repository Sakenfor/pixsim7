"""End-to-end coverage for /automation/presets endpoints with the
ownership-policy refactor.

Calls the endpoint functions directly with a fake AsyncSession — same
pattern as ``test_analyzer_presets_owner_scope.py`` — so we don't need a
real DB. The access-control logic now lives entirely in the policy
helpers (covered by ``test_access_flags.py``); these tests verify that
each endpoint actually plumbs them, plus the two bug fixes turned up by
the refactor (``owner_id`` set on create, ``owner_id`` + ``cloned_from_id``
+ ``category`` set on copy).
"""
from __future__ import annotations

from types import SimpleNamespace
from typing import Any, Dict, List, Optional, Tuple

import pytest
from fastapi import HTTPException

from pixsim7.automation.domain import AppActionPreset
from pixsim7.backend.main.api.v1.automation import (
    copy_preset,
    create_preset,
    delete_preset,
    get_preset,
    get_preset_stats,
    list_presets,
    update_preset,
)


TEST_SUITE = {
    "id": "automation-preset-endpoints",
    "label": "Automation Preset Endpoint Access Control",
    "kind": "unit",
    "category": "backend/automation",
    "subcategory": "presets",
    "covers": [
        "pixsim7/backend/main/api/v1/automation.py",
        "pixsim7/automation/domain/preset.py",
    ],
    "order": 100,
}


# ---------------------------------------------------------------------------
# Test fixtures
# ---------------------------------------------------------------------------


def _user(user_id: int, *, admin: bool = False) -> SimpleNamespace:
    """Tiny RequestPrincipal-like object with id + duck-typed is_admin()."""
    return SimpleNamespace(id=user_id, is_admin=lambda: admin)


class _FakeResult:
    """Mimics the slice of ``Result`` we use: ``.scalars().all()``."""

    def __init__(self, rows: List[Any]):
        self._rows = rows

    def scalars(self) -> "_FakeResult":
        return self

    def all(self) -> List[Any]:
        return list(self._rows)


class _FakeSession:
    """In-memory async session double for AppActionPreset.

    Models the operations the endpoints actually use: ``get``, ``add``,
    ``delete``, ``execute`` (with a non-trivial WHERE), ``commit``,
    ``refresh``. Doesn't simulate full SQL — just enough for the
    visibility filter to compile against an in-memory list."""

    def __init__(self, presets: Optional[List[AppActionPreset]] = None) -> None:
        self._by_id: Dict[int, AppActionPreset] = {}
        self.added: List[AppActionPreset] = []
        self.deleted: List[AppActionPreset] = []
        self.last_query: Any = None
        self.commit_count = 0
        self._next_id = 1
        for p in presets or []:
            self.seed(p)

    def seed(self, preset: AppActionPreset) -> AppActionPreset:
        if preset.id is None:
            preset.id = self._next_id
            self._next_id += 1
        self._by_id[preset.id] = preset
        return preset

    async def get(self, model: Any, key: Any) -> Optional[Any]:
        if model is AppActionPreset:
            return self._by_id.get(key)
        return None

    def add(self, entity: Any) -> None:
        if isinstance(entity, AppActionPreset):
            if entity.id is None:
                entity.id = self._next_id
                self._next_id += 1
            self._by_id[entity.id] = entity
        self.added.append(entity)

    async def delete(self, entity: Any) -> None:
        self.deleted.append(entity)
        if isinstance(entity, AppActionPreset) and entity.id in self._by_id:
            del self._by_id[entity.id]

    async def commit(self) -> None:
        self.commit_count += 1

    async def refresh(self, entity: Any) -> None:
        # No-op: in-memory entities don't need a server round-trip.
        return None

    async def execute(self, query: Any) -> _FakeResult:
        """Honour the visibility WHERE clause well enough to test list filtering.

        We don't compile real SQL — instead we walk the in-memory rows and
        let the query's compiled clause guide which ones to keep. For the
        cases under test, the clause is either ``None`` (admin sees all) or
        an OR over ``owner_id == :user_id`` plus ``is_<flag>.is_(True)``.
        We approximate by inspecting the column names mentioned in the
        compiled WHERE — fine for the assertions made below.
        """
        self.last_query = query
        rows = list(self._by_id.values())
        if query.whereclause is None:
            return _FakeResult(rows)

        # Extract the literal-bound SQL once to drive the in-memory filter.
        compiled = str(query.whereclause.compile(compile_kwargs={"literal_binds": True}))

        def keep(p: AppActionPreset) -> bool:
            # Admin path is whereclause-is-None handled above. Otherwise the
            # compiled SQL contains "owner_id = N" plus optional "is_system"/
            # "is_shared" disjuncts.
            ok = False
            for marker, attr in (("is_system", "is_system"), ("is_shared", "is_shared")):
                if marker in compiled and getattr(p, attr, False):
                    ok = True
            # Owner check — pull the integer from "owner_id = N" if present.
            import re
            m = re.search(r"owner_id\s*=\s*(\d+)", compiled)
            if m and p.owner_id == int(m.group(1)):
                ok = True
            return ok

        return _FakeResult([p for p in rows if keep(p)])


def _make_preset(**overrides: Any) -> AppActionPreset:
    """AppActionPreset factory with safe defaults for tests."""
    defaults = dict(
        name="test",
        description="",
        actions=[],
    )
    defaults.update(overrides)
    return AppActionPreset(**defaults)


# ---------------------------------------------------------------------------
# create_preset
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_create_sets_owner_to_creator() -> None:
    db = _FakeSession()
    payload = _make_preset(name="mine")
    result = await create_preset(payload, user=_user(42), db=db)
    assert result.owner_id == 42
    assert result in db.added


@pytest.mark.asyncio
async def test_create_strips_is_system_for_non_admin() -> None:
    db = _FakeSession()
    payload = _make_preset(name="sneaky", is_system=True)
    result = await create_preset(payload, user=_user(42), db=db)
    assert result.is_system is False  # gate forced it off


@pytest.mark.asyncio
async def test_create_admin_can_set_is_system() -> None:
    db = _FakeSession()
    payload = _make_preset(name="sysd", is_system=True)
    result = await create_preset(payload, user=_user(99, admin=True), db=db)
    assert result.is_system is True


# ---------------------------------------------------------------------------
# get_preset
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_owner_can_view_own_private_preset() -> None:
    db = _FakeSession([_make_preset(name="mine", owner_id=1)])
    result = await get_preset(1, user=_user(1), db=db)
    assert result.id == 1


@pytest.mark.asyncio
async def test_get_non_owner_blocked_on_private_preset() -> None:
    db = _FakeSession([_make_preset(name="theirs", owner_id=1)])
    with pytest.raises(HTTPException) as exc:
        await get_preset(1, user=_user(2), db=db)
    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_get_non_owner_can_view_via_system_flag() -> None:
    db = _FakeSession([_make_preset(name="sysd", owner_id=None, is_system=True)])
    # owner_id is None on system presets — non-owner can still see them.
    result = await get_preset(1, user=_user(99), db=db)
    assert result.is_system is True


@pytest.mark.asyncio
async def test_get_non_owner_can_view_via_shared_flag() -> None:
    db = _FakeSession([_make_preset(name="shared", owner_id=1, is_shared=True)])
    result = await get_preset(1, user=_user(2), db=db)
    assert result.is_shared is True


@pytest.mark.asyncio
async def test_get_admin_can_view_anything() -> None:
    db = _FakeSession([_make_preset(name="theirs", owner_id=1)])
    result = await get_preset(1, user=_user(99, admin=True), db=db)
    assert result.id == 1


# ---------------------------------------------------------------------------
# update_preset
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_update_owner_can_edit_own_preset() -> None:
    db = _FakeSession([_make_preset(name="orig", owner_id=1)])
    payload = _make_preset(name="renamed", owner_id=1)
    result = await update_preset(1, payload, user=_user(1), db=db)
    assert result.name == "renamed"


@pytest.mark.asyncio
async def test_update_non_admin_blocked_on_system_preset() -> None:
    db = _FakeSession([_make_preset(name="sysd", owner_id=None, is_system=True)])
    payload = _make_preset(name="hijack")
    with pytest.raises(HTTPException) as exc:
        await update_preset(1, payload, user=_user(1), db=db)
    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_update_non_owner_blocked_on_shared_preset() -> None:
    """is_shared widens *read* but not *write* — non-owner still can't edit."""
    db = _FakeSession([_make_preset(name="shared", owner_id=1, is_shared=True)])
    payload = _make_preset(name="hijack")
    with pytest.raises(HTTPException) as exc:
        await update_preset(1, payload, user=_user(2), db=db)
    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_update_non_admin_cannot_promote_to_system() -> None:
    """Owner edits their own preset and tries to flip is_system — gated."""
    db = _FakeSession([_make_preset(name="own", owner_id=1, is_system=False)])
    payload = _make_preset(name="own", is_system=True)
    result = await update_preset(1, payload, user=_user(1), db=db)
    assert result.is_system is False  # gate reverted to existing


@pytest.mark.asyncio
async def test_update_admin_can_demote_system_preset() -> None:
    db = _FakeSession([_make_preset(name="sysd", owner_id=None, is_system=True)])
    payload = _make_preset(name="sysd", is_system=False)
    result = await update_preset(1, payload, user=_user(99, admin=True), db=db)
    assert result.is_system is False


@pytest.mark.asyncio
async def test_update_admin_can_promote_to_system() -> None:
    db = _FakeSession([_make_preset(name="useful", owner_id=1, is_system=False)])
    payload = _make_preset(name="useful", is_system=True)
    result = await update_preset(1, payload, user=_user(99, admin=True), db=db)
    assert result.is_system is True


# ---------------------------------------------------------------------------
# delete_preset
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_delete_owner_can_delete_own_preset() -> None:
    preset = _make_preset(name="toss", owner_id=1)
    db = _FakeSession([preset])
    await delete_preset(1, user=_user(1), db=db)
    assert preset in db.deleted


@pytest.mark.asyncio
async def test_delete_non_admin_blocked_on_system() -> None:
    db = _FakeSession([_make_preset(name="sysd", owner_id=None, is_system=True)])
    with pytest.raises(HTTPException) as exc:
        await delete_preset(1, user=_user(1), db=db)
    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_delete_admin_can_delete_system() -> None:
    preset = _make_preset(name="sysd", owner_id=None, is_system=True)
    db = _FakeSession([preset])
    await delete_preset(1, user=_user(99, admin=True), db=db)
    assert preset in db.deleted


# ---------------------------------------------------------------------------
# copy_preset — bug-fix coverage
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_copy_sets_owner_to_copier_not_source_owner() -> None:
    """Pre-refactor bug: copies were left with owner_id=None.

    Source is shared so user 42 may view (and therefore copy) it; the
    point of the test is the new owner_id == 42, not access control."""
    source = _make_preset(name="src", owner_id=99, category="Snippet", is_shared=True)
    db = _FakeSession([source])
    result = await copy_preset(1, user=_user(42), db=db)
    assert result.owner_id == 42
    assert result.cloned_from_id == 1


@pytest.mark.asyncio
async def test_copy_preserves_category() -> None:
    """Pre-refactor bug: category was dropped on copy."""
    source = _make_preset(name="src", owner_id=99, category="Login", is_shared=True)
    db = _FakeSession([source])
    result = await copy_preset(1, user=_user(42), db=db)
    assert result.category == "Login"


@pytest.mark.asyncio
async def test_copy_starts_private_even_from_system_source() -> None:
    source = _make_preset(name="sysd", owner_id=None, is_system=True, is_shared=True)
    db = _FakeSession([source])
    result = await copy_preset(1, user=_user(42), db=db)
    assert result.is_system is False
    assert result.is_shared is False


@pytest.mark.asyncio
async def test_copy_blocked_when_source_not_viewable() -> None:
    db = _FakeSession([_make_preset(name="theirs", owner_id=1)])
    with pytest.raises(HTTPException) as exc:
        await copy_preset(1, user=_user(2), db=db)
    assert exc.value.status_code == 403


# ---------------------------------------------------------------------------
# list_presets — visibility filter end-to-end
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_list_non_admin_sees_own_shared_and_system_only() -> None:
    db = _FakeSession([
        _make_preset(name="own", owner_id=1),
        _make_preset(name="other-private", owner_id=2),
        _make_preset(name="other-shared", owner_id=2, is_shared=True),
        _make_preset(name="system", owner_id=None, is_system=True),
    ])
    result = await list_presets(user=_user(1), provider_id=None, db=db)
    names = {p.name for p in result}
    assert names == {"own", "other-shared", "system"}


@pytest.mark.asyncio
async def test_list_admin_sees_everything() -> None:
    db = _FakeSession([
        _make_preset(name="own", owner_id=1),
        _make_preset(name="other-private", owner_id=2),
        _make_preset(name="system", owner_id=None, is_system=True),
    ])
    result = await list_presets(user=_user(99, admin=True), provider_id=None, db=db)
    assert len(result) == 3


# ---------------------------------------------------------------------------
# get_preset_stats — visibility-filtered usage signals
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_stats_excludes_invisible_presets_for_non_admin() -> None:
    """Non-admin shouldn't get keys for presets they can't view."""
    own = _make_preset(name="own", owner_id=1)
    other_private = _make_preset(name="other-private", owner_id=2)
    db = _FakeSession([own, other_private])

    stats = await get_preset_stats(user=_user(1), db=db)

    assert own.id in stats
    assert other_private.id not in stats


@pytest.mark.asyncio
async def test_stats_referenced_by_excludes_invisible_parents() -> None:
    """Without the visibility filter, the names of private parent presets
    would leak through ``referenced_by[child].name``. Lock that down."""
    # Order dictates ids: shared-child = id 1, private-parent = id 2.
    shared_child = _make_preset(name="shared-child", owner_id=2, is_shared=True)
    private_parent = _make_preset(
        name="private-parent",
        owner_id=2,
        actions=[{"type": "call_preset", "params": {"preset_id": 1}}],
    )
    db = _FakeSession([shared_child, private_parent])

    # User 99 — not owner of either, not admin. Sees shared-child only.
    stats = await get_preset_stats(user=_user(99), db=db)

    assert 1 in stats and 2 not in stats
    assert stats[1].referenced_by == []  # private parent's name does NOT leak


@pytest.mark.asyncio
async def test_stats_admin_sees_full_referenced_by() -> None:
    """Same setup, admin sees everything including the private parent."""
    shared_child = _make_preset(name="shared-child", owner_id=2, is_shared=True)
    private_parent = _make_preset(
        name="private-parent",
        owner_id=2,
        actions=[{"type": "call_preset", "params": {"preset_id": 1}}],
    )
    db = _FakeSession([shared_child, private_parent])

    stats = await get_preset_stats(user=_user(99, admin=True), db=db)

    assert 1 in stats and 2 in stats
    assert len(stats[1].referenced_by) == 1
    assert stats[1].referenced_by[0].name == "private-parent"
