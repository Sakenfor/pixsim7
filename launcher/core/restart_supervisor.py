"""
Restart Supervisor - crash-restart policy for launcher-managed services.

The launcher's three-layer split is deliberately:

    HealthManager   observes  -> emits HealthEvent (STOPPED, reason)
            |  (event bus: EventTypes.HEALTH_UPDATE)
            v
    RestartSupervisor  decides -> restart? back off? give up?   (THIS module)
            |
            v
    ProcessManager   acts     -> restart(service_key)

HealthManager stays a pure sensor (it never restarts anything). This supervisor
is the single place that turns the *general* "wanted but dead" signal into a
restart, regardless of WHY the process died — suspend/resume, OOM, a dependency
crash, an external kill. That generality is the whole point: a resume-from-suspend
power hook (not implemented here) would only be an optimization that forces an
immediate re-probe so this supervisor reacts in ~0s instead of waiting out the
adaptive health interval. It is NOT a second restart path.

Safety rails (this is the part that keeps it from being a foot-gun):
  - Only act when `requested_running is True`. ProcessManager.stop() sets it to
    False, so a user Stop is never overridden. `None` (never touched) is also
    skipped — we only resurrect things the launcher/user actually wanted up.
  - Never touch detached/docker (`is_detached`, key == 'db') or
    externally-managed services — the launcher doesn't own their lifecycle.
  - Exponential backoff with a max-attempts-per-rolling-window cap. A service
    that crashes on a *persistent* fault burns its budget and is then left
    STOPPED (surfaced honestly) instead of thrashing in a restart loop.
  - A HEALTHY transition resets the budget, so a service that recovers and later
    crashes again gets a fresh set of attempts.

Restarts run on a dedicated worker thread, never on the health thread that
delivers the event (ProcessManager.restart() does stop + sleep + start and would
otherwise stall health probing for every service).
"""

from __future__ import annotations

import logging
import queue
import threading
import time
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Set

from .types import HealthEvent, HealthStatus, ServiceState
from .event_bus import EventBus, Event, EventTypes

logger = logging.getLogger("launcher.core.restart")


@dataclass
class RestartPolicy:
    """Tunables for the restart supervisor."""

    enabled: bool = True
    # Backoff delay (seconds) applied before attempt N (0-indexed). The last
    # entry is reused for any further attempts within the window.
    backoff_delays: tuple = (3.0, 5.0, 15.0, 30.0, 60.0)
    # Max restart attempts allowed inside `window_sec`. Exceeding it parks the
    # service in the "given up" set until it next goes HEALTHY (or is restarted
    # manually, which clears state via the HEALTHY transition).
    max_attempts_in_window: int = 5
    window_sec: float = 600.0
    # Service keys the supervisor must never auto-restart (belt-and-suspenders
    # on top of the detached/external guards).
    exclude_keys: frozenset = field(default_factory=frozenset)


