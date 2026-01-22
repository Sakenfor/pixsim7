## Task 101: Scene & World Visual Context Resolver

**Status:** Planned

### Intent

Provide a single, well-documented helper that answers the question:

> “Given a world, a scene (optional), and a session, which visual assets should I use right now for background, portrait/POV, and comic panels?”

This resolver should:

- Respect **scene-level** visuals (comic panels).
- Respect **world-level** bindings (World Visual Roles).
- Leverage the **asset resolver** (Task 99) as a fallback.
- Be usable from any surface (Game2D, HUD, overlays, storyboards) so they don’t re-implement selection logic.

No backend schema changes; all inputs come from existing types and meta JSON.

---

### Existing Pieces to Reuse

- **Scene metadata & comic panels:**
  - `apps/main/src/modules/scene-builder/index.ts`
    - `SceneMetaComicPanel`
    - `DraftScene.comicPanels`, `SceneMetadata.comicPanels`
  - `apps/main/src/lib/gameplay-ui-core/comicPanels.ts`
    - `getActiveComicPanels(session, sceneMeta)`
    - `setCurrentComicPanel`, `getComicPanelAssetIds`

- **World visual roles:**
  - `apps/main/src/components/game/panels/WorldVisualRolesPanel.tsx`
    - Stores bindings in `world.meta.visualRoles`:
      - `characters[npc:*].portraitAssetId`, `povAssetId`, `comicIntroPanelAssetIds`
      - `locations[loc:*].backgroundAssetIds`, `comicPanelAssetIds`

- **Asset roles & resolver (Task 99):**
  - `apps/main/src/lib/gallery/assetRoles.ts`
    - `AssetRole`, `getAssetRoles`, `getAssetCharacters`, `getAssetLocations`, etc.
  - `apps/main/src/lib/generation/assetResolver.ts`
    - `resolveAssetsForAction(request, candidates)`

- **Game world & UI config:**
  - `packages/shared/types/src/game.ts`
    - `GameWorldDetail`, `GameWorldSummary`
  - `packages/game/engine/src/world/worldUiConfig.ts`
    - World UI config; not directly used, but important to not conflict with.

---

### 101.1: Visual Context Types

**Goal:** Define a small, reusable type contract for “visual context” that clients can use.

**Files:**

- New module, e.g. `apps/main/src/lib/gameplay-ui-core/visualContext.ts`

**Types (conceptual):**

```ts
import type { GameWorldDetail } from '@pixsim7/shared.types';
import type { SceneMetaComicPanel, ComicSessionFlags } from '@/modules/scene-builder';
import type { GalleryAsset } from '@/lib/gallery/types';

export interface VisualContextInput {
  world: GameWorldDetail;
  sceneMeta?: {
    id?: string;
    title?: string;
    comicPanels?: SceneMetaComicPanel[];
    [key: string]: any;
  };
  session?: {
    flags?: {
      comic?: ComicSessionFlags;
      [key: string]: any;
    };
    [key: string]: any;
  };

  /** Optional explicit IDs (from DSL / ActionBlocks / callers) */
  heroId?: string;      // e.g. 'npc:alex' or 'player'
  locationId?: string;  // e.g. 'loc:dungeon_entrance'

  /** Available assets to choose from */
  assets: GalleryAsset[];
}

export interface VisualContextOutput {
  backgroundAsset?: GalleryAsset;
  portraitAsset?: GalleryAsset;
  povAsset?: GalleryAsset;
  comicPanels: SceneMetaComicPanel[];

  metadata: {
    source: {
      background: 'scene' | 'world' | 'resolver' | 'none';
      portrait: 'world' | 'npcExpression' | 'resolver' | 'none';
      pov: 'world' | 'resolver' | 'none';
      comicPanels: 'scene' | 'world' | 'none';
    };
  };
}
```

---

### 101.2: Resolution Strategy (Precedence)

**Goal:** Implement a clear precedence order so consumers don’t have to guess how visuals are picked.

**Precedence for comic panels:**

1. `Scene.meta.comicPanels` + `session.flags.comic.current_panel`  
   - Use `getActiveComicPanels(session, sceneMeta)` to get current panels.
2. World default comic panels for location/character (if present):
   - `world.meta.visualRoles.locations[locationId].comicPanelAssetIds`
   - `world.meta.visualRoles.characters[heroId].comicIntroPanelAssetIds`
