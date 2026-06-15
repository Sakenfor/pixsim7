"""Participant claim/liveness primitives for plans helpers."""

from __future__ import annotations

import os
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple, TYPE_CHECKING

from pixsim7.backend.main.domain.docs.models import PlanParticipant
from pixsim7.backend.main.shared.datetime_utils import utcnow

if TYPE_CHECKING:
    from pixsim7.backend.main.services.docs.plan_write import PlanBundle


_DEFAULT_PARTICIPANT_STALE_MINUTES = 15.0


def _positive_float(value: Any) -> Optional[float]:
    """Coerce a value to a positive float, else None (treat as 'unset')."""
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return None
    return parsed if parsed > 0 else None


def _resolve_minutes(*, runtime: Any, env_var: str, default: float) -> float:
    """Precedence: runtime override (settings, process-global) > env var > default.

    The runtime override is the value set via PATCH /dev/plans/settings; the env
    var is the boot default. Both must be positive to take effect.
    """
    override = _positive_float(runtime)
    if override is not None:
        return override
    from_env = _positive_float(os.getenv(env_var))
    if from_env is not None:
        return from_env
    return default


def participant_stale_minutes() -> float:
    """Effective stale-after window in minutes (runtime override > env > 15)."""
    from pixsim7.backend.main.shared.config import settings

    return _resolve_minutes(
        runtime=getattr(settings, "plan_participant_stale_minutes", None),
        env_var="PIXSIM_PLAN_PARTICIPANT_STALE_MINUTES",
        default=_DEFAULT_PARTICIPANT_STALE_MINUTES,
    )


def _participant_stale_ttl() -> timedelta:
    """Stale-after window. Runtime override (PATCH /dev/plans/settings) wins,
    else PIXSIM_PLAN_PARTICIPANT_STALE_MINUTES, else 15 min."""
    return timedelta(minutes=participant_stale_minutes())


def claim_idle_release_minutes() -> float:
    """Effective idle-release window in minutes, clamped to never drop below the
    stale TTL (a still-live claimant must never be swept). Runtime override >
    env > stale TTL."""
    from pixsim7.backend.main.shared.config import settings

    stale = participant_stale_minutes()
    resolved = _resolve_minutes(
        runtime=getattr(settings, "plan_claim_idle_release_minutes", None),
        env_var="PIXSIM_PLAN_CLAIM_IDLE_RELEASE_MINUTES",
        default=stale,
    )
    return max(resolved, stale)


def _claim_idle_release_ttl() -> timedelta:
    """Idle window after which an OPEN claim is auto-released even without a
    terminal agent run.

    Runtime override (PATCH /dev/plans/settings) > PIXSIM_PLAN_CLAIM_IDLE_RELEASE_MINUTES
    > the participant stale TTL. Clamped to never be shorter than the stale TTL:
    once a claimant drops off the live roster its persisted claim record is
    closed to match, and a still-live claimant is never swept out from under
    itself.
    """
    return timedelta(minutes=claim_idle_release_minutes())


def participant_liveness_at(row: PlanParticipant) -> Optional[datetime]:
    """Most recent liveness signal: max of last_heartbeat_at and last_seen_at."""
    candidates = [
        t for t in (getattr(row, "last_heartbeat_at", None), row.last_seen_at) if t is not None
    ]
    return max(candidates) if candidates else None


def participant_is_stale(
    row: PlanParticipant,
    *,
    now: Optional[datetime] = None,
    ttl: Optional[timedelta] = None,
) -> bool:
    """True when the participant has not signalled liveness within the TTL."""
    seen = participant_liveness_at(row)
    if seen is None:
        return True
    reference = now or utcnow()
    window = ttl or _participant_stale_ttl()
    return (reference - seen) > window


CLAIM_META_KEY = "claim"


def participant_claim(row: PlanParticipant) -> Optional[Dict[str, Any]]:
    meta = row.meta if isinstance(row.meta, dict) else None
    if not meta:
        return None
    claim = meta.get(CLAIM_META_KEY)
    return claim if isinstance(claim, dict) else None


def claim_is_open(claim: Optional[Dict[str, Any]]) -> bool:
    return bool(claim) and not claim.get("released_at")


def participant_is_live_claimant(
    row: PlanParticipant,
    *,
    checkpoint_id: Optional[str] = None,
    now: Optional[datetime] = None,
    run_terminal: bool = False,
) -> bool:
    """Open, non-stale claim whose run hasn't ended."""
    claim = participant_claim(row)
    if not claim_is_open(claim):
        return False
    if checkpoint_id is not None and claim.get("checkpoint_id") != checkpoint_id:
        return False
    if run_terminal:
        return False
    return not participant_is_stale(row, now=now)


_PLAN_TYPE_ICON_HINTS: Dict[str, str] = {
    "bugfix": "bug",
    "refactor": "wrench",
    "feature": "sparkles",
    "exploration": "search",
    "task": "clipboard",
}

_TAG_ICON_HINTS: List[Tuple[str, str]] = [
    ("auth", "lock"),
    ("security", "lock"),
    ("ui", "monitor"),
    ("frontend", "monitor"),
    ("panel", "monitor"),
    ("backend", "database"),
    ("api", "database"),
    ("database", "database"),
    ("test", "flask"),
    ("docs", "book"),
    ("plan", "clipboard"),
]

_TAB_SUBTITLE_MAX_LEN = 40


def derive_tab_identity_suggestion(bundle: "PlanBundle") -> Dict[str, str]:
    """Best-effort {icon, subtitle} hint for set_tab_identity, derived from a plan."""
    title = (bundle.doc.title or bundle.id or "").strip()
    if len(title) > _TAB_SUBTITLE_MAX_LEN:
        subtitle = title[: _TAB_SUBTITLE_MAX_LEN - 1].rstrip() + "\u2026"
    else:
        subtitle = title

    icon = ""
    tags = [str(t).lower() for t in (bundle.doc.tags or []) if t]
    for keyword, hint in _TAG_ICON_HINTS:
        if any(keyword in tag for tag in tags):
            icon = hint
            break
    if not icon:
        plan_type = getattr(bundle.plan, "plan_type", None) or ""
        icon = _PLAN_TYPE_ICON_HINTS.get(plan_type.lower(), "clipboard")

    return {"icon": icon, "subtitle": subtitle}

