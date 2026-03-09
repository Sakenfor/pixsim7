# Extension Platform Unification Handoff

## Why this doc

We want to avoid a narrow "minimal patch" and move toward a unified extension platform that covers:

1. backend plugins
2. analyzers
3. semantic packs
4. block packs/primitives

This handoff gives Claude a concrete starting point with code anchors already added.

Operational tracker:
- [`program-tracker.md`](./program-tracker.md)

## Current state (validated in codebase)

### Already in place

1. Capability sandbox for backend plugins (permission-gated APIs, no direct internals by default).
2. Permission validation and group expansion at plugin load.
3. Plugin ID prefixing and child manager support (namespace mechanics).
4. Per-user plugin enable/disable state in DB.
5. Per-world plugin activation via `GameWorld.meta.behavior.enabledPlugins`.
6. Analyzer plugin registration hooks (plugins can register/unregister analyzers).
7. Analyzer preset review workflow (draft/pending/approved/rejected).
8. Semantic packs with draft/published/deprecated states.
9. Primitive blocks require namespaced `block_id` format (`<namespace>.<name>`).

### Missing for full unification

1. Single lifecycle model across all extension types.
2. Canonical cross-domain extension ID scheme.
3. Shared owner namespace model (`core`, `org`, `user`) across plugins/analyzers/packs.
4. Shared publish/review pipeline for plugin-like artifacts.
5. Unified registry/catalog projection for all extension kinds.
6. Artifact/provenance model (version, origin, policy decision, approval metadata).
7. Analyzer ID bridge plan: current analyzer IDs are `<target>:<name>` and are not directly compatible with extension identity format.

## New scaffold added in this pass

### Backend shared contract

File: `pixsim7/backend/main/shared/extension_contract.py`

Provides:

1. Canonical ID format support:
   - `<kind>:<scope>.<owner>/<name>[@<version>]`
2. Legacy-compatible parse path for migration.
3. Shared enums:
   - `ExtensionKind`
   - `ExtensionScope`
   - `ExtensionLifecycleStatus`
4. Lifecycle guard helpers:
   - `is_editable_lifecycle`
   - `can_submit_lifecycle`
   - `can_approve_lifecycle`
   - `can_publish_lifecycle`

File: `pixsim7/backend/main/shared/__init__.py`

1. Exports the new shared contract symbols.

File: `pixsim7/backend/tests/test_extension_contract.py`

1. Tests canonical parse/build.
2. Tests legacy fallback parse.
3. Tests lifecycle helper semantics.

## Recommended target architecture (non-minimal)

```
Authoring surfaces (UI/API/AI agents)
        |
        v
Unified Extension Draft Store
(type + owner namespace + lifecycle + version)
        |
        v
Review / Policy Pipeline
(submit -> approve/reject -> publish/deprecate)
        |
        v
Unified Extension Registry (read projection)
        |                \
        |                 \--> Runtime loaders (plugin manager, analyzer registry, pack loaders)
        |
        \--> Discovery APIs (frontend, admin, automation)
```

## Claude implementation tracks

### Track A: Canonical identity adoption

1. Introduce extension identity columns where needed:
   - `kind`, `scope`, `owner`, `name`, `version`
2. Keep legacy ID columns for compatibility.
3. Add migration adapters:
   - read legacy -> parse to `ExtensionIdentity`
   - write canonical + legacy shadow during transition
4. Do not break existing plugin/analyzer IDs yet.

### Track B: Unified lifecycle

1. Add a shared lifecycle service for:
   - draft
   - submitted
   - approved
   - rejected
   - published
   - deprecated
2. Bridge existing workflows:
   - analyzer presets
   - semantic packs
3. Add transition validation using shared helpers.

### Track C: Unified registry projection

1. Build a read-model table/view:
   - `extension_catalog`
2. Include all extension kinds.
3. Include runtime capability metadata and enablement flags.
4. Power frontend discovery from this single projection over time.

### Track D: Runtime integration

1. Plugin manager:
   - keep current loading; add canonical identity metadata.
2. Analyzer registry:
   - attach canonical identity metadata for plugin-provided analyzers.
3. Packs/blocks:
   - align namespace ownership (`core/org/user`) to canonical identity.

### Track E: Policy and approval hardening

1. Centralize submit/approve/reject/publish permission checks.
2. Add audit records for decisions.
3. Add explicit policy markers:
   - trusted source
   - requires manual review
   - blocked permissions

## Sequence recommendation

1. Track A0 (analyzer ID migration plan) first.
2. Track A (identity adoption) second.
3. Track B (lifecycle) third.
4. Track C (registry projection) fourth.
5. Track D (runtime wiring) fifth.
6. Track E (policy hardening) sixth.

Reason: this order minimizes runtime disruption and avoids rework.

## Guardrails

1. Keep legacy IDs readable and operational until migration is complete.
2. No forced runtime path switch in one PR.
3. Every transition should have test vectors:
   - canonical IDs
   - legacy IDs
   - mixed-mode reads/writes
4. Preserve existing permission sandbox behavior for backend plugins.

## Definition of done (phase 1)

1. Canonical identity parse/build used in at least:
   - analyzer preset model/service boundary
   - semantic pack boundary
2. Shared lifecycle helper used by at least two extension domains.
3. New migration notes and endpoint contracts documented.
4. Zero behavior regression in existing plugin/analyzer runtime paths.
