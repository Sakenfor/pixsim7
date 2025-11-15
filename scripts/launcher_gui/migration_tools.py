"""Alembic migration helpers for Launcher GUI.

Provides lightweight wrappers around alembic command-line usage.
Assumes alembic.ini resides at repo root.
"""
from __future__ import annotations
import subprocess
import os
import sys
import shutil
from dataclasses import dataclass
from typing import Optional

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
ALEMBIC_INI = os.path.join(ROOT, 'alembic.ini')


def _run_alembic(*args: str, timeout: int = 60) -> tuple[int, str, str]:
    """
    Run alembic command with proper error handling and validation.

    Uses 'python -m alembic' for better virtual environment compatibility.

    Args:
        args: Command arguments to pass to alembic
        timeout: Maximum execution time in seconds (default: 60)

    Returns:
        Tuple of (return_code, stdout, stderr)
    """
    # Pre-flight checks
    if not os.path.exists(ALEMBIC_INI):
        return 1, "", f"ERROR: alembic.ini not found at {ALEMBIC_INI}. Check your repository setup."

    # Try python -m alembic first (works in virtual environments)
    # Fall back to direct alembic command if module not found
    try:
        # Test if alembic module is available
        test_result = subprocess.run(
            [sys.executable, '-m', 'alembic', '--version'],
            capture_output=True,
            text=True,
            timeout=5
        )
        if test_result.returncode == 0:
            # Use python -m alembic (best for venvs)
            cmd = [sys.executable, '-m', 'alembic', '-c', ALEMBIC_INI, *args]
        else:
            raise FileNotFoundError("alembic module not found")
    except (FileNotFoundError, subprocess.TimeoutExpired):
        # Fall back to direct alembic command
        if not shutil.which('alembic'):
            return 1, "", "ERROR: alembic not found. Please ensure alembic is installed: pip install alembic"
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


def check_migration_safety() -> tuple[bool, str]:
    """
    Perform pre-migration safety checks.

    Returns:
        Tuple of (is_safe, message)
    """
    # Check 1: Can we connect to the database and query current revision?
    code, out, err = _run_alembic('current')
    if code != 0:
        error_msg = err.strip() or out.strip()
        if 'could not connect' in error_msg.lower() or 'connection' in error_msg.lower():
            return False, "Cannot connect to database. Check DATABASE_URL in .env and ensure database is running."
        elif 'no such table' in error_msg.lower() or 'does not exist' in error_msg.lower():
            return False, "Database exists but migration tracking table missing. Run 'alembic stamp head' if schema is current, or contact administrator."
        else:
            return False, f"Database check failed: {error_msg}"

    # Check 2: Look for migration conflicts (multiple heads, branches)
    has_conflict, conflict_msg = check_for_conflicts()
    if has_conflict:
        return False, conflict_msg

    # Check 3: Verify alembic configuration integrity
    code, out, err = _run_alembic('check')
    if code != 0:
        # Note: 'alembic check' returns non-zero if there are pending model changes
        # This is informational, not necessarily an error for migrations
        if 'target database is not up to date' in out.lower() or 'detected' in out.lower():
            # This is expected when there are pending migrations - not an error
            pass
        else:
            # Actual configuration error
            error_msg = err.strip() or out.strip()
            return False, f"Alembic configuration issue: {error_msg}"

    return True, "Pre-migration checks passed. Safe to proceed."


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


def check_for_conflicts() -> tuple[bool, str]:
    """
    Check for migration conflicts (multiple heads, broken chains).

    Returns:
        Tuple of (has_conflict, message)
    """
    # Check for multiple heads (branching)
    code, out, err = _run_alembic('heads')
    if code != 0:
        return True, f"Cannot check for conflicts: {err.strip() or out.strip()}"

    heads = [line.strip() for line in out.strip().split('\n') if line.strip()]
    if len(heads) > 1:
        return True, f"⚠️ Multiple migration heads detected ({len(heads)} branches). This indicates branching in migration history. Run 'alembic merge' to resolve."

    # Check if current revision is in the history chain
    code, out, err = _run_alembic('current')
    if code != 0:
        return True, f"Cannot verify current revision: {err.strip() or out.strip()}"

    current = out.strip()
    if current and '(head)' not in current:
        # We have a current revision but it's not at head
        code, heads_out, _ = _run_alembic('heads')
        if code == 0 and heads_out.strip():
            head_rev = heads_out.strip().split()[0] if heads_out.strip() else None
            current_rev = current.split()[0] if current else None
            if head_rev and current_rev and head_rev != current_rev:
                # This is expected - there are pending migrations
                # Not a conflict, just out of date
                pass

    return False, "No migration conflicts detected."


def upgrade_head() -> str:
    """
    Upgrade database to head revision with safety checks.

    Returns:
        Human-readable result message
    """
    # Run safety checks first
    safe, msg = check_migration_safety()
    if not safe:
        return f"❌ Pre-migration check failed: {msg}"

    code, out, err = _run_alembic('upgrade', 'head')
    if code != 0:
        return f"upgrade failed: {err.strip() or out.strip()}"
    return out.strip() or 'upgraded to head'


def downgrade_one() -> str:
    """
    Downgrade database by one revision.

    ⚠️ WARNING: This can cause data loss!

    Returns:
        Human-readable result message
    """
    # Check database connectivity
    code, out, err = _run_alembic('current')
    if code != 0:
        return f"❌ Cannot connect to database: {err.strip() or out.strip()}"

    code, out, err = _run_alembic('downgrade', '-1')
    if code != 0:
        return f"downgrade failed: {err.strip() or out.strip()}"
    return out.strip() or 'downgraded -1'


def stamp_head() -> str:
    """
    Mark database as current version without running migrations.

    ⚠️ WARNING: Use only if schema already matches target revision!

    Returns:
        Human-readable result message
    """
    # Check database connectivity
    code, out, err = _run_alembic('current')
    if code != 0:
        return f"❌ Cannot connect to database: {err.strip() or out.strip()}"

    code, out, err = _run_alembic('stamp', 'head')
    if code != 0:
        return f"stamp failed: {err.strip() or out.strip()}"
    return out.strip() or 'stamped head'

