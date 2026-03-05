# Analyzer Shared Kernel Consolidation Plan

## Context

PixSim7 currently has two analyzer orchestrators:

- `PromptAnalysisService` for prompt/text analysis
- `AnalysisService` for asset/job analysis

This split is valid because runtime shape and lifecycle differ (inline prompt path vs queued asset jobs). The risk is duplication in shared behavior (resolution policy, chain behavior, telemetry, error semantics, config hashing).

This document defines the shared-kernel consolidation plan while keeping the two orchestrators separate.

## Goals

1. Keep prompt and asset orchestrators separate.
2. Move shared logic into a single reusable kernel layer.
3. Eliminate drift in provider/model resolution, chain execution, and observability.
4. Make analyzer/plugin growth safe without hardcoded behavior spread.

## Non-Goals

1. Merge prompt and asset services into one monolith.
2. Replace ARQ/job lifecycle for asset analysis.
3. Rework the analyzer registry model in this track.

## Current Baseline

Already consolidated:

1. `_ids`-only analyzer preference contract
2. AI Hub as single LLM provider/model resolution authority

Still fragmented:

1. Non-LLM execution policy precedence
2. Chain execution semantics
3. Result envelope/provenance shape
4. Error taxonomy and retry hints
5. Telemetry and run metrics contracts

## Target Shared Kernel Areas

### 1. Unified Execution Policy (All Analyzer Kinds)

- One policy component for provider/model/instance precedence across prompt and asset flows.
- LLM, vision, and parser-adjacent cases use the same precedence contract where applicable.

### 2. Shared Analyzer Chain Executor

- One executor with explicit strategy:
  - `first_success`
  - `run_all`
- Explicit timeout budget, per-step timeout, and merge strategy hooks.

### 3. Shared Result Envelope + Provenance

Standard metadata for all analyzer executions:

- `analyzer_id`
- `provider_id`
- `model_id`
- `analysis_point` (if applicable)
- `effective_config_hash`
- `duration_ms`
- `fallback_used`
- `error_category` (if failed)

### 4. Unified Capability Contract

Analyzer capability declaration consumed by both orchestrators:

- `input_modality`
- `task_family`
- `supports_batch`
- `supports_streaming`
- `output_schema_id`

### 5. Shared Error Taxonomy + Retry Hints

Normalize execution errors into categories:

- `transient`
- `auth`
- `quota`
- `invalid_input`
- `provider_unavailable`
- `unknown`

Each category carries retry guidance for prompt fallback and asset worker behavior.

### 6. Shared Observability Hooks

Single instrumentation helper for both paths:

- start/stop timing
- success/failure counters
- fallback depth
- empty-result rate

### 7. Shared Effective Config Hashing

One canonical hashing helper for dedupe, provenance, and replayability:

- stable key ordering
- consistent redaction rules
- consistent payload fields

### 8. Shared Preference Normalization Boundary

Central utility for analyzer preference normalization and validation:

- `_ids` key validation
- analysis point override validation
- intent chain validation

## Phased Roadmap

## Phase 0: Contracts First

1. Define shared kernel interfaces for execution policy, chain executor, telemetry hook, and error normalization.
2. Add golden tests for precedence and envelope behavior.

Exit criteria:

1. All interfaces are explicit and versioned in code comments/docs.
2. Both orchestrators can compile against interface stubs.

## Phase 1: Unified Execution Policy

1. Move non-LLM precedence into shared policy module.
2. Route prompt and asset orchestration through the same policy adapter.

Exit criteria:

1. No duplicated precedence branches in orchestrators.
2. Existing resolver tests pass plus new shared policy tests.

## Phase 2: Chain Executor + Error Taxonomy

1. Implement shared chain executor with strategy + timeout controls.
2. Normalize provider/analyzer errors into shared categories and retry hints.

Exit criteria:

1. Prompt and asset paths both use chain executor.
2. Worker retry logic and prompt fallback logic consume normalized categories.

## Phase 3: Result Envelope + Metrics

1. Introduce shared result envelope builder.
2. Add shared telemetry hooks and dashboards/log fields.

Exit criteria:

1. All analyzer runs emit a consistent provenance envelope.
2. Metrics for latency/success/fallback are visible per analyzer/provider.

## Phase 4: Capability and Plugin Contract

1. Introduce capability contract readers for both orchestrators.
2. Enforce output schema IDs and adapter validation points.

