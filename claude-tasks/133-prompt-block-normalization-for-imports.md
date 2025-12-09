# 133 – Normalize Imported Prompts into Prompt Blocks

## Current State (Dec 2025)

### What's Been Done ✅

**Phase 1 Complete: Prompt analysis now persisted on Assets**

- Added `Asset.prompt_analysis` field (JSON column) - stores `{prompt, blocks, tags}`
- `create_from_submission()` now calls `analyze_prompt()` automatically
- Every new asset gets its prompt analyzed and stored at creation time
- Migration: `20251208_0001_add_asset_prompt_analysis.py`

**Files changed:**
- `domain/asset.py` — added `prompt_analysis` field
- `services/asset/core_service.py` — analyze on creation, extract prompt from generation

### Current Capabilities

| Component | Location | What It Does |
|-----------|----------|--------------|
| `analyze_prompt()` | `services/prompt_dsl_adapter.py` | Returns `{prompt, blocks, tags}` |
| `SimplePromptParser` | `services/prompt_parser/simple.py` | 6 roles, ~117 keywords, sentence-level classification |
| `dev_prompt_inspector` | `api/v1/dev_prompt_inspector.py` | REST endpoint to inspect any prompt |
| `dev_prompt_categories` | `api/v1/dev_prompt_categories.py` | AI Hub integration for category discovery |

### Example `prompt_analysis` Output

```json
{
  "prompt": "A werewolf enters the dark forest, walking slowly with glowing eyes",
  "blocks": [
    {"role": "character", "text": "A werewolf enters the dark forest, walking slowly with glowing eyes"}
  ],
  "tags": ["has:character", "has:action"]
}
```

### Current Limitations (What the Parser Can't Do)

The `SimplePromptParser` is **keyword-based and sentence-level**. It cannot:

1. **Extract sub-phrases** — "She enters from the left, brushing her hair" is ONE block, not two
2. **Identify hand/body motion** — Would need NLP or LLM to slice "brushing her hair" out
3. **Detect entrance directions** — "from the left" isn't extracted as metadata
4. **Recognize camera cues** — Only detects "pov", "close-up" etc. as tags, not structured data

---

## Remaining Work (Phases 2-3)

### Phase 2: Unified ActionBlockDB Approach (Recommended)

**Decision: No separate PromptBlock table.** Instead, extend ActionBlockDB to handle both raw and curated blocks.

**Why unified?**
- ActionBlockDB already has `prompt`, `tags`, `compatible_*`, `package_name`, usage tracking
- Already has `source_type` and `extracted_from_prompt_version` for provenance
- Avoids schema drift, separate "promotion" pathway, query confusion
- One query surface for the whole system

**Two-tier storage model:**

```
┌─────────────────────────────────────────────────────────────────┐
│  PromptVersion.prompt_analysis (JSON)                           │
│  - Cheap storage for ALL parsed blocks (every sentence)         │
│  - No filtering, just raw analysis output                       │
│  - Fast to write, slow to query across prompts                  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ (heuristics OR user picks block)
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  ActionBlockDB                                                  │
│  - Only MEANINGFUL blocks (not every sentence)                  │
│  - Indexed, queryable across all prompts                        │
│  - Full lifecycle: raw → reviewed → curated                     │
└─────────────────────────────────────────────────────────────────┘
```

**When to create ActionBlockDB rows:**
- ❌ NOT for every parsed sentence (bloat)
- ✅ Heuristics: action blocks with ontology tags we care about
- ✅ User explicitly picks a phrase to save as block
- ✅ Import from external block libraries

**New fields to add to ActionBlockDB:**

```python
# Add to ActionBlockDB model:

role: Optional[ParsedRole] = Field(
    default=None,
    sa_column=Column(SAEnum(ParsedRole, native_enum=False), index=True),
    description="Coarse classification: character, action, setting, mood, romance, other"
)

category: Optional[str] = Field(
    default=None,
    max_length=64,
    index=True,
    description="Fine-grained label for UI: entrance, hand_motion, camera_pov"
)

analyzer_id: Optional[str] = Field(
    default=None,
    max_length=64,
    description="Who extracted: 'parser:simple', 'llm:claude-3', NULL for manual"
)

curation_status: str = Field(
    default="curated",
    max_length=20,
    index=True,
    description="raw | reviewed | curated"
)
```

**New indexes:**

