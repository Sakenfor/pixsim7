## Task 99: Asset Roles & Action Block Resolver

**Status:** Planned

### Intent

Unify **prompt DSL / ActionBlocks**, **NPC/location identity**, and **gallery assets** via a light, tag-based role system and a resolver.

When an ActionBlock or prompt DSL refers to:

- `npc:alex`, `npc:boss_01`, `player` (characters)
- `loc:dungeon_entrance`, `loc:school_rooftop` (locations)

the system should be able to:

- Find suitable reference assets (backgrounds, POV, characters/monsters) using gallery tags and roles.
- Map those assets into the right operation slots (Fusion background/character, i2i base images, transitions).

This is *not* a new schema or system layer, but glue between existing pieces.

---

### Existing Foundations

- **Gallery assets** (`GalleryAsset`):
  - Already support freeform `tags?: string[]`.
- **Fusion / Control Center**:
  - `FusionAssetType = 'character' | 'background' | 'image' | 'video'` (per `TimelineAsset.fusionType`).
  - Preset operator UI has a Fusion role selector for each asset.
- **ActionBlocks & i2i extension (docs)**:
  - `ACTION_BLOCKS_I2I_EXTENSION.md` proposes linking ActionBlocks to `generated_asset_id` / `base_image_asset_id` and using tags for compatibility.
  - `IMAGE_TO_IMAGE`, `VIDEO_TRANSITION`, and `FUSION` operation types are defined in `apps/main/src/types/operations.ts`.
- **Semantic Packs / Ontology**:
  - Ontology and semantic packs already talk about characters/locations as canonical IDs.

This task introduces a lightweight bridge that uses **tags + IDs** rather than new tables.

---

### Tag / Role Conventions (Ontology-Aligned)

**Goal:** Establish a small, consistent vocabulary for asset tagging that can be used across:

- Gallery filters and tools.
- ActionBlock compatibility.
- Prompt DSL resolution.

**Hard requirement:** Asset tags and roles MUST re-use existing identifiers from the **prompt ontology** and world/NPC IDs where applicable. Agents MUST NOT invent parallel, ad-hoc vocabularies when an ontology ID already exists.

Relevant file:

- `pixsim7/backend/main/shared/ontology.yaml` – defines core IDs for camera views, character types, beats, etc.

**Concrete conventions (non-exhaustive, but MUST follow this pattern):**

- Character identity (from world/NPC systems):
  - `npc:alex`, `npc:boss_01`, `player`
- Location identity (from world/location systems):
  - `loc:dungeon_entrance`, `loc:school_rooftop`
- Ontology-aligned tags (re-using ontology IDs where they exist):
  - Camera / POV:
    - If ontology defines a POV view (e.g., `camera:view:pov`), tag assets accordingly.
    - DO NOT invent `view:pov_1` or similar when `camera:view:pov` exists.
  - Character types:
    - If ontology/domain packs define creature/character type IDs, use those IDs as tags.
- Visual roles (local, overlay/HUD-specific, but still consistent):
  - `role:bg` (background)
  - `role:pov:player` (player POV hands/body)
  - `role:char:hero`
  - `role:char:npc`
  - `role:char:monster`
  - `role:comic_frame` (composite frame usable as a comic panel)

All of these live as plain tags on `GalleryAsset.tags`; no schema change is allowed in this task.
When in doubt, agents MUST prefer re-using an ontology ID or existing world ID (`npc:*`, `loc:*`) rather than introducing a new tag root.

---

### 99.1: Asset Role Helpers

**Goal:** Add small helpers to interpret `GalleryAsset.tags` as roles/IDs, to avoid duplicating string logic everywhere.

**Files:**

- `apps/main/src/lib/gallery/types.ts` (or a sibling helper file)
- Potentially `apps/main/src/lib/gameplay-ui-core/*` for shared use.

**Plan:**

- Define utility types:

  ```ts
  export type AssetCharacterId = string; // e.g. 'npc:alex', 'npc:boss_01', 'player'
  export type AssetLocationId = string;  // e.g. 'loc:dungeon_entrance'

  export type AssetRole =
    | 'bg'
    | 'pov:player'
    | 'char:hero'
    | 'char:npc'
    | 'char:monster'
    | 'comic_frame';
  ```

- Implement helpers:

  ```ts
  export function getAssetRoles(asset: GalleryAsset): AssetRole[] { /* parse tags */ }
  export function getAssetCharacters(asset: GalleryAsset): AssetCharacterId[] { /* tags starting npc: */ }
  export function getAssetLocations(asset: GalleryAsset): AssetLocationId[] { /* tags starting loc: */ }
  ```

