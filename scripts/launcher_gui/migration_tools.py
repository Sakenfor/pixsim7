"""Alembic migration helpers for Launcher GUI.

Provides lightweight wrappers around alembic command-line usage.
Assumes alembic.ini resides at repo root.
"""
from __future__ import annotations
import subprocess
import os
import shutil
from dataclasses import dataclass
from typing import Optional

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
ALEMBIC_INI = os.path.join(ROOT, 'alembic.ini')


def _run_alembic(*args: str, timeout: int = 60) -> tuple[int, str, str]:
    """
    Run alembic command with proper error handling and validation.

    Args:
        args: Command arguments to pass to alembic
        timeout: Maximum execution time in seconds (default: 60)

    Returns:
        Tuple of (return_code, stdout, stderr)
    """
    # Pre-flight checks
    if not shutil.which('alembic'):
        return 1, "", "ERROR: alembic command not found. Please ensure alembic is installed in your environment."

    if not os.path.exists(ALEMBIC_INI):
        return 1, "", f"ERROR: alembic.ini not found at {ALEMBIC_INI}. Check your repository setup."

    cmd = ['alembic', '-c', ALEMBIC_INI, *args]

    try:
        proc = subprocess.Popen(
            cmd,
            cwd=ROOT,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True
        )
        out, err = proc.communicate(timeout=timeout)
        return proc.returncode, out, err

    except subprocess.TimeoutExpired:
        # Kill the process if it times out
        try:
            proc.kill()
            proc.communicate()  # Clean up
        except Exception:
            pass
        return 1, "", f"ERROR: Migration command timed out after {timeout} seconds. This may indicate a database connectivity issue or a migration that requires manual intervention."

    except PermissionError:
        return 1, "", "ERROR: Permission denied when running alembic. Check file permissions and user privileges."

    except Exception as e:
        return 1, "", f"ERROR: Unexpected error running alembic: {type(e).__name__}: {str(e)}"


def get_current_revision() -> str:
    code, out, err = _run_alembic('current')
    if code != 0:
        return f"error: {err.strip() or out.strip()}"
    return out.strip() or '(no revision)'


def get_heads() -> str:
    code, out, err = _run_alembic('heads')
    if code != 0:
        return f"error: {err.strip() or out.strip()}"
    return out.strip() or '(no heads)'


def get_history(limit: int = 20) -> str:
    code, out, err = _run_alembic('history', f'-n {limit}')
    if code != 0:
        return f"error: {err.strip() or out.strip()}"
    return out.strip()


def upgrade_head() -> str:
    code, out, err = _run_alembic('upgrade', 'head')
    if code != 0:
        return f"upgrade failed: {err.strip() or out.strip()}"
    return out.strip() or 'upgraded to head'


def downgrade_one() -> str:
    code, out, err = _run_alembic('downgrade', '-1')
    if code != 0:
        return f"downgrade failed: {err.strip() or out.strip()}"
    return out.strip() or 'downgraded -1'


def stamp_head() -> str:
    code, out, err = _run_alembic('stamp', 'head')
    if code != 0:
        return f"stamp failed: {err.strip() or out.strip()}"
    return out.strip() or 'stamped head'

