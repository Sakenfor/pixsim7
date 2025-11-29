# Pose Graph System Proposal - SUPERSEDED

**Date:** 2025-11-29
**Status:** ⚠️ SUPERSEDED - See ACTION_BLOCKS_I2I_EXTENSION.md
**Related:** IMAGE_TO_IMAGE operation type

## Note

This proposal has been superseded by a more focused approach that extends the existing Action Blocks system rather than creating a duplicate pose graph system.

**Why superseded:**
- Action Blocks already provides ~70% of required functionality
- Avoids reinventing the wheel (compatible_next/prev, composition, extraction, graphs)
- Better architectural fit to extend existing system
- Reuses existing graph visualization and data structures

**See instead:** `/docs/ACTION_BLOCKS_I2I_EXTENSION.md`

---

## Original Problem Statement

Users want to create narrative sequences by:
1. Generating keyframe "poses" via sequential i2i generations
2. Creating smooth transitions between poses
3. Playing back different paths through the pose graph
4. Reusing generic transition prompts

**Solution:** Extend Action Blocks to support i2i workflows rather than creating separate pose graph system.

---

**Original Author:** Claude
**Revision:** See ACTION_BLOCKS_I2I_EXTENSION.md for current approach

Users want to create narrative sequences by:
1. Generating keyframe "poses" via sequential i2i generations
2. Creating smooth transitions between poses
3. Playing back different paths through the pose graph
4. Reusing generic transition prompts instead of writing custom 2000-char prompts each time

Example use case:
```
Base: couple standing
├─ i2i → Pose A: holding hands
│   ├─ i2i → Pose B: leaning close
│   │   └─ i2i → Pose C: kissing
│   └─ i2i → Pose D: dancing
│       └─ i2i → Pose E: dipping
```

Then create transitions:
- A → B: "smooth romantic progression"
- B → C: "intimate moment"
- A → D: "playful spin into dance"
- D → E: "dramatic dip"

## Current Capabilities

✅ **Data Layer Support:**
- `IMAGE_TO_IMAGE` operation type (just added)
- `VIDEO_TRANSITION` operation type
- `parent_generation_id` for lineage tracking
- `prompt_version_id` for prompt templates
- Asset lineage graph via `useLineageGraph`

❌ **Missing:**
- UI for chained i2i workflow
- Pose graph visualization
- Generic transition prompt library
- Path playback system

## Proposed Solution

### 1. Pose Graph Data Structure

```typescript
interface PoseNode {
  id: string;
  assetId: number;              // The image asset
  generationId: number;         // The i2i generation that created it
  label: string;                // User-defined: "Holding Hands", "Kissing", etc.
  tags: string[];               // Auto/manual: ['couple', 'romantic', 'standing']
  metadata: {
    mood?: string;
    intensity?: number;
    bodyPosition?: string;
  };
}

interface TransitionEdge {
  id: string;
  fromPoseId: string;
  toPoseId: string;
  transitionAssetId?: number;   // The video_transition result
  transitionGenerationId?: number;
  promptTemplateId?: string;    // Reference to generic prompt
  customPrompt?: string;        // Or custom override
  style: 'gradual' | 'abrupt';
  duration?: number;
}

interface PoseGraph {
  id: string;
  name: string;
  description?: string;
  nodes: PoseNode[];
  edges: TransitionEdge[];
  rootNodeId: string;           // Starting pose
}

interface PlaybackPath {
  id: string;
  graphId: string;
  name: string;
  nodeSequence: string[];       // Path through graph: [A, B, C]
  totalDuration?: number;       // Sum of transition durations
}
```

### 2. Generic Transition Prompt Library

**Database Schema:**
```typescript
interface TransitionPromptTemplate {
  id: string;
  category: TransitionCategory;
  name: string;
  description: string;
  prompt: string;               // Short generic prompt (~50-200 chars)
  variables?: PromptVariable[]; // Optional context injection
  exampleUse: string;
  tags: string[];

  // Auto-suggestion hints
  suggestWhen: {
    fromTags?: string[];        // Suggest when source has these tags
    toTags?: string[];          // Suggest when target has these tags
    moodTransition?: [string, string]; // e.g., ['tense', 'calm']
  };
}

type TransitionCategory =
  | 'romantic'           // Couple interactions
  | 'action'             // Fight, chase, dramatic
  | 'creature_movement'  // Monster/animal pose changes
  | 'intimate'           // Close/personal interactions
  | 'environmental'      // Scene changes
  | 'morph'              // Shape/form changes
  | 'generic';           // Catch-all

interface PromptVariable {
  name: string;          // e.g., 'creatureType', 'mood', 'intensity'
  type: 'string' | 'number' | 'enum';
  default?: any;
  enumValues?: string[];
}
```

