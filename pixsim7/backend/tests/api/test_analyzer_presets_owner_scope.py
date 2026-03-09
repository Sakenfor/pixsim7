"""Tests for analyzer preset owner-scope behavior using ownership helpers."""
from __future__ import annotations

from types import SimpleNamespace

import pytest
from fastapi import HTTPException

import pixsim7.backend.main.api.v1.analyzers as analyzers_module
from pixsim7.backend.main.api.v1.analyzers import (
    list_analyzer_presets,
    _build_preset_response,
)
from pixsim7.backend.main.services.ownership.user_owned import (
    resolve_user_owned_list_scope,
)


def _user(*, user_id: int, username: str = "user", is_admin: bool = False) -> SimpleNamespace:
    return SimpleNamespace(
        id=user_id,
        username=username,
        is_admin=(lambda: is_admin),
    )


class _NoopGateway:
    """Gateway stub that never proxies."""

    async def proxy(self, *args, **kwargs):
        return SimpleNamespace(called=False, data=None)


class _PresetServiceCapture:
    """Captures list_presets calls for assertion."""

    def __init__(self, results=None):
        self.calls: list[dict] = []
        self._results = results or []

    async def list_presets(self, **kwargs):
        self.calls.append(dict(kwargs))
        return self._results


# -- resolve_user_owned_list_scope unit tests (preset-oriented) --


def test_scope_mine_uses_current_user_id():
    scope = resolve_user_owned_list_scope(
        current_user=_user(user_id=5),
        requested_owner_user_id=None,
        requested_is_public=None,
        mine=True,
        include_public_when_mine=False,
    )
    assert scope.owner_user_id == 5
    assert scope.include_public_for_owner is False


def test_scope_mine_with_include_public():
    scope = resolve_user_owned_list_scope(
        current_user=_user(user_id=5),
        requested_owner_user_id=None,
        requested_is_public=None,
        mine=True,
        include_public_when_mine=True,
    )
    assert scope.owner_user_id == 5
    assert scope.include_public_for_owner is True


def test_scope_foreign_owner_forces_public():
    scope = resolve_user_owned_list_scope(
        current_user=_user(user_id=5),
        requested_owner_user_id=99,
        requested_is_public=None,
        mine=False,
        include_public_when_mine=False,
    )
    assert scope.owner_user_id == 99
    assert scope.is_public is True


def test_scope_admin_foreign_owner_not_forced_public():
    scope = resolve_user_owned_list_scope(
        current_user=_user(user_id=1, is_admin=True),
        requested_owner_user_id=99,
        requested_is_public=None,
        mine=False,
        include_public_when_mine=False,
    )
    assert scope.owner_user_id == 99
    assert scope.is_public is None


def test_scope_mine_cross_owner_forbidden_for_non_admin():
    with pytest.raises(HTTPException) as exc:
        resolve_user_owned_list_scope(
            current_user=_user(user_id=5),
            requested_owner_user_id=99,
            requested_is_public=None,
            mine=True,
            include_public_when_mine=False,
        )
    assert exc.value.status_code == 403


def test_scope_mine_cross_owner_allowed_for_admin():
    scope = resolve_user_owned_list_scope(
        current_user=_user(user_id=1, is_admin=True),
        requested_owner_user_id=99,
        requested_is_public=None,
        mine=True,
        include_public_when_mine=False,
    )
    assert scope.owner_user_id == 1


# -- list_analyzer_presets integration tests --


@pytest.mark.asyncio
async def test_list_presets_default_returns_own(monkeypatch: pytest.MonkeyPatch):
    """Default call (no params) shows current user's presets."""
    capture = _PresetServiceCapture()
    monkeypatch.setattr(analyzers_module, "AnalyzerPresetService", lambda _db: capture)

    await list_analyzer_presets(
        req=None,
        user=_user(user_id=7),
        db=None,
        analysis_gateway=_NoopGateway(),
        analyzer_id=None,
        status=None,
        include_public=False,
        owner_user_id=None,
        include_all=False,
        mine=False,
    )

    assert len(capture.calls) == 1
    assert capture.calls[0]["owner_user_id"] == 7
    assert capture.calls[0]["include_public"] is False
    assert capture.calls[0]["include_all"] is False


