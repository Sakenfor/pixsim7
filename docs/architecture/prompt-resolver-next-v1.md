# Prompt Resolver Architecture

## Core Idea

Same block library. Same template source (initially). Same high-level intent inputs.
Multiple compilers and resolvers operating over shared content.

The system has **two independently evolvable layers**:

### Layer 1: Compiler (`template → ResolutionRequest`)

Reads from the shared content source (blocks, templates, control values) and emits
a neutral intermediate representation (`ResolutionRequest`).

- Can have versions: `compiler_v1`, `compiler_v2`, etc.
- Each version may enrich the IR differently, but all emit the same `ResolutionRequest` schema.
- The compiler is a first-class entity, not just a helper function.

### Layer 2: Resolver (`ResolutionRequest → ResolutionResult`)

Consumes the neutral IR and applies a solving strategy.

- Can have versions: `legacy_v1`, `next_v1`, future resolvers.
- All resolvers operate over the same `ResolutionRequest` shape.
- Resolver selection is independent of compiler selection.

### Long-Term Target

```
shared content (blocks + templates)
         ↓
  compiler_v1 / compiler_v2   ← independently evolvable
         ↓
  ResolutionRequest (neutral IR)
         ↓
  LinkBackedRefBinder          ← bind op refs, prune unresolvable candidates
         ↓
  legacy_v1 / next_v1 / ...   ← independently evolvable
         ↓
  ResolutionResult
```

