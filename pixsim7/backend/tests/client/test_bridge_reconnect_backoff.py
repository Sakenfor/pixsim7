"""Tests for the bridge's WS reconnect backoff schedule.

Plan: ``launcher-health-probe-stability`` / ``ws-drop-root-cause``.

Background: backend restarts are the common cause of a dropped bridge WS.
The old flat ``min(5 * consecutive_failures, 30)`` schedule meant the FIRST
reconnect attempt always waited a full 5s — long enough that the browser
panel (which reconnects in ~1s) beat the bridge back and the user saw a
spurious "Task not found" for any in-flight task. The new schedule makes the
first attempt near-immediate and jitters the rest so many bridges don't
stampede a still-booting backend in lockstep.
"""
from __future__ import annotations

TEST_SUITE = {
    "id": "client-bridge-reconnect-backoff",
    "label": "Bridge WS reconnect backoff (fast first attempt + jitter)",
    "kind": "unit",
    "category": "client/mcp-reliability",
    "covers": [
        "pixsim7/client/bridge.py",
    ],
    "order": 19.2,
}

from pixsim7.client.bridge import _reconnect_backoff_delay


def test_first_attempt_is_near_immediate():
    """First reconnect fires within ~1s — backend restart is the common case."""
    for _ in range(50):
        delay = _reconnect_backoff_delay(1)
        assert 0.5 <= delay <= 1.0

    # Far below the old flat 5s floor that lost the restart race.
    assert max(_reconnect_backoff_delay(1) for _ in range(50)) < 5.0


def test_later_attempts_back_off_linearly_with_jitter():
    # attempt 2 → base 5s, attempt 3 → base 10s, attempt 4 → base 15s.
    for failures, base in [(2, 5), (3, 10), (4, 15)]:
        for _ in range(50):
            delay = _reconnect_backoff_delay(failures)
            assert base <= delay <= base + 2.0


def test_backoff_is_capped():
    # Base caps at 30s; jitter adds at most 2s on top.
    for failures in (7, 10, 100):
        for _ in range(50):
            assert _reconnect_backoff_delay(failures) <= 32.0


def test_monotonic_base_growth_across_early_attempts():
    """Successive attempts never decrease their floor (ignoring jitter)."""
    # Compare floors: attempt 1 floor 0.5, attempt 2 floor 5, attempt 3 floor 10.
    floors = [
        min(_reconnect_backoff_delay(n) for _ in range(50))
        for n in (1, 2, 3, 4)
    ]
    assert floors == sorted(floors)
    assert floors[0] < 1.0 < floors[1]
