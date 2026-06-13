"""Scoped-authorization resolver — the single chokepoint for "may this
principal act on this resource?".

This is the keystone of the ``scoped-agent-authorization`` plan. It exists so
that *one* function decides scope access for every call site, and the *source*
of the grants is pluggable. Today the only source is the agent's
``AgentProfile`` (``assigned_plans`` / ``allowed_contracts`` / ``default_scopes``);
tomorrow human membership grants, on-behalf-of delegation, or capability tokens
can feed the same resolver without touching a single call site.

That pluggability is a hard requirement, not an aesthetic one: scattering
``if plan_id not in profile.assigned_plans`` across endpoints would lock the
system to the profile-as-only-source model. Keeping the core a pure function
over an *iterable of grants* keeps every later option (membership / delegation /
capability) additive.

Design rules, mirroring :mod:`pixsim7.common.ownership`:
  * **Domain-free.** Knows nothing about plans, worlds, or DB rows. The caller
    fetches the grant source and hands normalized :class:`ScopeGrant`s in.
  * **Duck-typed principal.** Works with ``RequestPrincipal`` or any object
    exposing ``is_admin`` (method or attribute).
  * **NULL = unrestricted, [] = deny-all.** A *missing* grant for a kind means
    that kind is not narrowed (legacy open behaviour preserved). An *empty*
    grant (``allowed_ids=frozenset()``) means the principal may touch *no* id
    of that kind. This distinction matches the ``AgentProfile`` docstring
    ("NULL = unrestricted") and is load-bearing — tests pin it.

Grant combination is **additive (union)**: multiple grants for the same kind
widen access, so adding a second grant source can only ever grant more, never
revoke. An unrestricted grant for a kind wins over any id-restricted one.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Iterable, Optional

from fastapi import HTTPException

# Scope-string convention shared with ``scope_helpers`` (``plan:X``,
# ``contract:X``). A bare ``kind`` or ``kind:*`` means "unrestricted for that
# kind"; ``kind:id`` narrows to that specific id.
_WILDCARD = "*"


# ---------------------------------------------------------------------------
# Value types
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class ResourceScope:
    """A specific resource a principal wants to act on.

    ``id`` is normalized to ``str`` so callers can pass plan ids (str) and
    world ids (int) interchangeably. ``id is None`` asks a *kind-level*
    question ("may this principal touch plans at all?") — grants narrow
    *which ids*, never whether a kind exists, so kind-level access is always
    permitted (see :func:`can_access`).
    """

    kind: str
    id: Optional[str] = None

    def __post_init__(self) -> None:
        if self.id is not None and not isinstance(self.id, str):
            object.__setattr__(self, "id", str(self.id))


@dataclass(frozen=True)
class ScopeGrant:
    """Normalized authority a principal holds over one kind of resource.

    ``allowed_ids is None``  → unrestricted (may touch any id of this kind).
    ``allowed_ids == frozenset()`` → deny-all (may touch no id of this kind).
    ``allowed_ids == {"a", "b"}`` → may touch only those ids.
    """

    kind: str
    allowed_ids: Optional[frozenset[str]] = None

    @classmethod
    def unrestricted(cls, kind: str) -> "ScopeGrant":
        return cls(kind=kind, allowed_ids=None)

    @classmethod
    def restricted(cls, kind: str, ids: Iterable[Any]) -> "ScopeGrant":
        return cls(kind=kind, allowed_ids=frozenset(str(i) for i in ids))


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _is_admin(principal: Any) -> bool:
    """Duck-typed admin check — same contract as ``ownership._is_admin``."""
    if principal is None:
        return False
    if hasattr(principal, "is_admin") and callable(principal.is_admin):
        return bool(principal.is_admin())
    return bool(getattr(principal, "is_admin", False))


# ---------------------------------------------------------------------------
# Grant builders (still pure — take raw field values, return grants)
# ---------------------------------------------------------------------------


def grants_from_scope_strings(scopes: Optional[Iterable[str]]) -> tuple[ScopeGrant, ...]:
    """Parse a flat ``default_scopes``-style list into per-kind grants.

    Convention (shared with ``scope_helpers``):
      * ``"world"`` or ``"world:*"`` → unrestricted grant for kind ``world``.
      * ``"world:42"`` → restricted grant for ``world`` narrowed to ``{"42"}``.

    A kind that never appears yields *no* grant for it (so it stays
    unrestricted). ``None`` / ``[]`` → no grants at all. Blank / malformed
    entries are skipped.
    """
    if not scopes:
        return ()
    unrestricted: set[str] = set()
    restricted: dict[str, set[str]] = {}
    for raw in scopes:
        if not isinstance(raw, str):
            continue
        token = raw.strip()
        if not token:
            continue
        if ":" not in token:
            unrestricted.add(token)
            continue
        kind, _, ident = token.partition(":")
        kind = kind.strip()
        ident = ident.strip()
        if not kind:
            continue
        if not ident or ident == _WILDCARD:
            unrestricted.add(kind)
        else:
            restricted.setdefault(kind, set()).add(ident)
    grants: list[ScopeGrant] = [ScopeGrant.unrestricted(k) for k in sorted(unrestricted)]
    for kind, ids in sorted(restricted.items()):
        if kind in unrestricted:
            continue  # an unrestricted grant for this kind already wins
        grants.append(ScopeGrant.restricted(kind, ids))
    return tuple(grants)


def build_grants_from_profile(profile: Any) -> tuple[ScopeGrant, ...]:
    """Assemble the grants an ``AgentProfile`` confers (duck-typed, pure).

    Maps the three existing profile authorization fields onto grant kinds:
      * ``assigned_plans``   → kind ``plan``
      * ``allowed_contracts``→ kind ``contract``
      * ``default_scopes``   → any kind, via :func:`grants_from_scope_strings`

    ``None`` field ⇒ no grant for that kind (unrestricted). An explicit list
    (including ``[]``) ⇒ a grant (``[]`` is deny-all for that kind). Grants are
    merged per kind so a kind covered by both ``default_scopes`` and a
    dedicated field unions cleanly.
    """
    if profile is None:
        return ()
    collected: list[ScopeGrant] = []

    assigned_plans = getattr(profile, "assigned_plans", None)
    if assigned_plans is not None:
        collected.append(ScopeGrant.restricted("plan", assigned_plans))

    allowed_contracts = getattr(profile, "allowed_contracts", None)
    if allowed_contracts is not None:
        collected.append(ScopeGrant.restricted("contract", allowed_contracts))

    collected.extend(grants_from_scope_strings(getattr(profile, "default_scopes", None)))

    return merge_grants(collected)


def merge_grants(grants: Iterable[ScopeGrant]) -> tuple[ScopeGrant, ...]:
    """Collapse grants to at most one per kind, additively (union).

    An unrestricted grant for a kind absorbs any restricted ones for that kind.
    """
    unrestricted_kinds: set[str] = set()
    union: dict[str, set[str]] = {}
    order: list[str] = []
    for grant in grants:
        if grant.kind not in order:
            order.append(grant.kind)
        if grant.allowed_ids is None:
            unrestricted_kinds.add(grant.kind)
        else:
            union.setdefault(grant.kind, set()).update(grant.allowed_ids)
    result: list[ScopeGrant] = []
    for kind in order:
        if kind in unrestricted_kinds:
            result.append(ScopeGrant.unrestricted(kind))
        else:
            result.append(ScopeGrant.restricted(kind, union.get(kind, set())))
    return tuple(result)


# ---------------------------------------------------------------------------
# The resolver
# ---------------------------------------------------------------------------


def can_access(
    principal: Any,
    scope: ResourceScope,
    *,
    grants: Iterable[ScopeGrant] = (),
) -> bool:
    """Return whether ``principal`` may act on ``scope``, given its ``grants``.

    Resolution order:
      1. No principal → deny (this runs post-auth; ``None`` is a bug, not anon).
      2. Admins always pass.
      3. Kind-level questions (``scope.id is None``) always pass — grants narrow
         *which ids*, not whether a kind is reachable.
      4. No grant mentions ``scope.kind`` → pass (kind not narrowed; preserves
         the pre-enforcement open behaviour, matching NULL = unrestricted).
      5. Any matching grant is unrestricted → pass.
      6. Otherwise pass iff ``scope.id`` is in the union of matching grants'
         ``allowed_ids`` (so ``[]`` deny-all correctly denies).
    """
    if principal is None:
        return False
    if _is_admin(principal):
        return True
    if scope.id is None:
        return True

    relevant = [g for g in grants if g.kind == scope.kind]
    if not relevant:
        return True
    if any(g.allowed_ids is None for g in relevant):
        return True

    allowed: set[str] = set()
    for g in relevant:
        allowed.update(g.allowed_ids or ())
    return scope.id in allowed


def assert_can_access(
    principal: Any,
    scope: ResourceScope,
    *,
    grants: Iterable[ScopeGrant] = (),
) -> None:
    """Raise HTTP 403 if :func:`can_access` is False. Thin ergonomic wrapper
    for route/service call sites (mirrors ``ownership.assert_can_*``)."""
    if not can_access(principal, scope, grants=grants):
        raise HTTPException(
            status_code=403,
            detail=f"Not authorized for {scope.kind}:{scope.id}",
        )


__all__ = [
    "ResourceScope",
    "ScopeGrant",
    "grants_from_scope_strings",
    "build_grants_from_profile",
    "merge_grants",
    "can_access",
    "assert_can_access",
]
