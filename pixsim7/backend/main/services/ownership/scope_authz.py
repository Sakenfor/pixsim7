"""Enforce an agent principal's scoped grants against the live DB.

The single bridge from the pure resolver (:mod:`pixsim7.common.scope_grants`)
to the database. This is the ONE place that fetches the grant *source* — today
an ``AgentProfile``, tomorrow human membership / on-behalf-of delegation /
capability grants get merged here. Call sites only ever say "assert this
principal may touch this scope"; they never learn where the grants came from.
That indirection is what keeps the later collaboration options additive
(plan ``scoped-agent-authorization``).
"""
from __future__ import annotations

from typing import Any, Iterable

from sqlalchemy.ext.asyncio import AsyncSession

from pixsim7.common.scope_grants import (
    ResourceScope,
    ScopeGrant,
    assert_can_access,
    build_grants_from_profile,
    can_access,
    merge_grants,
)

__all__ = [
    "ResourceScope",
    "load_scope_grants",
    "assert_scope_access",
    "filter_allowed_contracts",
]


async def load_scope_grants(db: AsyncSession, principal: Any) -> tuple[ScopeGrant, ...]:
    """Assemble every scope grant a principal holds.

    Today the only source is the agent's ``AgentProfile`` (``assigned_plans`` /
    ``allowed_contracts`` / ``default_scopes``). Non-agent principals (humans,
    admins, service tokens) hold no agent-profile grants, so they get an empty
    tuple — which the resolver treats as *unrestricted* (admins also bypass
    outright). New grant sources get merged in HERE, never at call sites.
    """
    if principal is None:
        return ()
    if not getattr(principal, "is_agent", False):
        return ()
    profile_id = getattr(principal, "profile_id", None)
    if not profile_id:
        return ()
    from pixsim7.backend.main.domain.platform.agent_profile import AgentProfile

    profile = await db.get(AgentProfile, profile_id)
    grants = list(build_grants_from_profile(profile))

    # Second source: peer plan-access grants (ResourceGrant, resource_type='plan').
    # WIDEN-ONLY — only fold these in when the profile is ALREADY restricted for
    # 'plan' (assigned_plans set). The resolver is a narrowing model: injecting a
    # restricted grant where none existed would flip an unrestricted principal to
    # restricted-to-just-the-granted-ids, breaking access to its own plans. So a
    # peer grant may only union ids into an existing 'plan' restriction.
    if any(g.kind == "plan" and g.allowed_ids is not None for g in grants):
        plan_ids = await _peer_plan_grant_ids(db, principal)
        if plan_ids:
            grants.append(ScopeGrant.restricted("plan", plan_ids))
            grants = list(merge_grants(grants))

    return tuple(grants)


async def _peer_plan_grant_ids(db: AsyncSession, principal: Any) -> list[str]:
    """Plan ids granted to this principal's effective user via active
    ResourceGrant(resource_type='plan') rows."""
    from pixsim7.backend.main.shared.actor import resolve_effective_user_id

    user_id = resolve_effective_user_id(principal)
    if not user_id:
        return []
    from pixsim7.backend.main.domain.grants import ResourceGrantType
    from pixsim7.backend.main.services.grants import ResourceGrantService

    received = await ResourceGrantService(db).list_received(user_id, ResourceGrantType.PLAN)
    ids: list[str] = []
    for grant in received:
        plan_id = grant.scope_value("plan_id")
        if plan_id:
            ids.append(str(plan_id))
    return ids


async def assert_scope_access(
    db: AsyncSession, principal: Any, scope: ResourceScope
) -> None:
    """Raise HTTP 403 if ``principal`` may not act on ``scope``.

    Fetches the principal's grants (one PK lookup for agents; nothing for
    humans/admins) and delegates the decision to the pure resolver. A profile
    with the relevant field unset (NULL) stays unrestricted, preserving the
    pre-enforcement open behaviour for every agent that isn't deliberately
    scoped.
    """
    grants = await load_scope_grants(db, principal)
    assert_can_access(principal, scope, grants=grants)


async def filter_allowed_contracts(
    db: AsyncSession, principal: Any, contract_ids: Iterable[str]
) -> set[str]:
    """Return the subset of ``contract_ids`` the principal may use.

    Used to narrow contract *discovery* (the ``/meta/contracts`` listing) so a
    profile-restricted agent's MCP client only registers tools for its
    ``allowed_contracts``. This is a provisioning/discovery control, not a hard
    per-call gate — contracts are a discovery layer, not a server dispatch
    chokepoint, so the authoritative write limits remain the resource-scope
    gates (plan/world). ``allowed_contracts`` NULL ⇒ every id passes; humans /
    admins / unrestricted agents get the full set. Plan
    ``scoped-agent-authorization`` (cp4).
    """
    ids = list(contract_ids)
    grants = await load_scope_grants(db, principal)
    if not grants:
        # No grant source narrows anything (unauthenticated caller, human,
        # admin, or unrestricted agent) ⇒ full visibility. This also avoids
        # the resolver's ``principal is None`` deny-path hiding everything from
        # anonymous /meta/contracts callers.
        return set(ids)
    return {
        cid
        for cid in ids
        if can_access(principal, ResourceScope("contract", cid), grants=grants)
    }
