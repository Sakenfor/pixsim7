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


@dataclass
class MigrationHead:
    """Represents a migration head (branch endpoint)."""
    revision: str
    is_head: bool = False
    is_mergepoint: bool = False
    description: str = ""

    @property
    def short_revision(self) -> str:
        """Get shortened revision ID for display."""
        return self.revision[:12] if len(self.revision) > 12 else self.revision


@dataclass
class MigrationNode:
    """Represents a single migration in the history."""
    revision: str
    down_revision: Optional[str] = None
    description: str = ""
    is_current: bool = False
    is_head: bool = False
    is_mergepoint: bool = False
    is_branchpoint: bool = False
    is_applied: bool = False

    @property
    def short_revision(self) -> str:
        """Get shortened revision ID for display."""
        return self.revision[:8] if len(self.revision) > 8 else self.revision

    @property
    def status_emoji(self) -> str:
        """Get emoji representing migration status."""
        if self.is_current:
            return "📍"
        elif self.is_applied:
            return "✅"
        elif self.is_head:
            return "🎯"
        else:
            return "⏳"

    @property
    def status_text(self) -> str:
        """Get text description of status."""
        if self.is_current:
            return "Current"
        elif self.is_applied:
            return "Applied"
        elif self.is_head:
            return "Target"
        else:
            return "Pending"


def parse_heads() -> tuple[list[MigrationHead], Optional[str]]:
    """
    Parse alembic heads output to detect multiple branches.

    Returns:
        Tuple of (list of MigrationHead objects, error message if any)
    """
    code, out, err = _run_alembic('heads')
    if code != 0:
        return [], f"Cannot check heads: {err.strip() or out.strip()}"

    heads = []
    for line in out.strip().split('\n'):
        line = line.strip()
        if not line:
            continue

        # Parse format: "a786922d98aa (head)" or "a1b2c3d4e5f7 (head) (mergepoint)"
        parts = line.split()
        if not parts:
            continue

        revision = parts[0]
        is_head = '(head)' in line
        is_mergepoint = '(mergepoint)' in line

        # Try to extract description (everything after revision and markers)
        description = ""
        if len(parts) > 1:
            # Remove markers from description
            desc_parts = [p for p in parts[1:] if not p.startswith('(')]
            description = ' '.join(desc_parts)

        heads.append(MigrationHead(
            revision=revision,
            is_head=is_head,
            is_mergepoint=is_mergepoint,
            description=description
        ))

    return heads, None


def merge_heads(message: str = "merge migration branches") -> str:
    """
    Create a merge migration to unify multiple heads.

    Args:
        message: Commit message for the merge migration

    Returns:
        Human-readable result message
    """
    # Check if we actually have multiple heads
    heads, err = parse_heads()
    if err:
        return f"❌ Cannot check for multiple heads: {err}"

    if len(heads) < 2:
        return "✅ No merge needed - only one head exists"

    # Run the merge command
    code, out, err = _run_alembic('merge', '-m', message, 'heads')
    if code != 0:
        error_msg = err.strip() or out.strip()
        return f"❌ Merge failed: {error_msg}"

    # Extract the created revision ID from output
    result = out.strip()
    if 'Generating' in result:
        return f"✅ Merge migration created successfully!\n\n{result}"

    return result or '✅ Merge completed'


def get_pending_migrations() -> tuple[list[str], Optional[str]]:
    """
    Get list of pending migrations (not yet applied).

    Returns:
        Tuple of (list of migration descriptions, error message if any)
    """
    # Get current revision
    code, current_out, err = _run_alembic('current')
    if code != 0:
        return [], f"Cannot get current revision: {err.strip() or current_out.strip()}"

    current = current_out.strip()

    # Get all history
    code, history_out, err = _run_alembic('history')
    if code != 0:
        return [], f"Cannot get history: {err.strip() or history_out.strip()}"

    # Parse history to find pending migrations
    # This is a simplified implementation - could be enhanced to parse the actual chain
    if not current or '(no revision)' in current:
        # Database not initialized - all migrations are pending
        migrations = [line.strip() for line in history_out.split('\n') if line.strip() and '->' in line]
        return migrations, None

    # Extract current revision ID
    current_rev = current.split()[0] if current else None

    # Check if we're at head
    if '(head)' in current:
        return [], None  # No pending migrations

    # Get heads to determine target
    code, heads_out, err = _run_alembic('heads')
    if code != 0:
        return [], f"Cannot get heads: {err.strip() or heads_out.strip()}"

    # For now, return a simple message indicating migrations are pending
    # A more sophisticated implementation would parse the full chain
    return ["Pending migrations available (check 'View History' for details)"], None