Exit criteria:

1. New analyzers can plug in without per-orchestrator hardcoding.
2. Capability mismatches fail fast with clear errors.

## Risks and Mitigations

1. Risk: silent behavior change in fallback order  
   Mitigation: golden tests with before/after vectors and staged rollout flags.

2. Risk: throughput regressions from shared chain layer  
   Mitigation: benchmark baseline and add per-step timing metrics.

3. Risk: plugin breakage from stricter contracts  
   Mitigation: versioned capability contract and compatibility adapter.

## Suggested Work Items

1. `kernel-exec-policy`: shared precedence module + tests.
2. `kernel-chain-executor`: strategy/timeout/merge implementation + tests.
3. `kernel-error-taxonomy`: normalize + retry hints + worker integration.
4. `kernel-envelope`: shared provenance envelope + schema checks.
5. `kernel-observability`: unified metrics/log hook adoption.
6. `kernel-capability-contract`: output schema and capability checks.

## Progress

### Phase 0 + Phase 1 (`kernel-exec-policy`) — Completed 2026-03-04

**Deliverables:**

- New module: `services/analysis/execution_policy.py`
  - `resolve_provider_model_precedence()` — unified sync precedence for provider/model
  - `ProviderModelPrecedenceRequest` / `ProviderModelPrecedenceResult` — explicit contract
  - `DEFAULT_MODEL_BY_PROVIDER` — single source of truth (was duplicated in `ai_hub_service.py`)
  - Provenance tracking (`provider_source`, `model_source`, `conflict_detected`)

- Wired both orchestrators:
  - `analyzer_pipeline.py::resolve_analyzer_execution()` — LLM branch now uses shared policy (replaces direct `resolve_llm_provider_id` + `resolve_llm_model_id` + manual `normalize_llm_provider_id`)
  - `ai_hub_service.py::_resolve_provider_and_model()` — sync portion delegates to shared policy; async capability defaults and hardcoded global fallback remain in AiHubService

- Removed duplication:
  - `analyzer_pipeline.py` no longer has its own normalize + resolve calls — delegates to `resolve_provider_model_precedence`
  - `ai_hub_service.py` no longer has inline model catalog inference, conflict detection, or `_DEFAULT_MODEL_BY_PROVIDER` — delegates to `resolve_provider_model_precedence`
  - `llm_resolution.py` remains as the low-level helper layer consumed by the shared policy

- Tests: 21 new tests in `test_execution_policy.py` covering:
  - Provider precedence vectors (5 tests)
  - Model precedence vectors (4 tests)
  - Model catalog inference (3 tests)
  - Provider-model conflict handling (3 tests)
  - Provider default model lookup (3 tests)
  - No hidden fallback drift (3 tests)
- All 25 existing analyzer/LLM tests pass with zero regressions

**What is NOT in this slice:**

- Chain executor (Phase 2: `kernel-chain-executor`)
- Error taxonomy / retry hints (Phase 2)
- Result envelope / provenance (Phase 3)
- Observability hooks (Phase 3)
- Capability contract (Phase 4)

### Phase 2 (`kernel-chain-executor`) — Completed 2026-03-05

**Deliverables:**

- New module: `services/analysis/error_taxonomy.py`
  - `AnalyzerErrorCategory` enum: `transient`, `auth`, `quota`, `invalid_input`, `provider_unavailable`, `content_filtered`, `unknown`
  - `classify_analyzer_error()` — maps existing PixSim error hierarchy to categories
  - `should_try_next_in_chain()` — chain continuation decision
  - `is_retryable()` — worker retry decision

- New module: `services/analysis/chain_executor.py`
  - `ChainStrategy` enum: `first_success`, `run_all`
  - `execute_first_success()` — async chain executor with error classification, deduplication, and step-level provenance
  - `ChainResult` / `ChainStepOutcome` — provenance tracking per step

- Wired both orchestrators:
  - `AnalysisService.create_analysis_with_meta()` — inline candidate loop replaced with `execute_first_success()` call
  - `PromptAnalysisService._run_analyzer()` — inline fallback replaced with `execute_first_success([requested, "prompt:simple"])` chain

- Tests: 40 new tests across two files:
  - `test_error_taxonomy.py` (22 tests): classification for all error subtypes, chain continuation logic, retryability
  - `test_chain_executor.py` (10 tests): happy path, failure paths, chain stopping on transient errors, deduplication, provenance tracking
