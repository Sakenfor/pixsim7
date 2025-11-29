# Action Blocks i2i Extension

**Date:** 2025-11-29
**Status:** 💡 PROPOSAL
**Related:** IMAGE_TO_IMAGE operation type, Action Blocks Unified System
**Replaces:** POSE_GRAPH_SYSTEM_PROPOSAL.md

## Problem

Users want to create image variation workflows:
1. Generate base image → create multiple themed variations (e.g., pirate variations)
2. Chain i2i generations (holding hands → leaning close → kissing)
3. Create transitions between poses/images
4. Reuse generic short prompts instead of writing 2000-char custom prompts

**Current gap:** Action Blocks system handles text prompts for i2v, but doesn't link to generated i2i assets.

## Existing Foundation ✅

The Action Blocks system already provides:

**1. Block Storage & Chaining**
- `action_blocks` table with `compatible_next/prev` arrays
- Single-state and transition block types
- Complexity levels (simple | moderate | complex)
- Rich tagging (location, mood, intimacy)

**2. Composition Engine**
- Mix and match blocks
- Compatibility validation
- Multiple composition strategies

**3. AI Extraction**
- Parse complex prompts into reusable blocks
- Variable suggestion
- Block categorization

**4. Graph Visualization**
- `ActionBlockGraph` with existing graph surfaces
- Already integrated into Character Graph
- Dev tools for browsing blocks

**5. Prompt Versioning Integration**
- Links to `prompt_versions` table
- Tracks which blocks came from which prompts
- Analytics support

## What's Missing

1. **Link to generated i2i assets** - Blocks are prompts, not actual generated images
2. **Asset variation tracking** - No UI for chained i2i workflow
3. **Short transition templates** - Need more ~50-char generic prompts
4. **Playback paths** - No concept of "path through graph"

## Proposed Extensions

### 1. Extend ActionBlock Schema (Database Migration)

Add fields to existing `action_blocks` table:

```sql
ALTER TABLE action_blocks ADD COLUMN:
  -- Link to generated assets (i2i or i2v results)
  generated_asset_id INTEGER REFERENCES assets(id);
  base_image_asset_id INTEGER REFERENCES assets(id);

  -- Operation type this block supports
  operation_type VARCHAR(32) DEFAULT 'image_to_video';
  -- Values: 'image_to_video' | 'image_to_image' | 'both'

  -- For i2i blocks, track strength
  default_strength FLOAT CHECK (default_strength >= 0 AND default_strength <= 1);
```

**Benefits:**
- Reuses existing table structure
- Maintains all current fields (tags, compatibility, etc.)
- Backward compatible (new fields are nullable)

### 2. i2i-Aware Block Types

**Extend existing types:**

```python
# In domain/action_block.py
class ActionBlockDB(SQLModel, table=True):
    # ... existing fields ...

    # NEW FIELDS
    generated_asset_id: Optional[int] = Field(
        default=None,
        foreign_key="assets.id",
        description="Link to the i2i or i2v generation result"
    )

    base_image_asset_id: Optional[int] = Field(
        default=None,
        foreign_key="assets.id",
        description="Source image for i2i variations"
    )

    operation_type: str = Field(
        default="image_to_video",
        max_length=32,
        description="Supported operation: image_to_video | image_to_image | both"
    )

    default_strength: Optional[float] = Field(
        default=None,
        description="Default strength for i2i blocks (0-1)"
    )
```

**Use cases:**

```python
# Case 1: i2v block (existing behavior)
{
  "block_id": "bench_hair_tease",
  "kind": "single_state",
  "prompt": "gentle hair movement, playful smile",
  "operation_type": "image_to_video",
  "base_image_asset_id": null,  # Uses any compatible image
  "generated_asset_id": 42  # The i2v result (video)
}

# Case 2: i2i variation block (NEW)
{
  "block_id": "pirate_captain_variation",
  "kind": "single_state",
  "prompt": "pirate captain outfit, weathered look",
  "operation_type": "image_to_image",
  "base_image_asset_id": 100,  # woman.jpg
  "generated_asset_id": 101,  # pirate variation result
  "default_strength": 0.7
}

# Case 3: i2i transition block (NEW)
{
  "block_id": "couple_progression_close",
  "kind": "transition",
  "prompt": "smooth romantic progression, leaning closer",
  "operation_type": "image_to_image",
  "base_image_asset_id": 200,  # holding hands
  "generated_asset_id": 201,  # leaning close result
  "default_strength": 0.6
}
```