def validate_revision_ids() -> tuple[bool, list[str]]:
    """
    Check if any revision IDs are too long for alembic_version table (VARCHAR(32)).

    Returns:
        Tuple of (all_valid, list of problematic revision IDs)
    """
    code, out, err = _run_alembic('history')
    if code != 0:
        return True, []  # Can't check, assume OK

    problematic = []
    for line in out.split('\n'):
        line = line.strip()
        if not line or not '->' in line:
            continue

        # Extract revision IDs from format like "rev1 -> rev2, description"
        parts = line.split(',')[0].split('->')
        for part in parts:
            rev = part.strip().split()[0] if part.strip() else ""
            if len(rev) > 32:
                problematic.append(f"{rev} ({len(rev)} chars)")

    return len(problematic) == 0, problematic


def parse_migration_history() -> tuple[list[MigrationNode], Optional[str]]:
    """
    Parse alembic history into structured MigrationNode objects.

    Returns:
        Tuple of (list of MigrationNode objects ordered from oldest to newest, error message if any)
    """
    # Get current revision
    code, current_out, err = _run_alembic('current')
    if code != 0:
        return [], f"Cannot get current revision: {err.strip() or current_out.strip()}"

    current_rev = None
    if current_out.strip():
        current_rev = current_out.strip().split()[0]

    # Get heads
    heads_list, heads_err = parse_heads()
    if heads_err:
        return [], heads_err

    head_revisions = {h.revision for h in heads_list}

    # Get full history with verbose output
    code, history_out, err = _run_alembic('history', '--verbose')
    if code != 0:
        return [], f"Cannot get history: {err.strip() or history_out.strip()}"

    migrations = []
    current_migration = None

    for line in history_out.split('\n'):
        line_stripped = line.strip()

        # Look for revision lines like "Rev: a786922d98aa (head)"
        if line_stripped.startswith('Rev:'):
            # Save previous migration if exists
            if current_migration:
                migrations.append(current_migration)

            # Parse revision line
            parts = line_stripped[4:].strip().split()
            if not parts:
                continue

            revision = parts[0]
            is_head = '(head)' in line_stripped
            is_mergepoint = '(mergepoint)' in line_stripped
            is_branchpoint = '(branchpoint)' in line_stripped

            current_migration = MigrationNode(
                revision=revision,
                is_head=is_head,
                is_mergepoint=is_mergepoint,
                is_branchpoint=is_branchpoint,
                is_current=(revision == current_rev),
                is_applied=(revision == current_rev)  # Simplified - all before current are applied
            )

        elif line_stripped.startswith('Parent:') and current_migration:
            # Parse parent/down_revision
            parts = line_stripped[7:].strip().split()
            if parts and parts[0] != '<base>':
                current_migration.down_revision = parts[0]

        elif current_migration and not line_stripped.startswith(('Rev:', 'Parent:', 'Path:', 'Branches', 'Revision ID:', 'Revises:', 'Create Date:')):
            # This is likely the description
            if line_stripped and current_migration.description == "":
                current_migration.description = line_stripped

    # Add last migration
    if current_migration:
        migrations.append(current_migration)

    # Mark all migrations before current as applied
    found_current = False
    for migration in reversed(migrations):
        if migration.revision == current_rev:
            found_current = True
            migration.is_applied = True
        elif found_current:
            migration.is_applied = True
        else:
            migration.is_applied = False

    return list(reversed(migrations)), None  # Return oldest to newest


def get_pending_migrations_detailed() -> tuple[list[MigrationNode], Optional[str]]:
    """
    Get detailed list of pending migrations that haven't been applied yet.

    Returns:
        Tuple of (list of pending MigrationNode objects, error message if any)
    """
    migrations, err = parse_migration_history()
    if err:
        return [], err

    # Filter to only pending (not applied) migrations
    pending = [m for m in migrations if not m.is_applied]

    return pending, None

