import type { UnlockCondition } from '../scene-collection/types';

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
    required_relationship_tier?: string;

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

// Re-export UnlockCondition for convenience
export type { UnlockCondition };
