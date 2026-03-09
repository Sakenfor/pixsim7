"""Tests for template resolver link_id handling."""

from types import SimpleNamespace
from uuid import uuid4

import pytest

from pixsim7.backend.main.services.links import template_resolver


@pytest.mark.asyncio
async def test_explicit_link_id_requires_template_identity_match(monkeypatch):
    link = SimpleNamespace(
        template_kind="itemTemplate",
        template_id="different-id",
        sync_enabled=True,
        runtime_id=123,
        activation_conditions=None,
    )

    class DummyLinkService:
        def __init__(self, db):
            self.db = db

        async def get_link(self, link_id):
            return link

    monkeypatch.setattr(template_resolver, "LinkService", DummyLinkService)

    result = await template_resolver.resolve_template_to_runtime(
        db=object(),
        template_kind="characterInstance",
        template_id="expected-id",
        link_id=str(uuid4()),
    )

    assert result is None


@pytest.mark.asyncio
async def test_explicit_link_id_respects_activation_conditions(monkeypatch):
    link = SimpleNamespace(
        template_kind="characterInstance",
        template_id="char-1",
        sync_enabled=True,
        runtime_id=77,
        activation_conditions={"location.zone": "downtown"},
    )

    class DummyLinkService:
        def __init__(self, db):
            self.db = db

        async def get_link(self, link_id):
            return link

    monkeypatch.setattr(template_resolver, "LinkService", DummyLinkService)

    no_context_result = await template_resolver.resolve_template_to_runtime(
        db=object(),
        template_kind="characterInstance",
        template_id="char-1",
        link_id=str(uuid4()),
    )
    assert no_context_result is None

    inactive_result = await template_resolver.resolve_template_to_runtime(
        db=object(),
        template_kind="characterInstance",
        template_id="char-1",
        link_id=str(uuid4()),
        context={"location.zone": "suburbs"},
    )
    assert inactive_result is None

    active_result = await template_resolver.resolve_template_to_runtime(
        db=object(),
        template_kind="characterInstance",
        template_id="char-1",
        link_id=str(uuid4()),
        context={"location.zone": "downtown"},
    )
    assert active_result == 77


@pytest.mark.asyncio
async def test_explicit_link_id_rejects_invalid_uuid():
    with pytest.raises(ValueError, match="Invalid link_id format"):
        await template_resolver.resolve_template_to_runtime(
            db=object(),
            template_kind="characterInstance",
            template_id="char-1",
            link_id="not-a-uuid",
        )