### 3. Generic Transition Block Library

**Populate DB with short, reusable transition prompts:**

```json
[
  {
    "block_id": "transition_romantic_progression",
    "kind": "transition",
    "prompt": "smooth, gentle transition with romantic atmosphere",
    "operation_type": "both",
    "complexity_level": "simple",
    "tags": {
      "category": "romantic",
      "mood_from": "*",
      "mood_to": "intimate",
      "duration": "short"
    },
    "compatible_next": ["intimate_*", "close_*"],
    "source_type": "library"
  },
  {
    "block_id": "transition_creature_pose_shift",
    "kind": "transition",
    "prompt": "fluid, natural creature movement maintaining anatomy",
    "operation_type": "image_to_video",
    "complexity_level": "simple",
    "tags": {
      "category": "creature_movement",
      "character_type": "creature"
    },
    "source_type": "library"
  },
  {
    "block_id": "transition_action_quick",
    "kind": "transition",
    "prompt": "rapid, energetic movement with motion blur",
    "operation_type": "image_to_video",
    "complexity_level": "simple",
    "tags": {
      "category": "action",
      "pacing": "fast"
    },
    "source_type": "library"
  }
]
```

**Migration script:**

```python
# services/action_blocks/seed_transition_templates.py
TRANSITION_TEMPLATES = [
    # Romantic
    {"block_id": "transition_romantic_progression", ...},
    {"block_id": "transition_intimate_moment", ...},

    # Creature/Character
    {"block_id": "transition_creature_pose_shift", ...},
    {"block_id": "transition_creature_morph", ...},

    # Action
    {"block_id": "transition_action_quick", ...},
    {"block_id": "transition_action_combat", ...},

    # Generic
    {"block_id": "transition_smooth_generic", ...},
]

def seed_transition_templates():
    """Populate DB with generic transition blocks"""
    for template in TRANSITION_TEMPLATES:
        # Create ActionBlockDB from template
        # Insert if not exists
```

### 4. Chained i2i Workflow UI

**Add to MediaCard component:**

```typescript
// apps/main/src/components/media/MediaCard.tsx

function MediaCardActions({ asset }: { asset: Asset }) {
  const createVariation = useCreateVariation();
  const createTransition = useCreateTransition();

  return (
    <div className="card-actions">
      {/* Existing actions */}

      {/* NEW: i2i workflow */}
      <button onClick={() => createVariation(asset)}>
        🎨 Create Variation
      </button>

      <button onClick={() => createTransition(asset)}>
        🎬 Add Transition
      </button>
    </div>
  );
}

function useCreateVariation() {
  return (asset: Asset) => {
    // Open generation UI pre-filled for i2i
    openGenerationPanel({
      operationType: 'image_to_image',
      params: {
        image_url: asset.file_url,
        parent_generation_id: asset.generation_id
      },
      // Suggest relevant action blocks
      suggestedBlocks: getCompatibleBlocks(asset.tags)
    });
  };
}
```

**Block suggestion logic:**

```typescript
// services/action_blocks/suggestion.ts

function getCompatibleBlocks(assetTags: string[]): ActionBlock[] {
  // Query blocks matching asset context
  return ActionBlockService.search({
    operation_type: 'image_to_image',
    tags_match: assetTags,  // e.g., ['couple', 'standing']
    complexity_level: 'simple',
    sort_by: 'usage_count'
  });
}
```

### 5. Playback Path Concept (Lightweight)

**Don't create separate tables - use existing graph structure:**

