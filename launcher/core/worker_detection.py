"""Single source of truth for detecting headless service processes by cmdline.

Both :class:`ProcessManager` (stale-orphan cleanup on start/stop) and
:class:`HealthManager` (externally-started detection + arq-worker liveness)
need to map a launcher service key to the unique substring(s) that identify
its Python process. They MUST agree: if one worker's selector cross-matches
another worker's process, PID attribution between the cards gets corrupted
(this previously flipped the "Worker (Generation)" card offline whenever the
generation-retry worker started). Keeping the selector map and the scan logic
here means there is exactly one copy instead of two hand-synced ones.

Selectors must be UNIQUE per worker. They all run ``python -m arq ...``, so
broad substrings like ``-m arq`` or bare ``arq_worker`` cross-match across
workers and must never be used. Note ``WorkerSettings`` is a substring of
``GenerationRetryWorkerSettings``/``SimulationWorkerSettings``/etc., so the
main worker must be qualified as ``arq_worker.WorkerSettings``.
"""
from __future__ import annotations

import logging
import os
import subprocess
from typing import List, Optional, Sequence

logger = logging.getLogger("launcher.core.worker_detection")

# service key -> unique cmdline substrings that identify its process.
WORKER_CMDLINE_SELECTORS: dict[str, List[str]] = {
    "worker": ["arq_worker.WorkerSettings"],
    "generation-retry": ["GenerationRetryWorkerSettings"],
    "simulation-worker": ["SimulationWorkerSettings"],
    "automation-worker": ["AutomationWorkerSettings"],
    "media-archive-worker": ["MediaArchiveWorkerSettings"],
    "ai-client": ["pixsim7.client", "-m pixsim7.client"],
}

# The arq worker families (everything in the selector map except ai-client).
# These use the PID + Redis health probe rather than an HTTP/port check.
ARQ_WORKER_KEYS = frozenset(WORKER_CMDLINE_SELECTORS) - {"ai-client"}


def resolve_selectors(
    service_key: str,
    definition_args: Optional[Sequence[str]] = None,
) -> List[str]:
    """Return the cmdline substrings that identify ``service_key``'s process.

    Resolution order:
      1. An explicit, unique selector from :data:`WORKER_CMDLINE_SELECTORS`.
      2. The first two definition args joined (the ``-m <module>`` pair).
      3. Empty — we have no confident way to identify the process, so we
         decline to match rather than risk a loose ``service_key`` substring
         match (the cross-match class of bug this module exists to prevent).
    """
    selectors = WORKER_CMDLINE_SELECTORS.get(service_key)
    if selectors:
        return list(selectors)
    args = list(definition_args or [])
    if len(args) >= 2:
        return [" ".join(args[:2])]
    return []


def scan_pids(
    service_key: str,
    *,
    definition_args: Optional[Sequence[str]] = None,
) -> List[int]:
    """Scan running ``python`` processes for ones matching ``service_key``.

    Uses PowerShell ``Get-CimInstance`` on Windows (wmic is deprecated) and
    ``ps aux`` elsewhere. Always excludes the launcher's own PID. Returns all
    matches; callers wanting "is it running" can take the first. Returns an
    empty list when no confident selector exists or on any scan error.
    """
    search_terms = resolve_selectors(service_key, definition_args)
    if not search_terms:
        return []

    pids: List[int] = []
    own_pid = os.getpid()
    try:
        if os.name == "nt":
            ps_cmd = (
                "Get-CimInstance Win32_Process -Filter \"Name='python.exe'\" "
                "| ForEach-Object { \"$($_.ProcessId)|$($_.CommandLine)\" }"
            )
            result = subprocess.run(
                ["powershell", "-NoProfile", "-Command", ps_cmd],
                capture_output=True, text=True, timeout=10,
            )
            if result.returncode == 0:
                for line in result.stdout.splitlines():
                    line = line.strip()
                    if "|" not in line:
                        continue
                    pid_str, cmdline = line.split("|", 1)
                    if any(term in cmdline for term in search_terms):
                        try:
                            pid = int(pid_str.strip())
                        except ValueError:
                            continue
                        if pid != own_pid:
                            pids.append(pid)
        else:
            result = subprocess.run(
                ["ps", "aux"], capture_output=True, text=True, timeout=5,
            )
            if result.returncode == 0:
                for line in result.stdout.splitlines():
                    if any(term in line for term in search_terms):
                        parts = line.split()
                        if len(parts) >= 2:
                            try:
                                pid = int(parts[1])
                            except ValueError:
                                continue
                            if pid != own_pid:
                                pids.append(pid)
    except Exception as exc:
        logger.debug(
            "worker_pid_scan_failed service=%s error_type=%s error=%s",
            service_key, type(exc).__name__, str(exc),
        )
    return pids
