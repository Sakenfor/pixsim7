"""
Task 48 – Intermediate Graph Layers: Scene Collections & Campaigns

Goal

Fill architectural gaps in the multi-layer graph system by adding two intermediate layers, **without introducing new backend tables** and keeping all structure front-end–driven via world metadata:

1. **Scene Collections (Layer 1.5):** Logical grouping of related scenes (chapters, episodes, conversations)
2. **Campaign Layer (Layer 2.5):** Organize multiple arc graphs into complete narrative campaigns

These layers improve content organization, provide better progress tracking, and enable more sophisticated story structuring while:
- Keeping all new structure under `GameWorld.meta` / `WorldManifest.meta`
- Preserving existing scene and arc graph behavior

Background

Current multi-layer graph architecture:

- **Layer 1 (Scene Graph):** Individual scene nodes with branching narrative
- **Layer 2 (Arc Graph):** Story arcs, quests, milestones that organize scenes
- **Layer 3 (Character Graph):** Meta-layer query system for content discovery

Identified gaps:

**Gap 1.5 (Scene → Arc):**
- Individual scenes are too granular, full arcs are too broad
- No way to group related scenes into chapters/episodes
- Writers need intermediate organizational unit
- No explicit conversation thread tracking

**Gap 2.5 (Arc → Character):**
- Multiple arc graphs lack higher-level organization
- WorldManifest has `enabled_arc_graphs: string[]` but no structure for how they relate
- No distinction between main story, side content, character-specific arcs
- Campaign progression not explicitly modeled

Evidence in codebase:

```typescript
// WorldManifest already hints at multiple arc graphs
interface WorldManifest {
  enabled_arc_graphs?: string[];  // No structure or relationships
  meta?: {
    // New work in this task should extend meta.*, not add new top-level fields
    scene_collections?: Record<string, unknown>;
    campaigns?: Record<string, unknown>;
  };
}

// Hotspots already reference scenes
interface GameHotspotDTO {
  action?: { type: "play_scene"; scene_id: number } | null;  // Location-based scene triggers
}

// World has temporal tracking
interface GameWorldDetail {
  world_time: number;  // Time progression exists
  meta: any;           // World-specific structure lives here
}
```

Scope

Includes:

- `apps/main/src/modules/scene-collection/` – New **front-end** module for scene collections (types, validation, helpers)
- `apps/main/src/modules/campaign/` – New **front-end** module for campaigns (types, validation, helpers)
- `apps/main/src/stores/sceneCollectionStore/` – Zustand store for collections (front-end state + world-meta mapping)
- `apps/main/src/stores/campaignStore/` – Zustand store for campaigns (front-end state + world-meta mapping)
- `apps/main/src/components/scene-collection/` – UI components
- `apps/main/src/components/campaign/` – UI components
- Updates to `WorldManifest` TypeScript type to expose campaigns/collections **under `meta`**, not as new top-level fields
- Integration with existing scene and arc graph systems

Out of scope:

- Location-based scene groups (deferred to Task 49)
- Relationship arc layer (deferred to Task 50)
- Timeline/temporal layer (deferred to Task 51)
- Playthrough/save file management (separate backend concern; progression lives in `GameSession.flags` / `relationships`)
- Conversation thread tracking (can be modeled as scene collections)

Problems & Proposed Work

1. Scene Collections (Layer 1.5)

Problem:

- Writers organize scenes into logical groups (chapters, episodes) manually via external documents
- No in-app structure for "this is Chapter 3, containing scenes 12-18"
- Progress tracking is scene-by-scene, not chapter-by-chapter
- Difficult to estimate content duration or structure
- Scene metadata has `arc_id` but no intermediate grouping

Proposed:

Create `apps/main/src/modules/scene-collection/types.ts`:

```typescript
/**
 * Scene Collection - Logical grouping of related scenes
 *
 * Use cases:
 * - Chapters (e.g., "Chapter 3: The First Date")
 * - Episodes (e.g., "Episode 5: Drama Unfolds")
 * - Conversations (e.g., "Getting to Know Sarah")
 * - Location-based groups (e.g., "Downtown Cafe Scenes")
 */

export type SceneCollectionType =
  | 'chapter'
  | 'episode'
  | 'conversation'
  | 'location_group'
  | 'custom';

export interface SceneCollectionScene {
  /** Scene IDs use the same string IDs as GraphState scenes */
  sceneId: string;
  order: number;  // Position within collection
  optional?: boolean;  // Can be skipped
  unlockConditions?: UnlockCondition[];
}

export interface SceneCollection {
  id: string;
  title: string;
  description?: string;
  type: SceneCollectionType;

  /** Ordered list of scenes in this collection */
  scenes: SceneCollectionScene[];

  /** Optional parent arc graph ID */
  arcGraphId?: string;

  /** Optional parent campaign ID */
  campaignId?: string;

  metadata: {
    /** Collection number (e.g., Chapter 3) */
    number?: number;

    /** Estimated duration in minutes */
    estimated_duration_min?: number;

    /** Unlock requirements for entire collection */
    unlock_requirements?: UnlockCondition[];

    /** Color for visual organization */
    color?: string;

    /** Icon for visual organization */
    icon?: string;

    /** Custom metadata */
    [key: string]: unknown;
  };

  version?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface UnlockCondition {
  type: 'relationship_tier' | 'quest_status' | 'flag' | 'time' | 'collection_complete';
  data: {
    /** NPCs use the standard string IDs (e.g. "npc:12") */
    npcId?: string;
    minTier?: string;
    /** Quest IDs follow the existing world/quest ID convention (string) */
    questId?: string;
    status?: 'completed' | 'in_progress';
    flag?: string;
    flagValue?: any;
    minWorldTime?: number;
    collectionId?: string;
  };
}
```

Create `apps/main/src/modules/scene-collection/validation.ts`:

```typescript
import type { SceneCollection } from './types';
import type { ValidationIssue } from '../validation/types';

/**
 * Validate scene collection structure.
 *
 * Uses the shared ValidationIssue model so UI can render issues
 * from scenes, arcs, collections, and campaigns consistently.
 */
export function validateSceneCollection(
  collection: SceneCollection,
  sceneIds: Set<string>
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // Check for missing scenes (hard errors)
  for (const scene of collection.scenes) {
    if (!sceneIds.has(scene.sceneId)) {
      issues.push({
        type: 'broken-scene-reference',
        severity: 'error',
        message: `Collection "${collection.title}" references non-existent scene: ${scene.sceneId}`,
        details: `Scene at order ${scene.order}`,
      });
    }
  }

  // Check for duplicate scene references (design warning)
  const seenScenes = new Set<string>();
  for (const scene of collection.scenes) {
    if (seenScenes.has(scene.sceneId)) {
      issues.push({
        type: 'invalid-requirements',
        severity: 'warning',
        message: `Collection "${collection.title}" contains duplicate scene: ${scene.sceneId}`,
      });
    }
    seenScenes.add(scene.sceneId);
  }

  // Check for ordering gaps (informational only)
  const orders = collection.scenes.map(s => s.order).sort((a, b) => a - b);
  for (let i = 0; i < orders.length - 1; i++) {
    if (orders[i + 1] - orders[i] > 1) {
      issues.push({
        type: 'invalid-requirements',
        severity: 'info',
        message: `Collection "${collection.title}" has ordering gap between ${orders[i]} and ${orders[i + 1]}`,
      });
    }
  }

  // Warn if collection is empty
  if (collection.scenes.length === 0) {
    issues.push({
      type: 'no-nodes',
      severity: 'warning',
      message: `Collection "${collection.title}" contains no scenes`,
    });
  }

  return issues;
}
```

Create `apps/main/src/stores/sceneCollectionStore/index.ts`:

```typescript
import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type { SceneCollection } from '../../modules/scene-collection';

interface SceneCollectionState {
  /** All scene collections by ID */
  collections: Record<string, SceneCollection>;

  /** Currently active collection ID (per-world in UI context) */
  currentCollectionId: string | null;

  // CRUD operations
  createCollection: (title: string, type: SceneCollectionType) => string;
  getCollection: (id: string) => SceneCollection | null;
  updateCollection: (id: string, patch: Partial<SceneCollection>) => void;
  deleteCollection: (id: string) => void;

  // Scene management
  addSceneToCollection: (collectionId: string, sceneId: string, order?: number) => void;
  removeSceneFromCollection: (collectionId: string, sceneId: string) => void;
  reorderScenes: (collectionId: string, sceneIds: string[]) => void;

  // Selection
  setCurrentCollection: (id: string | null) => void;
  getCurrentCollection: () => SceneCollection | null;

  // Query helpers
  getCollectionsForArc: (arcGraphId: string) => SceneCollection[];
  getCollectionsForCampaign: (campaignId: string) => SceneCollection[];
  getCollectionForScene: (sceneId: string) => SceneCollection | null;

  // Import/Export
  exportCollection: (id: string) => string | null;
  importCollection: (json: string) => string | null;
}

export const useSceneCollectionStore = create<SceneCollectionState>()(
  devtools(
    (set, get) => ({
      collections: {},
      currentCollectionId: null,

      createCollection: (title, type) => {
        const id = crypto.randomUUID();
        const collection: SceneCollection = {
          id,
          title,
          type,
          scenes: [],
          metadata: {},
          version: 1,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        set((state) => ({
          collections: {
            ...state.collections,
            [id]: collection,
          },
        }), false, 'createCollection');

        return id;
      },

      getCollection: (id) => {
        return get().collections[id] || null;
      },

      updateCollection: (id, patch) => {
        set((state) => ({
          collections: {
            ...state.collections,
            [id]: {
              ...state.collections[id],
              ...patch,
              updatedAt: new Date().toISOString(),
            },
          },
        }), false, 'updateCollection');
      },

      deleteCollection: (id) => {
        set((state) => {
          const { [id]: removed, ...rest } = state.collections;
          return {
            collections: rest,
            currentCollectionId: state.currentCollectionId === id ? null : state.currentCollectionId,
          };
        }, false, 'deleteCollection');
      },

      addSceneToCollection: (collectionId, sceneId, order) => {
        const collection = get().collections[collectionId];
        if (!collection) return;

        const maxOrder = Math.max(0, ...collection.scenes.map(s => s.order));
        const newOrder = order !== undefined ? order : maxOrder + 1;

        set((state) => ({
          collections: {
            ...state.collections,
            [collectionId]: {
              ...collection,
              scenes: [
                ...collection.scenes,
                { sceneId, order: newOrder },
              ],
              updatedAt: new Date().toISOString(),
            },
          },
        }), false, 'addSceneToCollection');
      },

      removeSceneFromCollection: (collectionId, sceneId) => {
        const collection = get().collections[collectionId];
        if (!collection) return;

        set((state) => ({
          collections: {
            ...state.collections,
            [collectionId]: {
              ...collection,
              scenes: collection.scenes.filter(s => s.sceneId !== sceneId),
              updatedAt: new Date().toISOString(),
            },
          },
        }), false, 'removeSceneFromCollection');
      },

      reorderScenes: (collectionId, sceneIds) => {
        const collection = get().collections[collectionId];
        if (!collection) return;

        const reordered = sceneIds.map((sceneId, index) => {
          const existing = collection.scenes.find(s => s.sceneId === sceneId);
          return {
            sceneId,
            order: index,
            optional: existing?.optional,
            unlockConditions: existing?.unlockConditions,
          };
        });

        set((state) => ({
          collections: {
            ...state.collections,
            [collectionId]: {
              ...collection,
              scenes: reordered,
              updatedAt: new Date().toISOString(),
            },
          },
        }), false, 'reorderScenes');
      },

      setCurrentCollection: (id) => {
        set({ currentCollectionId: id }, false, 'setCurrentCollection');
      },

      getCurrentCollection: () => {
        const { currentCollectionId, collections } = get();
        return currentCollectionId ? collections[currentCollectionId] || null : null;
      },

      getCollectionsForArc: (arcGraphId) => {
        const { collections } = get();
        return Object.values(collections).filter(c => c.arcGraphId === arcGraphId);
      },

      getCollectionsForCampaign: (campaignId) => {
        const { collections } = get();
        return Object.values(collections).filter(c => c.campaignId === campaignId);
      },

      getCollectionForScene: (sceneId) => {
        const { collections } = get();
        return Object.values(collections).find(c =>
          c.scenes.some(s => s.sceneId === sceneId)
        ) || null;
      },

      exportCollection: (id) => {
        const collection = get().collections[id];
        return collection ? JSON.stringify(collection, null, 2) : null;
      },

      importCollection: (json) => {
        try {
          const collection = JSON.parse(json) as SceneCollection;
          set((state) => ({
            collections: {
              ...state.collections,
              [collection.id]: collection,
            },
          }), false, 'importCollection');
          return collection.id;
        } catch (error) {
          console.error('Failed to import collection:', error);
          return null;
        }
      },
    }),
    { name: 'SceneCollectionStore' }
  )
);
```

Acceptance:

- Scene collection module with types and validation exists
- Zustand store provides CRUD operations for collections
- Collections can reference scenes, arcs, and campaigns
- Validation detects broken scene references
- Import/export functionality works

2. Campaign Layer (Layer 2.5)

Problem:

- Multiple arc graphs exist but no structure for how they relate
- WorldManifest has `enabled_arc_graphs` array but no metadata about each arc
- No distinction between main story vs side content vs character-specific arcs
- Campaign progression not tracked (which arcs are complete, which are active)
- No way to define arc dependencies ("Arc B unlocks after Arc A completes")

Proposed:

Create `apps/main/src/modules/campaign/types.ts`:

```typescript
/**
 * Campaign - High-level organization of multiple arc graphs
 *
 * Represents a complete narrative campaign (main story, side quest chain, character storyline)
 */

export type CampaignType =
  | 'main_story'
  | 'side_story'
  | 'character_arc'
  | 'seasonal_event'
  | 'custom';

export interface CampaignArc {
  arcGraphId: string;
  order: number;  // Position in campaign progression
  optional?: boolean;  // Can be skipped
  unlockConditions?: UnlockCondition[];
  parallel?: boolean;  // Can run alongside other arcs
}

export interface Campaign {
  id: string;
  title: string;
  description?: string;
  type: CampaignType;

  /** World this campaign belongs to */
  worldId: number;

  /** Ordered list of arc graphs in this campaign */
  arcs: CampaignArc[];

  /** Scene collections that are part of this campaign */
  collectionIds?: string[];

  metadata: {
    /** Estimated total playtime in hours */
    estimated_playtime_hours?: number;

    /** Required relationship tier to start campaign */
    required_relationship_tier?: RelationshipTierId;

    /** Campaigns that can run in parallel */
    parallel_campaigns?: string[];

    /** Campaigns that must be completed first */
    prerequisite_campaigns?: string[];

    /** Featured character (for character-specific campaigns) */
    featured_character_id?: number;

    /** Color for visual organization */
    color?: string;

    /** Icon for visual organization */
    icon?: string;

    /** Custom metadata */
    [key: string]: unknown;
  };

  version?: number;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Campaign progression state (stored in GameSession or WorldManifest)
 */
export interface CampaignProgression {
  campaignId: string;
  status: 'not_started' | 'in_progress' | 'completed';
  currentArcId?: string;
  completedArcIds: string[];
  startedAt?: string;
  completedAt?: string;
}
```

Create `apps/main/src/modules/campaign/validation.ts`:

```typescript
import type { Campaign } from './types';
import type { ValidationIssue } from '../validation/types';

/**
 * Validate campaign structure
 */
export function validateCampaign(
  campaign: Campaign,
  arcGraphIds: Set<string>,
  options?: {
    allCampaigns?: Campaign[];
  }
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // Check for missing arc graph references
  for (const arc of campaign.arcs) {
    if (!arcGraphIds.has(arc.arcGraphId)) {
      issues.push({
        type: 'broken-arc-reference',
        severity: 'error',
        message: `Campaign "${campaign.title}" references non-existent arc graph: ${arc.arcGraphId}`,
        details: `Arc at order ${arc.order}`,
      });
    }
  }

  // Check for duplicate arc references
  const seenArcs = new Set<string>();
  for (const arc of campaign.arcs) {
    if (seenArcs.has(arc.arcGraphId)) {
      issues.push({
        type: 'invalid-requirements',
        severity: 'warning',
        message: `Campaign "${campaign.title}" contains duplicate arc graph: ${arc.arcGraphId}`,
      });
    }
    seenArcs.add(arc.arcGraphId);
  }

  // Check for circular prerequisite dependencies
  if (options?.allCampaigns && campaign.metadata.prerequisite_campaigns) {
    const visited = new Set<string>([campaign.id]);
    const checkCircular = (prereqIds: string[]) => {
      for (const prereqId of prereqIds) {
        if (visited.has(prereqId)) {
          issues.push({
            type: 'cycle',
            severity: 'error',
            message: `Circular prerequisite dependency detected in campaign "${campaign.title}"`,
            details: `Campaign ${prereqId} creates a cycle`,
          });
          return;
        }
        visited.add(prereqId);
        const prereqCampaign = options.allCampaigns!.find(c => c.id === prereqId);
        if (prereqCampaign?.metadata.prerequisite_campaigns) {
          checkCircular(prereqCampaign.metadata.prerequisite_campaigns);
        }
      }
    };
    checkCircular(campaign.metadata.prerequisite_campaigns);
  }

  // Warn if campaign is empty
  if (campaign.arcs.length === 0) {
    issues.push({
      type: 'no-nodes',
      severity: 'warning',
      message: `Campaign "${campaign.title}" contains no arc graphs`,
    });
  }

  return issues;
}
```

Create `apps/main/src/stores/campaignStore/index.ts`:

```typescript
import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type { Campaign, CampaignProgression } from '../../modules/campaign';

interface CampaignState {
  /** All campaigns by ID */
  campaigns: Record<string, Campaign>;

  /** Campaign progression state (per world) */
  progression: Record<number, Record<string, CampaignProgression>>;  // worldId → campaignId → progression

  /** Currently active campaign ID */
  currentCampaignId: string | null;

  // CRUD operations
  createCampaign: (title: string, type: CampaignType, worldId: number) => string;
  getCampaign: (id: string) => Campaign | null;
  updateCampaign: (id: string, patch: Partial<Campaign>) => void;
  deleteCampaign: (id: string) => void;

  // Arc management
  addArcToCampaign: (campaignId: string, arcGraphId: string, order?: number) => void;
  removeArcFromCampaign: (campaignId: string, arcGraphId: string) => void;
  reorderArcs: (campaignId: string, arcGraphIds: string[]) => void;

  // Progression tracking
  startCampaign: (worldId: number, campaignId: string) => void;
  completeCampaign: (worldId: number, campaignId: string) => void;
  updateCampaignProgress: (worldId: number, campaignId: string, currentArcId: string) => void;
  completeArc: (worldId: number, campaignId: string, arcGraphId: string) => void;
  getCampaignProgression: (worldId: number, campaignId: string) => CampaignProgression | null;

  // Selection
  setCurrentCampaign: (id: string | null) => void;
  getCurrentCampaign: () => Campaign | null;

  // Query helpers
  getCampaignsForWorld: (worldId: number) => Campaign[];
  getMainStoryCampaigns: (worldId: number) => Campaign[];
  getActiveCampaigns: (worldId: number) => Campaign[];

  // Import/Export
  exportCampaign: (id: string) => string | null;
  importCampaign: (json: string) => string | null;
}

export const useCampaignStore = create<CampaignState>()(
  devtools(
    (set, get) => ({
      campaigns: {},
      progression: {},
      currentCampaignId: null,

      createCampaign: (title, type, worldId) => {
        const id = crypto.randomUUID();
        const campaign: Campaign = {
          id,
          title,
          type,
          worldId,
          arcs: [],
          metadata: {},
          version: 1,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        set((state) => ({
          campaigns: {
            ...state.campaigns,
            [id]: campaign,
          },
        }), false, 'createCampaign');

        return id;
      },

      getCampaign: (id) => {
        return get().campaigns[id] || null;
      },

      updateCampaign: (id, patch) => {
        set((state) => ({
          campaigns: {
            ...state.campaigns,
            [id]: {
              ...state.campaigns[id],
              ...patch,
              updatedAt: new Date().toISOString(),
            },
          },
        }), false, 'updateCampaign');
      },

      deleteCampaign: (id) => {
        set((state) => {
          const { [id]: removed, ...rest } = state.campaigns;
          return {
            campaigns: rest,
            currentCampaignId: state.currentCampaignId === id ? null : state.currentCampaignId,
          };
        }, false, 'deleteCampaign');
      },

      addArcToCampaign: (campaignId, arcGraphId, order) => {
        const campaign = get().campaigns[campaignId];
        if (!campaign) return;

        const maxOrder = Math.max(0, ...campaign.arcs.map(a => a.order));
        const newOrder = order !== undefined ? order : maxOrder + 1;

        set((state) => ({
          campaigns: {
            ...state.campaigns,
            [campaignId]: {
              ...campaign,
              arcs: [
                ...campaign.arcs,
                { arcGraphId, order: newOrder },
              ],
              updatedAt: new Date().toISOString(),
            },
          },
        }), false, 'addArcToCampaign');
      },

      removeArcFromCampaign: (campaignId, arcGraphId) => {
        const campaign = get().campaigns[campaignId];
        if (!campaign) return;

        set((state) => ({
          campaigns: {
            ...state.campaigns,
            [campaignId]: {
              ...campaign,
              arcs: campaign.arcs.filter(a => a.arcGraphId !== arcGraphId),
              updatedAt: new Date().toISOString(),
            },
          },
        }), false, 'removeArcFromCampaign');
      },

      reorderArcs: (campaignId, arcGraphIds) => {
        const campaign = get().campaigns[campaignId];
        if (!campaign) return;

        const reordered = arcGraphIds.map((arcGraphId, index) => {
          const existing = campaign.arcs.find(a => a.arcGraphId === arcGraphId);
          return {
            arcGraphId,
            order: index,
            optional: existing?.optional,
            unlockConditions: existing?.unlockConditions,
            parallel: existing?.parallel,
          };
        });

        set((state) => ({
          campaigns: {
            ...state.campaigns,
            [campaignId]: {
              ...campaign,
              arcs: reordered,
              updatedAt: new Date().toISOString(),
            },
          },
        }), false, 'reorderArcs');
      },

      startCampaign: (worldId, campaignId) => {
        set((state) => ({
          progression: {
            ...state.progression,
            [worldId]: {
              ...state.progression[worldId],
              [campaignId]: {
                campaignId,
                status: 'in_progress',
                completedArcIds: [],
                startedAt: new Date().toISOString(),
              },
            },
          },
        }), false, 'startCampaign');
      },

      completeCampaign: (worldId, campaignId) => {
        set((state) => ({
          progression: {
            ...state.progression,
            [worldId]: {
              ...state.progression[worldId],
              [campaignId]: {
                ...state.progression[worldId]?.[campaignId],
                campaignId,
                status: 'completed',
                completedAt: new Date().toISOString(),
              },
            },
          },
        }), false, 'completeCampaign');
      },

      updateCampaignProgress: (worldId, campaignId, currentArcId) => {
        set((state) => ({
          progression: {
            ...state.progression,
            [worldId]: {
              ...state.progression[worldId],
              [campaignId]: {
                ...state.progression[worldId]?.[campaignId],
                campaignId,
                currentArcId,
                status: 'in_progress',
              },
            },
          },
        }), false, 'updateCampaignProgress');
      },

      completeArc: (worldId, campaignId, arcGraphId) => {
        const progression = get().progression[worldId]?.[campaignId];
        if (!progression) return;

        set((state) => ({
          progression: {
            ...state.progression,
            [worldId]: {
              ...state.progression[worldId],
              [campaignId]: {
                ...progression,
                completedArcIds: [...new Set([...progression.completedArcIds, arcGraphId])],
              },
            },
          },
        }), false, 'completeArc');
      },

      getCampaignProgression: (worldId, campaignId) => {
        return get().progression[worldId]?.[campaignId] || null;
      },

      setCurrentCampaign: (id) => {
        set({ currentCampaignId: id }, false, 'setCurrentCampaign');
      },

      getCurrentCampaign: () => {
        const { currentCampaignId, campaigns } = get();
        return currentCampaignId ? campaigns[currentCampaignId] || null : null;
      },

      getCampaignsForWorld: (worldId) => {
        const { campaigns } = get();
        return Object.values(campaigns).filter(c => c.worldId === worldId);
      },

      getMainStoryCampaigns: (worldId) => {
        const { campaigns } = get();
        return Object.values(campaigns).filter(
          c => c.worldId === worldId && c.type === 'main_story'
        );
      },

      getActiveCampaigns: (worldId) => {
        const { campaigns, progression } = get();
        const worldProgression = progression[worldId] || {};
        return Object.values(campaigns).filter(
          c => c.worldId === worldId && worldProgression[c.id]?.status === 'in_progress'
        );
      },

      exportCampaign: (id) => {
        const campaign = get().campaigns[id];
        return campaign ? JSON.stringify(campaign, null, 2) : null;
      },

      importCampaign: (json) => {
        try {
          const campaign = JSON.parse(json) as Campaign;
          set((state) => ({
            campaigns: {
              ...state.campaigns,
              [campaign.id]: campaign,
            },
          }), false, 'importCampaign');
          return campaign.id;
        } catch (error) {
          console.error('Failed to import campaign:', error);
          return null;
        }
      },
    }),
    { name: 'CampaignStore' }
  )
);
```

Acceptance:

- Campaign module with types and validation exists
- Zustand store provides CRUD operations for campaigns
- Campaign progression tracking works per-world
- Validation detects broken arc references and circular dependencies
- Import/export functionality works

3. WorldManifest Integration

Problem:

- WorldManifest has `enabled_arc_graphs` but no campaign structure
- Need to integrate campaigns into world configuration

Proposed:

Update `packages/shared/types/src/game.ts`:

```typescript
export interface WorldManifest {
  /** Default turn preset for turn-based mode */
  turn_preset?: string;

  /** List of arc graph IDs enabled in this world (deprecated - use campaigns) */
  enabled_arc_graphs?: string[];

  /** List of campaign IDs enabled in this world */
  enabled_campaigns?: string[];

  /** Campaign progression state */
  campaign_progression?: Record<string, CampaignProgression>;

  /** List of plugin IDs enabled in this world */
  enabled_plugins?: string[];

  /** Additional custom configuration */
  [key: string]: unknown;
}
```

Migration strategy:

- Existing `enabled_arc_graphs` arrays are preserved for backward compatibility
- New campaigns can be created that reference these arc graphs
- UI prompts user to migrate to campaign structure when editing

Acceptance:

- WorldManifest supports campaigns
- Backward compatibility maintained for existing enabled_arc_graphs
- Migration path documented

4. UI Components

Problem:

- Need UI to create, edit, and visualize collections and campaigns

Proposed:

Create `apps/main/src/components/scene-collection/SceneCollectionPanel.tsx`:

```typescript
/**
 * Scene Collection Editor Panel
 *
 * Features:
 * - Create/edit/delete scene collections
 * - Drag-and-drop scene reordering
 * - Visual organization by type (chapter, episode, etc.)
 * - Assign to arc graphs or campaigns
 * - Unlock condition editor
 */
```

Create `apps/main/src/components/campaign/CampaignPanel.tsx`:

```typescript
/**
 * Campaign Editor Panel
 *
 * Features:
 * - Create/edit/delete campaigns
 * - Visualize arc graph progression
 * - Set prerequisites and parallel campaigns
 * - Track campaign progression state
 * - Assign featured characters
 */
```

Create `apps/main/src/components/campaign/CampaignMapView.tsx`:

```typescript
/**
 * Campaign Map Visualization (v1 stub)
 *
 * v1 scope:
 * - List arcs in a campaign with basic dependency badges
 * - Highlight broken references / unmet prerequisites
 *
 * v2 (follow-up task):
 * - Full visual flowchart with edges and layout
 * - Completion state color-coded from GameSession flags
 */
```

Acceptance:

- Scene collection panel allows CRUD operations
- Campaign panel allows CRUD operations
- Campaign map visualizes campaign structure
- Drag-and-drop reordering works
- Unlock condition editors functional

5. Dependency Tracking

Problem:

- Need to track what collections/campaigns reference what arcs/scenes
- Prevent orphaned references when deleting

Proposed:

Extend `apps/main/src/lib/graph/dependencies.ts`:

```typescript
/**
 * Build comprehensive dependency index across all layers
 */
export interface CompleteDependencyIndex {
  // Existing arc → scene dependencies
  sceneToArcNodes: Map<string, Set<string>>;
  arcNodeToScene: Map<string, string>;

  // New collection → scene dependencies
  sceneToCollections: Map<string, Set<string>>;
  collectionToScenes: Map<string, Set<string>>;

  // New campaign → arc dependencies
  arcToCollections: Map<string, Set<string>>;
  collectionToArcs: Map<string, Set<string>>;

  // New campaign → arc dependencies
  arcToCampaigns: Map<string, Set<string>>;
  campaignToArcs: Map<string, Set<string>>;

  // Collection → campaign dependencies
  collectionToCampaigns: Map<string, Set<string>>;
  campaignToCollections: Map<string, Set<string>>;
}

export function buildCompleteDependencyIndex(
  scenes: Record<string, DraftScene>,
  arcGraphs: Record<string, ArcGraph>,
  collections: Record<string, SceneCollection>,
  campaigns: Record<string, Campaign>
): CompleteDependencyIndex {
  // ... implementation
}
```

Create hooks:

```typescript
// Hook to check if scene has dependencies across all layers
export function useSceneHasAnyDependencies(sceneId: string): {
  hasArcDeps: boolean;
  hasCollectionDeps: boolean;
  totalDeps: number;
} {
  // ... implementation
}

// Hook to check if arc has campaign dependencies
export function useArcHasCampaignDependencies(arcGraphId: string): boolean {
  // ... implementation
}
```

Acceptance:

- Dependency index tracks all cross-layer references
- Hooks provide easy dependency checking
- Delete operations warn about all dependencies

Testing Plan

Unit Tests:

- `modules/scene-collection/validation.test.ts`:
  - Validates broken scene references
  - Detects duplicate scenes in collection
  - Detects ordering gaps

- `modules/campaign/validation.test.ts`:
  - Validates broken arc references
  - Detects circular prerequisite dependencies
  - Validates parallel campaign logic

- `lib/graph/dependencies.test.ts`:
  - Builds complete dependency index correctly
  - Handles cross-layer references

Integration Tests:

- Create scene collection → add scenes → validate
- Create campaign → add arcs → track progression
- Delete scene with collection dependencies → warning shown
- Delete arc with campaign dependencies → warning shown
- Migrate WorldManifest from enabled_arc_graphs to campaigns

Manual Testing:

- Create chapter with 5 scenes
- Create campaign with 3 arcs
- Visualize campaign map
- Track campaign progression through arcs
- Delete scene → verify warning lists all collections
- Export/import collections and campaigns

Documentation Updates

- Update `ARCHITECTURE.md`:
  - Add "Intermediate Graph Layers" section
  - Document scene collections and campaigns
  - Update multi-layer diagram

- Create `docs/GRAPH_LAYERS.md`:
  - Comprehensive guide to all graph layers
  - Scene → Collection → Arc → Campaign → Character
  - Use cases for each layer
  - Best practices for organization

- Update `docs/GRAPH_SYSTEM.md` (from Task 43):
  - Add scene collection and campaign sections
  - Integration patterns
  - Progression tracking

- Create `docs/CAMPAIGN_DESIGN.md`:
  - Guide for designing campaigns
  - Prerequisites and parallel campaigns
  - Unlock conditions and gating
  - Progression tracking patterns

Follow-Up Tasks

This task is part of the graph architecture improvement series:

- **Task 43** ✅: Cross-layer validation and dependency tracking
- **Task 48** (this task): Scene Collections & Campaign layers
- **Task 49**: Location-based scene groups and hotspot integration
- **Task 50**: Relationship arc layer (separate from story arcs)
- **Task 51**: Timeline/temporal layer for time-gated content

Related Work:

- Task 43: Cross-layer validation (foundation for this work)
- Character Identity Graph: Already implemented meta-layer
- WorldManifest: Already has enabled_arc_graphs pattern

Success Criteria

- [ ] Scene collection module exists with types, validation, and store
- [ ] Campaign module exists with types, validation, and store
- [ ] WorldManifest exposes campaigns/collections via meta.*
- [ ] Dependency tracking includes collection and campaign layers
- [ ] UI panels for managing collections and campaigns exist
- [ ] Campaign map visualization works (v1 list/badges)
- [ ] Progression tracking hooks can read per-world state from GameSession flags
- [ ] All validation detects broken references across layers
- [ ] Unit and integration tests pass
- [ ] Documentation complete
"""