- All 46 existing tests pass with zero regressions

**What is NOT in this slice:**

- `run_all` strategy implementation (interface defined, no current consumer)
- Worker-side consumption of `is_retryable()` (ready for adoption)
- Result envelope / provenance (Phase 3)
- Observability hooks (Phase 3)
- Capability contract (Phase 4)

### Phase 3 (`kernel-envelope` + `kernel-observability`) — Completed 2026-03-05

**Deliverables:**

- New module: `services/analysis/result_envelope.py`
  - `AnalyzerProvenance` dataclass — standard provenance envelope with `analyzer_id`, `provider_id`, `model_id`, `duration_ms`, `chain_duration_ms`, `fallback_used`, `fallback_depth`, `error_category`, `chain_trace`
  - `StepTrace` dataclass — compact per-step audit trail
  - `build_provenance()` — builds `AnalyzerProvenance` from `ChainResult`
  - `to_dict()` — JSON-safe serialization omitting None values

- New module: `services/analysis/observability.py`
  - `log_analyzer_run()` — structured log emitter consumed by both orchestrators
  - `analyzer_timer()` — async context manager for wall-clock timing
  - `AnalyzerRunMetrics` — metrics dataclass for instrumentation

- Extended `chain_executor.py`:
  - `ChainStepOutcome.duration_ms` — per-step wall-clock timing
  - `ChainResult.total_duration_ms` — total chain wall-clock timing
  - `ChainResult.fallback_used` — property: True if success required fallback
  - `ChainResult.fallback_depth` — property: count of failed steps before success

- Wired both orchestrators:
  - `PromptAnalysisService._run_analyzer()` — now returns `(result, analyzer_id, provenance)` 3-tuple; `analyze()` attaches `provenance` dict to result
  - `AnalysisService.create_analysis_with_meta()` — builds provenance from chain result and includes it in `ANALYSIS_CREATED` event payload

- Both paths emit structured `log_analyzer_run()` entries with consistent fields

- Tests: 20 new tests across two files:
  - `test_result_envelope.py` (13 tests): provenance building for success/failure, serialization, chain result properties, step duration
  - `test_observability.py` (7 tests): structured logging, timer, metrics dataclass
- All 85 kernel tests pass with zero regressions

**What is NOT in this slice:**

- Capability contract (Phase 4)
- Worker-side consumption of provenance for retry decisions
- Dashboard/metric aggregation endpoints

### Phase 4 (`kernel-capability-contract`) — Completed 2026-03-05

**Deliverables:**

- Extended `AnalyzerInfo` (in `parser/registry.py`):
  - `supports_batch: bool` — whether analyzer supports batch execution
  - `supports_streaming: bool` — whether analyzer supports streaming
  - `output_schema_id: Optional[str]` — declared output schema identifier

- New module: `services/analysis/capability_contract.py`
  - `CapabilityRequest` dataclass — describes what the caller needs (`input_modality`, `task_family`, `requires_batch`, `requires_streaming`, `output_schema_id`)
  - `validate_analyzer_capability()` — fail-fast validation of analyzer against request; checks modality, task family, batch, streaming, and output schema
  - `check_analyzer_capability()` — non-raising boolean version
  - `CapabilityMismatchError` — raised on validation failure
  - Multimodal compatibility: `MULTIMODAL` analyzers accept any specific modality

- Wired into shared pipeline:
  - `AnalyzerExecutionRequest.capability_request` — optional capability check during `resolve_analyzer_execution()`
  - Capability validation runs before provider/model resolution (fail fast)
  - `CapabilityMismatchError` classified as `INVALID_INPUT` in error taxonomy — chain executor tries next candidate on mismatch

- Tests: 24 new tests in `test_capability_contract.py`:
  - Modality validation (6 tests): exact match, mismatch, multimodal, no-constraint
  - Task family validation (3 tests)
  - Batch/streaming validation (4 tests)
  - Output schema validation (4 tests)
  - Non-raising check (2 tests)
  - Error taxonomy integration (1 test)
  - Pipeline integration (3 tests): fail-fast, pass-through, no-request
  - Chain executor integration (1 test): mismatch skips to next candidate
- All 109 kernel tests pass with zero regressions

## Completion Signal

This plan is complete when prompt and asset orchestrators are thin coordinators over the same shared analyzer kernel for all cross-cutting behavior, while preserving their distinct runtime lifecycles.