**Acceptance:**

- Role/identity parsing is centralized and used wherever assets are matched to characters/locations.

---

### 99.2: Resolver for ActionBlocks / DSL → Assets

**Goal:** Given a structured request (from ActionBlocks, prompt DSL, or a higher‑level “generate scene” action), resolve appropriate assets based on IDs + roles.

**Files:**

- A new helper module, e.g.:
  - `apps/main/src/lib/gameplay-ui-core/assetResolver.ts`
  - or `apps/main/src/lib/generation/assetResolver.ts`

**Resolver shape (conceptual):**

```ts
interface AssetResolutionRequest {
  locationId?: AssetLocationId;     // loc:dungeon_entrance
  heroId?: AssetCharacterId;        // npc:alex
  enemyIds?: AssetCharacterId[];    // ['npc:boss_01']

  // Desired roles for this operation (for filtering)
  needBackground?: boolean;
  needHero?: boolean;
  needEnemies?: boolean;
}

interface AssetResolutionResult {
  backgroundAsset?: GalleryAsset;
  heroAssets: GalleryAsset[];
  enemyAssets: GalleryAsset[];
}

export function resolveAssetsForAction(
  request: AssetResolutionRequest,
  candidates: GalleryAsset[],
): AssetResolutionResult { /* use tags + roles */ }
```

**Behavior:**

- If `locationId` is set, prefer assets tagged with that location + matching role (e.g. `loc:dungeon_entrance` + `role:bg`).
- If `heroId` is set, prefer assets tagged with that character + a hero/char role.
- If `enemyIds` are set, pick assets tagged with those IDs and `role:char:monster`/`role:char:npc`.
- Fallbacks:
  - If no exact match, fall back to assets with correct role only (`role:bg`, `role:char:*`), or return empty slots.

**Acceptance:**

- A single function can be used by:
  - ActionEngine / ActionBlocks when selecting reference assets.
  - Quick generation helpers (e.g., “generate dungeon frame for this scene”).
  - Future smart tools (e.g. MediaCard “smart generate”).

---

### 99.3: Integration Points (No Behavior Change Yet)

**Goal:** Thread the resolver into a few strategic places, but initially in a “suggestion” / optional way so existing flows do not break.

**Candidate integration points:**

- **Smart MediaCard generate button** (see `docs/SMART_MEDIACARD_GENERATE_BUTTON.md`):
  - When deciding which ActionBlocks are “compatible” with an asset, use its roles/IDs.
  - Offer a “use related assets (background/character)” suggestion using the resolver.
- **ActionBlock i2i/Fusion flows** (per `ACTION_BLOCKS_I2I_EXTENSION.md`):
  - When an ActionBlock’s tags specify character/location, call the resolver to pick base/variation assets.
  - Use resolved assets as `image_url` / `fusion_assets` inputs in the operation params.
- **Control Center presets (Fusion)**:
  - Optionally, add a “populate from scene” or “populate from character/location” button that pre-fills assets based on current scene/characters using the resolver.

**Important:** In this task, treat the resolver as a **helper**; don’t hard‑wire it deep into ActionEngine logic yet. The initial use should be “recommendations / prefill” so behavior remains predictable.

---

### 99.4: Tagging Support (Optional UX)

To make the above useful, creators need an easy way to tag assets with IDs/roles.

**Optional but valuable UI:**

- In gallery asset details or MediaCard:
  - Quick tag chips/dropdowns for:
    - Character: dropdown of known NPC IDs (`npc:...`).
    - Location: dropdown of known location IDs (`loc:...`).
    - Role: background / player POV / npc / monster / comic frame.

These can be thin wrappers that just add/remove tags on the asset; they don’t need new backend fields.

---

### Acceptance Criteria

- Role + identity conventions for assets are documented and implemented via helpers.
- A reusable resolver exists that maps structured character/location IDs to gallery assets selected by tags/roles.
- At least one integration point (e.g. Smart MediaCard generate or Fusion presets) uses the resolver to suggest/reference assets, without breaking existing manual flows.

---

### Notes

- This task intentionally builds on the i2i ActionBlocks proposal and Fusion support; it doesn’t try to implement that entire proposal, only the asset matching part.
- No DB migrations are required; everything is driven by in-band tags and existing asset metadata.
