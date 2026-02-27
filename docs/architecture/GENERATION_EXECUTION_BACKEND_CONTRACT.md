# Generation Execution Backend Contract (V1)

Status: Draft (intended to stabilize backend semantics before more orchestration features)

## Purpose

Define a backend execution model that separates:

- what runs (`plan`)
- how it runs (`policy`)
- what gets tracked (`execution`)

This avoids conflating UI modes (`Each`, future `Sequential`) with backend semantics.

## Core Concepts

### 1. Execution Kind

High-level orchestration shape.

- `single`
  - One generation request.
- `fanout`
  - Multiple independent generation requests (no step dependencies).
- `chain`
  - Ordered steps where later steps may depend on prior step outputs.

Notes:
- `chain` includes both saved chains and ephemeral chains.
- `fanout` is the backend peer of frontend `Each` semantics.

### 2. Execution Plan

The units of work to run.

- `single` plan
  - one generation payload
- `fanout` plan
  - many generation payloads/items
- `chain` plan
  - ordered step definitions (`template_id`, `operation`, wiring, overrides, guidance)

The plan answers:
- what items/steps exist
- what inputs/overrides each one uses

The plan does **not** define waiting/failure behavior.

### 3. Execution Policy

How the plan is executed.

Policy is a behavior object, not a UI mode.

Recommended V1 policy shape:

```json
{
  "dispatch_mode": "single",
  "wait_policy": "none",
  "dependency_mode": "none",
  "failure_policy": "stop",
  "concurrency": 1,
  "step_timeout_seconds": 600,
  "force_new": true
}
```

#### Policy Fields (V1)

- `dispatch_mode`
  - `single | fanout | sequential`
  - Execution scheduler behavior.
- `wait_policy`
  - `none | terminal_per_step | terminal_final`
  - `none` = fire-and-forget.
  - `terminal_per_step` = wait after each unit before continuing.
  - `terminal_final` = allow concurrent/fanout but wait until all terminal before returning final status.
- `dependency_mode`
  - `none | previous | explicit`
  - `none` = units do not depend on prior outputs.
  - `previous` = default sequential piping (`step N <- step N-1`).
  - `explicit` = resolve from named prior units (`input_from`).
- `failure_policy`
  - `stop | continue`
  - `stop` = first failure halts execution.
  - `continue` = continue remaining units where possible.
- `concurrency`
  - integer >= 1
  - Mainly relevant for `fanout` now/future.
- `step_timeout_seconds`
  - Per-unit timeout when waiting.
- `force_new`
  - Whether to bypass dedup/cache and force fresh generation.

## Execution Record (Tracked Runtime Instance)

An execution record is a persisted runtime instance of an execution plan.

### Invariants

- Tracks status independently from the plan definition.
- Stores a snapshot of units/steps at execution start.
- Stores per-unit state for progress/debugging.
- Can be polled by frontend/UI.

### Canonical Per-Unit State Shape (V1)

Use a consistent shape across `fanout` and `chain` as much as possible.

```json
{
  "unit_id": "step_1",
  "status": "pending",
  "generation_id": 123,
  "result_asset_id": 456,
  "source_asset_id": 111,
  "error": null,
  "started_at": "2026-02-24T12:00:00Z",
  "completed_at": "2026-02-24T12:00:15Z",
  "duration_seconds": 15.2,
  "roll_result": {
    "assembled_prompt": "...",
    "selected_block_ids": ["..."],
    "roll_seed": 42
  },
  "compiled_guidance": { "version": 1, "references": { } },
  "guidance_warnings": [],
  "formatter_warnings": []
}
```

Notes:
- Existing `chain` step state already contains much of this.
- `unit_id` may be `step_id` for chains and `item_<n>` for fanout.

## Mapping Current Backend Components

### Already Implemented (Good Foundation)

- `create_generation` endpoint
  - Kind: `single`
  - Policy: implicit (`dispatch_mode=single`, `wait_policy=none`)

- `GenerationStepExecutor`
  - Primitive for `submit + wait until terminal`
  - Supports `terminal_per_step` semantics
  - Reusable across orchestration kinds

- `ChainExecutor`
  - Kind: `chain`
  - Policy (effective):
    - `dispatch_mode=sequential`
    - `wait_policy=terminal_per_step`
    - `dependency_mode=previous|explicit`
    - `failure_policy=stop`

- `POST /generation-chains/{id}/execute`
  - Saved chain plan + `ChainExecutor`

