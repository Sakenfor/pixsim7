# Prompt Pipeline — Current State (pre-redesign snapshot)

> Captured before block schema redesign. Documents the compiler → resolver → assembly
> pipeline as it exists, including all schema dependencies and coupling points.

## Overview

```
Template (slots + controls)
  → CompilerV1 (expand slots, apply controls, fetch candidates)
  → ResolutionRequest IR (targets + candidates + constraints)
  → NextV1Resolver (score candidates, pick winners per target)
  → Assembly (concatenate selected block texts in slot order)
  → Final prompt string
```

## 1. Registry System

Compilers and resolvers are pluggable via `SimpleRegistry[K, V]`.

| Registry | Key | Default Implementation |
|----------|-----|-----------------------|
| `CompilerRegistry` | `compiler_id` | `CompilerV1` |
| `ResolverRegistry` | `resolver_id` | `NextV1Resolver` |

**Files:**
- `lib/registry/simple.py` — generic base
- `services/prompt/block/compiler_core/registry.py`
- `services/prompt/block/resolution_core/registry.py`

Built via `build_default_compiler_registry()` / `build_default_resolver_registry()`,
called from API layer.

## 2. CompilerV1

**File:** `services/prompt/block/compiler_core/compiler_v1.py`

Transforms a template + control values into a `ResolutionRequest` IR.

### Steps:

1. **Normalize slots** — v1→v2 migration (`tag_constraints` → `tags` with groups),
   expand presets from `SLOT_PRESETS`
2. **Resolve lazy controls** — `tag_select` controls query DB for distinct tag values,
   populate dropdown options
3. **Apply control effects** — sliders: highest `enabledAt ≤ value` wins;
   selects: use selected option. Merges `boostTags`/`avoidTags` into slot preferences.
4. **Per slot** (skip `reinforcement` and `audio_cue` kinds):
   - Create `ResolutionTarget` with `key`, `label`, `role`, `category`, `capabilities`
   - Fetch candidate `PromptBlock` rows via `service.find_candidates(slot, limit)`
   - Convert to `CandidateBlock` dataclass
   - Build constraints from slot tag groups
5. **Emit** `ResolutionRequest`

### Block fields read by compiler:

| Field | Usage |
|-------|-------|
| `block_id` | Unique ID, constraint references |
| `text` | Prompt content |
| `role` | → `capabilities` list as `f"role:{role}"` |
| `category` | → `capabilities` list as-is |
| `tags` | Nested dict, passed through to resolver |
| `package_name` | Metadata |
| `avg_rating` | Passed to resolver for scoring |

### Capability generation (hardcoded):

```python
capabilities = []
if block.category:
    capabilities.append(block.category)
if block.role:
    capabilities.append(f"role:{block.role}")
```

Resolver enforces `required_capabilities` against this list.

## 3. Block Query Builder

**File:** `services/prompt/block/block_query.py`

`build_prompt_block_query()` — SQLAlchemy query factory used by `find_candidates()`.

### Filterable fields:

| Field | Filter Type |
|-------|-------------|
| `role` | Exact match |
| `category` | Exact match |
| `kind` | Exact match |
| `default_intent` | Exact match |
| `package_name` | Exact match |
| `complexity_level` | Range (enum order: `simple < moderate < complex < very_complex`) |
| `avg_rating` | `>= threshold` |
| `tags` | JSONB path extraction with `all`/`any`/`not` groups |
| `is_public` | Boolean |
| `block_id`, `text` | ILIKE text search |
| `exclude_block_ids` | NOT IN list |

### Tag query format (canonical):

```python
tags: {
    "all": {"key": "value", ...},   # AND — all must match
    "any": {"key": "value", ...},   # OR — at least one matches
    "not": {"key": "value", ...}    # NOT — none must match
}
# Values can be scalars or lists (IN semantics)
```

Uses PostgreSQL `jsonb_extract_path_text` for extraction.

## 4. NextV1Resolver

**File:** `services/prompt/block/resolution_core/next_v1_resolver.py`

### Algorithm:

1. **Order targets** — topological sort by dependencies (`requires_other_selected`,
   pairwise bonuses), fall back to declared order
2. **Per target**:
   - Filter candidates by hard constraints (`REQUIRES_TAG`, `FORBID_TAG`,
     `REQUIRES_CAPABILITY`, `FORBID_PAIR`)
   - Score remaining candidates
   - Apply pairwise bonuses from already-selected targets
   - Select highest-scored

### Constraint kinds:

| Kind | Behavior |
|------|----------|
| `REQUIRES_TAG` | Block must have tag matching value |
| `FORBID_TAG` | Block must NOT have tag matching value |
| `REQUIRES_CAPABILITY` | Block must declare capability |
| `FORBID_PAIR` | Block can't co-exist with specific block in other target |
| `REQUIRES_OTHER_SELECTED` | Other target must resolve first (ordering) |

### Scoring:

```python
score = 0.0
# Desired tags (from slot preferences.boost_tags)
for tag_key, expected in desired_tags:
    if match: score += 2.0

# Avoided tags (from slot preferences.avoid_tags)
for tag_key, expected in avoid_tags:
    if match: score -= 2.5

# Desired features
for feature_key, expected in desired_features:
    if match: score += 1.5

# Rating
if avg_rating:
    score += clamp(rating, 0, 5) * 0.2
```

