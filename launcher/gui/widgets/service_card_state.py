"""Value-object snapshot of everything a ServiceCard needs to render.

Built from a core.ServiceState; the card never reaches back into the
state object.  Comparing old vs new state lets the card skip widget
updates that haven't changed.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional

try:
    from ..status import HealthStatus
except ImportError:
    from status import HealthStatus


@dataclass(frozen=True, slots=True)
class ServiceCardState:
    health_status: HealthStatus = HealthStatus.STOPPED
    is_running: bool = False
    tool_available: bool = True
    tool_check_message: str = ""
    externally_managed: bool = False
    requested_running: bool = False
    last_error_line: str = ""
    effective_pid: Optional[int] = None
    card_details: Optional[dict] = field(default=None, hash=False, compare=False)
    port: Optional[str] = None
    stopping: bool = False
    recent_log_lines: tuple[str, ...] = ()

    @property
    def health_class(self) -> str:
        if self.health_status == HealthStatus.UNHEALTHY:
            return "unhealthy"
        if self.externally_managed:
            return "external"
        return "normal"

    @property
    def has_card_details(self) -> bool:
        return isinstance(self.card_details, dict) and bool(self.card_details)


def build_card_state(state, *, stopping: bool = False) -> ServiceCardState:
    """Build a ServiceCardState snapshot from a core.ServiceState (or legacy ServiceProcess)."""
    # Support both core.ServiceState (.health) and legacy ServiceProcess (.health_status)
    health = getattr(state, "health", None) or getattr(state, "health_status", HealthStatus.STOPPED)
    is_running = health in (HealthStatus.STARTING, HealthStatus.HEALTHY, HealthStatus.UNHEALTHY)

    # PID: core.ServiceState has .pid and .detected_pid
    pid = getattr(state, "pid", None) or getattr(state, "detected_pid", None)
    # Legacy fallback: ServiceProcess has get_effective_pid()
    if pid is None:
        get_pid = getattr(state, "get_effective_pid", None)
        if callable(get_pid):
            pid = get_pid()

    # Port from definition URL
    port = None
    defn = getattr(state, "definition", None) or getattr(state, "defn", None)
    url = getattr(defn, "url", None) if defn else None
    if url:
        try:
            port = url.split(":")[-1].split("/")[0]
        except Exception:
            pass

    # Recent log lines for tooltip
    recent: list[str] = []
    try:
        buf = getattr(state, "log_buffer", None)
        if buf:
            n = len(buf)
            for i in range(min(2, n)):
                line = str(buf[n - 1 - i]).strip()
                if line:
                    recent.append(line)
    except (IndexError, RuntimeError):
        pass

    return ServiceCardState(
        health_status=health,
        is_running=is_running,
        tool_available=getattr(state, "tool_available", True),
        tool_check_message=getattr(state, "tool_check_message", ""),
        externally_managed=getattr(state, "externally_managed", False),
        requested_running=getattr(state, "requested_running", False),
        last_error_line=getattr(state, "last_error", "") or getattr(state, "last_error_line", ""),
        effective_pid=pid,
        card_details=getattr(state, "card_details", None),
        port=port,
        stopping=stopping,
        recent_log_lines=tuple(recent),
    )
