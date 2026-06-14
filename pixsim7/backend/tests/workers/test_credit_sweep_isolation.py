"""Regression: the periodic Pixverse credit sweep must isolate each account.

Before the per-account-session fix, a single errored account (e.g. Pixverse
10001 "account is blocked") rolled back the shared session, expiring every
loaded ORM object. The next attribute access then attempted sync IO outside the
async greenlet ("greenlet_spawn has not been called"), bubbled up to
credit_sweep_fatal, and aborted the whole sweep — so every account after the
blocked one went unsynced.
"""
from __future__ import annotations

from contextlib import asynccontextmanager
from types import SimpleNamespace

import pytest

from pixsim7.backend.main.domain.enums import AccountStatus
from pixsim7.backend.main.workers import status_poller_maintenance as mod


class _FakeScalarResult:
    def __init__(self, values):
        self._values = list(values)

    def scalars(self):
        return self

    def all(self):
        return list(self._values)


class _FakeSession:
    """Minimal async session: phase-1 execute()->accounts, phase-2 get()->account."""

    def __init__(self, accounts_by_id):
        self._accounts_by_id = accounts_by_id
        self.committed = 0

    async def execute(self, _stmt):
        return _FakeScalarResult(self._accounts_by_id.values())

    async def get(self, _model, pk):
        return self._accounts_by_id.get(pk)

    async def commit(self):
        self.committed += 1


def _make_account(acct_id: int, email: str):
    return SimpleNamespace(
        id=acct_id,
        email=email,
        status=AccountStatus.ACTIVE,
        provider_id="pixverse",
        provider_metadata={},  # never synced -> always due
    )


@pytest.mark.asyncio
async def test_blocked_account_does_not_abort_sweep(monkeypatch: pytest.MonkeyPatch):
    accounts = {
        1: _make_account(1, "a@example.com"),
        2: _make_account(2, "blocked@example.com"),
        3: _make_account(3, "c@example.com"),
    }
    session = _FakeSession(accounts)

    @asynccontextmanager
    async def _fake_session():
        yield session

    monkeypatch.setattr(mod, "get_async_session", _fake_session)

    class _FakeProvider:
        async def get_credits(self, account, **_kwargs):
            if account.id == 2:
                raise RuntimeError("Pixverse API error 10001: account is blocked,exit")
            return {"web": 100, "openapi": 0}

    class _FakeRegistry:
        def get(self, _provider_id):
            return _FakeProvider()

    import sys
    import pixsim7.backend.main.domain.providers.registry  # noqa: F401  (ensure loaded)
    import pixsim7.backend.main.services.account as account_mod

    reg_mod = sys.modules["pixsim7.backend.main.domain.providers.registry"]
    monkeypatch.setattr(reg_mod, "registry", _FakeRegistry())
    monkeypatch.setattr(account_mod, "AccountService", lambda _db: SimpleNamespace())

    async def _fake_apply_snapshot(**kwargs):
        return {"web": 100}

    monkeypatch.setattr(
        account_mod, "apply_provider_credit_snapshot", _fake_apply_snapshot
    )

    stats = await mod.refresh_stale_account_credits({})

    # The blocked account (2) errors, but 1 and 3 are still refreshed — the
    # sweep did NOT abort. Pre-fix this returned a fatal {errors: 1} with 0
    # refreshed because the rollback-expiry killed the run at account 2.
    assert stats["refreshed"] == 2, stats
    assert stats["failed"] == 1, stats
    assert stats["errors"] == 1, stats