**Example Templates:**
```json
[
  {
    "id": "romantic_progression",
    "category": "romantic",
    "name": "Smooth Romantic Progression",
    "description": "Gentle transition for escalating romantic moments",
    "prompt": "smooth, gentle transition with soft lighting and romantic atmosphere",
    "tags": ["couple", "romantic", "gentle"],
    "suggestWhen": {
      "fromTags": ["couple", "standing"],
      "toTags": ["couple", "intimate"]
    }
  },
  {
    "id": "creature_pose_shift",
    "category": "creature_movement",
    "name": "Natural Creature Movement",
    "description": "Fluid movement maintaining creature anatomy",
    "prompt": "fluid, natural {creatureType} movement between poses, maintaining anatomical consistency",
    "variables": [
      {
        "name": "creatureType",
        "type": "string",
        "default": "creature"
      }
    ],
    "suggestWhen": {
      "fromTags": ["creature", "monster", "dragon"]
    }
  },
  {
    "id": "quick_action",
    "category": "action",
    "name": "Fast Action Transition",
    "description": "Quick, energetic movement for action sequences",
    "prompt": "rapid, energetic transition with motion blur and dynamic camera movement",
    "tags": ["action", "fast", "dynamic"]
  }
]
```

### 3. Chained i2i Workflow UI

**MediaCard Enhancement:**
```typescript
// Add to MediaCard component
function MediaCard({ asset }: { asset: Asset }) {
  return (
    <div className="media-card">
      {/* ... existing card UI ... */}

      <div className="card-actions">
        <button onClick={() => createVariationFrom(asset)}>
          🎨 Create Variation
        </button>
        <button onClick={() => createTransitionFrom(asset)}>
          🎬 Create Transition
        </button>
      </div>

      {/* Show lineage */}
      {asset.parent_generation_id && (
        <div className="lineage-badge">
          Variation of #{asset.parent_generation_id}
        </div>
      )}
    </div>
  );
}

function createVariationFrom(asset: Asset) {
  // Open generation UI with image_url pre-filled
  openGenerationPanel({
    operationType: 'image_to_image',
    params: {
      image_url: asset.file_url,
      parent_generation_id: asset.generation_id
    }
  });
}
```

### 4. Pose Graph Editor Panel

**New Panel:** `PoseGraphEditorPanel`

```typescript
function PoseGraphEditorPanel() {
  const [graph, setGraph] = useState<PoseGraph>({
    nodes: [],
    edges: [],
    // ...
  });

  return (
    <div className="pose-graph-editor">
      {/* Graph visualization (react-flow or d3) */}
      <GraphCanvas
        nodes={graph.nodes}
        edges={graph.edges}
        onNodeClick={handleNodeClick}
        onEdgeClick={handleEdgeClick}
      />

      {/* Sidebar */}
      <div className="sidebar">
        <h3>Selected Pose</h3>
        {selectedNode && (
          <PoseEditor
            pose={selectedNode}
            onUpdate={updateNode}
            onCreateVariation={createVariationFrom}
          />
        )}

        <h3>Transition</h3>
        {selectedEdge && (
          <TransitionEditor
            edge={selectedEdge}
            onUpdate={updateEdge}
            templates={transitionTemplates}
          />
        )}
      </div>
    </div>
  );
}
```

### 5. Transition Template Selector

```typescript
function TransitionTemplateSelector({
  fromPose,
  toPose,
  onSelect
}: {
  fromPose: PoseNode;
  toPose: PoseNode;
  onSelect: (template: TransitionPromptTemplate) => void;
}) {
  // Auto-suggest based on pose tags/metadata
  const suggested = suggestTransitionPrompts(fromPose, toPose);
  const allTemplates = useTransitionTemplates();

  return (
    <div className="template-selector">
      <h4>Suggested Transitions</h4>
      {suggested.map(template => (
        <TemplateCard
          key={template.id}
          template={template}
          onClick={() => onSelect(template)}
          badge="Suggested"
        />
      ))}

      <h4>All Templates</h4>
      <TemplateGrid
        templates={allTemplates}
        onSelect={onSelect}
      />

      <button onClick={() => setCustomPrompt(true)}>
        ✏️ Write Custom Prompt
      </button>
    </div>
  );
}
```

