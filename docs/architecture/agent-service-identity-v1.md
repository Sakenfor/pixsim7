# Agent/Service Identity & Run Tracking — v1

**Status**: Implemented
**Date**: 2026-03-19

## Problem

AI agents authenticate via personal user JWTs. Writes from agents are indistinguishable from human user writes. No `agent_id` / `run_id` traceability. No short-lived scoped tokens.

## Decision

Replace the `User` ORM object in route signatures with a lightweight `RequestPrincipal` built directly from JWT claims. One type, one decode, one dependency. No synthetic Users, no actor tuples, no double decodes.

### Why `RequestPrincipal` instead of `User`?

The `User` model is an ORM table object. The auth pipeline decoded the JWT, loaded the full User from DB, then downstream code only used `.id`, `.is_admin()`, `.has_permission()`. For agents/services there was no real User row, so the code fabricated synthetic `User(id=0)` objects. `RequestPrincipal` is claims-based — it has everything route handlers actually need without a DB lookup.

### Tradeoffs

| Choice | Pro | Con |
|--------|-----|-----|
| Claims-based principal | No DB hit for auth, no synthetic Users | Endpoints needing full User ORM must load separately |
| Duck-compatible with User | Existing endpoints work unchanged | Slightly misleading if type-checked |
| Agent claims in JWT | Stateless, no new tables | No persistent service-principal lifecycle |

## Architecture

### `RequestPrincipal` (`shared/actor.py`)

Single type for all authenticated requests. Three principal types:

```
user    — normal human (id=user_id, from DB)
agent   — AI agent (id=0, agent_id/run_id/plan_id from claims or headers)
service — internal bridge (id=0, from bridge tokens)
```

Duck-compatible with `User`: has `.id`, `.is_admin()`, `.has_permission()`, `.username`, `.email`, `.display_name`, `.permissions`, `.preferences`, `.is_active`.

### Auth flow

```
Request
  │
  └─ get_current_principal()          ← single dependency
       ├─ verify_token_claims()       ← one JWT decode
       ├─ RequestPrincipal.from_jwt_payload(claims, headers)
       └─ if user: enrich display_name/preferences from DB
```

No separate `get_actor_context()`. No re-decoding the token. The principal carries agent metadata natively.

### Agent headers (for user-token requests)

When an agent uses a user token but wants to tag its actions:
- `X-Agent-Id` — agent instance ID
- `X-Run-Id` — unique run/invocation ID
- `X-Plan-Id` — plan being worked on

These are consumed inside `get_current_principal()` and produce a hybrid agent principal (`principal_type="agent"` with `on_behalf_of=user_id`).

### Agent token minting

```
POST /api/v1/dev/agent-tokens  (admin-only)
→ JWT with purpose="agent", agent_id, run_id, plan_id, on_behalf_of, scopes
```

### Write path (plan example)

```python
@router.patch("/update/{plan_id}")
async def update_plan_endpoint(
    plan_id: str,
    payload: PlanUpdateRequest,
    principal: CurrentUser,         # ← one param, carries everything
    db: DatabaseSession,
):
    result = await update_plan(db, plan_id, updates, principal=principal)
```

Service functions take `principal=` (not three separate args):
```python
async def update_plan(db, plan_id, updates, principal=None):
    actor_source = principal.source if principal else None
    await _emit_events(db, plan_id, changes, sha, actor_source=actor_source)
    await _emit_plan_notification(db, plan_id, title, changes, principal=principal)
```

### Audit trail

| Location | What's recorded |
|----------|----------------|
| `PlanEvent.actor` | `"agent:claude-abc"` or `"user:42"` |
| `DocumentEvent.actor` | Same (pre-existing) |
| `Notification.source` | `"agent:claude-abc"` |
| `checkpoint.last_update.actor` | Full `audit_dict()` when `is_agent` |

## Files

| File | Change |
|------|--------|
| `shared/actor.py` | `RequestPrincipal` (replaces `User` in routes) |
| `shared/auth.py` | `create_agent_token()` |
| `api/dependencies.py` | `get_current_principal()`, `CurrentUser`→`RequestPrincipal` |
| `api/v1/agent_tokens.py` | Token minting endpoint |
| `routes/agent_tokens/manifest.py` | Route plugin |
| `api/v1/dev_plans.py` | All endpoints use `principal: CurrentUser` |
| `services/docs/plan_write.py` | `update_plan(principal=)`, `_emit_events(actor_source=)` |
| `services/user/auth_service.py` | Consolidated synthetic User branch |
| `domain/docs/models.py` | `PlanEvent.actor` column |
| Migration `20260319_0004` | `ALTER TABLE plan_events ADD actor` |
| Tests | 42 tests pass (16 new + 26 existing updated) |

## What was removed

- `_actor_identity()` — replaced by `principal.source` / `principal.actor_display_name`
- `ActorContext` / `ActorCtx` / `get_actor_context()` — merged into `RequestPrincipal`
- `actor_tuple` property — no longer needed
- Separate `get_current_user` + `get_actor_context` double-dependency pattern
- Two synthetic User branches in `auth_service.verify_token()` → consolidated into one

## Phased rollout

### v1 (done)
- `RequestPrincipal` replaces `User` in auth pipeline
- Agent token minting
- Plan write path fully converted
- `PlanEvent.actor`, checkpoint audit dict

### v1.1 (next)
- Scope enforcement middleware for agent tokens
- Rate limiting per `agent_id`
- Agent-originated notification category

### v2 (future)
- Persistent `ServicePrincipal` table
- Token revocation for agent tokens
- Per-agent audit dashboard
- RBAC policies for agent scopes
