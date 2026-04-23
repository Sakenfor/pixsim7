"""
Tests for AccountService selection logic.

Pins two pieces:

1. Routing helpers (``_account_matches_routing``, ``_account_priority_delta``) —
   pure functions, exhaustively covered.

2. The Python-side scoring inside ``select_and_reserve_account._pick_account``
   that runs whenever ``operation_type`` or ``model`` is supplied. This branch
   re-sorts the SQL candidates and is responsible for the documented
   "drain cheap accounts first / prefer high-credit accounts on expensive
   ops" behavior.

The SQL-side ORDER BY (no-routing path) is not exercised here because it
requires a real Postgres engine; the Python-side path uses the same key
shape and is the user-visible contract.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from pixsim7.backend.main.domain import AccountStatus
from pixsim7.backend.main.services.account.account_service import (
    AccountService,
    _account_matches_routing,
    _account_priority_delta,
    _iter_route_patterns,
    _parse_route_pattern,
)
from pixsim7.backend.main.shared.errors import NoAccountAvailableError


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_account(
    *,
    account_id: int = 1,
    priority: int = 0,
    last_used: datetime | None = None,
    allow: list[str] | None = None,
    deny: list[str] | None = None,
    priority_overrides: dict | None = None,
    metadata: dict | None = None,
) -> SimpleNamespace:
    """A SimpleNamespace shaped like a ProviderAccount row for routing tests."""
    return SimpleNamespace(
        id=account_id,
        email=f"acct-{account_id}@test",
        priority=priority,
        last_used=last_used,
        routing_allow_patterns=allow,
        routing_deny_patterns=deny,
        routing_priority_overrides=priority_overrides,
        provider_metadata=metadata,
        status=AccountStatus.ACTIVE,
        current_processing_jobs=0,
        max_concurrent_jobs=2,
        cooldown_until=None,
    )


class _FakeResult:
    """Mimics the slice of sqlalchemy Result used by select_and_reserve_account."""

    def __init__(self, rows: list[tuple]):
        self._rows = rows

    def all(self) -> list[tuple]:
        return list(self._rows)

    def scalars(self):
        return self

    def scalar_one_or_none(self):
        return self._rows[0][0] if self._rows else None


class _FakeDb:
    """Async DB session double — returns canned results in execute order."""

    def __init__(self, results: list[_FakeResult]):
        self._results = list(results)
        self.execute_calls = 0
        self.commits = 0
        self.rollbacks = 0
        self.refreshed: list = []

    async def execute(self, _stmt):
        self.execute_calls += 1
        if not self._results:
            return _FakeResult([])
        return self._results.pop(0)

    async def commit(self) -> None:
        self.commits += 1

    async def rollback(self) -> None:
        self.rollbacks += 1

    async def refresh(self, obj) -> None:
        self.refreshed.append(obj)


# ---------------------------------------------------------------------------
# Routing helper unit tests
# ---------------------------------------------------------------------------


def test_account_matches_routing_no_constraints_when_no_filters() -> None:
    account = _make_account()
    assert _account_matches_routing(account, operation_type=None, model=None) is True
    assert _account_matches_routing(account, operation_type="image_to_video", model="qwen") is True


def test_account_matches_routing_allow_list_passes_when_pattern_matches() -> None:
    account = _make_account(allow=["image_to_video:qwen-image"])
    assert _account_matches_routing(
        account, operation_type="image_to_video", model="qwen-image"
    ) is True


def test_account_matches_routing_allow_list_rejects_unmatched_op() -> None:
    account = _make_account(allow=["image_to_video:qwen-image"])
    assert _account_matches_routing(
        account, operation_type="text_to_image", model="qwen-image"
    ) is False


def test_account_matches_routing_allow_wildcard_model_matches_any_model() -> None:
    account = _make_account(allow=["image_to_video:*"])
    assert _account_matches_routing(
        account, operation_type="image_to_video", model="any-model"
    ) is True


def test_account_matches_routing_allow_alias_matches_canonical_model() -> None:
    account = _make_account(allow=["text_to_image:seedream-5.0"])
    assert _account_matches_routing(
        account, operation_type="text_to_image", model="seedream-5.0-lite"
    ) is True


def test_account_matches_routing_deny_list_blocks_match() -> None:
    account = _make_account(deny=["image_to_video:expensive-model"])
    assert _account_matches_routing(
        account, operation_type="image_to_video", model="expensive-model"
    ) is False
    assert _account_matches_routing(
        account, operation_type="image_to_video", model="cheap-model"
    ) is True


def test_account_matches_routing_deny_alias_blocks_canonical_model() -> None:
    account = _make_account(deny=["text_to_image:seedream-5"])
    assert _account_matches_routing(
        account, operation_type="text_to_image", model="seedream-5.0-lite"
    ) is False


def test_account_matches_routing_metadata_routing_rules_are_merged() -> None:
    account = _make_account(metadata={"routing_deny_patterns": ["*:blocked"]})
    assert _account_matches_routing(
        account, operation_type="image_to_video", model="blocked"
    ) is False


def test_account_priority_delta_returns_zero_without_rules() -> None:
    account = _make_account()
    assert _account_priority_delta(
        account, operation_type="image_to_video", model="qwen-image"
    ) == 0


def test_account_priority_delta_applies_matching_rule() -> None:
    account = _make_account(priority_overrides={"image_to_video:qwen-image": 25})
    assert _account_priority_delta(
        account, operation_type="image_to_video", model="qwen-image"
    ) == 25


def test_account_priority_delta_applies_model_alias_rule() -> None:
    account = _make_account(priority_overrides={"text_to_image:seedream-5.0": -3})
    assert _account_priority_delta(
        account, operation_type="text_to_image", model="seedream-5.0-lite"
    ) == -3


def test_account_priority_delta_sums_overlapping_rules() -> None:
    account = _make_account(
        priority_overrides={
            "image_to_video:*": 5,
            "image_to_video:qwen-image": 10,
        }
    )
    assert _account_priority_delta(
        account, operation_type="image_to_video", model="qwen-image"
    ) == 15


def test_account_priority_delta_ignores_non_matching_rules() -> None:
    account = _make_account(priority_overrides={"text_to_image:*": 100})
    assert _account_priority_delta(
        account, operation_type="image_to_video", model="qwen-image"
    ) == 0


def test_parse_route_pattern_normalizes_wildcards_and_aliases() -> None:
    assert _parse_route_pattern("image_to_video") == ("image_to_video", "*")
    assert _parse_route_pattern("image_to_video:qwen") == ("image_to_video", "qwen")
    assert _parse_route_pattern("*:any") == ("*", "*")
    assert _parse_route_pattern({"operation": "ANY", "model": "Qwen"}) == ("*", "qwen")
    assert _parse_route_pattern("text_to_image:seedream-5") == (
        "text_to_image",
        "seedream-5.0-lite",
    )
    assert _parse_route_pattern("") is None


def test_iter_route_patterns_handles_dict_with_model_lists() -> None:
    patterns = _iter_route_patterns({"image_to_video": ["qwen-image", "qwen-video"]})
    assert ("image_to_video", "qwen-image") in patterns
    assert ("image_to_video", "qwen-video") in patterns


# ---------------------------------------------------------------------------
# select_and_reserve_account — Python-side scoring path
# ---------------------------------------------------------------------------

OP = "image_to_video"
MODEL = "qwen-image"


def _service(db: _FakeDb, monkeypatch: pytest.MonkeyPatch) -> AccountService:
    service = AccountService(db=db)  # type: ignore[arg-type]
    # Disable accountless fallback so we test selection in isolation.
    monkeypatch.setattr(
        service,
        "reserve_or_create_accountless_account",
        AsyncMock(return_value=None),
    )
    return service


@pytest.mark.asyncio
async def test_select_and_reserve_picks_lowest_credits_at_equal_priority(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Default behavior: drain cheap accounts first."""
    cheap = _make_account(account_id=1, priority=0)
    rich = _make_account(account_id=2, priority=0)
    # SQL would normally pre-order this; we deliberately scramble to prove
    # the Python re-sort is what enforces the contract.
    rows = [(rich, 5000), (cheap, 25)]

    db = _FakeDb(results=[_FakeResult(rows)])
    service = _service(db, monkeypatch)

    selected = await service.select_and_reserve_account(
        provider_id="pixverse",
        operation_type=OP,
        model=MODEL,
    )

    assert selected.id == cheap.id
    assert selected.current_processing_jobs == 1  # reserved
    assert db.commits == 1