### 6. Path Playback System

```typescript
interface PlaybackController {
  graph: PoseGraph;
  currentPath: PlaybackPath;
  currentNodeIndex: number;

  play(): void;
  pause(): void;
  next(): void;
  previous(): void;
  jumpToNode(nodeId: string): void;
}

function PathPlayback({ graph }: { graph: PoseGraph }) {
  const [controller] = useState(() => new PlaybackController(graph));

  return (
    <div className="path-playback">
      <PathVisualization
        graph={graph}
        currentPath={controller.currentPath}
        currentIndex={controller.currentNodeIndex}
      />

      <PlaybackControls
        onPlay={controller.play}
        onPause={controller.pause}
        onNext={controller.next}
        onPrevious={controller.previous}
      />

      <PathSelector
        paths={getPaths(graph)}
        onSelectPath={controller.setPath}
      />
    </div>
  );
}
```

## Implementation Phases

### Phase 1: Chained i2i UI (Quick Win)
- Add "Create Variation" button to MediaCard
- Pre-fill image_url from selected asset
- Show lineage badge on variations
- **Effort:** ~1-2 days

### Phase 2: Generic Transition Library
- Create transition prompt templates (JSON)
- Build template selector UI
- Add to video_transition workflow
- **Effort:** ~3-4 days

### Phase 3: Pose Graph Data Model
- Add PoseGraph, PoseNode, TransitionEdge schemas
- Create database tables
- Build API endpoints (CRUD)
- **Effort:** ~3-5 days

### Phase 4: Pose Graph Editor
- Build graph visualization (react-flow)
- Implement node/edge editing
- Add pose/transition editors
- **Effort:** ~5-7 days

### Phase 5: Path Playback
- Build playback controller
- Create path visualization
- Add playback controls
- **Effort:** ~3-4 days

## Benefits

✅ **Rapid prototyping** - Quickly test different narrative paths
✅ **Reusable prompts** - No need to write 2000-char prompts repeatedly
✅ **Procedural animation** - AI generates smooth transitions between keyframes
✅ **Branching narratives** - Multiple paths through pose graph
✅ **Visual workflow** - Graph view shows all poses and transitions
✅ **Context-aware** - Auto-suggest appropriate transition templates

## Example Workflows

### Workflow 1: Romantic Progression
```
1. Generate base: couple_standing.jpg
2. Create variation: "holding hands" → pose_a.jpg
3. Create variation from pose_a: "leaning close" → pose_b.jpg
4. Create variation from pose_b: "kissing" → pose_c.jpg
5. Add transition A→B: Select template "romantic_progression"
6. Add transition B→C: Select template "intimate_moment"
7. Play path: [A, B, C] with smooth transitions
```

### Workflow 2: Creature Battle Poses
```
1. Base: dragon_idle.jpg
2. Variations:
   - dragon_roaring.jpg (from idle)
   - dragon_attacking.jpg (from roaring)
   - dragon_flying.jpg (from idle)
   - dragon_landing.jpg (from flying)
3. Transitions:
   - idle → roaring: template "creature_aggressive_buildup"
   - roaring → attacking: template "creature_attack_strike"
   - idle → flying: template "creature_takeoff"
   - flying → landing: template "creature_landing"
4. Create paths:
   - Path 1 (ground attack): idle → roaring → attacking
   - Path 2 (aerial): idle → flying → landing
```

## Open Questions

1. **Storage:** Store pose graphs in database or as JSON in assets?
2. **Sharing:** Can users share/export pose graphs?
3. **Versioning:** How to handle pose graph versions?
4. **Limits:** Max nodes/edges per graph?
5. **Performance:** How to render large graphs (100+ poses)?

## Related Systems

- Asset lineage tracking (`useLineageGraph`)
- Prompt versioning (`prompt_version_id`)
- Scene management (similar graph concepts)
- Action blocks (sequence of actions)

---

**Author:** Claude
**Status:** Proposal - Ready for feedback