@pytest.mark.asyncio
async def test_list_presets_mine_uses_current_user(monkeypatch: pytest.MonkeyPatch):
    capture = _PresetServiceCapture()
    monkeypatch.setattr(analyzers_module, "AnalyzerPresetService", lambda _db: capture)

    await list_analyzer_presets(
        req=None,
        user=_user(user_id=7),
        db=None,
        analysis_gateway=_NoopGateway(),
        analyzer_id=None,
        status=None,
        include_public=False,
        owner_user_id=None,
        include_all=False,
        mine=True,
    )

    assert capture.calls[0]["owner_user_id"] == 7
    assert capture.calls[0]["include_public"] is False


@pytest.mark.asyncio
async def test_list_presets_mine_with_include_public(monkeypatch: pytest.MonkeyPatch):
    capture = _PresetServiceCapture()
    monkeypatch.setattr(analyzers_module, "AnalyzerPresetService", lambda _db: capture)

    await list_analyzer_presets(
        req=None,
        user=_user(user_id=7),
        db=None,
        analysis_gateway=_NoopGateway(),
        analyzer_id=None,
        status=None,
        include_public=True,
        owner_user_id=None,
        include_all=False,
        mine=True,
    )

    assert capture.calls[0]["owner_user_id"] == 7
    assert capture.calls[0]["include_public"] is True


@pytest.mark.asyncio
async def test_list_presets_foreign_owner_forces_approved(monkeypatch: pytest.MonkeyPatch):
    """Non-admin querying another user's presets only sees approved ones."""
    capture = _PresetServiceCapture()
    monkeypatch.setattr(analyzers_module, "AnalyzerPresetService", lambda _db: capture)

    await list_analyzer_presets(
        req=None,
        user=_user(user_id=7),
        db=None,
        analysis_gateway=_NoopGateway(),
        analyzer_id=None,
        status=None,
        include_public=False,
        owner_user_id=99,
        include_all=False,
        mine=False,
    )

    assert capture.calls[0]["owner_user_id"] == 99
    assert capture.calls[0]["status"].value == "approved"
    assert capture.calls[0]["include_public"] is False


@pytest.mark.asyncio
async def test_list_presets_foreign_owner_draft_status_returns_empty(monkeypatch: pytest.MonkeyPatch):
    """Non-admin querying another user's draft presets returns empty."""
    capture = _PresetServiceCapture()
    monkeypatch.setattr(analyzers_module, "AnalyzerPresetService", lambda _db: capture)

    result = await list_analyzer_presets(
        req=None,
        user=_user(user_id=7),
        db=None,
        analysis_gateway=_NoopGateway(),
        analyzer_id=None,
        status="draft",
        include_public=False,
        owner_user_id=99,
        include_all=False,
        mine=False,
    )

    # Service should not even be called — empty result returned early
    assert len(capture.calls) == 0
    assert result.presets == []


@pytest.mark.asyncio
async def test_list_presets_admin_foreign_owner_sees_all(monkeypatch: pytest.MonkeyPatch):
    """Admin querying another user's presets sees all statuses."""
    capture = _PresetServiceCapture()
    monkeypatch.setattr(analyzers_module, "AnalyzerPresetService", lambda _db: capture)

    await list_analyzer_presets(
        req=None,
        user=_user(user_id=1, is_admin=True),
        db=None,
        analysis_gateway=_NoopGateway(),
        analyzer_id=None,
        status=None,
        include_public=False,
        owner_user_id=99,
        include_all=False,
        mine=False,
    )

    assert capture.calls[0]["owner_user_id"] == 99
    assert capture.calls[0]["status"] is None
    assert capture.calls[0]["include_public"] is False