```typescript
// frontend types only - no DB persistence

interface PlaybackPath {
  id: string;  // Frontend-only, localStorage or session
  name: string;
  assetSequence: number[];  // Array of asset IDs
  transitionBlocks?: string[];  // Optional action block IDs for transitions
}

// Build from existing lineage graph
function buildPlaybackPath(
  rootAssetId: number,
  targetAssetId: number
): PlaybackPath {
  const lineage = useLineageGraph(rootAssetId, { maxDepth: 10 });
  const path = findPathBetweenAssets(lineage, rootAssetId, targetAssetId);

  return {
    id: generateId(),
    name: `Path: ${path[0]} → ${path[path.length - 1]}`,
    assetSequence: path,
    transitionBlocks: suggestTransitionBlocks(path)
  };
}
```

**Playback UI:**

```typescript
// components/media/PlaybackPathViewer.tsx

function PlaybackPathViewer({ path }: { path: PlaybackPath }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const currentAsset = useAsset(path.assetSequence[currentIndex]);

  return (
    <div>
      <AssetViewer asset={currentAsset} />

      <PathProgress
        total={path.assetSequence.length}
        current={currentIndex}
        onJump={setCurrentIndex}
      />

      <PlaybackControls
        onNext={() => setCurrentIndex(i => i + 1)}
        onPrev={() => setCurrentIndex(i => i - 1)}
      />
    </div>
  );
}
```

### 6. Extend Existing Graph Visualization

**Enhance ActionBlockGraph to show asset links:**

