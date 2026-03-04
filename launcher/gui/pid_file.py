"""PID file management for launcher instance detection."""
import os
from pathlib import Path

try:
    from ..core.paths import LAUNCHER_STATE_DIR
except ImportError:
    from launcher.core.paths import LAUNCHER_STATE_DIR


def get_pid_file_path() -> Path:
    """Get the path to the launcher PID file."""
    LAUNCHER_STATE_DIR.mkdir(parents=True, exist_ok=True)
    return LAUNCHER_STATE_DIR / "launcher.pid"


def is_process_running(pid: int) -> bool:
    """Check if a process with given PID is running.

    Delegates to process_utils.is_process_alive for the actual check.
    """
    if not pid or pid <= 0:
        return False
    try:
        from .process_utils import is_process_alive
    except ImportError:
        from process_utils import is_process_alive
    return is_process_alive(pid)


def read_pid_file() -> tuple[bool, int | None]:
    """
    Read PID file and check if launcher is already running.

    Returns:
        (is_running, pid): Tuple of whether launcher is running and its PID
    """
    pid_file = get_pid_file_path()

    if not pid_file.exists():
        return False, None

    try:
        pid = int(pid_file.read_text().strip())

        # Check if process is actually running
        if is_process_running(pid):
            return True, pid
        else:
            # Stale PID file, remove it
            try:
                pid_file.unlink()
            except Exception:
                pass
            return False, None
    except (ValueError, OSError):
        # Invalid PID file, remove it
        try:
            pid_file.unlink()
        except Exception:
            pass
        return False, None


def write_pid_file() -> bool:
    """
    Write current process PID to PID file.

    Returns:
        True if successful, False otherwise
    """
    pid_file = get_pid_file_path()

    try:
        pid_file.write_text(str(os.getpid()))
        return True
    except Exception:
        return False


def remove_pid_file() -> bool:
    """
    Remove PID file.

    Returns:
        True if successful, False otherwise
    """
    pid_file = get_pid_file_path()

    try:
        if pid_file.exists():
            pid_file.unlink()
        return True
    except Exception:
        return False


def ensure_single_instance() -> tuple[bool, int | None]:
    """
    Ensure only one launcher instance is running.

    Returns:
        (can_proceed, existing_pid): Tuple of whether this instance can proceed
                                      and the PID of existing instance if any
    """
    is_running, existing_pid = read_pid_file()

    if is_running:
        return False, existing_pid

    # No existing instance, write our PID
    success = write_pid_file()
    if not success:
        # Could not write PID file, but proceed anyway
        pass

    return True, None