- `POST /generation-chains/execute-ephemeral`
  - Ephemeral chain plan + `ChainExecutor`
  - Same execution tracking flow as saved chains

## Mapping Frontend Modes To Backend Semantics

### Quick Generate `Single`

- Backend kind: `single`
- Policy:
  - `dispatch_mode=single`
  - `wait_policy=none`

### Quick Generate `Each`

- Backend kind: `fanout` (conceptually)
- Policy:
  - `dispatch_mode=fanout`
  - `dependency_mode=none`
  - `failure_policy=continue`
  - `wait_policy=none` (current behavior)

Important:
- `Each` is **not** “sequential=false”.
- It is an independent orchestration kind (`fanout`) with different semantics.

### Quick Generate `Sequential` (planned)

- Backend kind: `chain` (ephemeral)
- Policy:
  - `dispatch_mode=sequential`
  - `wait_policy=terminal_per_step`
  - `dependency_mode=previous` (or explicit later)
  - `failure_policy=stop`

Implementation target:
- Frontend builds ephemeral step payload
- Backend executes via `POST /generation-chains/execute-ephemeral`
- Frontend polls execution status

## RunContext Conventions (Execution Metadata)

Use stable snake_case keys for step provenance in `generation_config.run_context`.

Current/target keys:

- `chain_id`
- `chain_execution_id`
- `chain_step_id`
- `chain_step_index`
- `chain_total_steps`
- `chain_source_generation_id`
- `chain_source_asset_id`
- `guidance_plan` (compiled provider-agnostic guidance payload)

Guidelines:

- Do not invent ad hoc variants for the same meaning.
- Keep orchestration metadata in `run_context`; provider-specific formatting details stay in execution step state / logs.

## Why A Bool Is Not Enough

`wait=true/false` does not capture:

- dependency wiring (`none`, `previous`, `explicit`)
- failure behavior (`stop`, `continue`)
- concurrency
- whether units are independent or piped

Examples:

- `Each` and `Sequential` both can “wait”, but they mean different things.
- `Sequential` without dependencies is just serialized fanout, not a chain.

## Recommended Near-Term Implementation Rules

### Rule 1: Keep Backend Orchestration Kinds Explicit

Do not model new execution features as “just a wait flag”.

Use one of:
- `single`
- `fanout`
- `chain`

### Rule 2: Reuse `ChainExecutor` For Sequential Ad Hoc Runs

For frontend sequential flows, prefer:
- `execute-ephemeral` + execution polling

Avoid frontend-only orchestration as the production path.

### Rule 3: Do Not Rewire `Each` Into Chain Execution

`Each` should remain fanout semantics.

If/when backend-tracked fanout is desired, add a dedicated fanout executor/endpoint rather than forcing it through chain semantics.

### Rule 4: Unify Lower-Level Primitives, Not Top-Level Modes

Good shared primitives:
- generation submission
- step wait (`GenerationStepExecutor`)
- execution state tracking patterns

Different top-level semantics should remain different endpoints/modes until a generalized execution API is justified.

## Future Extension Path

### V1.5 (Backend Fanout Tracking)

Add a backend fanout execution endpoint with chain-like tracking:

- Kind: `fanout`
- Policy:
  - `dispatch_mode=fanout`
  - `dependency_mode=none`
  - `failure_policy=continue`

This would modernize `Each` without changing its semantics.

### V2 (Generalized Execution API, Optional)

If multiple orchestration kinds converge enough, consider a generalized execution endpoint:

- `kind`
- `plan`
- `policy`
- `execution_metadata`

Do this only after:
- `single`, `fanout`, and `chain` semantics are stable
- frontend call sites are clear about intent

## Open Questions (Intentional, Not Blocking)

1. Should `ChainExecution` be generalized into a shared execution table for fanout + chain?
2. Do we want a distinct `BatchExecution` model for fanout, or reuse `ChainExecution` with `execution_kind` metadata?
3. When introducing backend fanout execution, should `wait_policy=terminal_final` be supported from day one?
4. Should execution policy become persisted on saved chains, or remain runtime request-only initially?

## Summary

Backend should feel like one execution family with:

- shared primitives
- explicit orchestration kinds
- policy-driven behavior

But it should **not** collapse all modes into a single boolean or a forced single endpoint prematurely.

The current backend is already close:
- `GenerationStepExecutor` + `ChainExecutor` + saved/ephemeral chain execute are the right foundation.
