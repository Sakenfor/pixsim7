from __future__ import annotations

from types import SimpleNamespace

import pytest

from pixsim7.backend.main.services.provider.provider_service import ProviderService


class _FakeDB:
    """Minimal stand-in for AsyncSession.get used by the resolver helper."""

    def __init__(self, user: object) -> None:
        self._user = user

    async def get(self, _model: object, _pk: object) -> object:
        return self._user


def _service(preferences: dict) -> ProviderService:
    user = SimpleNamespace(id=11, preferences=preferences)
    return ProviderService(db=_FakeDB(user))


@pytest.mark.asyncio
async def test_resolves_outbound_prompt_with_values() -> None:
    svc = _service({"prompt_variables": [{"name": "ACTOR1_DETAILS", "value": "tall woman"}]})
    generation = SimpleNamespace(id=1, user_id=11)
    params = {"prompt": "ACTOR1 ==> ACTOR1_DETAILS"}

    await svc._resolve_prompt_variables_inplace(generation, params)

    # Bare ACTOR1 stays symbolic (no value); ACTOR1_DETAILS expands.
    assert params["prompt"] == "ACTOR1 ==> tall woman"


@pytest.mark.asyncio
async def test_noop_when_no_values() -> None:
    svc = _service({})  # no saved variables
    generation = SimpleNamespace(id=1, user_id=11)
    params = {"prompt": "ACTOR1 ==> ACTOR2"}

    await svc._resolve_prompt_variables_inplace(generation, params)

    assert params["prompt"] == "ACTOR1 ==> ACTOR2"


@pytest.mark.asyncio
async def test_noop_without_owner() -> None:
    svc = _service({"prompt_variables": [{"name": "ACTOR1", "value": "x"}]})
    generation = SimpleNamespace(id=1, user_id=None)
    params = {"prompt": "ACTOR1"}

    await svc._resolve_prompt_variables_inplace(generation, params)

    assert params["prompt"] == "ACTOR1"
