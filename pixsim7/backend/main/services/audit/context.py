"""Request-scoped audit context using contextvars.

Set the actor at the start of each request (via middleware or dependency),
and SQLAlchemy model event listeners read it automatically.

Usage in middleware:
    from pixsim7.backend.main.services.audit.context import set_audit_actor, clear_audit_context

    set_audit_actor("user:1")
    ...
    clear_audit_context()

Usage in model hooks:
    from pixsim7.backend.main.services.audit.context import get_audit_actor

    actor = get_audit_actor()  # returns "user:1" or "system"
"""
from __future__ import annotations

from typing import Optional

from contextvars import ContextVar

_audit_actor: ContextVar[str] = ContextVar("audit_actor", default="system")
_audit_commit_sha: ContextVar[Optional[str]] = ContextVar("audit_commit_sha", default=None)
_audit_run_id: ContextVar[Optional[str]] = ContextVar("audit_run_id", default=None)


def set_audit_actor(actor: str) -> None:
    """Set the actor for the current request scope."""
    _audit_actor.set(actor)


def get_audit_actor() -> str:
    """Get the actor for the current request scope."""
    return _audit_actor.get()


def set_audit_commit_sha(sha: Optional[str]) -> None:
    """Attach a git commit SHA to the current request scope (optional)."""
    _audit_commit_sha.set(sha)


def get_audit_commit_sha() -> Optional[str]:
    """Get the commit SHA for the current request scope, if set."""
    return _audit_commit_sha.get()


def set_audit_run_id(run_id: Optional[str]) -> None:
    """Attach an agent run ID to the current request scope (optional)."""
    _audit_run_id.set(run_id)


def get_audit_run_id() -> Optional[str]:
    """Get the agent run ID for the current request scope, if set."""
    return _audit_run_id.get()


def clear_audit_context() -> None:
    """Reset audit context (call at end of request)."""
    _audit_actor.set("system")
    _audit_commit_sha.set(None)
    _audit_run_id.set(None)
