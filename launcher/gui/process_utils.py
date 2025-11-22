"""
Utility functions for process management and PID detection.
"""
import os
import subprocess
from typing import Optional, Dict, Any
import json


def find_pid_by_port(port: int) -> Optional[int]:
    """
    Find the PID of a process listening on the given port.
    Works on both Windows and Unix-like systems.

    Returns:
        PID as integer if found, None otherwise
    """
    try:
        if os.name == 'nt':
            # Windows: use netstat to find PID
            # Use findstr to filter output immediately, much faster than parsing everything
            result = subprocess.run(
                f'netstat -ano | findstr ":{port} " | findstr "LISTENING"',
                capture_output=True,
                text=True,
                timeout=2,  # Reduced from 5s to 2s
                shell=True,  # Required for pipe commands on Windows
                creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0
            )
            if result.returncode != 0 or not result.stdout.strip():
                return None

            # Parse netstat output for listening port
            # Format: TCP    0.0.0.0:8001           0.0.0.0:0              LISTENING       12345
            for line in result.stdout.splitlines():
                parts = line.split()
                if len(parts) >= 5:
                    # Extract port from address (0.0.0.0:8001 or [::]:8001)
                    addr = parts[1]
                    if ':' in addr:
                        try:
                            found_port = int(addr.split(':')[-1])
                            if found_port == port:
                                # Last column is PID
                                return int(parts[-1])
                        except (ValueError, IndexError):
                            continue
        else:
            # Unix: use lsof to find PID
            result = subprocess.run(
                ['lsof', '-i', f':{port}', '-t'],
                capture_output=True,
                text=True,
                timeout=2  # Reduced from 5s to 2s
            )
            if result.returncode == 0 and result.stdout.strip():
                return int(result.stdout.strip().split('\n')[0])
    except Exception:
        pass

    return None


def kill_process_by_pid(pid: int, force: bool = False) -> bool:
    """
    Kill a process by PID, handling process trees properly.

    Args:
        pid: Process ID to kill
        force: If True, use force kill immediately (Unix only - Windows always force kills)

    Returns:
        True if successful, False otherwise
    """
    if not pid:
        return False

    try:
        if os.name == 'nt':
            # Windows: always use /F (force) for detected processes since we don't have
            # a graceful shutdown mechanism for them. Processes not started by launcher
            # won't handle taskkill without /F properly.
            result = subprocess.run(
                ['taskkill', '/PID', str(pid), '/T', '/F'],
                capture_output=True,
                text=True,
                timeout=10,
                shell=False  # Explicitly disable shell to avoid Git Bash path issues
            )
            # Windows taskkill returns:
            # - 0: Success
            # - 128: Process not found (treat as success - process is gone)
            # - Other: Actual failure (permission denied, etc.)
            if result.returncode == 0:
                return True
            elif result.returncode == 128 or 'not found' in (result.stderr or '').lower():
                # Process doesn't exist - treat as success
                try:
                    from logger import launcher_logger
                    if launcher_logger:
                        launcher_logger.info(
                            "taskkill_process_not_found",
                            pid=pid,
                            msg="Process already gone"
                        )
                except Exception:
                    pass
                return True
            else:
                # Actual error - log it
                try:
                    from logger import launcher_logger
                    if launcher_logger:
                        launcher_logger.warning(
                            "taskkill_failed",
                            pid=pid,
                            returncode=result.returncode,
                            stderr=result.stderr.strip() if result.stderr else "",
                            stdout=result.stdout.strip() if result.stdout else ""
                        )
                except Exception:
                    pass
                return False
        else:
            # Unix: kill process group
            import signal
            try:
                pgid = os.getpgid(pid)
                sig = signal.SIGKILL if force else signal.SIGTERM
                os.killpg(pgid, sig)
                return True
            except Exception:
                # Fallback to killing single process
                sig = signal.SIGKILL if force else signal.SIGTERM
                os.kill(pid, sig)
                return True
    except Exception:
        return False


def _get_windows_process_info(pid: int) -> Optional[Dict[str, Any]]:
    """Return process info for a PID on Windows using PowerShell CIM.

    Keys: ProcessId, ParentProcessId, Name, CommandLine
    """
    if os.name != 'nt' or not pid:
        return None
    try:
        cmd = [
            'powershell', '-NoProfile', '-Command',
            f"$p=Get-CimInstance Win32_Process -Filter 'ProcessId={pid}'; if($p){{ $p | Select-Object ProcessId,ParentProcessId,Name,CommandLine | ConvertTo-Json -Compress }}"
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=4)
        out = (result.stdout or '').strip()
        if not out:
            return None
        try:
            data = json.loads(out)
            # Normalize keys
            return {
                'ProcessId': data.get('ProcessId'),
                'ParentProcessId': data.get('ParentProcessId'),
                'Name': data.get('Name') or '',
                'CommandLine': data.get('CommandLine') or '',
            }
        except Exception:
            return None
    except Exception:
        return None