> **Note (March 2026):** `LinkBackedRefBinder` is now an implemented stage
> between compiler and resolver. It enriches `CandidateBlock.metadata.op` with
> `resolved_refs` / `resolved_params` and prunes candidates that cannot satisfy
> required refs. Binding mode (`off` | `advisory` | `required`) is controlled
> via `template_metadata.ref_binding_mode`. See
> `services/prompt/block/ref_binding_adapter.py` and
> [`prompt-pipeline-current-state.md`](./prompt-pipeline-current-state.md#2b-linkbackedrefbinder-ref-binding-stage)
> for details.

Multiple compilers all emit the same IR schema.
Multiple resolvers all consume the same IR schema.
Neither layer needs to know about the other's internals.

### Acceptable Transition State

During migration, these paths may coexist:

- **Legacy roll path**: `template_service.py` direct runtime (no `ResolutionRequest`, no registry)
- **Workbench path**: `compiler_v1 → next_v1` via dev endpoints

This is fine. The transition does not require a big-bang switch.

---

## Why

Current block selection is effective but tightly coupled:

- template/slot structures
- weighted tag scoring behavior
- selection/debug logic inside `template_service.py`

That makes it harder to:

- swap solving strategies
- compare resolvers on the same input
- reason about global cross-target compatibility
- build future board/graph UIs over a stable planning interface

---

## High-Level Pipeline

1. `Content` — blocks, templates, vocabularies (shared source of truth)
2. `Compiler` — reads content, emits `ResolutionRequest` (neutral IR)
3. `RefBinder` — enriches candidates with bound op refs; prunes unresolvable (mode-dependent)
4. `Resolver` — consumes enriched IR, applies solving strategy, returns `ResolutionResult`
5. `Assembler` — composes prompt/output from result
6. `UI` — edits intent/controls only; does not know about resolver internals

---

## Implemented

```
pixsim7/backend/main/services/prompt/block/resolution_core/
  types.py           — ResolutionRequest / ResolutionResult / trace types (neutral IR)
  interfaces.py      — BlockResolver protocol
  registry.py        — ResolverRegistry (pluggable resolver lookup)
  next_v1_resolver.py — next_v1 implementation
  legacy_adapter.py  — post-hoc normalizer: slot_results → ResolutionResult (not a full resolver)
  trace.py           — trace event helpers
```

`compiler_v1` is currently implemented as `_compile_template_to_resolution_request()`
in `pixsim7/backend/main/api/v1/block_templates.py`. It is not yet a formal versioned
entity with its own interface, but functions as the first compiler implementation.

Legacy runtime stays in:

```
pixsim7/backend/main/services/prompt/block/template_service.py
```

## Resolver Interface (Minimal, Future-Safe)

### `ResolutionRequest`

This is the neutral input to any resolver.

```python
from dataclasses import dataclass, field
from typing import Any, Literal

ResolverId = Literal["legacy_v1", "next_v1"]

@dataclass(slots=True)
class ResolutionRequest:
    resolver_id: str
    seed: int | None = None

    # Template/plan-level intent (UI/template compiler output)
    intent: "ResolutionIntent" = field(default_factory=lambda: ResolutionIntent())

    # Candidate pool prepared by caller (legacy template service can still do filtering)
    candidates_by_target: dict[str, list["CandidateBlock"]] = field(default_factory=dict)

    # Optional hard constraints provided by compiler/template features
    constraints: list["ResolutionConstraint"] = field(default_factory=list)

    # Runtime/debug behavior knobs
    debug: "ResolutionDebugOptions" = field(default_factory=lambda: ResolutionDebugOptions())

    # Back-compat passthrough for incremental migration (template slug, user id, etc.)
    context: dict[str, Any] = field(default_factory=dict)
```

### `ResolutionIntent`

Neutral plan/intent structure. Slots can exist here, but are not required as the only structure.

```python
@dataclass(slots=True)
class ResolutionIntent:
    # User-facing control values normalized by compiler/lazy-control resolver
    control_values: dict[str, int | float | str | bool] = field(default_factory=dict)

    # Soft preferences (weighted goals)
    desired_tags_by_target: dict[str, dict[str, str | list[str]]] = field(default_factory=dict)
    avoid_tags_by_target: dict[str, dict[str, str | list[str]]] = field(default_factory=dict)

    # Optional typed features/capabilities for next_v1
    desired_features_by_target: dict[str, dict[str, Any]] = field(default_factory=dict)
    required_capabilities_by_target: dict[str, list[str]] = field(default_factory=dict)

    # Optional explicit role/target graph (works for slots, layers, or nodes)
    targets: list["ResolutionTarget"] = field(default_factory=list)
```

### `ResolutionTarget`

Target is intentionally generic (can represent slot/layer/node).

```python
@dataclass(slots=True)
class ResolutionTarget:
    key: str                     # stable key, e.g. "uniform_aesthetic", "wardrobe_modifier"
    kind: str                    # "slot", "layer", "node_input", ...
    label: str | None = None
    category: str | None = None
    capabilities: list[str] = field(default_factory=list)
    metadata: dict[str, Any] = field(default_factory=dict)
```

### `CandidateBlock`

Normalized block candidate passed to resolver (built from existing block records).

```python
@dataclass(slots=True)
class CandidateBlock:
    block_id: str                # canonical string id
    package_name: str | None
    text: str

    # Existing content model data (keep current tags usable)
    tags: dict[str, str | list[str]] = field(default_factory=dict)
    category: str | None = None
    avg_rating: float | None = None

    # Future-proof typed/capability layer
    features: dict[str, Any] = field(default_factory=dict)
    capabilities: list[str] = field(default_factory=list)

    # Debug/source metadata
    metadata: dict[str, Any] = field(default_factory=dict)
```

### `ResolutionConstraint`

Hard constraints / compatibility rules (optional in `legacy_v1`, primary in `next_v1`).

```python
@dataclass(slots=True)
class ResolutionConstraint:
    id: str
    kind: str  # e.g. "requires_tag", "forbid_pair", "requires_capability", "custom"
    target_key: str | None = None
    payload: dict[str, Any] = field(default_factory=dict)
    severity: str = "error"  # "error" | "warn"
```

### `ResolutionResult`

Must be rich enough for debugging and UI explainability.

```python
@dataclass(slots=True)
class ResolutionResult:
    resolver_id: str
    seed: int | None

    selected_by_target: dict[str, "SelectedBlock"]

    warnings: list[str] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)

    # Explainability / diffing
    trace: "ResolutionTrace" = field(default_factory=lambda: ResolutionTrace())

    # Resolver-specific extras (kept namespaced)
    diagnostics: dict[str, Any] = field(default_factory=dict)
```

### `SelectedBlock`

```python
@dataclass(slots=True)
class SelectedBlock:
    target_key: str
    block_id: str
    text: str
    score: float | None = None
    reasons: list[str] = field(default_factory=list)
    metadata: dict[str, Any] = field(default_factory=dict)
```

### `ResolutionTrace`

Trace should be standardized enough to compare `legacy_v1` vs `next_v1`.

```python
@dataclass(slots=True)
class ResolutionTrace:
    events: list["TraceEvent"] = field(default_factory=list)

@dataclass(slots=True)
class TraceEvent:
    kind: str  # "target_start", "candidate_scored", "constraint_failed", "selected", ...
    target_key: str | None = None
    candidate_block_id: str | None = None
    score: float | None = None
    message: str | None = None
    data: dict[str, Any] = field(default_factory=dict)
```

### `Resolver` interface

```python
from typing import Protocol

class BlockResolver(Protocol):
    resolver_id: str

    def resolve(self, request: ResolutionRequest) -> ResolutionResult:
        ...
```

## `legacy_v1` vs `next_v1` Responsibilities

### `legacy_v1` (adapter around current behavior)

- Uses existing weighted-tag / weighted-rating / diverse logic
- Can ignore unsupported `features/capabilities/constraints`
- Emits trace best-effort from current debug data
- Primary purpose: compatibility + baseline comparison

### `next_v1` (pilot)

Recommended pilot behavior:

- Hard constraints first (validity)
- Soft scoring second (style preference)
- Explicit trace
- Narrow domain initially (e.g. police/tribal + allure family)

Do **not** aim for full parity on day one.

## Integration Plan (Low Risk)

### Phase 1: Types + Registry (no behavior change)

- Add `resolution_core/types.py`, `interfaces.py`, `registry.py`
- No callers yet

### Phase 2: `legacy_v1` adapter

- Wrap current selection behavior in `legacy_adapter.py`
- Return `ResolutionResult`
- No changes to template YAML/content required

### Phase 3: `next_v1` pilot

- Implement `next_v1_resolver.py` for a narrow template family
- Add resolver selection in dev path only (template metadata override or dev param)

### Phase 4: Comparison / Diff Tooling

- Run both resolvers on same input
- Diff:
  - selected blocks
  - scores
  - trace events

## Suggested Resolver Selection Sources

Resolver choice should be overrideable in this order:

1. explicit request param (dev/testing)
2. template metadata default (future)
3. system default (`legacy_v1`)

Possible template metadata shape (future):

```yaml
template_metadata:
  resolver:
    default: legacy_v1
    allowed: [legacy_v1, next_v1]
```

## How This Maps to Current Police/Allure Work

Current work (good to keep):

- blocks remain authorable via tags/categories
- control presets and template features remain compile-time sugar
- `allure` core profile can feed multiple adapters

`next_v1` can consume the same content but with stronger internals:

- constraints for incompatible combos
- pairwise scoring for nuanced interactions
- capability-aware matching (later)

## What Not To Do Yet

- Do not rewrite all templates to a new schema
- Do not remove slot-based compilation yet
- Do not require UI changes before resolver core exists
- Do not force exact legacy parity before `next_v1` proves value

## First Concrete Pilot (recommended)

Target family:

- police precinct break-room
- tribal-theme-woman (partial)

Use cases:

- base aesthetic + wardrobe allure modifier
- variant selector + allure slider
- compare `legacy_v1` vs `next_v1` trace on same controls

This is enough to validate the architecture without a full rewrite.
