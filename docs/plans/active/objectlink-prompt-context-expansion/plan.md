# ObjectLink Prompt Context Expansion

Last updated: 2026-03-16
Owner: links/context lane
Status: active
Stage: proposed

## Goal

Expand ObjectLink-driven prompt context resolution from NPC-centric behavior to broader entity support with explicit contracts, mapping coverage, and observability.

## Scope

- In scope:
  - Add and verify link types, entity loaders, and mapping registry entries for missing entity pairs.
  - Introduce resolver registrations and enrichers for non-NPC entity types in `PromptContextService`.
  - Improve test coverage for link-resolution edge cases and context fallback behavior.
  - Define agent-facing usage guidance for link-based context resolution.
- Out of scope:
  - UI redesign of prompt context tools.
  - Breaking schema changes for existing NPC flows.
  - Full migration of all world/entity authoring surfaces in one pass.

## Current Baseline

- Relevant files/endpoints/services:
  - `pixsim7/backend/main/services/links/link_types.py`
  - `pixsim7/backend/main/services/links/entity_loaders.py`
  - `pixsim7/backend/main/services/links/mapping_registry.py`
  - `pixsim7/backend/main/services/links/object_link_resolver.py`
  - `pixsim7/backend/main/services/prompt/context/resolver.py`
  - `pixsim7/backend/main/services/refs/entity_resolver.py`
  - `pixsim7/backend/main/startup.py`
- Existing startup wiring already initializes default link types/loaders/mappings.
- Prompt context service auto-registers only the NPC resolver by default.

## Decisions Already Settled

- ObjectLink remains the canonical template-runtime linking mechanism.
- Resolver and mapping registries are startup-initialized infrastructure, not per-feature singletons.
- Expansion must preserve backward compatibility for current NPC context consumers.

## Delivery Phases

### Phase 0: Coverage Audit and Contract Inventory

- [ ] Inventory currently registered link types, loaders, and mappings against required entity families.
- [ ] Document gaps and prioritize them by runtime impact.
- [ ] Confirm prompt-context request/response contract expectations for each candidate entity type.

Exit criteria:

- Gap matrix exists with explicit entity pairs and required mapping/loader additions.

### Phase 1: Registration and Mapping Expansion

- [ ] Add missing link type specs and mapping factories where canonical.
- [ ] Add/verify loader registrations for all mapped kinds.
- [ ] Ensure mapping registry and prompt-context resolver registry stay aligned.

Exit criteria:

- New entity pairs resolve through ObjectLink without ad-hoc direct DB fallback code.

### Phase 2: Prompt Context Resolver Extensions

- [ ] Register non-NPC resolvers in `PromptContextService` where needed.
- [ ] Define adapter strategy for converting link-resolved fields into `PromptContextSnapshot`.
- [ ] Add explicit fallback behavior for unresolved runtime links.

Exit criteria:

- Non-NPC prompt context resolution paths are available and covered by targeted tests.

### Phase 3: Testing and Observability

- [ ] Expand service tests for resolver registration, runtime-kind disambiguation, and fallback semantics.
- [ ] Add regression tests for startup registration integrity.
- [ ] Document agent-facing discovery/usage notes for link-based context flows.

Exit criteria:

- Tests cover positive/negative link resolution cases for each newly supported entity family.

## Risks

- Risk: Added mappings drift from resolver expectations.
  - Mitigation: enforce mapping/resolver alignment checks in tests.
- Risk: Link type growth introduces ambiguous runtime-kind resolution.
  - Mitigation: define deterministic runtime-kind selection policy and explicit errors.
- Risk: Context snapshots become inconsistent across entity types.
  - Mitigation: enforce normalized snapshot contract and adapter-level tests.

## Update Log

- 2026-03-16 (`uncommitted`): Created ObjectLink prompt-context expansion plan and initial phased scope.