### CandidateBlock schema (resolver input):

```python
@dataclass
class CandidateBlock:
    block_id: str
    text: str
    package_name: Optional[str] = None
    tags: Dict[str, Any] = {}
    category: Optional[str] = None
    avg_rating: Optional[float] = None
    features: Dict[str, Any] = {}       # Unused by default resolver
    capabilities: List[str] = []        # Built from role + category
    metadata: Dict[str, Any] = {}
```

## 5. Template Slots

**File:** `services/prompt/block/template_slots.py`

### TemplateSlotSpec fields:

```python
key: Optional[str]                  # Stable ID for control targeting
label: str                          # Display name
role: Optional[str]                 # → PromptBlock.role filter
category: Optional[str]             # → PromptBlock.category filter
kind: Optional[str]                 # → PromptBlock.kind filter
intent: Optional[str]               # → PromptBlock.default_intent filter
package_name: Optional[str]         # → PromptBlock.package_name filter
complexity_min/max: Optional[str]   # Range filter
min_rating: Optional[float]         # Rating threshold
tags: Optional[Dict]                # Tag groups {all, any, not}
preferences: Optional[Prefs]       # boost_tags, avoid_tags, diversity, novelty
selection_strategy: str             # "uniform" | "weighted_tags" | "weighted_rating"
weight: float                       # Slot importance
optional: bool                      # Can be empty
fallback_text: Optional[str]        # Text when no candidate found
intensity: Optional[int]            # 0-10 scale
```

### Slot presets (`SLOT_PRESETS`):

Predefined slot configurations expanded at compile time.
Examples: `subject_preservation`, `three_layer_composition`,
`pose_lock_graduated`, `wardrobe_allure_modifier`.

## 6. Template Controls

**File:** `services/prompt/block/template_controls.py`

### Control types:

| Type | Status | Mechanism |
|------|--------|-----------|
| `slider` | Working | `enabledAt` thresholds, highest ≤ value wins |
| `select` | Planned | Per-option effects |
| `tag_select` | Working | Lazy-resolved: queries distinct tag values → select |

### Effect schema:

```python
{
    "kind": "slot_tag_boost" | "slot_intensity",
    "slotLabel": str,       # Target slot by label
    "slotKey": str,         # Target slot by key (preferred)
    "enabledAt": number,    # Activation threshold (sliders only)
    "boostTags": {...},     # Merged into preferences.boost_tags
    "avoidTags": {...},     # Merged into preferences.avoid_tags
}
```

## 7. Assembly

**File:** `services/prompt/block/template_service.py` → `roll_template()`

Post-resolution step:
1. Iterate selected blocks in slot order
2. Extract `PromptBlock.text` from each
3. Sequential concatenation
4. Reinforcement/audio_cue literal text injected separately
5. Return prompt string + block metadata + warnings

No reordering by role. Slot declaration order = prompt order.

## 8. Content Pack Loader

**File:** `services/prompt/block/content_pack_loader.py`

### Minimum block YAML:

```yaml
- block_id: "my_block"     # Required, unique
  text: "prompt text"      # Required
  # Everything else optional with defaults
```

### Defaults applied at load:

```python
role: None, category: None, kind: "single_state",
tags: {}, complexity_level: "simple", package_name: (inherited),
style: "cinematic", duration_sec: 1.0, source_type: "library",
curation_status: "curated", is_public: True
```

### Discovery:

`discover_content_packs()` scans `content_packs/prompt/` for direct child dirs
containing `blocks.yaml`, `blocks/*.yaml`, `templates.yaml`, `templates/*.yaml`,
or `characters.yaml` / `characters/*.yaml`.

## 9. Schema Coupling Summary

### What the pipeline hard-depends on:

| Dependency | Components | Breaking if removed |
|------------|-----------|---------------------|
| `block_id` (unique string) | Compiler, Resolver, Constraints | Yes — identity |
| `text` (string) | Assembly output | Yes — no prompt |
| `tags` (nested dict) | Query builder (JSONB), Resolver scoring | Yes — filtering breaks |
| `role` → capability | Compiler, Resolver | Partial — slots can use tags instead |
| `category` → capability | Compiler, Resolver | Partial — slots can use tags instead |

### What's soft/optional:

| Field | Impact if removed |
|-------|-------------------|
| `complexity_level` | Slots can't range-filter; no functional loss |
| `avg_rating` | Scoring loses rating component; minor |
| `package_name` | Can't scope blocks to a pack; minor |
| `kind` | Only matters for `single_state` vs `transition`; usually `single_state` |
| `default_intent` | Slot intent filtering disabled; rarely used |

### Path to simpler blocks:

A block with just `block_id`, `text`, and `tags: {type: light}` works through
the full pipeline if slots filter via `tags: {all: {type: light}}` instead of
`role: lighting`. The capability system won't fire (no role/category), but
tag-based constraints and scoring still work. This is the minimum viable path
for new block types.
