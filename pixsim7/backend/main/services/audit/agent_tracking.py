"""Agent run lifecycle and git commit audit tracking.

Centralises all agent-activity tracking logic so API routes stay thin.

Usage:
    from pixsim7.backend.main.services.audit.agent_tracking import AgentTrackingService

    svc = AgentTrackingService(db)
    run = await svc.create_run(profile_id="my-agent", run_id=run_id, token_jti=jti)
    await svc.record_git_commit(actor="agent:my-agent", commit_sha="abc123", ...)
    await svc.complete_run(run_id, status="completed", summary={...})
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from pixsim7.backend.main.domain.platform.agent_profile import AgentRun
from pixsim7.backend.main.domain.platform.entity_audit import EntityAudit
from pixsim7.backend.main.services.audit.emit import emit_audit
from pixsim7.backend.main.shared.datetime_utils import utcnow


class AgentTrackingService:
    """Encapsulates agent run lifecycle and commit audit operations."""

    def __init__(self, db: AsyncSession):
        self.db = db

    # ── Runs ─────────────────────────────────────────────────────

    async def create_run(
        self,
        *,
        profile_id: str,
        run_id: str,
        token_jti: Optional[str] = None,
    ) -> AgentRun:
        """Create a new agent run (called during token minting)."""
        run = AgentRun(
            profile_id=profile_id,
            run_id=run_id,
            status="running",
            token_jti=token_jti,
        )
        self.db.add(run)
        return run

    async def complete_run(
        self,
        run_id: str,
        *,
        status: str = "completed",
        summary: Optional[Dict[str, Any]] = None,
        actor: str = "system",
    ) -> AgentRun:
        """Mark an agent run as completed or failed.

        Raises:
            LookupError: Run not found.
            ValueError: Run already in terminal state, or invalid status.
        """
        stmt = select(AgentRun).where(AgentRun.run_id == run_id)
        run = (await self.db.execute(stmt)).scalar_one_or_none()
        if not run:
            raise LookupError(f"Agent run not found: {run_id}")
        if run.status != "running":
            raise ValueError(f"Run already {run.status}")

        valid = {"completed", "failed"}
        if status not in valid:
            raise ValueError(f"Status must be one of: {', '.join(valid)}")

        run.status = status
        run.ended_at = utcnow()
        if summary:
            run.summary = {**(run.summary or {}), **summary}

        await emit_audit(
            self.db,
            domain="agent",
            entity_type="agent_run",
            entity_id=run_id,
            entity_label=run.profile_id,
            action="status_changed",
            field="status",
            old_value="running",
            new_value=status,
            actor=actor,
        )
        return run

    async def list_runs(
        self,
        *,
        profile_id: Optional[str] = None,
        status: Optional[str] = None,
        limit: int = 50,
    ) -> List[AgentRun]:
        """Query agent runs with optional filters."""
        stmt = select(AgentRun).order_by(AgentRun.started_at.desc()).limit(limit)
        if profile_id:
            stmt = stmt.where(AgentRun.profile_id == profile_id)
        if status:
            stmt = stmt.where(AgentRun.status == status)
        return list((await self.db.execute(stmt)).scalars().all())

    async def get_run(self, run_id: str) -> Optional[AgentRun]:
        """Fetch a single run by run_id."""
        stmt = select(AgentRun).where(AgentRun.run_id == run_id)
        return (await self.db.execute(stmt)).scalar_one_or_none()

    # ── Git Commit Audit ─────────────────────────────────────────

    async def record_git_commit(
        self,
        *,
        actor: str,
        commit_sha: str,
        message: str,
        branch: Optional[str] = None,
        files_changed: Optional[List[str]] = None,
        insertions: Optional[int] = None,
        deletions: Optional[int] = None,
        agent_id: Optional[str] = None,
        agent_type: Optional[str] = None,
        run_id: Optional[str] = None,
    ) -> EntityAudit:
        """Record a git commit and link it to the active run (if any).

        Returns the EntityAudit entry.
        """
        extra: Dict[str, Any] = {"message": message}
        if branch:
            extra["branch"] = branch
        if files_changed:
            extra["files_changed"] = files_changed[:100]
            extra["files_count"] = len(files_changed)
        if insertions is not None:
            extra["insertions"] = insertions
        if deletions is not None:
            extra["deletions"] = deletions
        if agent_id:
            extra["agent_id"] = agent_id
        if agent_type:
            extra["agent_type"] = agent_type

        if run_id:
            extra["run_id"] = run_id
            # Append commit SHA to the run's summary for quick lookup
            run = await self.get_run(run_id)
            if run and run.status == "running":
                summary = run.summary or {}
                commits = summary.get("commits", [])
                commits.append(commit_sha)
                summary["commits"] = commits
                summary["last_commit_at"] = utcnow().isoformat()
                run.summary = summary

        return await emit_audit(
            self.db,
            domain="agent",
            entity_type="git_commit",
            entity_id=commit_sha,
            entity_label=message[:120],
            action="created",
            actor=actor,
            commit_sha=commit_sha,
            extra=extra,
        )

    async def list_git_commits(
        self,
        *,
        profile_id: Optional[str] = None,
        run_id: Optional[str] = None,
        limit: int = 50,
    ) -> List[EntityAudit]:
        """Query audited git commits with optional filters."""
        stmt = (
            select(EntityAudit)
            .where(
                EntityAudit.domain == "agent",
                EntityAudit.entity_type == "git_commit",
            )
            .order_by(EntityAudit.timestamp.desc())
            .limit(limit)
        )
        if profile_id:
            stmt = stmt.where(EntityAudit.actor == f"agent:{profile_id}")
        if run_id:
            stmt = stmt.where(EntityAudit.extra["run_id"].as_string() == run_id)
        return list((await self.db.execute(stmt)).scalars().all())
