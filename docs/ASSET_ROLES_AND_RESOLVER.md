# Asset Roles & Action Block Resolver

**Status:** ✅ IMPLEMENTED (Task 99)
**Date:** 2025-12-01

## Overview

A lightweight tag-based role system that unifies **prompt DSL / ActionBlocks**, **NPC/location identity**, and **gallery assets** through a resolver that maps structured requests to appropriate assets.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                   Asset Roles System                         │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  Gallery Assets                  Asset Resolver              │
│  (with tags)                                                  │
│       │                                 ▲                     │
│       │                                 │                     │
│       ▼                                 │                     │
│  ┌──────────────┐              ┌───────┴──────┐             │
│  │ Asset Roles  │───resolves──▶│  Resolution  │             │
│  │   Helpers    │              │   Request    │             │
│  └──────────────┘              └──────────────┘             │
│       │                                 │                     │
│       │ parse tags                      │ structured query    │
│       │                                 │                     │
│       ▼                                 ▼                     │
│  Tags:                          ActionBlocks / DSL           │
│  • npc:alex                     MediaCard / Control Center   │
│  • loc:dungeon                  Generation Flows             │
│  • role:bg                                                    │
│  • cam:pov                                                    │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

## Tag Conventions (Ontology-Aligned)

All tags follow the pattern `namespace:value` and **MUST re-use existing identifiers** from:
- Prompt ontology (`ontology.yaml`)
- World/NPC systems
- Location systems

### Character Identity

```typescript
// From world/NPC systems
'npc:alex'        // Specific NPC
'npc:boss_01'     // Named character
'player'          // Player character
```

### Location Identity

```typescript
// From world/location systems
'loc:dungeon_entrance'
'loc:school_rooftop'
'loc:park_bench'
```

### Visual Roles

```typescript
// Asset visual roles (local but consistent)
'role:bg'              // Background
'role:pov:player'      // Player POV hands/body
'role:char:hero'       // Hero character
'role:char:npc'        // NPC character
'role:char:monster'    // Monster/enemy character
'role:comic_frame'     // Composite frame for comic panel
```

### Ontology-Aligned Tags

```typescript
// Camera/POV (from ontology.yaml)
'cam:pov'              // Point of view
'cam:from_behind'      // Camera angle
'cam:upper_body_focus' // Framing

// Re-use ontology IDs wherever they exist
// DO NOT invent parallel vocabularies!
```

## Implementation

### 1. Asset Role Helpers (`assetRoles.ts`)

Utilities for parsing and filtering assets by roles/identities:

```typescript
import {
  getAssetRoles,
  getAssetCharacters,
  getAssetLocations,
  hasAssetRole,
  filterAssetsByRole,
  filterAssetsByCharacter,
  filterAssetsByLocation,
} from '@/lib/gallery/assetRoles';

// Extract roles from an asset
const roles = getAssetRoles(asset);
// Returns: ['bg', 'comic_frame']

// Extract character IDs
const characters = getAssetCharacters(asset);
// Returns: ['npc:alex', 'player']

// Filter assets by role
const backgrounds = filterAssetsByRole(allAssets, 'bg');

// Filter by character
const alexAssets = filterAssetsByCharacter(allAssets, 'npc:alex');
```

### 2. Asset Resolver (`assetResolver.ts`)

Resolves assets for operations based on structured requests:

```typescript
import {
  resolveAssetsForAction,
  resolveSingleAsset,
  createRequestFromActionBlock,
} from '@/lib/generation/assetResolver';

// Example: Resolve assets for a scene
const result = resolveAssetsForAction(
  {
    locationId: 'loc:dungeon_entrance',
    heroId: 'npc:alex',
    enemyIds: ['npc:boss_01'],
    needBackground: true,
    needHero: true,
    needEnemies: true,
  },
  availableAssets
);

// Result structure:
{
  backgroundAsset: GalleryAsset | undefined,
  backgroundCandidates: GalleryAsset[],
  heroAssets: GalleryAsset[],
  enemyAssets: GalleryAsset[],
  allMatched: GalleryAsset[],
  metadata: {
    hasExactLocationMatch: boolean,
    hasExactHeroMatch: boolean,
    hasExactEnemyMatch: boolean,
    usedBackgroundFallback: boolean,
    usedCharacterFallback: boolean,
  }
}
```

### 3. Resolution Strategy

The resolver uses a **fallback hierarchy**:

1. **Exact match** (location + role, character + role)
2. **ID-only match** (location or character, any role)
3. **Role-only match** (correct role, any identity)
4. **Empty** (no matches found)

This ensures the system always tries to find the most specific match first.

### 4. Scoring System

Assets are scored by relevance:

- **+100** points: Exact location match
- **+100** points: Exact character match
- **+50** points: Secondary character match
- **+20** points: Required tag match
- **+10** points: Role match

Higher-scored assets are returned first.

## Usage Examples

### Example 1: Smart Asset Suggestions

```typescript
import { resolveAssetsForAction } from '@/lib/generation';
import { getAssetCharacters, getAssetLocations } from '@/lib/gallery';

function suggestRelatedAssets(currentAsset: GalleryAsset, allAssets: GalleryAsset[]) {
  const characters = getAssetCharacters(currentAsset);
  const locations = getAssetLocations(currentAsset);

  const suggestions = resolveAssetsForAction(
    {
      locationId: locations[0],
      heroId: characters[0],
      needBackground: true,
      needHero: true,
      maxResults: 5,
    },
    allAssets
  );

  return suggestions;
}
```

