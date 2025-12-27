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
