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
from pixsim7.backend.main.domain.user import UserSession
from pixsim7.backend.main.services.audit.service import AuditService
from pixsim7.backend.main.shared.datetime_utils import utcnow


class AgentTrackingService:
    """Encapsulates agent run lifecycle and commit audit operations."""

    def __init__(self, db: AsyncSession):
        self.db = db
        self._audit = AuditService(db)

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

        await self._audit.record(
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

        # Auto-release any open plan-participant claims owned by this run so a
        # crashed/finished agent doesn't keep a checkpoint claimed. Best-effort
        # and lazily imported (api layer) — must never break run completion.
        try:
            from pixsim7.backend.main.api.v1.plans.helpers import (
                release_claims_for_run,
            )

            await release_claims_for_run(self.db, run_id)
        except Exception:
            pass

        return run

    async def revoke_profile(
        self,
        profile_id: str,
        *,
        reason: str = "profile_revoked",
        actor: str = "system",
    ) -> Dict[str, int]:
        """Hard-revoke a profile: terminate every live run and revoke the
        ``UserSession`` backing each run's token.

        Pausing/archiving a profile only blocks *new* token mints; in-flight
        agent tokens keep working until their session is revoked. This makes
        revocation effective immediately — ``verify_token_claims`` checks
        ``session.is_valid()`` on the main auth path, so a revoked session
        rejects the very next request the agent makes.

        Idempotent: only acts on runs still ``running`` and sessions not yet
        revoked. Commits its own transaction (any pending changes on the
        session, e.g. the profile status update, are flushed with it).

        Plan ``scoped-agent-authorization`` (session-kill hard revocation).
        """
        stmt = select(AgentRun).where(
            AgentRun.profile_id == profile_id,
            AgentRun.status == "running",
        )
        runs = list((await self.db.execute(stmt)).scalars().all())

        now = utcnow()
        token_jtis: List[str] = []
        for run in runs:
            run.status = "revoked"
            run.ended_at = now
            if run.token_jti:
                token_jtis.append(run.token_jti)
            await self._audit.record(
                domain="agent",
                entity_type="agent_run",
                entity_id=run.run_id,
                entity_label=run.profile_id,
                action="status_changed",
                field="status",
                old_value="running",
                new_value="revoked",
                actor=actor,
            )

        # Revoke the UserSession backing each killed run's token — the hard
        # kill. A token whose session is revoked fails session.is_valid().
        sessions_revoked = 0
        if token_jtis:
            sess_stmt = select(UserSession).where(
                UserSession.token_id.in_(token_jtis),
                UserSession.is_revoked == False,  # noqa: E712
            )
            for session in (await self.db.execute(sess_stmt)).scalars().all():
                session.is_revoked = True
                session.revoked_at = now
                session.revoke_reason = reason
                sessions_revoked += 1

        # Release any plan-participant claims held by the killed runs so a
        # revoked agent doesn't keep checkpoints claimed. Best-effort.
        try:
            from pixsim7.backend.main.api.v1.plans.helpers import (
                release_claims_for_run,
            )

            for run in runs:
                await release_claims_for_run(self.db, run.run_id)
        except Exception:
            pass

        await self.db.commit()

        # Evict cached claims so the cache-backed verify path (game endpoints)
        # also rejects, not just the always-fresh main dependency path.
        if token_jtis:
            from pixsim7.backend.main.services.user.auth_service import AuthService

            for jti in token_jtis:
                try:
                    await AuthService.evict_claims_cache_for_jti(jti)
                except Exception:
                    pass

        return {"runs_revoked": len(runs), "sessions_revoked": sessions_revoked}

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

        return await self._audit.record(
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