@pytest.mark.asyncio
async def test_list_presets_include_all_admin_only(monkeypatch: pytest.MonkeyPatch):
    """include_all requires admin."""
    capture = _PresetServiceCapture()
    monkeypatch.setattr(analyzers_module, "AnalyzerPresetService", lambda _db: capture)

    with pytest.raises(HTTPException) as exc:
        await list_analyzer_presets(
            req=None,
            user=_user(user_id=7),
            db=None,
            analysis_gateway=_NoopGateway(),
            analyzer_id=None,
            status=None,
            include_public=False,
            owner_user_id=None,
            include_all=True,
            mine=False,
        )
    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_list_presets_mine_cross_owner_forbidden(monkeypatch: pytest.MonkeyPatch):
    """mine=true with a different owner_user_id is forbidden for non-admins."""
    capture = _PresetServiceCapture()
    monkeypatch.setattr(analyzers_module, "AnalyzerPresetService", lambda _db: capture)

    with pytest.raises(HTTPException) as exc:
        await list_analyzer_presets(
            req=None,
            user=_user(user_id=7),
            db=None,
            analysis_gateway=_NoopGateway(),
            analyzer_id=None,
            status=None,
            include_public=False,
            owner_user_id=99,
            include_all=False,
            mine=True,
        )
    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_list_presets_own_owner_id_allowed(monkeypatch: pytest.MonkeyPatch):
    """Non-admin can pass their own user_id as owner_user_id (backward compat)."""
    capture = _PresetServiceCapture()
    monkeypatch.setattr(analyzers_module, "AnalyzerPresetService", lambda _db: capture)

    await list_analyzer_presets(
        req=None,
        user=_user(user_id=7),
        db=None,
        analysis_gateway=_NoopGateway(),
        analyzer_id=None,
        status=None,
        include_public=False,
        owner_user_id=7,
        include_all=False,
        mine=False,
    )

    assert capture.calls[0]["owner_user_id"] == 7


@pytest.mark.asyncio
async def test_list_presets_include_public_without_mine(monkeypatch: pytest.MonkeyPatch):
    """include_public=True without mine still includes approved presets."""
    capture = _PresetServiceCapture()
    monkeypatch.setattr(analyzers_module, "AnalyzerPresetService", lambda _db: capture)

    await list_analyzer_presets(
        req=None,
        user=_user(user_id=7),
        db=None,
        analysis_gateway=_NoopGateway(),
        analyzer_id=None,
        status=None,
        include_public=True,
        owner_user_id=None,
        include_all=False,
        mine=False,
    )

    assert capture.calls[0]["owner_user_id"] == 7
    assert capture.calls[0]["include_public"] is True


# -- _build_preset_response canonical owner fields --


def _preset_stub(*, owner_user_id: int, status: str = "draft") -> SimpleNamespace:
    from datetime import datetime, timezone

    now = datetime.now(timezone.utc)
    return SimpleNamespace(
        id=1,
        analyzer_id="prompt:test",
        preset_id="my-preset",
        name="Test Preset",
        description=None,
        config={"key": "val"},
        status=SimpleNamespace(value=status),
        owner_user_id=owner_user_id,
        approved_by_user_id=None,
        approved_at=None,
        rejected_at=None,
        rejection_reason=None,
        created_at=now,
        updated_at=now,
    )


def test_build_preset_response_includes_owner_ref():
    preset = _preset_stub(owner_user_id=7)
    resp = _build_preset_response(preset)
    assert resp.owner_user_id == 7
    assert resp.owner_ref == "user:7"


def test_build_preset_response_owner_username_none_without_metadata():
    """owner_username is None when no metadata/created_by is available."""
    preset = _preset_stub(owner_user_id=7)
    resp = _build_preset_response(preset)
    assert resp.owner_username is None
