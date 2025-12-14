# Smart MediaCard Generate Button

**Date:** 2025-11-29
**Status:** 💡 DESIGN PROPOSAL
**Related:** ACTION_BLOCKS_I2I_EXTENSION.md

## Problem

The MediaCard "Generate" button should intelligently suggest next actions based on the asset's existing metadata, rather than showing generic options.

**Current state:** Generic "Add to Generate" button
**Desired state:** Context-aware suggestions based on what the asset "knows"

## Asset Intelligence Sources

Assets already contain rich metadata for smart suggestions:

```typescript
interface SmartAssetContext {
  // From Asset model
  id: number;
  mediaType: 'video' | 'image';
  tags: string[];                    // ['couple', 'standing', 'park']
  styleTags: string[];               // ['realistic', 'cinematic']
  description?: string;              // "couple holding hands in park"
  contentDomain: string;             // 'general' | 'adult' | etc.
  contentCategory?: string;          // 'romantic' | 'action' | etc.

  // From Generation (if exists)
  generationId?: number;
  parentGenerationId?: number;       // Part of a chain
  operationType?: string;            // How it was created
  promptUsed?: string;

  // From Asset Lineage
  hasParent: boolean;                // Is this a variation?
  hasChildren: boolean;              // Has variations from this?
  lineageDepth: number;              // How deep in chain (0 = root)

  // From Action Blocks (potential)
  compatibleBlocks?: ActionBlock[];  // Blocks matching tags
  suggestedNextBlocks?: ActionBlock[]; // Based on compatible_next
}
```

## Smart Suggestion Algorithm

```typescript
function getSmartGenerationSuggestions(
  asset: SmartAssetContext
): GenerationSuggestion[] {
  const suggestions: GenerationSuggestion[] = [];

  // 1. Media type determines base operations
  if (asset.mediaType === 'image') {
    suggestions.push({
      operation: 'image_to_image',
      label: 'Create Variation',
      icon: '🎨',
      priority: 10,
      reason: 'Create themed variation of this image'
    });

    suggestions.push({
      operation: 'image_to_video',
      label: 'Animate Image',
      icon: '🎬',
      priority: 8,
      reason: 'Add motion to this image'
    });
  }

  if (asset.mediaType === 'video') {
    suggestions.push({
      operation: 'video_extend',
      label: 'Extend Video',
      icon: '➡️',
      priority: 10,
      reason: 'Continue this video'
    });
  }

  // 2. Lineage context adds smart chaining
  if (asset.parentGenerationId) {
    suggestions.push({
      operation: 'image_to_image',
      label: 'Continue Chain',
      icon: '🔗',
      priority: 15,  // Higher priority!
      reason: `Part of variation chain #${asset.lineageDepth}`,
      prefill: {
        // Auto-suggest next variation based on pattern
        suggestedPrompt: inferNextVariation(asset)
      }
    });
  }

  // 3. Tags trigger action block suggestions
  if (asset.tags.length > 0) {
    const compatibleBlocks = findCompatibleActionBlocks(asset.tags);

    if (compatibleBlocks.length > 0) {
      suggestions.push({
        operation: 'use_action_block',
        label: `Use Template (${compatibleBlocks.length})`,
        icon: '📦',
        priority: 12,
        reason: `${compatibleBlocks.length} matching templates`,
        blocks: compatibleBlocks.slice(0, 3)  // Top 3
      });
    }
  }

  // 4. Content domain/category adds specialized options
  if (asset.contentCategory === 'romantic') {
    suggestions.push({
      operation: 'image_to_image',
      label: 'Romantic Progression',
      icon: '💕',
      priority: 11,
      reason: 'Continue romantic sequence',
      suggestedBlocks: ['transition_romantic_progression']
    });
  }

  if (asset.contentDomain === 'creature' || asset.tags.includes('creature')) {
    suggestions.push({
      operation: 'image_to_image',
      label: 'Creature Pose',
      icon: '🐉',
      priority: 11,
      reason: 'Create new creature pose',
      suggestedBlocks: ['transition_creature_pose_shift']
    });
  }

  // 5. If has children, suggest viewing variations
  if (asset.hasChildren) {
    suggestions.push({
      operation: 'view_variations',
      label: 'View Variations',
      icon: '🌳',
      priority: 9,
      reason: 'See all variations from this image'
    });
  }

  // 6. Description analysis (optional AI enhancement)
  if (asset.description) {
    const inferredAction = inferActionFromDescription(asset.description);
    if (inferredAction) {
      suggestions.push(inferredAction);
    }
  }

  // Sort by priority and return top 5
  return suggestions
    .sort((a, b) => b.priority - a.priority)
    .slice(0, 5);
}
```

## UI Implementation

**Redesigned Generate Button:**

```typescript
// components/media/SmartGenerateButton.tsx