```python
__table_args__ = (
    # ... existing indexes ...
    Index("idx_action_block_role_category_status", "role", "category", "curation_status"),
    Index("idx_action_block_source_extracted", "source_type", "extracted_from_prompt_version"),
)
```

**Curation matrix:**

| source_type | curation_status | Meaning |
|-------------|-----------------|---------|
| `ai_extracted` | `raw` | Machine-suggested, not reviewed |
| `ai_extracted` | `reviewed` | Machine-found, human-reviewed |
| `ai_extracted` | `curated` | Machine-found, human-approved + enhanced |
| `user_created` | `curated` | Hand-authored by user |
| `library` | `curated` | From block library/import |

**Query patterns:**

```sql
-- Curator tools: show raw + reviewed blocks
SELECT * FROM action_blocks
WHERE curation_status IN ('raw', 'reviewed');

-- Production/gameplay: only curated + library
SELECT * FROM action_blocks
WHERE curation_status = 'curated' OR source_type = 'library';

-- Find all entrance blocks
SELECT * FROM action_blocks
WHERE category = 'entrance' AND curation_status = 'curated';

-- Find blocks from a specific prompt
SELECT * FROM action_blocks
WHERE extracted_from_prompt_version = '<uuid>';
```

**Semantic anchoring (critical):**
- `role` = ParsedRole enum (stable, for logic)
- `category` = string label (for UI, can change)
- `tags["ontology_ids"]` = canonical IDs (for actual semantics)

Changing `category` from "hand_motion" to "hand_move" doesn't break anything — queries that need stability use `tags["ontology_ids"]`.

### Phase 3: Fine-Grained Extraction (Research Needed)

To extract "hand motion", "entrance direction", "camera cues" as separate blocks, we need:

**Option A: LLM-based extraction**
- Call AI Hub with structured prompt asking for sub-phrase extraction
- Store results in `PromptBlock.metadata`
- Expensive but accurate

**Option B: Enhanced keyword patterns**
- Add regex patterns for common phrases ("from the left", "with one hand")
- Cheaper but brittle

**Option C: Hybrid (Recommended)**
- Use SimplePromptParser for all prompts (fast, free)
- For prompts > N sentences OR with low keyword coverage, call LLM:
  - "Extract entrance direction, hand motion, camera cues as discrete phrases"
- Cap LLM calls per day/user to control costs
- Store analyzer provenance: `analyzer = "simple_parser"` vs `analyzer = "ai_hub:v2"`

**LLM Extraction Prompt (example):**
```
Given this video generation prompt, extract discrete phrases for:
- entrance_direction: how/where subject enters
- hand_motion: what hands are doing
- body_motion: movement/pose
- camera: camera angle/movement
- expression: facial expression

Prompt: "A woman enters from the left, brushing her hair with one hand while smiling softly, camera slowly zooms in"

Return JSON:
{
  "entrance_direction": "enters from the left",
  "hand_motion": "brushing her hair with one hand",
  "body_motion": null,
  "camera": "camera slowly zooms in",
  "expression": "smiling softly"
}
```

---

## Original Task Scope (For Reference)

## Context / Purpose
We have dozens of "wild" prompts coming in from external video generations (Pixverse, Midjourney, etc.). Each prompt is a long paragraph with implicit scene descriptions, camera cues, body/hand motion, entrance directions, etc. Our prompt block system (SimplePromptParser + AI Hub analyzers + prompt DSL adapter) already knows how to tease structure out of messy text, but we're not running it on imported prompts today. As a result:

- ~~Imported assets have only a raw string, no block metadata.~~ ✅ Fixed
- Curators can't harvest reusable blocks/phrases for future scenes. ⏳ Needs Phase 2
- Scene editor / lineage views can't answer questions like "what's the hand motion here?" unless we manually read the prompt. ⏳ Needs Phase 3

We need a lightweight "analysis spec" that tells Claude (or other agents) how to process these prompts via the existing adapters, what metadata to capture, and how to store the results so downstream tools (prompt block catalog, scene editor, lineage explorer) can consume consistent block entries.

## Desired Outcomes
1. ✅ Document the flow for analyzing an arbitrary prompt string using current infra
2. ⏳ Define a "block harvesting" spec for imported prompts (needs Phase 3)
3. ⏳ Produce an example import flow with curated block list (needs Phase 2-3)
4. ⏳ Capture gaps/questions for fine-grained extraction (documented above)

---

## Architectural Direction: PromptVersion as Single Source of Truth

