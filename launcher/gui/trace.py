"""Startup tracing utility for the launcher."""
import os
from datetime import datetime

try:
    from ..core.paths import launcher_log_file
except Exception:
    from launcher.core.paths import launcher_log_file

STARTUP_TRACE_ENABLED = os.getenv("PIXSIM_LAUNCHER_TRACE", "0").lower() in {"1", "true", "yes", "on"}


def _startup_trace(message: str) -> None:
    """Optional startup tracing guarded by PIXSIM_LAUNCHER_TRACE env flag."""
    if not STARTUP_TRACE_ENABLED:
        return
    try:
        trace_path = launcher_log_file("startup_trace.log")
        trace_path.parent.mkdir(parents=True, exist_ok=True)
        with trace_path.open('a', encoding='utf-8') as f:
            f.write(f"{datetime.now().isoformat()} {message}\n")
    except Exception:
        pass