class RestartSupervisor:
    """Auto-restarts launcher-managed services that crash while wanted up.

    Subscribes to `EventTypes.HEALTH_UPDATE` on the event bus and applies
    `RestartPolicy`. See module docstring for the design rationale.
    """

    def __init__(
        self,
        states: Dict[str, ServiceState],
        process_manager,
        event_bus: EventBus,
        policy: Optional[RestartPolicy] = None,
    ):
        self.states = states
        self.process_manager = process_manager
        self.event_bus = event_bus
        self.policy = policy or RestartPolicy()

        self._lock = threading.Lock()
        # Monotonic timestamps of recent restart attempts, per service.
        self._attempts: Dict[str, List[float]] = {}
        # Services currently queued or mid-restart — debounces the repeated
        # STOPPED events the health loop emits every probe.
        self._pending: Set[str] = set()
        # Services that exhausted their budget; left alone until next HEALTHY.
        self._given_up: Set[str] = set()

        self._queue: "queue.Queue[tuple]" = queue.Queue()
        self._stop_event = threading.Event()
        self._thread: Optional[threading.Thread] = None
        self._running = False

    # ── Lifecycle ──────────────────────────────────────────────────────────

    def start(self) -> None:
        if self._running or not self.policy.enabled:
            return
        self._stop_event.clear()
        self._running = True
        self._thread = threading.Thread(
            target=self._run_loop, name="RestartSupervisor", daemon=True
        )
        self._thread.start()
        self.event_bus.subscribe(EventTypes.HEALTH_UPDATE, self._on_health_event)
        logger.info("restart_supervisor_started policy=%s", self.policy)

    def stop(self, timeout: float = 5.0) -> None:
        if not self._running:
            return
        try:
            self.event_bus.unsubscribe(EventTypes.HEALTH_UPDATE, self._on_health_event)
        except Exception:
            pass
        self._stop_event.set()
        # Unblock the worker thread if it's parked on the queue.
        self._queue.put(None)
        if self._thread:
            self._thread.join(timeout=timeout)
        self._running = False

    def is_running(self) -> bool:
        return self._running

    # ── Event handling (runs on the health thread — must stay cheap) ────────

    def _on_health_event(self, event: Event) -> None:
        data = getattr(event, "data", None)
        if not isinstance(data, HealthEvent):
            return
        key = data.service_key

        # A recovery resets the budget so a later crash gets a fresh start.
        if data.status == HealthStatus.HEALTHY:
            with self._lock:
                self._attempts.pop(key, None)
                self._given_up.discard(key)
            return

        if data.status != HealthStatus.STOPPED:
            return

        state = self.states.get(key)
        if not self._is_eligible(key, state):
            return

        with self._lock:
            if key in self._pending or key in self._given_up:
                return
            attempts = self._prune_attempts(key)
            if len(attempts) >= self.policy.max_attempts_in_window:
                self._given_up.add(key)
                logger.warning(
                    "restart_supervisor_gave_up service=%s attempts=%d window=%.0fs "
                    "(persistent crash — leaving STOPPED; will retry after next HEALTHY)",
                    key, len(attempts), self.policy.window_sec,
                )
                return
            attempt_idx = len(attempts)
            self._pending.add(key)

        self._queue.put((key, attempt_idx))

    def _is_eligible(self, key: str, state: Optional[ServiceState]) -> bool:
        if state is None:
            return False
        if key in self.policy.exclude_keys:
            return False
        # Only resurrect what was actually wanted up. stop() -> False (user Stop);
        # None -> never started. Both are left alone.
        if state.requested_running is not True:
            return False
        # The launcher doesn't own detached/docker or externally-started procs.
        defn = state.definition
        if defn.is_detached or defn.key == "db":
            return False
        if state.externally_managed:
            return False
        return True

    # ── Restart worker (runs off the health thread) ─────────────────────────

    def _run_loop(self) -> None:
        while not self._stop_event.is_set():
            try:
                item = self._queue.get()
            except Exception:
                continue
            if item is None:  # stop() sentinel
                break
            key, attempt_idx = item
            try:
                self._attempt_restart(key, attempt_idx)
            except Exception as exc:  # never let one bad restart kill the loop
                logger.error("restart_supervisor_attempt_error service=%s %r", key, exc)
            finally:
                with self._lock:
                    self._pending.discard(key)

    def _attempt_restart(self, key: str, attempt_idx: int) -> None:
        delays = self.policy.backoff_delays
        delay = delays[min(attempt_idx, len(delays) - 1)] if delays else 0.0

        # Interruptible backoff — also gives a recovering service time to come
        # back on its own (e.g. a dependency restarting) before we bounce it.
        if delay and self._stop_event.wait(timeout=delay):
            return  # supervisor stopping

        state = self.states.get(key)
        # Re-validate after the wait: the service may have recovered, or the
        # user may have hit Stop while we were backing off.
        if not self._is_eligible(key, state):
            return
        if state.status.value != "stopped":
            return

        with self._lock:
            self._prune_attempts(key)
            self._attempts.setdefault(key, []).append(time.monotonic())
            attempt_num = len(self._attempts[key])

        logger.info(
            "restart_supervisor_restarting service=%s attempt=%d delay=%.1fs reason=%s",
            key, attempt_num, delay, (state.last_error or "stopped"),
        )
        ok = self.process_manager.restart(key)
        if not ok:
            logger.warning("restart_supervisor_restart_failed service=%s attempt=%d", key, attempt_num)

    # ── Helpers (call under self._lock) ─────────────────────────────────────

    def _prune_attempts(self, key: str) -> List[float]:
        now = time.monotonic()
        cutoff = now - self.policy.window_sec
        attempts = [t for t in self._attempts.get(key, []) if t >= cutoff]
        if attempts:
            self._attempts[key] = attempts
        else:
            self._attempts.pop(key, None)
        return attempts