### The Problem

Prompts can be analyzed at multiple points:
- **UI/Editor**: Preview blocks before generating
- **Generation creation**: Store analysis with the job
- **Import pipeline**: Analyze wild prompts from external sources

Currently prompt analysis could live in multiple places:
- `PromptVersion.provider_hints.prompt_analysis` (prompt library)
- `Generation.prompt_analysis` (inline prompts)
- `Asset.prompt_analysis` (result)

This creates confusion about where the source of truth is.

### Proposed Model: PromptVersion for Everything

```
┌─────────────────────────────────────────────────────────────────┐
│                      PromptVersion                              │
│  (single source of truth for ALL prompts)                       │
├─────────────────────────────────────────────────────────────────┤
│  id                                                             │
│  prompt_text          ← the actual prompt                       │
│  prompt_hash          ← SHA256 for dedup                        │
│  prompt_analysis      ← {blocks, tags} analyzed once            │
│  provider_hints       ← provider-specific metadata              │
│  family_id (nullable) ← NULL for one-off prompts               │
│  created_at                                                     │
└─────────────────────────────────────────────────────────────────┘
                              ↑
                    prompt_version_id (FK)
                              │
┌─────────────────────────────────────────────────────────────────┐
│                        Generation                               │
├─────────────────────────────────────────────────────────────────┤
│  id                                                             │
│  prompt_version_id    ← always set, never inline prompt         │
│  inputs               ← images, videos, etc.                    │
│  operation_type                                                 │
│  reproducible_hash    ← hash of (prompt_version_id + inputs)    │
└─────────────────────────────────────────────────────────────────┘
                              │
                    multiple submissions = variations
                              │
┌─────────────────────────────────────────────────────────────────┐
│                     ProviderSubmission                          │
├─────────────────────────────────────────────────────────────────┤
│  id                                                             │
│  generation_id                                                  │
│  attempt / variation number                                     │
│  → Asset (on success)                                           │
└─────────────────────────────────────────────────────────────────┘
```

### Flow: User Types a Prompt

```
User types "A wolf enters the forest"
    ↓
hash = SHA256("A wolf enters the forest")
    ↓
Find existing PromptVersion by hash
    OR create new one:
       - prompt_text = "A wolf enters..."
       - prompt_hash = hash
       - prompt_analysis = analyze_prompt(text)
       - family_id = NULL (one-off)
    ↓
Generation.prompt_version_id = version.id
    ↓
User clicks "Generate" again (variation)
    ↓
Same Generation, new ProviderSubmission
    ↓
New Asset linked to same prompt_version
```

### Benefits

| Benefit | Why |
|---------|-----|
| **Dedup** | Same prompt text → same PromptVersion (by hash) |
| **Analyze once** | `prompt_analysis` computed once per unique prompt |
| **Lineage** | "Which generations used this prompt?" = simple FK query |
| **Variations** | Multiple generations with same `prompt_version_id` = intentional variations |
| **Clean model** | Generation never stores prompt text, just references |
| **Pre-generation analysis** | Can analyze in UI before generation exists |

### One-off vs Library Prompts

| Type | `family_id` | Visible in browser | Use case |
|------|-------------|-------------------|----------|
| Library prompt | Set | Yes | Curated, reusable |
| One-off prompt | NULL | No (or filtered) | Quick generation |

### Migration Path

1. Add `prompt_hash` index to PromptVersion (if missing)
2. Add `prompt_analysis` field to PromptVersion (move from `provider_hints`)
3. Update generation creation to always find-or-create PromptVersion
4. Remove inline prompt storage from Generation (`raw_params.prompt` → reference only)
5. Keep `Asset.prompt_analysis` as denormalized cache (see decision below)

### Key Decisions

**Asset.prompt_analysis**: Treat as a **denormalized cache only**. PromptVersion remains the source of truth. New code should always read from PromptVersion first; Asset.prompt_analysis exists for query convenience and offline access.

**Block persistence**: No separate PromptBlock table. Use unified ActionBlockDB with `curation_status` field. `PromptVersion.prompt_analysis` holds all parsed blocks as JSON; only meaningful blocks become ActionBlockDB rows (via heuristics or user selection). This avoids table bloat and query confusion.

**Block classification**: Reuse existing systems instead of hard-coding new enums:

