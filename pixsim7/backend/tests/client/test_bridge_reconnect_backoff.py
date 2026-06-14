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

from pixsim7.client.bridge import (
    _is_backend_booting_error,
    _reconnect_backoff_delay,
)


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


# --- Boot-window (port-not-open-yet) behavior -------------------------------
# A real backend restart refuses connections for the ~5–20s it takes to boot.
# Those refusals must NOT escalate the delay into a 15–30s sleep — that strands
# any in-flight task long after the WS endpoint is reachable again. While
# booting, the bridge probes at a tight ~1s cadence regardless of attempt count.


def test_booting_stays_tight_regardless_of_attempt_count():
    # Even at attempt 5/8 — where the normal curve is already 20–30s — a
    # refused (still-booting) backend keeps the probe near ~1s.
    for failures in (2, 3, 5, 8, 10):
        for _ in range(50):
            delay = _reconnect_backoff_delay(failures, booting=True)
            assert 1.0 <= delay <= 1.5


def test_booting_does_not_blow_past_the_non_booting_curve():
    # The whole point: booting delay must be far below the escalating curve it
    # replaces, so we reconnect promptly once the port reopens.
    for failures in (3, 5, 8):
        assert max(_reconnect_backoff_delay(failures, booting=True) for _ in range(50)) < \
            min(_reconnect_backoff_delay(failures) for _ in range(50))


def test_booting_has_a_gentle_ceiling_for_a_dead_backend():
    # A backend that never returns shouldn't be hammered forever at 1s; after
    # many tries the cadence eases to ~3s. Still tight, just not a busy-loop.
    for failures in (11, 50, 100):
        for _ in range(50):
            assert 3.0 <= _reconnect_backoff_delay(failures, booting=True) <= 3.5


def test_classifier_detects_direct_connection_refused():
    assert _is_backend_booting_error(ConnectionRefusedError(1225, "refused"))


def test_classifier_walks_wrapped_cause_chain():
    # The refusal is usually wrapped (OSError / websockets handshake error).
    try:
        try:
            raise ConnectionRefusedError(1225, "refused")
        except ConnectionRefusedError as inner:
            raise OSError("connect failed") from inner
    except OSError as wrapped:
        assert _is_backend_booting_error(wrapped)


def test_classifier_walks_implicit_context_chain():
    # Implicit chaining (no `from`) is exposed via __context__, not __cause__.
    try:
        try:
            raise ConnectionRefusedError(1225, "refused")
        except ConnectionRefusedError:
            raise RuntimeError("handshake aborted")
    except RuntimeError as wrapped:
        assert _is_backend_booting_error(wrapped)


def test_classifier_false_for_a_dropped_established_connection():
    # A mid-turn drop (ConnectionReset) is NOT a boot-window refusal — it should
    # take the normal near-immediate-then-escalate path, not the tight loop.
    assert not _is_backend_booting_error(
        ConnectionResetError(64, "network name no longer available")
    )
    assert not _is_backend_booting_error(TimeoutError("no pong"))
