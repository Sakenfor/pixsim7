"""Auto-restart mixin.

Extracts the auto-restart scheduling, execution, and state management
logic from ``LauncherWindow``.

Uses ``self.facade`` for service operations and ``self.processes``
(core.ServiceState dict) for state reads.
"""
import time
from datetime import datetime
from PySide6.QtCore import QTimer
from ..logger import launcher_logger as _launcher_logger


def _is_running(state) -> bool:
    return state.status.value in ("running", "starting")


class AutoRestartMixin:
    def _clear_auto_restart_state(self, key: str, *, clear_cooldown: bool = True):
        """Reset auto-restart bookkeeping for a service key."""
        self._auto_restart_attempts[key] = 0
        self._auto_restart_pending[key] = False
        self._auto_restart_healthy_since.pop(key, None)
        self._auto_restart_recent.pop(key, None)
        if clear_cooldown:
            self._auto_restart_cooldown_until.pop(key, None)

    def _schedule_auto_restart(self, key: str, reason: str):
        """Schedule a backoff restart when a requested service drops unexpectedly."""
        state = self.processes.get(key)
        if not state:
            return
        if key == "db":
            return
        if self._bulk_stop_active or time.monotonic() < self._bulk_stop_until:
            return
        if not state.requested_running:
            return
        if not state.tool_available:
            return
        if _is_running(state):
            return
        now = time.monotonic()
        cooldown_until = float(self._auto_restart_cooldown_until.get(key, 0.0) or 0.0)
        if now < cooldown_until:
            return

        if self._auto_restart_pending.get(key, False):
            return
        missing_dep_keys = self._missing_dependency_keys(key)
        if missing_dep_keys:
            self._auto_restart_pending[key] = True
            delay_ms = int(self._auto_restart_dependency_wait_ms)
            ts = datetime.now().strftime("%H:%M:%S")
            try:
                state.log_buffer.append(
                    f"[{ts}] [LAUNCHER] auto-restart waiting for deps in {delay_ms}ms "
                    f"(missing={', '.join(missing_dep_keys)}, reason={reason})"
                )
            except Exception:
                pass
            QTimer.singleShot(delay_ms, lambda: self._perform_auto_restart(key, "dependencies_unavailable"))
            return

        # Circuit breaker
        recent = [ts for ts in self._auto_restart_recent.get(key, []) if (now - ts) <= self._auto_restart_flap_window_sec]
        recent.append(now)
        self._auto_restart_recent[key] = recent
        if len(recent) >= int(self._auto_restart_flap_threshold):
            cooldown_sec = float(self._auto_restart_cooldown_sec)
            self._auto_restart_cooldown_until[key] = now + cooldown_sec
            self._auto_restart_pending[key] = False
            ts = datetime.now().strftime("%H:%M:%S")
            try:
                state.log_buffer.append(
                    f"[{ts}] [LAUNCHER] auto-restart paused for {int(cooldown_sec)}s "
                    f"(flapping: {len(recent)} events in {int(self._auto_restart_flap_window_sec)}s)"
                )
            except Exception:
                pass
            return

        attempt = int(self._auto_restart_attempts.get(key, 0)) + 1
        self._auto_restart_attempts[key] = attempt
        self._auto_restart_pending[key] = True

        delay_ms = min(30000, 1000 * (2 ** max(0, attempt - 1)))
        ts = datetime.now().strftime("%H:%M:%S")
        try:
            state.log_buffer.append(
                f"[{ts}] [LAUNCHER] auto-restart scheduled in {delay_ms}ms "
                f"(attempt={attempt}, reason={reason})"
            )
        except Exception:
            pass
        if _launcher_logger:
            try:
                _launcher_logger.warning(
                    "service_auto_restart_scheduled",
                    service_key=key, attempt=attempt, delay_ms=delay_ms, reason=reason,
                )
            except Exception:
                pass

        QTimer.singleShot(delay_ms, lambda: self._perform_auto_restart(key, reason))

    def _perform_auto_restart(self, key: str, reason: str):
        """Execute auto-restart if service still intended to run."""
        self._auto_restart_pending[key] = False
        state = self.processes.get(key)
        if not state:
            return
        if not state.requested_running:
            return
        if _is_running(state):
            return
        if not state.tool_available:
            return

        missing_dep_keys = self._missing_dependency_keys(key)
        if missing_dep_keys:
            self._schedule_auto_restart(key, reason="dependencies_unavailable")
            return

        started = False
        try:
            started = bool(self.facade.start_service(key))
        except Exception:
            started = False

        if started:
            self._refresh_console_logs()
            if _launcher_logger:
                try:
                    _launcher_logger.info(
                        "service_auto_restart_succeeded",
                        service_key=key, reason=reason,
                        attempt=self._auto_restart_attempts.get(key, 0),
                    )
                except Exception:
                    pass
            return

        self._schedule_auto_restart(key, reason="start_failed")