- **`role`** (ParsedRole enum): Parser-driven, stable. Reuses `ParsedRole` from `services/prompt_parser/simple.py` (character, action, setting, mood, romance, other). What SimplePromptParser already produces. Safe to branch on in core logic.

- **`category`** (string): Analysis/LLM-driven, experimental. Free-form for fine-grained extraction (entrance, hand_motion, camera_pov, etc.). Treat as a hint — put structured details in `tags`. Extensible without migrations.

- **`tags`** (Dict[str, Any]): Follows `ActionBlockDB.tags` pattern. Contains **ontology IDs as canonical values**:
  ```json
  {"ontology_ids": ["act:hand_motion", "part:hand"], "motion_type": "act:brush_hair"}
  {"ontology_ids": ["space:from_left"], "entrance_direction": "space:from_left"}
  ```
  See **Ontology Integration** section below for the three-layer model and documented keys.

**Relationship to ActionBlockDB**: PromptBlock is lean and analysis-focused. ActionBlockDB is the curated, human-edited layer. The bridge is "promote" — when a block is deemed reusable, create an ActionBlockDB from that PromptBlock, copying text and relevant tags. No hard FK needed yet.

---

## Ontology Integration: Canonical IDs vs Labels

### The Problem with String-Based Categories

Using `category = "hand_motion"` as the canonical identifier creates brittleness:
- If we rename "hand_motion" to "hand_movement", all queries break
- Different analyzers might use slightly different strings
- No consistency between PromptBlock.category and ActionBlockDB.tags

### Solution: Ontology IDs as the Canonical Layer

We already have infrastructure for this:

| Component | Location | What It Provides |
|-----------|----------|------------------|
| `ontology.yaml` | `shared/ontology.yaml` | Source of truth for IDs like `part:shaft`, `act:hand_motion`, `cam:pov` |
| `Ontology.match_keywords()` | `shared/ontology.py` | Returns list of ontology IDs from text |
| `SimplePromptParser` | `prompt_parser/simple.py:207` | Already calls `match_keywords()` and stores in `metadata["ontology_ids"]` |

### Three-Layer Classification Model

```
┌─────────────────────────────────────────────────────────────────┐
│ Layer 1: role (ParsedRole enum)                                 │
│   → Stable, coarse. Parser-driven.                              │
│   → character, action, setting, mood, romance, other            │
│   → Safe to branch on in core logic                             │
├─────────────────────────────────────────────────────────────────┤
│ Layer 2: category (string)                                      │
│   → Flexible human label for UI/debugging                       │
│   → "hand_motion", "entrance", "camera_pov"                     │
│   → Can change freely — don't key logic on this                 │
├─────────────────────────────────────────────────────────────────┤
│ Layer 3: tags["ontology_ids"] (List[str])                       │
│   → Canonical, stable IDs from ontology.yaml                    │
│   → ["act:hand_motion", "part:hand", "space:from_left"]         │
│   → This is what logic should key on                            │
└─────────────────────────────────────────────────────────────────┘
```

### PromptBlock.tags Schema

Following `ActionBlockDB.tags` pattern, but with documented keys:

```json
{
  "ontology_ids": ["act:hand_motion", "part:hand"],
  "camera_view": "cam:pov",
  "motion_type": "act:walk_slow",
  "body_part": "part:hand",
  "entrance_direction": "space:from_left",
  "intensity": "intensity:soft",
  "speed": "speed:slow"
}
```

Key rules:
- **`ontology_ids`**: Always populated from parser's `metadata["ontology_ids"]`
- **Typed keys** (`camera_view`, `motion_type`, etc.): Values are ontology IDs, not strings
- **Labels** (`category`): Human-readable, can change without breaking queries

### Implementation: Ontology Bridge

Create a small bridge module to centralize the mapping:

```python
# services/prompt_ontology_bridge.py

from pixsim7.backend.main.shared.ontology import load_ontology

def annotate_prompt_block(block: PromptBlock) -> PromptBlock:
    """
    Enrich a PromptBlock with ontology IDs.

    Called when persisting blocks to ensure ontology_ids are always populated.
    """
    ontology = load_ontology()
    ontology_ids = ontology.match_keywords(block.text.lower())

    if ontology_ids:
        block.tags["ontology_ids"] = ontology_ids

        # Optionally, extract typed keys from IDs
        for oid in ontology_ids:
            if oid.startswith("cam:"):
                block.tags["camera_view"] = oid
            elif oid.startswith("act:"):
                if "motion_type" not in block.tags:
                    block.tags["motion_type"] = oid
            elif oid.startswith("space:"):
                block.tags["entrance_direction"] = oid

    return block
```