```typescript
// lib/graphs/actionGraphBuilder.ts

function buildActionBlockGraphWithAssets(
  blockIds: string[]
): ActionBlockGraph {
  const nodes: ActionGraphNode[] = [];
  const edges: ActionGraphEdge[] = [];

  for (const block of blocks) {
    // Block node
    nodes.push({
      id: `block:${block.id}`,
      kind: 'block',
      label: block.block_id
    });

    // NEW: Link to generated asset if exists
    if (block.generated_asset_id) {
      nodes.push({
        id: `asset:${block.generated_asset_id}`,
        kind: 'asset',  // NEW node type
        label: `Asset #${block.generated_asset_id}`
      });

      edges.push({
        id: `e-generates-${block.id}`,
        kind: 'generates',  // NEW edge type
        from: `block:${block.id}`,
        to: `asset:${block.generated_asset_id}`
      });
    }

    // NEW: Link from base image if exists
    if (block.base_image_asset_id) {
      nodes.push({
        id: `asset:${block.base_image_asset_id}`,
        kind: 'asset',
        label: `Base #${block.base_image_asset_id}`
      });

      edges.push({
        id: `e-uses-${block.id}`,
        kind: 'uses-base',  // NEW edge type
        from: `block:${block.id}`,
        to: `asset:${block.base_image_asset_id}`
      });
    }

    // Existing: compatible_next/prev edges
    for (const nextId of block.compatible_next || []) {
      edges.push({
        id: `e-next-${block.id}-${nextId}`,
        kind: 'can-follow',
        from: `block:${block.id}`,
        to: `block:${nextId}`
      });
    }
  }

  return { nodes, edges };
}
```

## Implementation Phases

### Phase 1: Database Extension (1-2 days)
- [ ] Create migration adding new fields to `action_blocks`
- [ ] Update `ActionBlockDB` model
- [ ] Update API schemas to support new fields
- [ ] Test backward compatibility

### Phase 2: Transition Library (1 day)
- [ ] Create seed script with ~20 generic transition blocks
- [ ] Add to library (romantic, action, creature, generic categories)
- [ ] Test retrieval and search

### Phase 3: i2i Workflow UI (2-3 days)
- [ ] Add "Create Variation" button to MediaCard
- [ ] Add "Add Transition" button
- [ ] Implement block suggestion logic
- [ ] Pre-fill generation UI with base image
- [ ] Show lineage breadcrumb

### Phase 4: Enhanced Graph Visualization (2 days)
- [ ] Extend ActionBlockGraph to show assets
- [ ] Add new node type: 'asset'
- [ ] Add new edge types: 'generates', 'uses-base'
- [ ] Update graph rendering

### Phase 5: Playback Paths (2-3 days)
- [ ] Create frontend-only PlaybackPath type
- [ ] Build path from lineage graph
- [ ] Create PlaybackPathViewer component
- [ ] Add to media browsing UI

**Total effort:** ~8-11 days

## Benefits

✅ **Reuses 70% of existing system** - No duplicate infrastructure
✅ **Backward compatible** - Existing i2v blocks unchanged
✅ **Unified data model** - One table for prompts and generated results
✅ **Existing graph viz** - Already built, just extend
✅ **Short prompts** - Generic transitions avoid 2000-char custom prompts
✅ **Asset lineage** - Already tracked via parent_generation_id
✅ **Composition engine** - Works with i2i blocks too

## Example Workflows

### Workflow 1: Pirate Variations

```
1. User has: woman.jpg (asset #100)

2. Click "Create Variation" on woman.jpg
   → Opens generation UI
   → Pre-filled: image_url = woman.jpg, operation_type = i2i
   → Suggests blocks: ["fantasy_character", "costume_change"]

3. User types: "pirate captain outfit"
   → Generates asset #101 (pirate captain)
   → Creates action block linking base #100 → result #101

4. Click "Create Variation" on asset #101 (pirate captain)
   → Chain continues
   → Generates asset #102 (pirate with eyepatch)
   → Links #101 → #102

5. View in graph:
   woman.jpg (#100)
     ├→ block: "pirate captain" → pirate.jpg (#101)
     └→ block: "pirate eyepatch" → pirate2.jpg (#102)
```

### Workflow 2: Romantic Progression

```
1. User has: couple_standing.jpg

2. Create variations:
   - "holding hands" → couple_holding.jpg
   - (from holding) "leaning close" → couple_close.jpg
   - (from close) "kissing" → couple_kiss.jpg

3. Add transitions (video):
   - Select couple_holding + couple_close
   - Choose block: "transition_romantic_progression"
   - Generates smooth video transition

4. Playback path:
   [couple_standing] → (transition) → [couple_holding] → (transition) → [couple_close]
```

### Workflow 3: Creature Battle Poses

```
1. Base: dragon_idle.jpg

2. Create pose variations:
   - "roaring" → dragon_roar.jpg
   - "attacking" → dragon_attack.jpg
   - "flying" → dragon_flying.jpg

3. Add transition blocks:
   - idle → roaring: "transition_creature_aggressive"
   - roaring → attacking: "transition_action_quick"

4. Build multiple paths:
   - Path A: idle → roaring → attacking
   - Path B: idle → flying → landing
```

## Migration from Old Proposal

Items from POSE_GRAPH_SYSTEM_PROPOSAL.md mapped to this approach:

| Old Concept | New Approach |
|-------------|--------------|
| PoseNode | Asset + ActionBlock with generated_asset_id |
| TransitionEdge | ActionBlock with kind='transition' |
| PoseGraph table | No new table - extend action_blocks |
| Generic prompts | Seed transition blocks in DB |
| Graph visualization | Extend existing ActionBlockGraph |
| Playback paths | Frontend-only, built from lineage |

## Open Questions

1. **Should playback paths be persisted?**
   - Pro: Can save/share favorite paths
   - Con: Adds DB complexity
   - **Decision:** Start frontend-only, add DB later if needed

2. **How to handle block templates with variables?**
   - Already supported via prompt versioning
   - Can use `{{creatureType}}` in prompts
   - **Decision:** Reuse existing variable system

3. **Should we version generated blocks?**
   - Already tracked via prompt_version_id
   - **Decision:** Reuse existing versioning

## Related Documentation

- `/docs/ACTION_BLOCKS_UNIFIED_SYSTEM.md` - Existing system
- `/docs/ACTION_PROMPT_ENGINE_SPEC.md` - Original spec
- `/claude-tasks/81-prompt-and-action-block-graphs.md` - Graph visualization
- `/docs/POSE_GRAPH_SYSTEM_PROPOSAL.md` - Superseded by this doc

---

**Author:** Claude
**Status:** Proposal - Ready for implementation
**Effort:** ~8-11 days
