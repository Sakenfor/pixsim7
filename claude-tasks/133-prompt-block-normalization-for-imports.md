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

### Phase 2: Block-Level Persistence (Not Started)

Create a `PromptBlock` table for individual blocks that can be:
- Queried across prompts ("find all entrance blocks")
- Tagged and categorized independently
- Linked to semantic packs

**Why a table, not just JSON?**
Keeping blocks as JSON in `PromptVersion.prompt_analysis` works for simple cases, but a real `PromptBlock` table makes queries like "find all entrance blocks across all prompts" or "all hand_motion blocks used in this world" cheap and composable.

**Schema:**

```python
class PromptBlock(SQLModel, table=True):
    """Individual block extracted from a prompt"""
    __tablename__ = "prompt_blocks"

    id: int = Field(primary_key=True)
    prompt_version_id: UUID = Field(foreign_key="prompt_versions.id", index=True)

    # Classification (strings, not enums — extensible)
    role: str = Field(index=True)      # ParsedRole value: "character", "action", "setting", etc.
    category: Optional[str] = Field(index=True)  # Fine-grained: "entrance", "hand_motion", "camera", etc.

    # Content
    text: str  # The extracted phrase

    # Provenance
    analyzer: str  # "simple_parser", "ai_hub:v2", "llm:claude-3"
    confidence: Optional[float]  # 0.0-1.0 (NULL for deterministic parsers)

    # Metadata
    tags: List[str] = Field(sa_column=Column(JSON))
    metadata: Dict[str, Any] = Field(sa_column=Column(JSON))
    # metadata includes: spans, source_sentence_index, keyword_matches, etc.

    created_at: datetime

    __table_args__ = (
        Index("idx_block_role", "role"),
        Index("idx_block_category", "category"),
        Index("idx_block_version_role", "prompt_version_id", "role"),
    )
```

**Optional: Asset-specific overrides**

If LLM extraction is run only for specific assets (not all uses of a prompt), add a join table:

```python
class AssetPromptBlock(SQLModel, table=True):
    """Asset-specific block overrides or additions"""
    __tablename__ = "asset_prompt_blocks"

    id: int = Field(primary_key=True)
    asset_id: int = Field(foreign_key="assets.id", index=True)
    prompt_block_id: int = Field(foreign_key="prompt_blocks.id", index=True)

    # Override metadata (if different from base block)
    override_metadata: Optional[Dict[str, Any]] = Field(sa_column=Column(JSON))

    created_at: datetime
```

**Relationship diagram:**

```
PromptVersion (1)
    │
    ├── prompt_analysis (JSON summary)
    │
    └── PromptBlock (N)
            │
            └── AssetPromptBlock (optional, for per-asset overrides)
                    │
                    └── Asset
```

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

**Block persistence**: Attach `PromptBlock` rows to **PromptVersion**, not per-Asset. One PromptVersion → many PromptBlock rows. This avoids duplicating the same blocks every time a prompt is reused. For per-asset overrides (e.g., LLM extraction differs), use a lightweight `AssetPromptBlockOverride` join table.

**Block classification**: Reuse existing systems instead of hard-coding new enums:
- **`role`**: Reuse `ParsedRole` from `services/prompt_parser/simple.py` (character, action, setting, mood, romance, other) — what SimplePromptParser already produces
- **`category`**: Free-form string field (not enum) for fine-grained LLM extraction (entrance, hand_motion, camera, etc.) — extensible without schema changes

```python
# Existing - reuse this
from pixsim7.backend.main.services.prompt_parser import ParsedRole

class PromptBlock:
    role: str           # ParsedRole value: "character", "action", etc.
    category: str       # Free-form: "entrance", "hand_motion", "camera", etc.
```

This aligns with how `ActionBlockDB.tags` works — flexible dict rather than rigid enum.

**Analyzer provenance**: Store which analyzer produced each block:
```python
class PromptBlock:
    analyzer: str  # "simple_parser", "ai_hub:v2", "llm:claude-3"
    confidence: float  # 0.0-1.0
```

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