@pytest.mark.asyncio
async def test_select_and_reserve_priority_beats_credits(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Higher base priority wins even if it has more credits."""
    high_priority = _make_account(account_id=1, priority=10)
    low_priority_cheap = _make_account(account_id=2, priority=0)
    rows = [(low_priority_cheap, 10), (high_priority, 9000)]

    db = _FakeDb(results=[_FakeResult(rows)])
    service = _service(db, monkeypatch)

    selected = await service.select_and_reserve_account(
        provider_id="pixverse",
        operation_type=OP,
        model=MODEL,
    )

    assert selected.id == high_priority.id


@pytest.mark.asyncio
async def test_select_and_reserve_priority_override_promotes_account(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """routing_priority_overrides shifts effective priority for the matched route."""
    base = _make_account(account_id=1, priority=10)
    boosted = _make_account(
        account_id=2,
        priority=0,
        priority_overrides={f"{OP}:{MODEL}": 50},
    )
    rows = [(base, 0), (boosted, 9999)]

    db = _FakeDb(results=[_FakeResult(rows)])
    service = _service(db, monkeypatch)

    selected = await service.select_and_reserve_account(
        provider_id="pixverse",
        operation_type=OP,
        model=MODEL,
    )

    assert selected.id == boosted.id


@pytest.mark.asyncio
async def test_select_and_reserve_alias_override_penalizes_canonical_model(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Alias keys should affect the canonical model route used at runtime."""
    penalized = _make_account(
        account_id=1,
        priority=5,
        priority_overrides={"text_to_image:seedream-5.0": -10},
    )
    neutral = _make_account(account_id=2, priority=0)
    rows = [(penalized, 100), (neutral, 100)]

    db = _FakeDb(results=[_FakeResult(rows)])
    service = _service(db, monkeypatch)

    selected = await service.select_and_reserve_account(
        provider_id="pixverse",
        operation_type="text_to_image",
        model="seedream-5.0-lite",
    )

    assert selected.id == neutral.id


@pytest.mark.asyncio
async def test_select_and_reserve_high_cost_inverts_to_prefer_high_credits(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """min_credits >= _HIGH_COST_MIN_CREDIT_HINT (50) flips the sort to prefer
    high-credit accounts so expensive jobs don't land on near-empty ones."""
    near_empty = _make_account(account_id=1, priority=0)
    well_funded = _make_account(account_id=2, priority=0)
    rows = [(near_empty, 60), (well_funded, 5000)]

    # First execute = pre-filter query (rows that pass min_credits filter).
    db = _FakeDb(results=[_FakeResult(rows)])
    service = _service(db, monkeypatch)

    selected = await service.select_and_reserve_account(
        provider_id="pixverse",
        operation_type=OP,
        model=MODEL,
        min_credits=50,
    )

    assert selected.id == well_funded.id


@pytest.mark.asyncio
async def test_select_and_reserve_filters_routing_mismatches(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """SQL may yield candidates whose allow-list doesn't include the route;
    Python re-sort drops them."""
    blocked = _make_account(
        account_id=1,
        priority=99,
        allow=["text_to_image:*"],  # excludes image_to_video
    )
    eligible = _make_account(account_id=2, priority=0)
    rows = [(blocked, 0), (eligible, 100)]

    db = _FakeDb(results=[_FakeResult(rows)])
    service = _service(db, monkeypatch)

    selected = await service.select_and_reserve_account(
        provider_id="pixverse",
        operation_type=OP,
        model=MODEL,
    )

    assert selected.id == eligible.id


@pytest.mark.asyncio
async def test_select_and_reserve_breaks_ties_by_least_recently_used(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Equal priority and equal credits → least recently used wins."""
    now = datetime.now(timezone.utc)
    stale = _make_account(account_id=1, priority=0, last_used=now - timedelta(hours=2))
    fresh = _make_account(account_id=2, priority=0, last_used=now)
    rows = [(fresh, 100), (stale, 100)]

    db = _FakeDb(results=[_FakeResult(rows)])
    service = _service(db, monkeypatch)

    selected = await service.select_and_reserve_account(
        provider_id="pixverse",
        operation_type=OP,
        model=MODEL,
    )

    assert selected.id == stale.id


@pytest.mark.asyncio
async def test_select_and_reserve_falls_back_when_credit_prefilter_excludes_all(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """If the SQL pre-filter (DB credits >= min_credits) yields nothing — likely
    a stale credit snapshot — retry without the filter and probe high-credit
    candidates first. Pinned by the comment at line 712-737."""
    high = _make_account(account_id=1, priority=0)
    low = _make_account(account_id=2, priority=0)

    # 1st execute (pre-filter) → empty.
    # 2nd execute (fallback, prefer_high_credits=True) → both rows.
    db = _FakeDb(
        results=[
            _FakeResult([]),
            _FakeResult([(low, 5), (high, 9000)]),
        ]
    )
    service = _service(db, monkeypatch)

    selected = await service.select_and_reserve_account(
        provider_id="pixverse",
        operation_type=OP,
        model=MODEL,
        min_credits=10,  # below high-cost hint, so first attempt uses normal sort
    )

    # Fallback flips to high-credits-first regardless of the original hint.
    assert selected.id == high.id
    assert db.execute_calls == 2


@pytest.mark.asyncio
async def test_select_and_reserve_raises_when_no_candidates_and_no_accountless(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # 1st execute (selection) → empty
    # 2nd execute (debug all-accounts query) → empty
    db = _FakeDb(results=[_FakeResult([]), _FakeResult([])])
    service = _service(db, monkeypatch)

    with pytest.raises(NoAccountAvailableError):
        await service.select_and_reserve_account(
            provider_id="pixverse",
            operation_type=OP,
            model=MODEL,
        )

    assert db.rollbacks == 1  # locks released before fallback path