def find_uvicorn_root_pid_windows(child_pid: int) -> Optional[int]:
    """Walk parent chain to find the uvicorn reloader/root PID on Windows.

    Rationale: In --reload mode, uvicorn spawns a reloader parent that respawns
    the worker. Killing only the listening worker causes immediate respawn.
    We look for an ancestor whose CommandLine references uvicorn or any backend-style API module.
    """
    if os.name != 'nt' or not child_pid:
        return None

    visited = set()
    current = child_pid
    uvicorn_root: Optional[int] = None

    for _ in range(12):  # reasonable bound to avoid infinite loops
        if current in visited or not current:
            break
        visited.add(current)

        info = _get_windows_process_info(current)
        if not info:
            break
        cmd = (info.get('CommandLine') or '').lower()
        name = (info.get('Name') or '').lower()

        # Heuristics: uvicorn in command line, or python running any backend-style service
        if (
            'uvicorn' in cmd
            or 'pixsim7.backend.main' in cmd
            or 'pixsim7.backend.generation' in cmd  # generation-api
            or 'pixsim7_backend.main' in cmd  # Legacy compatibility
            or 'pixsim7\\backend\\main\\main.py' in cmd
            or 'pixsim7/backend/main/main.py' in cmd
            or 'pixsim7\\backend\\generation\\main.py' in cmd  # generation-api
            or 'pixsim7/backend/generation/main.py' in cmd  # generation-api
            or 'pixsim7_backend\\main.py' in cmd  # Legacy compatibility
            or 'pixsim7_backend/main.py' in cmd  # Legacy compatibility
        ):
            uvicorn_root = info.get('ProcessId')
            # Keep walking to find the highest matching ancestor (if any)

        parent = info.get('ParentProcessId')
        if not parent or parent == current:
            break
        current = parent

    return uvicorn_root or None


def find_backend_candidate_pids_windows(port: Optional[int] = None) -> list[int]:
    """Find backend-related PIDs by CommandLine heuristics and optional port.

    Matches python/uvicorn processes whose command lines reference uvicorn or
    pixsim7.backend (main, generation, or any other backend-style API).
    If port is provided, it prefers PIDs listening on that port.
    """
    if os.name != 'nt':
        return []
    candidates: list[int] = []
    try:
        # Fetch processes with command lines
        cmd = [
            'powershell', '-NoProfile', '-Command',
            (
                "Get-CimInstance Win32_Process | "
                "Where-Object { $_.Name -match 'python|uvicorn' -and $_.CommandLine } | "
                "Select-Object ProcessId,Name,CommandLine | ConvertTo-Json -Compress"
            )
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=8)
        out = (result.stdout or '').strip()
        if not out:
            return []
        try:
            data = json.loads(out)
            items = data if isinstance(data, list) else [data]
        except Exception:
            return []

        # Optional: collect PIDs by port
        pids_by_port: set[int] = set()
        if port:
            try:
                net = subprocess.run(
                    f'netstat -ano | findstr ":{port} " | findstr "LISTENING"',
                    capture_output=True,
                    text=True,
                    timeout=3,
                    shell=True
                )
                if net.returncode == 0 and net.stdout.strip():
                    for line in net.stdout.splitlines():
                        parts = line.split()
                        if len(parts) >= 5:
                            try:
                                pids_by_port.add(int(parts[-1]))
                            except Exception:
                                pass
            except Exception:
                pass

        for item in items:
            try:
                pid = int(item.get('ProcessId'))
                cmdl = (item.get('CommandLine') or '').lower()
                if (
                    'uvicorn' in cmdl
                    or 'pixsim7.backend.main' in cmdl
                    or 'pixsim7.backend.generation' in cmdl  # generation-api
                    or 'pixsim7_backend.main:app' in cmdl  # Legacy compatibility
                    or 'pixsim7\\backend\\main\\main.py' in cmdl
                    or 'pixsim7/backend/main/main.py' in cmdl
                    or 'pixsim7\\backend\\generation\\main.py' in cmdl  # generation-api
                    or 'pixsim7/backend/generation/main.py' in cmdl  # generation-api
                    or 'pixsim7_backend\\main.py' in cmdl  # Legacy compatibility
                    or 'pixsim7_backend/main.py' in cmdl  # Legacy compatibility
                ):
                    # If port provided and pid matches, prioritize by placing first
                    if port and pid in pids_by_port:
                        candidates.insert(0, pid)
                    else:
                        candidates.append(pid)
            except Exception:
                continue
    except Exception:
        return candidates
    # Deduplicate while preserving order
    seen = set()
    ordered = []
    for p in candidates:
        if p not in seen:
            seen.add(p)
            ordered.append(p)
    return ordered