interface GenerationSuggestion {
  operation: OperationType;
  label: string;
  icon: string;
  priority: number;
  reason: string;
  prefill?: {
    suggestedPrompt?: string;
    strength?: number;
    blocks?: string[];
  };
  blocks?: ActionBlock[];
}

function SmartGenerateButton({ asset }: { asset: SmartAssetContext }) {
  const [showMenu, setShowMenu] = useState(false);
  const suggestions = getSmartGenerationSuggestions(asset);

  // Primary action = highest priority suggestion
  const primaryAction = suggestions[0];

  return (
    <div className="relative">
      {/* Primary quick action */}
      <button
        onClick={() => executeGeneration(primaryAction)}
        className="generate-btn-primary"
      >
        <span>{primaryAction.icon}</span>
        <span>{primaryAction.label}</span>
      </button>

      {/* Dropdown for more options */}
      <button
        onClick={() => setShowMenu(!showMenu)}
        className="generate-btn-dropdown"
      >
        ▼
      </button>

      {/* Smart suggestions menu */}
      {showMenu && (
        <div className="suggestions-menu">
          {suggestions.map((suggestion) => (
            <SuggestionMenuItem
              key={suggestion.operation}
              suggestion={suggestion}
              onSelect={() => executeGeneration(suggestion)}
            />
          ))}

          <div className="divider" />

          {/* Manual option */}
          <button onClick={() => openGenerationPanel(asset)}>
            ✏️ Custom Prompt...
          </button>
        </div>
      )}
    </div>
  );
}

function SuggestionMenuItem({ suggestion, onSelect }: {
  suggestion: GenerationSuggestion;
  onSelect: () => void;
}) {
  return (
    <button className="suggestion-item" onClick={onSelect}>
      <div className="suggestion-header">
        <span className="icon">{suggestion.icon}</span>
        <span className="label">{suggestion.label}</span>
        <span className="priority-badge">{suggestion.priority}</span>
      </div>
      <div className="suggestion-reason">
        {suggestion.reason}
      </div>
      {suggestion.blocks && (
        <div className="suggested-blocks">
          {suggestion.blocks.map(block => (
            <span key={block.id} className="block-chip">
              {block.block_id}
            </span>
          ))}
        </div>
      )}
    </button>
  );
}
```

## Smart Prefill Logic

When user selects a suggestion, pre-fill generation panel:

```typescript
function executeGeneration(suggestion: GenerationSuggestion, asset: SmartAssetContext) {
  openGenerationPanel({
    operationType: suggestion.operation,

    // Auto-fill base image
    params: {
      image_url: asset.remoteUrl || asset.fileUrl,
      parent_generation_id: asset.generationId,

      // Prefill from suggestion
      prompt: suggestion.prefill?.suggestedPrompt,
      strength: suggestion.prefill?.strength || 0.7,
    },

    // Suggest action blocks
    suggestedBlocks: suggestion.blocks || [],

    // Show reason in UI
    contextHint: suggestion.reason
  });
}
```

## Example Smart Behaviors

### Example 1: Pirate Variation Chain

```
Asset: woman.jpg
Tags: ['portrait', 'woman', 'standing']
Parent: null
Children: 0

Smart Suggestions:
1. 🎨 Create Variation (priority: 10)
   "Create themed variation of this image"

2. 🎬 Animate Image (priority: 8)
   "Add motion to this image"

3. 📦 Use Template (3) (priority: 12)
   "3 matching templates"
   Blocks: [portrait_variation, costume_change, character_transformation]
```

User creates variation → pirate_captain.jpg

```
Asset: pirate_captain.jpg
Tags: ['portrait', 'woman', 'pirate', 'costume']
Parent: woman.jpg (generation_id: 100)
Children: 0
Lineage depth: 1

Smart Suggestions:
1. 🔗 Continue Chain (priority: 15) ← NEW! Higher priority
   "Part of variation chain #1"
   Prefill: "pirate with eyepatch and bandana"