Use this bridge in:
- `prompt_dsl_adapter.analyze_prompt()` when building prompt_analysis
- LLM extractors (so LLM outputs get normalized to ontology IDs)
- Block persistence when creating PromptBlock rows

### LLM Extraction with Ontology

When adding LLM-based extraction (Phase 3), have the LLM output candidate ontology labels:

```json
// LLM output
{
  "hand_motion": ["act:brush_hair", "part:hand"],
  "camera": ["cam:zoom_in", "cam:slow"]
}
```

Then run through the bridge to validate/normalize. Invalid IDs get logged but not stored.

### Benefits

| Benefit | Why |
|---------|-----|
| **Rename-safe** | Changing "hand_motion" → "hand_movement" only changes label, not queries |
| **Consistent** | Same ontology IDs in PromptBlock and ActionBlockDB |
| **Query-friendly** | `WHERE 'act:hand_motion' = ANY(tags->'ontology_ids')` |
| **LLM-validated** | LLM outputs normalized against known vocabulary |

### Implementation Touchpoints

Files to modify for PromptVersion refactor:

| File | Change |
|------|--------|
| `domain/prompt_versioning.py` | Add `prompt_hash`, `prompt_analysis` fields; add `PromptBlock` model |
| `services/generation/creation_service.py` | Find-or-create PromptVersion by hash before creating Generation |
| `services/provider/provider_service.py` | Read prompt from PromptVersion, not `canonical_params.prompt` |
| `services/prompt_dsl_adapter.py` | No change (already pure function) |
| `workers/job_processor.py` | Resolve `prompt_version_id` → text when building provider payload |
| `api/v1/generations.py` | Accept `prompt_version_id` OR inline text (find-or-create) |

---

## Existing Lineage & Input Tracking Infrastructure

### What We Already Have

**Generation Input Tracking:**
```python
# Generation model
inputs: List[Dict[str, Any]]      # [{type: "image", asset_id: 123}, ...]
reproducible_hash: str            # SHA256(canonical_params + inputs) for dedup
prompt_version_id: UUID           # FK to PromptVersion (optional)
final_prompt: str                 # Resolved prompt after substitution
```

**Asset Lineage (parent→child edges):**
```python
# AssetLineage model
child_asset_id: int               # Output asset
parent_asset_id: int              # Input asset
relation_type: str                # 'source', 'keyframe', 'reference_image', 'audio_track'
operation_type: OperationType     # VIDEO_EXTEND, IMAGE_TO_VIDEO, etc.
parent_start_time: float          # Timestamp if from video (e.g., paused at 10.5s)
sequence_order: int               # Order for multi-input operations
```

**Branch Points (multiple variants from same source):**
```python
# AssetBranch model
source_asset_id: int              # Base asset that branches
branch_time: float                # Where branch occurs (seconds)
branch_name: str                  # "Hero wins", "Villain escapes"
branch_tag: str                   # For game logic: 'ending_A'

# AssetBranchVariant model
branch_id: int                    # FK to AssetBranch
variant_asset_id: int             # One variant asset
variant_name: str                 # "Epic victory"
conditions: Dict                  # Game conditions for this variant
```

### Data Flow

```
User provides:
  - Prompt (text or PromptVersion reference)
  - Input assets (images, videos)
      ↓
Generation created:
  - inputs = [{type: "image", asset_id: 123}]
  - reproducible_hash = SHA256(canonical_params + inputs)
  - prompt_version_id or prompt in canonical_params
      ↓
Provider executes → Asset created
      ↓
AssetLineage records created:
  - For each input asset → lineage edge to output asset
```

### Inputs Structure (Clarified)

`Generation.inputs` should contain **structured references to upstream assets**, not the whole parameter blob. Parameters like `duration`, `seed`, `quality` stay in `canonical_params`.

```json
[
  {
    "type": "image",
    "asset_id": 123,
    "role": "source",
    "sequence_order": 0
  },
  {
    "type": "video",
    "asset_id": 456,
    "role": "base",
    "start_time": 10.5,
    "end_time": 12.0
  }
]
```

Fields per input:
- `type`: "image", "video", "audio"
- `asset_id`: FK to assets table
- `role`: "source", "reference", "mask", "keyframe", "base"
- `sequence_order`: for multi-input operations
- `start_time` / `end_time`: if using a segment (optional)