3. No panels → empty list.

**Precedence for background:**

1. If scene has comic panels and they’re being used for this beat:
   - Optionally treat the first panel as the “background frame”, but this is a UX decision; default resolver should not assume this unless explicitly requested.
2. World visual roles:
   - `world.meta.visualRoles.locations[locationId].backgroundAssetIds[0]`
3. Resolver fallback (Task 99):
   - Call `resolveAssetsForAction({ locationId, needBackground: true }, assets)` and use `backgroundAsset`.
4. No match → `backgroundAsset` undefined.

**Precedence for portrait / POV:**

1. World visual roles:
   - `world.meta.visualRoles.characters[heroId].portraitAssetId`
   - `world.meta.visualRoles.characters[heroId].povAssetId`
2. (Optional future extension) NpcExpressions:
   - If wired in later, check `NpcExpressionDTO` assets for active state.
3. Resolver fallback:
   - Call `resolveAssetsForAction({ heroId, needHero: true }, assets)` and use `heroAssets[0]` as portrait.
4. No match → corresponding slot undefined.

**Implementation:**

- In `visualContext.ts`, implement:

  ```ts
  export function resolveVisualContext(input: VisualContextInput): VisualContextOutput {
    // 1. Use getActiveComicPanels for panels (scene + session).
    // 2. For background, check world.meta.visualRoles, then resolver.
    // 3. For portrait/pov, check world.meta.visualRoles, then resolver.
    // 4. Fill metadata.source fields accordingly.
  }
  ```

- Make sure this function:
  - Never mutates `world`, `sceneMeta`, or `session`.
  - Does not call APIs; it operates purely on provided inputs.

---

### 101.3: Integration Points (Read-Only, No Behavior Change)

**Goal:** Wire the resolver into a few key places as a **read-only helper** so it can be adopted gradually without breaking existing behavior.

Initial integration targets:

1. **Game2D route** (`apps/main/src/routes/Game2D.tsx`)
   - Where it currently decides:
     - NPC portraits.  
     - Background image / location art.  
   - Add a small, opt-in path that:
     - Calls `resolveVisualContext` with current world + scene meta + session + preloaded `GalleryAsset[]`.  
     - Uses `backgroundAsset` / `portraitAsset` / `comicPanels` for display if available, but preserves existing logic as a fallback.

2. **HUD / Overlay configs (where appropriate)**
   - For any HUD overlay or overlay preset that wants “contextual art”:
     - Use `resolveVisualContext` to feed `ComicPanelWidget` or background widgets.
   - Keep this optional; don’t force existing overlays to depend on it immediately.

3. **WorldVisualRolesPanel docs**
   - Update/respect `TASK_100_IMPLEMENTATION_SUMMARY.md` to mention:
     - `world.meta.visualRoles` is a high-priority source for `resolveVisualContext`.

**Important:** In this task, the resolver should NOT override existing behavior silently. Use it as:

- A “preferred path” when data is present, and  
- A helper that surfaces decisions (via `metadata.source`) so callers can log/inspect what’s happening.

---

### Non-Goals / Constraints

- No backend schema changes.
- No changes to how `WorldVisualRolesPanel` or `NpcPortraits` store their data; this resolver only reads.
- Do not hard-wire ActionEngine or generation pipelines to use this resolver yet; that’s a separate concern (they already have the asset resolver for their needs).
- Do not build new UI in this task; the focus is on the library/helper layer.

---

### Acceptance Criteria

- `visualContext.ts` exports:
  - `VisualContextInput`
  - `VisualContextOutput`
  - `resolveVisualContext(input): VisualContextOutput`
- The resolver:
  - Uses `Scene.meta.comicPanels` + `ComicSessionFlags` via `getActiveComicPanels`.  
  - Consumes `world.meta.visualRoles` to prefer per-world bindings.  
  - Falls back to `resolveAssetsForAction` (Task 99) when needed.  
  - Sets `metadata.source` fields accurately to reflect where each visual came from.
- At least one consumer (e.g., Game2D) calls `resolveVisualContext` and uses its results in a guarded way (no breaking changes to existing paths).
- Behavior is documented clearly so future UI (HUD overlays, storyboards, comic views) can rely on a single visual context helper instead of re-implementing selection logic.