### Example 2: ActionBlock Integration

```typescript
import { createRequestFromActionBlock, resolveAssetsForAction } from '@/lib/generation';

function resolveAssetsForBlock(actionBlock: ActionBlock, assets: GalleryAsset[]) {
  // Convert ActionBlock tags to resolution request
  const request = createRequestFromActionBlock(actionBlock);

  // Resolve assets
  const result = resolveAssetsForAction(request, assets);

  // Use resolved assets for operation
  return {
    baseImage: result.backgroundAsset || result.heroAssets[0],
    relatedAssets: result.allMatched,
  };
}
```

### Example 3: Fusion Operation

```typescript
import { resolveAssetsForAction } from '@/lib/generation';

function populateFusionAssets(
  locationId: string,
  characterId: string,
  allAssets: GalleryAsset[]
) {
  const result = resolveAssetsForAction(
    {
      locationId,
      heroId: characterId,
      needBackground: true,
      needHero: true,
      maxResults: 1,
    },
    allAssets
  );

  return {
    fusionAssets: [
      result.backgroundAsset?.remote_url,
      result.heroAssets[0]?.remote_url,
    ].filter(Boolean),
  };
}
```

### Example 4: Validation

```typescript
import { resolveAssetsForAction } from '@/lib/generation';

function validateAssetsAvailable(
  locationId: string,
  characterId: string,
  allAssets: GalleryAsset[]
): { valid: boolean; errors: string[] } {
  const result = resolveAssetsForAction(
    {
      locationId,
      heroId: characterId,
      needBackground: true,
      needHero: true,
    },
    allAssets
  );

  const errors: string[] = [];

  if (!result.backgroundAsset) {
    errors.push(`No background found for location: ${locationId}`);
  }

  if (result.heroAssets.length === 0) {
    errors.push(`No assets found for character: ${characterId}`);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
```

## Integration Points

The resolver is designed to be integrated into:

### 1. Smart MediaCard Generate Button
When user clicks "Generate" on an asset:
- Extract asset's location/character tags
- Resolve related assets
- Suggest compatible operations (i2i, Fusion, etc.)

### 2. ActionBlock i2i/Fusion Flows
When executing an ActionBlock:
- Parse ActionBlock tags for character/location references
- Resolve matching assets
- Use as `image_url` or `fusion_assets` inputs

### 3. Control Center Presets
"Populate from scene" button:
- Get current scene's location/characters
- Resolve matching assets
- Pre-fill preset operator with resolved assets

### 4. Gallery Smart Filters
Show related assets:
- Filter by location: "All assets at dungeon_entrance"
- Filter by character: "All assets featuring Alex"
- Filter by role: "All backgrounds"

## File Structure

```
apps/main/src/
├── lib/
│   ├── gallery/
│   │   ├── types.ts                    # GalleryAsset interface
│   │   ├── assetRoles.ts               # Task 99.1 - Role helpers
│   │   └── index.ts                    # Exports (updated)
│   └── generation/
│       ├── assetResolver.ts            # Task 99.2 - Resolver
│       ├── assetResolverIntegration.example.ts  # Integration examples
│       └── index.ts                    # Exports (new)
└── docs/
    └── ASSET_ROLES_AND_RESOLVER.md     # This file
```

## Benefits

✅ **No schema changes** - Uses existing `tags` field
✅ **Ontology-aligned** - Reuses IDs from ontology.yaml
✅ **Flexible fallbacks** - Graceful degradation when exact matches not found
✅ **Centralized logic** - Single place for tag parsing
✅ **Type-safe** - Full TypeScript support
✅ **Reusable** - Works across ActionBlocks, MediaCard, Control Center

## Future Enhancements

### Phase 2 (Optional):
- **Tagging UI**: Quick tag chips/dropdowns in gallery
- **Smart filters**: "Show all assets at this location"
- **Auto-tagging**: AI-based tag suggestions
- **Tag validation**: Warn about non-ontology tags

### Phase 3 (Optional):
- **Usage analytics**: Track which tags/roles are most used
- **Smart recommendations**: Learn from user patterns
- **Batch tagging**: Tag multiple assets at once
- **Tag templates**: Pre-defined tag sets for common scenarios

## Related Documentation

- `claude-tasks/99-asset-roles-and-action-block-resolver.md` - Original task spec
- `docs/ACTION_BLOCKS_I2I_EXTENSION.md` - ActionBlock i2i integration proposal
- `docs/SMART_MEDIACARD_GENERATE_BUTTON.md` - MediaCard smart suggestions proposal
- `pixsim7/backend/main/shared/ontology.yaml` - Ontology definitions

## Testing

### Manual Testing Checklist:

1. **Asset Role Helpers**
   - [ ] `getAssetRoles()` correctly parses role tags
   - [ ] `getAssetCharacters()` finds npc: and player tags
   - [ ] `getAssetLocations()` finds loc: tags
   - [ ] Filter functions work correctly

2. **Asset Resolver**
   - [ ] Exact matches are prioritized
   - [ ] Fallbacks work when no exact match
   - [ ] Scoring system ranks assets correctly
   - [ ] Empty results when no matches

3. **Integration Examples**
   - [ ] Example functions demonstrate correct usage
   - [ ] Type checking passes
   - [ ] Examples cover common use cases

---

**Status:** ✅ Implemented
**Author:** Claude
**Date:** 2025-12-01