2. 🎨 Create Variation (priority: 10)
   "Create themed variation of this image"

3. 📦 Use Template (5) (priority: 12)
   "5 matching templates"
   Blocks: [pirate_gear_variation, costume_detail, character_pose]
```

### Example 2: Romantic Progression

```
Asset: couple_holding_hands.jpg
Tags: ['couple', 'romantic', 'standing', 'park']
Content category: 'romantic'
Parent: couple_standing.jpg
Children: 2

Smart Suggestions:
1. 🔗 Continue Chain (priority: 15)
   "Part of variation chain #2"
   Prefill: "couple leaning closer, intimate moment"
   Blocks: [transition_romantic_progression]

2. 💕 Romantic Progression (priority: 11) ← Context-aware!
   "Continue romantic sequence"
   Blocks: [transition_romantic_progression, intimate_moment]

3. 🌳 View Variations (priority: 9)
   "See all variations from this image"

4. 🎨 Create Variation (priority: 10)
   "Create themed variation of this image"
```

### Example 3: Creature Battle Poses

```
Asset: dragon_idle.jpg
Tags: ['creature', 'dragon', 'idle', 'fantasy']
Parent: null
Children: 4

Smart Suggestions:
1. 🐉 Creature Pose (priority: 11) ← Tag-triggered!
   "Create new creature pose"
   Blocks: [transition_creature_pose_shift, creature_aggressive]

2. 🌳 View Variations (priority: 9)
   "See all variations from this image"
   Shows: dragon_roaring, dragon_attacking, dragon_flying, dragon_landing

3. 🎬 Animate Image (priority: 8)
   "Add motion to this image"
   Blocks: [creature_idle_animation, ambient_movement]
```

## Backend Support

**New API endpoint for smart suggestions:**

```python
# /api/v1/assets/{id}/generation-suggestions
@router.get("/assets/{asset_id}/generation-suggestions")
async def get_generation_suggestions(
    asset_id: int,
    user: CurrentUser,
    asset_service: AssetService,
    action_block_service: ActionBlockService,
    lineage_service: AssetLineageService
):
    """
    Analyze asset and return smart generation suggestions
    """
    asset = await asset_service.get_asset(asset_id)

    # Build context
    context = SmartAssetContext(
        asset=asset,
        lineage=await lineage_service.get_lineage(asset_id),
        compatible_blocks=await action_block_service.find_compatible(
            tags=asset.tags,
            content_category=asset.content_category
        )
    )

    # Generate suggestions
    suggestions = smart_suggestion_engine.analyze(context)

    return suggestions
```

## Configuration

Allow users to tune smart suggestion behavior:

```typescript
interface SmartGenerationSettings {
  enableSmartSuggestions: boolean;
  prioritizeChaining: boolean;        // Boost "Continue Chain" priority
  showActionBlockTemplates: boolean;  // Suggest compatible blocks
  inferFromDescription: boolean;      // Use AI to analyze description
  maxSuggestions: number;             // Default: 5

  // Per-category overrides
  categoryPreferences: {
    romantic: { priority: number };
    action: { priority: number };
    creature: { priority: number };
  };
}
```

## Benefits

✅ **Context-aware** - Uses what asset already knows
✅ **Reduces friction** - No need to manually select operation type
✅ **Promotes chaining** - Encourages sequential workflows
✅ **Discovers templates** - Surfaces relevant action blocks
✅ **Progressive disclosure** - Primary action + dropdown for more
✅ **Learns from usage** - Can track which suggestions users pick

## Implementation Phases

**Phase 1: Basic Smart Suggestions** (2-3 days)
- Implement suggestion algorithm (media type + lineage)
- Update MediaCard with smart button
- Add "Continue Chain" priority boost

**Phase 2: Action Block Integration** (2 days)
- Query compatible action blocks by tags
- Add block suggestions to menu
- Prefill with suggested blocks

**Phase 3: Backend Endpoint** (1-2 days)
- Create `/assets/{id}/generation-suggestions` API
- Move smart logic to backend
- Cache suggestions

**Phase 4: Advanced Inference** (3-4 days)
- Content category/domain awareness
- Description analysis
- Usage tracking and learning

**Total effort:** ~8-11 days

## Related

- ACTION_BLOCKS_I2I_EXTENSION.md - Foundation for block suggestions
- MediaCard.tsx - Component to update
- Action Blocks system - Template library

---

**Author:** Claude
**Status:** Design Proposal