This keeps `inputs` focused on **what assets** were used, while `canonical_params` holds **how** they were processed.

### Current Gaps

| Gap | Description |
|-----|-------------|
| **Hash includes prompt text, not reference** | `reproducible_hash` hashes `canonical_params.prompt` (the text), not `prompt_version_id`. Same prompt via different versions = different hash. |
| **Inputs → Lineage not automatic** | `Generation.inputs` and `AssetLineage` are populated separately. Could drift. |
| **PromptVersion not in hash** | If we want "same prompt version + same inputs = reuse generation", hash should use `prompt_version_id`. |
| **Variations vs Retries** | Multiple submissions to same Generation = retries. Multiple Generations with same hash = variations? Not clearly distinguished. |

### Ideal Model (Future)

```
PromptVersion (source of truth for prompts)
    ↓ prompt_version_id
Generation (intent: prompt + inputs + operation)
    ↓ reproducible_hash = SHA256(prompt_version_id + inputs + operation)
    │
    ├── ProviderSubmission #1 → Asset A (variation 1)
    ├── ProviderSubmission #2 → Asset B (variation 2)
    └── ProviderSubmission #3 → Asset C (variation 3)
            ↓
      AssetLineage (auto-created from Generation.inputs)
```

This would give us:
- **Dedup by intent**: Same prompt_version + inputs = same Generation
- **Variations**: Multiple submissions under one Generation
- **Lineage consistency**: AssetLineage derived from Generation.inputs automatically

---

## Open Questions

1. **When to use LLM vs keyword patterns?**
   - Suggestion: LLM for prompts > 2 sentences or with complex structure
   - Keywords for short, simple prompts

2. **How to deduplicate similar blocks?**
   - Hash-based dedup on normalized text?
   - Semantic similarity with embeddings?

3. **How to score/rank extracted blocks?**
   - By frequency across assets?
   - By specificity (more keywords = higher rank)?

4. **Block category taxonomy for video prompts:**
   - `entrance` — "enters from left", "walks in"
   - `exit` — "leaves", "walks away"
   - `hand_motion` — "brushes hair", "reaches out"
   - `body_motion` — "walks slowly", "dances"
   - `camera` — "POV", "close-up", "tracking shot"
   - `lighting` — "dramatic lighting", "soft glow"
   - `expression` — "smiles", "looks worried"

5. **PromptVersion cleanup policy?**
   - Keep one-off prompts forever?
   - Prune orphaned versions (no generations) after N days?
   - **Suggestion**: Add a background job to delete orphaned versions (no generations, created > 30 days ago) so the table doesn't explode with one-off prompts.

6. **reproducible_hash composition?**
   - Currently: `SHA256(canonical_params + inputs)` where prompt is inside canonical_params
   - Should be: `SHA256(prompt_version_id + operation_type + normalized_inputs + canonical_params_subset)`
   - This way, updating a PromptVersion creates a new version with new hash; existing generations stay tied to old version.

---

## Related Systems Inventory

This section documents all existing systems that relate to prompt blocks, tags, and classification. **Consult this before adding new infrastructure.**

### Tagging Systems (Already Exist)

| System | File | Purpose | Key Functions |
|--------|------|---------|---------------|
| **ActionBlock tagging** | `services/action_blocks/tagging.py` | Normalize block tags to ontology IDs | `normalize_tags()`, `extract_ontology_ids_from_tags()` |
| **Asset tagging** | `services/assets/tags.py` | Extract tags from generation metadata | `tag_asset_from_metadata()` |

**Key Pattern**: Both systems:
- Call `load_ontology()` and `match_keywords()`
- Produce `ontology_ids` list in the output
- Use prefix patterns: `part:`, `act:`, `state:`, `mood:`, `cam:`, `intensity:`, `speed:`, etc.

### ActionBlock System

| Component | File | What It Does |
|-----------|------|--------------|
| **ActionBlockDB** | `domain/action_block.py` | SQLModel with `tags: Dict[str, Any]`, compatibility, complexity |
| **ActionBlockTags** | `domain/narrative/action_blocks/types.py` | Pydantic model: location, pose, intimacy_level, mood, intensity, custom |
| **ActionBlockService** | `services/action_blocks/action_block_service.py` | CRUD, search, filtering |
| **ActionEngine** | `domain/narrative/action_blocks/engine.py` | Runtime selection and resolution |
| **ConceptLibrary** | `domain/narrative/action_blocks/concepts.py` | CreatureType, MovementType, BodyArea, ActionVocabulary |

