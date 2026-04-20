"""Squash Routes — guided migration-chain collapse.

Non-destructive by design: ``generate`` creates a new baseline migration
file but leaves the old chain intact.  ``verify`` loads the baseline into a
throwaway DB and diffs against live.  ``discard`` deletes the generated
file.  The final commit step (``alembic stamp`` + archiving old migrations)
stays manual on purpose — those are the destructive parts.
"""
from __future__ import annotations

from fastapi import APIRouter

router = APIRouter(prefix="/squash", tags=["squash"])


@router.get("/{db_id}/status")
async def squash_status(db_id: str) -> dict:
    """Report whether a baseline file currently exists for this db_id."""
    from launcher.core.squash_tools import baseline_status
    return {"db_id": db_id, **baseline_status(db_id)}


@router.post("/{db_id}/generate")
async def squash_generate(db_id: str) -> dict:
    """Generate a baseline migration file from the live schema."""
    from launcher.core.squash_tools import generate_baseline
    result = generate_baseline(db_id)
    return {"db_id": db_id, **result}


@router.post("/{db_id}/verify")
async def squash_verify(db_id: str) -> dict:
    """Load the baseline into a throwaway DB and diff against live."""
    from launcher.core.squash_tools import verify_baseline
    result = verify_baseline(db_id)
    return {"db_id": db_id, **result}


@router.delete("/{db_id}/baseline")
async def squash_discard(db_id: str) -> dict:
    """Delete the generated baseline file."""
    from launcher.core.squash_tools import discard_baseline
    result = discard_baseline(db_id)
    return {"db_id": db_id, **result}


@router.post("/{db_id}/archive-old")
async def squash_archive_old(db_id: str) -> dict:
    """Move every migration file except the baseline into
    ``versions_archive/<timestamp>/``.  Reversible by moving files back
    manually.  Does NOT stamp the live DB — that's a separate step.
    """
    from launcher.core.squash_tools import archive_old_migrations
    result = archive_old_migrations(db_id)
    return {"db_id": db_id, **result}
