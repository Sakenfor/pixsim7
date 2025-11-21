"""
Admin API endpoints for Alembic database migrations
"""
import subprocess
import sys
import os
from pathlib import Path
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional

router = APIRouter()


class MigrationStatus(BaseModel):
    """Current migration status"""
    current_revision: Optional[str]
    head_revision: Optional[str]
    is_up_to_date: bool
    pending_migrations: list[str]
    history: list[dict]


class MigrationOperation(BaseModel):
    """Result of a migration operation"""
    success: bool
    message: str
    output: str


def get_alembic_config_path() -> Path:
    """Get path to alembic.ini (repo root)"""
    # Assuming we're in pixsim7/backend/main/api/admin/migrations.py
    # Go up to repo root: ../../../alembic.ini
    current_file = Path(__file__)
    repo_root = current_file.parent.parent.parent.parent
    return repo_root / "alembic.ini"


def run_alembic_command(args: list[str]) -> tuple[bool, str]:
    """
    Run alembic command and return (success, output)

    Uses 'python -m alembic' for better virtual environment compatibility.

    Args:
        args: Command arguments (e.g., ['current'], ['upgrade', 'head'])

    Returns:
        Tuple of (success: bool, output: str)
    """
    config_path = get_alembic_config_path()

    if not config_path.exists():
        return False, f"ERROR: Alembic config not found at {config_path}. Check repository structure."

    # Change to repo root directory for proper path resolution
    repo_root = config_path.parent

    # Prefer 'python -m alembic' for better virtual environment support
    # This ensures we use the same Python interpreter as the running API
    try:
        # Test if alembic module is available
        test_result = subprocess.run(
            [sys.executable, '-m', 'alembic', '--version'],
            capture_output=True,
            text=True,
            timeout=5,
            cwd=str(repo_root)
        )
        if test_result.returncode == 0:
            # Use python -m alembic
            cmd = [sys.executable, '-m', 'alembic', '-c', str(config_path)] + args
        else:
            # Fall back to direct alembic command
            cmd = ['alembic', '-c', str(config_path)] + args
    except (FileNotFoundError, subprocess.TimeoutExpired):
        # Fall back to direct alembic command
        cmd = ['alembic', '-c', str(config_path)] + args

    try:
        result = subprocess.run(
            cmd,
            cwd=str(repo_root),
            capture_output=True,
            text=True,
            timeout=60  # 1 minute timeout
        )

        output = result.stdout + result.stderr
        return result.returncode == 0, output

    except subprocess.TimeoutExpired:
        return False, "ERROR: Migration command timed out after 60 seconds. This may indicate a database connectivity issue or a migration requiring manual intervention. Check database connection and logs."

    except FileNotFoundError:
        return False, "ERROR: alembic command not found. Please ensure alembic is installed in the Python environment running this API."

    except PermissionError as e:
        return False, f"ERROR: Permission denied when running alembic. Check file permissions and user privileges. Details: {str(e)}"

    except OSError as e:
        return False, f"ERROR: System error running alembic. This may be due to path issues or resource limits. Details: {str(e)}"

    except Exception as e:
        return False, f"ERROR: Unexpected error running alembic: {type(e).__name__}: {str(e)}"


@router.get("/admin/migrations/status", response_model=MigrationStatus)
async def get_migration_status():
    """
    Get current migration status
    
    Returns current revision, head revision, and whether DB is up to date
    """
    # Get current revision
    success_current, current_output = run_alembic_command(["current"])
    current_revision = None
    if success_current and current_output.strip():
        # Parse output like "abc123 (head)" or "abc123"
        parts = current_output.strip().split()
        if parts:
            current_revision = parts[0]
    
    # Get head revision
    success_heads, heads_output = run_alembic_command(["heads"])
    head_revision = None
    if success_heads and heads_output.strip():
        parts = heads_output.strip().split()
        if parts:
            head_revision = parts[0]
    
    # Get history
    success_history, history_output = run_alembic_command(["history"])
    history = []
    if success_history:
        for line in history_output.strip().split("\n"):
            if line.strip() and not line.startswith("Rev:"):
                history.append({"line": line.strip()})
    
    # Determine if up to date
    is_up_to_date = (
        current_revision is not None 
        and head_revision is not None 
        and current_revision == head_revision
    )
    
    # Get pending migrations (simplified - just check if current != head)
    pending = []
    if not is_up_to_date and head_revision:
        pending.append(f"Pending: {current_revision or 'none'} -> {head_revision}")
    
    return MigrationStatus(
        current_revision=current_revision,
        head_revision=head_revision,
        is_up_to_date=is_up_to_date,
        pending_migrations=pending,
        history=history[:10]  # Limit to 10 most recent
    )


@router.post("/admin/migrations/upgrade", response_model=MigrationOperation)
async def upgrade_migrations(target: str = "head"):
    """
    Upgrade database to target revision (default: head)
    
    Args:
        target: Target revision (default "head")
    """
    success, output = run_alembic_command(["upgrade", target])
    
    if not success:
        raise HTTPException(
            status_code=500,
            detail=f"Migration upgrade failed: {output}"
        )
    
    return MigrationOperation(
        success=True,
        message=f"Successfully upgraded to {target}",
        output=output
    )


@router.post("/admin/migrations/downgrade", response_model=MigrationOperation)
async def downgrade_migrations(target: str = "-1"):
    """
    Downgrade database to target revision
    
    Args:
        target: Target revision (default "-1" for one step back)
        
    ⚠️ USE WITH CAUTION: Can cause data loss!
    """
    success, output = run_alembic_command(["downgrade", target])
    
    if not success:
        raise HTTPException(
            status_code=500,
            detail=f"Migration downgrade failed: {output}"
        )
    
    return MigrationOperation(
        success=True,
        message=f"Successfully downgraded to {target}",
        output=output
    )


@router.post("/admin/migrations/stamp", response_model=MigrationOperation)
async def stamp_migrations(revision: str = "head"):
    """
    Stamp database with revision without running migrations
    
    Useful for marking DB as up-to-date when schema already matches.
    
    Args:
        revision: Revision to stamp (default "head")
    """
    success, output = run_alembic_command(["stamp", revision])
    
    if not success:
        raise HTTPException(
            status_code=500,
            detail=f"Migration stamp failed: {output}"
        )
    
    return MigrationOperation(
        success=True,
        message=f"Successfully stamped to {revision}",
        output=output
    )