**ActionBlockDB.tags example:**
```json
{
  "location": "bench_park",
  "pose": "sitting_close",
  "intimacy_level": "intensity:medium",
  "mood": "mood:playful",
  "intensity": "intensity:soft",
  "ontology_ids": ["intensity:medium", "mood:playful"]
}
```

### Semantic Packs

| Component | File | What It Does |
|-----------|------|--------------|
| **SemanticPackDB** | `domain/semantic_pack.py` | Pack with `parser_hints`, block refs, family refs |
| **ParserHintProvider** | `services/prompt_parser/hints.py` | Merges pack hints into SimplePromptParser |

**parser_hints format:**
```json
{
  "role:character": ["minotaur", "werecow"],
  "act:sit_closer": ["scoots", "slides closer"]
}
```

### Character System

| Component | File | What It Does |
|-----------|------|--------------|
| **Character** | `domain/character.py` | Reusable templates with visual/personality/behavioral traits |
| **CharacterInstance** | `domain/character_integrations.py` | World-specific character versions |
| **CharacterUsage** | `domain/character.py` | Tracks character usage in prompts/blocks |
| **CharacterService** | `services/characters/character_service.py` | CRUD, versioning, relationships |

### Parser System

| Component | File | What It Does |
|-----------|------|--------------|
| **SimplePromptParser** | `services/prompt_parser/simple.py` | Sentence-level parser, returns `ParsedBlock` with `metadata["ontology_ids"]` |
| **ParsedRole** | `services/prompt_parser/simple.py` | Enum: character, action, setting, mood, romance, other |
| **ROLE_KEYWORDS** | `services/prompt_parser/ontology.py` | Keyword lists for role classification |

**ParsedBlock.metadata includes:**
- `has_{role}_keywords` counts
- `has_verb` boolean
- `ontology_ids` list (from `ontology.match_keywords()`)

### Ontology System

| Component | File | What It Does |
|-----------|------|--------------|
| **Ontology** | `shared/ontology.py` | Loads and queries ontology.yaml |
| **ontology.yaml** | `shared/ontology.yaml` | Source of truth for IDs (part:, act:, cam:, etc.) |

**Core ID prefixes:**
- `part:` — anatomy parts (part:shaft, part:hand)
- `act:` — actions (act:hand_motion, act:sit_closer)
- `state:` — states (state:erect, state:relaxed)
- `mood:` — moods (mood:playful, mood:nervous)
- `cam:` — camera (cam:pov, cam:zoom_in)
- `intensity:` — intensity scale (intensity:soft, intensity:high)
- `speed:` — speed scale (speed:slow, speed:fast)
- `rel:` — spatial relations (rel:between_legs, rel:at_crotch)
- `space:` — spatial locations (space:from_left)

### Unified Block Model (No Separate PromptBlock)

```
┌─────────────────────────────────────────────────────────────────┐
│  PromptVersion.prompt_analysis (JSON)                           │
│  - ALL parsed blocks (every sentence)                           │
│  - Cheap, ephemeral, no filtering                               │
│  - {blocks: [{role, text, tags: {ontology_ids}}], tags}         │
└───────────────────────────┬─────────────────────────────────────┘
                            │ heuristics OR user picks
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│  ActionBlockDB (unified)                                        │
│  - Only MEANINGFUL blocks                                       │
│  - role, category, analyzer_id (new fields)                     │
│  - curation_status: raw → reviewed → curated                    │
│  - tags: {ontology_ids, location, pose, mood, ...}              │
│  - compatible_next/prev (for curated blocks)                    │
│  - package_name, source_type, extracted_from_prompt_version     │
└─────────────────────────────────────────────────────────────────┘
```

**Flow:**
1. User imports wild prompt → `analyze_prompt()` → `PromptVersion.prompt_analysis`
2. Heuristics identify good candidates OR user picks a block
3. ActionBlockDB created with `source_type = "ai_extracted"`, `curation_status = "raw"`
4. Curator reviews → sets `curation_status = "curated"`, adds `compatible_*`
5. Semantic packs bundle curated blocks → `parser_hints` flow back to parser

### Implementation Checklist

- [x] Add `role`, `category`, `analyzer_id`, `curation_status` to ActionBlockDB
- [x] Add indexes: `(role, category, curation_status)`, `(source_type, extracted_from_prompt_version)`
- [x] `tags["ontology_ids"]` remains canonical (same as existing Asset tagging)
- [ ] Update ActionBlockService to handle raw/curated lifecycle
- [ ] Update UI to filter by `curation_status` (curator vs production views)

---

## Future: Analyzer Presets (User-Configurable Analysis)

### Motivation

Users want to create custom analysis configurations:
- "Motion Analyzer" — focus on action/movement ontology
- "Character Extract" — prioritize character descriptions
- "Camera Director" — specialized for cinematography terms
- "Romance Classifier" — tuned for intimacy content

Rather than hardcoding these, let users create and share presets.

### Domain Model (MVP)

```python
class AnalyzerPreset(SQLModel, table=True):
    id: UUID
    slug: str                      # unique, URL-safe
    name: str
    description: Optional[str]
    base_analyzer_id: str          # must exist in AnalyzerRegistry
    config: Dict[str, Any]         # JSON for customization
    is_public: bool                # shareable with others
    owner_id: int                  # FK User
    tags: List[str]                # for discovery
    created_at: datetime
    updated_at: datetime
```

### Config Keys (v1)

| Key | Type | Description |
|-----|------|-------------|
| `focus_ontology` | `List[str]` | Prioritize these prefixes/IDs (e.g., `["act:*", "cam:*"]`) |
| `ignore_ontology` | `List[str]` | Skip these (e.g., `["mood:*"]`) |
| `llm_system_prompt` | `str` | Override for LLM analyzers |
| `llm_temperature` | `float` | LLM temperature (0.0-1.0) |

### Example Presets

| Name | Base | Config | Use Case |
|------|------|--------|----------|
| Motion Analyzer | prompt:claude | `{focus: ["act:*", "manner:*"]}` | Action scenes |
| Character Extract | prompt:simple | `{focus: ["character", "part:*"]}` | Character sheets |
| Camera Director | prompt:claude | `{focus: ["cam:*"], llm_system_prompt: "Focus on cinematography..."}` | Direction notes |
| Romance Classifier | prompt:claude | `{focus: ["romance", "state:*"]}` | Intimacy content |
| Quick Parse | prompt:simple | `{}` | Fast, general |

### API

```
GET  /api/v1/analyzer-presets              → list presets (public + own)
POST /api/v1/analyzer-presets              → create preset
GET  /api/v1/analyzer-presets/{id}         → get preset
PUT  /api/v1/analyzer-presets/{id}         → update preset
DELETE /api/v1/analyzer-presets/{id}       → delete preset

# Usage in analysis
POST /api/v1/prompts/analyze { text, preset_id }    → uses preset
POST /api/v1/prompts/analyze { text, analyzer_id }  → uses raw analyzer
```

### Integration with PromptAnalysisService

```python
async def analyze(
    self,
    text: str,
    analyzer_id: Optional[str] = None,
    preset_id: Optional[UUID] = None,
) -> Dict[str, Any]:
    """
    If preset_id provided:
    1. Load preset from DB
    2. Set analyzer_id = preset.base_analyzer_id
    3. Pass preset.config to underlying analyzer
    4. Apply focus/ignore ontology filtering in post-processing
    """
```

### Hierarchy

```
AnalyzerRegistry (system, immutable)
  └── prompt:simple, prompt:claude, prompt:openai
  └── [future] asset:faces, asset:scene

AnalyzerPreset (user-created, shareable)
  └── references base_analyzer_id + custom config
  └── stored in DB, owned by users
```

### Frontend Integration

- **Settings → Prompts → "My Presets" tab**: Create/manage personal presets
- **Quick Generate**: Preset dropdown (advanced option)
- **Prompt Lab**: Preset selector with live preview
- **Dev-only initially**: Keep `prompt:simple` default everywhere

### Reproducibility Benefit

When analyzing, record both:
- `analyzer_id` — base analyzer used
- `preset_id` — preset applied (if any)

This allows reproducing exact analysis later, even if preset config changes.

### Implementation Checklist (Future)

- [ ] Create `AnalyzerPreset` domain model and migration
- [ ] Add `preset_id` support to `PromptAnalysisService.analyze()`
- [ ] Create preset CRUD API endpoints
- [ ] Add ontology filtering post-processing
- [ ] Frontend: preset selector in Prompt Lab
- [ ] Frontend: "My Presets" tab in Settings
