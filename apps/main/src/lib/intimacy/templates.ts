/**
 * Template Library for Intimacy Scenes and Progression Arcs
 *
 * Pre-built templates for common intimacy scenarios and relationship progressions.
 * Designers can use these as starting points or learn from them.
 *
 * @see docs/INTIMACY_SCENE_COMPOSER.md
 * @see claude-tasks/12-intimacy-scene-composer-and-progression-editor.md (Phase 10)
 */

import type {
  IntimacySceneConfig,
  RelationshipProgressionArc,
  RelationshipGate,
} from '@pixsim7/shared.types';

// ============================================================================
// Template Metadata
// ============================================================================

export interface SceneTemplate {
  id: string;
  name: string;
  description: string;
  category: 'flirt' | 'date' | 'kiss' | 'intimate' | 'custom';
  tags: string[];
  difficulty: 'easy' | 'medium' | 'hard';
  author?: string;
  scene: IntimacySceneConfig;
}

export interface ArcTemplate {
  id: string;
  name: string;
  description: string;
  category: 'romance' | 'friendship' | 'rivalry' | 'custom';
  tags: string[];
  difficulty: 'easy' | 'medium' | 'hard';
  estimatedDuration: 'short' | 'medium' | 'long';
  author?: string;
  arc: RelationshipProgressionArc;
}

// ============================================================================
// Scene Templates
// ============================================================================

export const SCENE_TEMPLATES: SceneTemplate[] = [
  // Flirt Templates
  {
    id: 'flirt_casual',
    name: 'Casual Flirting',
    description: 'Light, playful flirting between acquaintances',
    category: 'flirt',
    tags: ['beginner', 'light', 'playful'],
    difficulty: 'easy',
    scene: {
      id: 'flirt_casual',
      name: 'Casual Flirting',
      sceneType: 'flirt',
      intensity: 'light',
      targetNpcIds: [],
      gates: [
        {
          id: 'acquaintance_gate',
          name: 'Met Before',
          description: 'Must have met at least once',
          requiredTier: 'acquaintance',
          metricRequirements: {
            minAffinity: 10,
          },
        },
      ],
      contentRating: 'romantic',
      requiresConsent: false,
      tags: ['casual', 'playful', 'light'],
    },
  },
  {
    id: 'flirt_workplace',
    name: 'Workplace Flirting',
    description: 'Subtle flirting in a professional setting',
    category: 'flirt',
    tags: ['professional', 'subtle', 'tension'],
    difficulty: 'medium',
    scene: {
      id: 'flirt_workplace',
      name: 'Workplace Flirting',
      sceneType: 'flirt',
      intensity: 'subtle',
      targetNpcIds: [],
      gates: [
        {
          id: 'professional_gate',
          name: 'Professional Setting',
          description: 'Must be in a professional context',
          requiredTier: 'acquaintance',
          metricRequirements: {
            minAffinity: 20,
            minTension: 15,
          },
          requiredFlags: ['workplace_context'],
        },
      ],
      contentRating: 'sfw',
      requiresConsent: false,
      tags: ['workplace', 'professional', 'subtle'],
    },
  },

  // Date Templates
  {
    id: 'date_coffee',
    name: 'Coffee Date',
    description: 'Casual coffee shop date, low-pressure',
    category: 'date',
    tags: ['beginner', 'casual', 'safe'],
    difficulty: 'easy',
    scene: {
      id: 'date_coffee',
      name: 'Coffee Date',
      sceneType: 'date',
      intensity: 'light',
      targetNpcIds: [],
      gates: [
        {
          id: 'friend_gate',
          name: 'Friends First',
          description: 'Must be friends before dating',
          requiredTier: 'friend',
          metricRequirements: {
            minAffinity: 30,
            minChemistry: 20,
          },
        },
      ],
      contentRating: 'romantic',
      requiresConsent: false,
      tags: ['coffee', 'casual', 'first_date'],
    },
  },
  {
    id: 'date_dinner',
    name: 'Romantic Dinner',
    description: 'Intimate dinner date with romantic atmosphere',
    category: 'date',
    tags: ['romantic', 'formal', 'evening'],
    difficulty: 'medium',
    scene: {
      id: 'date_dinner',
      name: 'Romantic Dinner',
      sceneType: 'date',
      intensity: 'moderate',
      targetNpcIds: [],
      gates: [
        {
          id: 'close_friend_gate',
          name: 'Close Connection',
          description: 'Must be close friends or romantic interests',
          requiredTier: 'close_friend',
          metricRequirements: {
            minAffinity: 50,
            minChemistry: 40,
            minTrust: 35,
          },
        },
      ],
      contentRating: 'romantic',
      requiresConsent: false,
      tags: ['dinner', 'romantic', 'formal'],
    },
  },
  {
    id: 'date_adventure',
    name: 'Adventure Date',
    description: 'Exciting outdoor or activity-based date',
    category: 'date',
    tags: ['active', 'fun', 'bonding'],
    difficulty: 'medium',
    scene: {
      id: 'date_adventure',
      name: 'Adventure Date',
      sceneType: 'date',
      intensity: 'moderate',
      targetNpcIds: [],
      gates: [
        {
          id: 'friend_adventurous',
          name: 'Adventurous Spirit',
          description: 'Both parties enjoy adventure',
          requiredTier: 'friend',
          metricRequirements: {
            minAffinity: 40,
            minChemistry: 30,
          },
          requiredFlags: ['enjoys_adventure'],
        },
      ],
      contentRating: 'sfw',
      requiresConsent: false,
      tags: ['adventure', 'outdoor', 'active'],
    },
  },

  // Kiss Templates
  {
    id: 'kiss_first',
    name: 'First Kiss',
    description: 'Sweet, nervous first kiss',
    category: 'kiss',
    tags: ['romantic', 'sweet', 'milestone'],
    difficulty: 'medium',
    scene: {
      id: 'kiss_first',
      name: 'First Kiss',
      sceneType: 'kiss',
      intensity: 'light',
      targetNpcIds: [],
      gates: [
        {
          id: 'romance_ready',
          name: 'Ready for Romance',
          description: 'Strong romantic connection established',
          requiredTier: 'close_friend',
          requiredIntimacyLevel: 'deep_flirt',
          metricRequirements: {
            minAffinity: 60,
            minChemistry: 50,
            minTrust: 45,
          },
          blockedFlags: ['already_kissed'],
        },
      ],
      contentRating: 'romantic',
      requiresConsent: false,
      tags: ['first_kiss', 'sweet', 'romantic'],
    },
  },
  {
    id: 'kiss_passionate',
    name: 'Passionate Kiss',
    description: 'Intense, passionate kissing scene',
    category: 'kiss',
    tags: ['intense', 'passionate', 'chemistry'],
    difficulty: 'hard',
    scene: {
      id: 'kiss_passionate',
      name: 'Passionate Kiss',
      sceneType: 'kiss',
      intensity: 'intense',
      targetNpcIds: [],
      gates: [
        {
          id: 'deep_romance',
          name: 'Deep Romantic Bond',
          description: 'Strong romantic and physical chemistry',
          requiredTier: 'lover',
          requiredIntimacyLevel: 'intimate',
          metricRequirements: {
            minAffinity: 75,
            minChemistry: 70,
            minTension: 50,
          },
          requiredFlags: ['already_kissed'],
        },
      ],
      contentRating: 'mature_implied',
      requiresConsent: false,
      tags: ['passionate', 'intense', 'chemistry'],
    },
  },
  {
    id: 'kiss_goodbye',
    name: 'Goodbye Kiss',
    description: 'Tender goodbye kiss at end of date',
    category: 'kiss',
    tags: ['sweet', 'tender', 'parting'],
    difficulty: 'easy',
    scene: {
      id: 'kiss_goodbye',
      name: 'Goodbye Kiss',
      sceneType: 'kiss',
      intensity: 'light',
      targetNpcIds: [],
      gates: [
        {
          id: 'dating_gate',
          name: 'Dating Relationship',
          description: 'Must be in a dating relationship',
          requiredTier: 'lover',
          metricRequirements: {
            minAffinity: 65,
            minChemistry: 55,
          },
          requiredFlags: ['currently_on_date'],
        },
      ],
      contentRating: 'romantic',
      requiresConsent: false,
      tags: ['goodbye', 'sweet', 'parting'],
    },
  },

  // Intimate Templates
  {
    id: 'intimate_cuddling',
    name: 'Cuddling Scene',
    description: 'Intimate cuddling and physical closeness',
    category: 'intimate',
    tags: ['tender', 'close', 'affectionate'],
    difficulty: 'medium',
    scene: {
      id: 'intimate_cuddling',
      name: 'Cuddling Scene',
      sceneType: 'intimate',
      intensity: 'moderate',
      targetNpcIds: [],
      gates: [
        {
          id: 'lover_gate',
          name: 'Lover Status',
          description: 'Must be in a romantic relationship',
          requiredTier: 'lover',
          metricRequirements: {
            minAffinity: 70,
            minTrust: 65,
            minChemistry: 60,
          },
        },
      ],
      contentRating: 'romantic',
      requiresConsent: false,
      tags: ['cuddling', 'tender', 'affectionate'],
    },
  },
  {
    id: 'intimate_morning_after',
    name: 'Morning After',
    description: 'Tender morning scene after intimacy (implied)',
    category: 'intimate',
    tags: ['mature', 'tender', 'aftermath'],
    difficulty: 'hard',
    scene: {
      id: 'intimate_morning_after',
      name: 'Morning After',
      sceneType: 'intimate',
      intensity: 'moderate',
      targetNpcIds: [],
      gates: [
        {
          id: 'deep_intimacy',
          name: 'Deep Intimate Bond',
          description: 'Very deep romantic and physical connection',
          requiredTier: 'lover',
          requiredIntimacyLevel: 'very_intimate',
          metricRequirements: {
            minAffinity: 80,
            minTrust: 75,
            minChemistry: 75,
          },
          requiredFlags: ['intimate_relationship'],
        },
      ],
      contentRating: 'mature_implied',
      requiresConsent: true,
      tags: ['morning', 'tender', 'implied'],
    },
  },
];

// ============================================================================
// Progression Arc Templates
// ============================================================================

export const ARC_TEMPLATES: ArcTemplate[] = [
  // Romance Arcs
  {
    id: 'arc_friends_to_lovers',
    name: 'Friends to Lovers',
    description: 'Classic progression from friendship to romance',
    category: 'romance',
    tags: ['classic', 'slow_burn', 'friends_first'],
    difficulty: 'easy',
    estimatedDuration: 'medium',
    arc: {
      id: 'arc_friends_to_lovers',
      name: 'Friends to Lovers',
      targetNpcId: 0, // Will be set by user
      stages: [
        {
          id: 'stage_meet',
          name: 'First Meeting',
          tier: 'acquaintance',
          gate: {
            id: 'gate_meet',
            name: 'Initial Meeting',
            requiredTier: 'stranger',
          },
          onEnterEffects: {
            affinityDelta: 5,
            setFlags: ['met_npc'],
          },
        },
        {
          id: 'stage_friend',
          name: 'Becoming Friends',
          tier: 'friend',
          gate: {
            id: 'gate_friend',
            name: 'Friendship Gate',
            requiredTier: 'acquaintance',
            metricRequirements: {
              minAffinity: 25,
            },
          },
          onEnterEffects: {
            affinityDelta: 10,
            trustDelta: 10,
            setFlags: ['friends'],
          },
          availableScenes: ['flirt_casual'],
        },
        {
          id: 'stage_close_friend',
          name: 'Close Friends',
          tier: 'close_friend',
          gate: {
            id: 'gate_close_friend',
            name: 'Close Friendship',
            requiredTier: 'friend',
            metricRequirements: {
              minAffinity: 50,
              minTrust: 40,
            },
          },
          onEnterEffects: {
            affinityDelta: 15,
            trustDelta: 10,
            chemistryDelta: 10,
            setFlags: ['close_friends'],
          },
          availableScenes: ['date_coffee'],
        },
        {
          id: 'stage_romantic',
          name: 'Romantic Interest',
          tier: 'lover',
          gate: {
            id: 'gate_romantic',
            name: 'Romance Gate',
            requiredTier: 'close_friend',
            requiredIntimacyLevel: 'deep_flirt',
            metricRequirements: {
              minAffinity: 65,
              minChemistry: 55,
              minTrust: 50,
            },
          },
          onEnterEffects: {
            affinityDelta: 20,
            chemistryDelta: 15,
            setFlags: ['dating'],
          },
          availableScenes: ['date_dinner', 'kiss_first'],
        },
      ],
      maxContentRating: 'romantic',
      tags: ['romance', 'friends_first', 'slow_burn'],
    },
  },
  {
    id: 'arc_slow_burn',
    name: 'Slow Burn Romance',
    description: 'Very gradual progression with lots of tension',
    category: 'romance',
    tags: ['slow_burn', 'tension', 'detailed'],
    difficulty: 'medium',
    estimatedDuration: 'long',
    arc: {
      id: 'arc_slow_burn',
      name: 'Slow Burn Romance',
      targetNpcId: 0,
      stages: [
        {
          id: 'stage_strangers',
          name: 'Strangers',
          tier: 'stranger',
          gate: {
            id: 'gate_start',
            name: 'Starting Point',
          },
          onEnterEffects: {
            setFlags: ['arc_started'],
          },
        },
        {
          id: 'stage_acquaintance',
          name: 'Getting Acquainted',
          tier: 'acquaintance',
          gate: {
            id: 'gate_acquaintance',
            name: 'Acquaintance Gate',
            requiredTier: 'stranger',
            metricRequirements: {
              minAffinity: 10,
            },
          },
          onEnterEffects: {
            affinityDelta: 5,
            tensionDelta: 5,
            setFlags: ['met_npc'],
          },
        },
        {
          id: 'stage_casual_friend',
          name: 'Casual Friends',
          tier: 'friend',
          gate: {
            id: 'gate_casual_friend',
            name: 'Casual Friendship',
            requiredTier: 'acquaintance',
            metricRequirements: {
              minAffinity: 30,
              minTension: 10,
            },
          },
          onEnterEffects: {
            affinityDelta: 10,
            trustDelta: 8,
            tensionDelta: 5,
          },
          availableScenes: ['flirt_casual'],
        },
        {
          id: 'stage_good_friend',
          name: 'Good Friends',
          tier: 'friend',
          gate: {
            id: 'gate_good_friend',
            name: 'Good Friendship',
            requiredTier: 'friend',
            metricRequirements: {
              minAffinity: 45,
              minTrust: 35,
              minTension: 20,
            },
          },
          onEnterEffects: {
            affinityDelta: 12,
            trustDelta: 10,
            chemistryDelta: 8,
            tensionDelta: 8,
          },
        },
        {
          id: 'stage_close_friend',
          name: 'Close Friends (Tension Rising)',
          tier: 'close_friend',
          gate: {
            id: 'gate_close_friend_tension',
            name: 'Close Friends with Tension',
            requiredTier: 'friend',
            metricRequirements: {
              minAffinity: 60,
              minTrust: 50,
              minChemistry: 40,
              minTension: 35,
            },
          },
          onEnterEffects: {
            affinityDelta: 15,
            trustDelta: 12,
            chemistryDelta: 15,
            tensionDelta: 12,
          },
          availableScenes: ['date_coffee', 'date_adventure'],
        },
        {
          id: 'stage_almost_lovers',
          name: 'Almost Lovers',
          tier: 'close_friend',
          gate: {
            id: 'gate_almost',
            name: 'Almost There',
            requiredTier: 'close_friend',
            requiredIntimacyLevel: 'deep_flirt',
            metricRequirements: {
              minAffinity: 70,
              minTrust: 60,
              minChemistry: 60,
              minTension: 50,
            },
          },
          onEnterEffects: {
            affinityDelta: 15,
            chemistryDelta: 15,
            tensionDelta: 15,
          },
          availableScenes: ['date_dinner'],
        },
        {
          id: 'stage_lovers',
          name: 'Finally Together',
          tier: 'lover',
          gate: {
            id: 'gate_lovers',
            name: 'Lovers Gate',
            requiredTier: 'close_friend',
            requiredIntimacyLevel: 'intimate',
            metricRequirements: {
              minAffinity: 80,
              minTrust: 70,
              minChemistry: 75,
              minTension: 60,
            },
          },
          onEnterEffects: {
            affinityDelta: 20,
            chemistryDelta: 20,
            setFlags: ['dating', 'relationship_official'],
          },
          availableScenes: ['kiss_first', 'kiss_passionate'],
        },
      ],
      maxContentRating: 'romantic',
      tags: ['slow_burn', 'tension', 'detailed'],
    },
  },
  {
    id: 'arc_love_at_first_sight',
    name: 'Love at First Sight',
    description: 'Quick progression with instant chemistry',
    category: 'romance',
    tags: ['fast', 'chemistry', 'passionate'],
    difficulty: 'easy',
    estimatedDuration: 'short',
    arc: {
      id: 'arc_love_at_first_sight',
      name: 'Love at First Sight',
      targetNpcId: 0,
      stages: [
        {
          id: 'stage_meet',
          name: 'Electric First Meeting',
          tier: 'acquaintance',
          gate: {
            id: 'gate_meet',
            name: 'Love at First Sight',
            requiredTier: 'stranger',
          },
          onEnterEffects: {
            affinityDelta: 20,
            chemistryDelta: 25,
            tensionDelta: 20,
            setFlags: ['instant_chemistry'],
          },
        },
        {
          id: 'stage_fast_friend',
          name: 'Fast Friends',
          tier: 'friend',
          gate: {
            id: 'gate_fast_friend',
            name: 'Quick Connection',
            requiredTier: 'acquaintance',
            metricRequirements: {
              minAffinity: 30,
              minChemistry: 30,
            },
          },
          onEnterEffects: {
            affinityDelta: 20,
            trustDelta: 15,
            chemistryDelta: 15,
          },
          availableScenes: ['flirt_casual', 'date_coffee'],
        },
        {
          id: 'stage_passionate',
          name: 'Passionate Romance',
          tier: 'lover',
          gate: {
            id: 'gate_passionate',
            name: 'Passion Ignites',
            requiredTier: 'friend',
            requiredIntimacyLevel: 'deep_flirt',
            metricRequirements: {
              minAffinity: 60,
              minChemistry: 70,
              minTension: 50,
            },
          },
          onEnterEffects: {
            affinityDelta: 25,
            chemistryDelta: 25,
            setFlags: ['whirlwind_romance'],
          },
          availableScenes: ['date_dinner', 'kiss_first', 'kiss_passionate'],
        },
      ],
      maxContentRating: 'mature_implied',
      tags: ['fast', 'chemistry', 'passionate'],
    },
  },

  // Friendship Arc (Non-Romantic)
  {
    id: 'arc_platonic_friendship',
    name: 'Platonic Friendship',
    description: 'Deep friendship without romantic elements',
    category: 'friendship',
    tags: ['friendship', 'platonic', 'wholesome'],
    difficulty: 'easy',
    estimatedDuration: 'medium',
    arc: {
      id: 'arc_platonic_friendship',
      name: 'Platonic Friendship',
      targetNpcId: 0,
      stages: [
        {
          id: 'stage_meet',
          name: 'First Meeting',
          tier: 'acquaintance',
          gate: {
            id: 'gate_meet',
            name: 'Initial Meeting',
            requiredTier: 'stranger',
          },
          onEnterEffects: {
            affinityDelta: 5,
            setFlags: ['met_npc'],
          },
        },
        {
          id: 'stage_friend',
          name: 'Becoming Friends',
          tier: 'friend',
          gate: {
            id: 'gate_friend',
            name: 'Friendship Gate',
            requiredTier: 'acquaintance',
            metricRequirements: {
              minAffinity: 25,
              minTrust: 15,
            },
          },
          onEnterEffects: {
            affinityDelta: 15,
            trustDelta: 15,
            setFlags: ['friends'],
          },
        },
        {
          id: 'stage_good_friend',
          name: 'Good Friends',
          tier: 'friend',
          gate: {
            id: 'gate_good_friend',
            name: 'Good Friendship',
            requiredTier: 'friend',
            metricRequirements: {
              minAffinity: 50,
              minTrust: 40,
            },
          },
          onEnterEffects: {
            affinityDelta: 20,
            trustDelta: 20,
          },
        },
        {
          id: 'stage_best_friend',
          name: 'Best Friends',
          tier: 'close_friend',
          gate: {
            id: 'gate_best_friend',
            name: 'Best Friendship',
            requiredTier: 'friend',
            metricRequirements: {
              minAffinity: 75,
              minTrust: 70,
            },
            blockedFlags: ['romantic_interest'],
          },
          onEnterEffects: {
            affinityDelta: 25,
            trustDelta: 25,
            setFlags: ['best_friends', 'platonic_bond'],
          },
        },
      ],
      maxContentRating: 'sfw',
      tags: ['friendship', 'platonic', 'wholesome'],
    },
  },
];

// ============================================================================
// Template Query & Management
// ============================================================================

/**
 * Get all scene templates, optionally filtered
 */
export function getSceneTemplates(filter?: {
  category?: SceneTemplate['category'];
  difficulty?: SceneTemplate['difficulty'];
  tags?: string[];
}): SceneTemplate[] {
  let templates = SCENE_TEMPLATES;

  if (filter?.category) {
    templates = templates.filter((t) => t.category === filter.category);
  }

  if (filter?.difficulty) {
    templates = templates.filter((t) => t.difficulty === filter.difficulty);
  }

  if (filter?.tags && filter.tags.length > 0) {
    templates = templates.filter((t) =>
      filter.tags!.some((tag) => t.tags.includes(tag))
    );
  }

  return templates;
}

/**
 * Get a scene template by ID
 */
export function getSceneTemplate(id: string): SceneTemplate | undefined {
  return SCENE_TEMPLATES.find((t) => t.id === id);
}

/**
 * Get all arc templates, optionally filtered
 */
export function getArcTemplates(filter?: {
  category?: ArcTemplate['category'];
  difficulty?: ArcTemplate['difficulty'];
  duration?: ArcTemplate['estimatedDuration'];
  tags?: string[];
}): ArcTemplate[] {
  let templates = ARC_TEMPLATES;

  if (filter?.category) {
    templates = templates.filter((t) => t.category === filter.category);
  }

  if (filter?.difficulty) {
    templates = templates.filter((t) => t.difficulty === filter.difficulty);
  }

  if (filter?.duration) {
    templates = templates.filter((t) => t.estimatedDuration === filter.duration);
  }

  if (filter?.tags && filter.tags.length > 0) {
    templates = templates.filter((t) =>
      filter.tags!.some((tag) => t.tags.includes(tag))
    );
  }

  return templates;
}

/**
 * Get an arc template by ID
 */
export function getArcTemplate(id: string): ArcTemplate | undefined {
  return ARC_TEMPLATES.find((t) => t.id === id);
}

/**
 * Clone a template scene and prepare it for use (assign new IDs)
 */
export function cloneSceneFromTemplate(
  template: SceneTemplate,
  targetNpcIds: number[]
): IntimacySceneConfig {
  const timestamp = Date.now();
  return {
    ...template.scene,
    id: `${template.id}_${timestamp}`,
    name: `${template.name} (Copy)`,
    targetNpcIds,
    gates: template.scene.gates.map((gate, idx) => ({
      ...gate,
      id: `${gate.id}_${timestamp}_${idx}`,
    })),
  };
}

/**
 * Clone a template arc and prepare it for use (assign new IDs)
 */
export function cloneArcFromTemplate(
  template: ArcTemplate,
  targetNpcId: number
): RelationshipProgressionArc {
  const timestamp = Date.now();
  return {
    ...template.arc,
    id: `${template.id}_${timestamp}`,
    name: `${template.name} (Copy)`,
    targetNpcId,
    stages: template.arc.stages.map((stage, idx) => ({
      ...stage,
      id: `${stage.id}_${timestamp}_${idx}`,
      gate: {
        ...stage.gate,
        id: `${stage.gate.id}_${timestamp}_${idx}`,
      },
    })),
  };
}

// ============================================================================
// User-Created Templates (localStorage)
// ============================================================================

const USER_SCENE_TEMPLATES_KEY = 'pixsim7_user_scene_templates';
const USER_ARC_TEMPLATES_KEY = 'pixsim7_user_arc_templates';

/**
 * Save a scene as a user template
 */
export function saveSceneAsTemplate(
  scene: IntimacySceneConfig,
  metadata: {
    name: string;
    description: string;
    category?: SceneTemplate['category'];
    difficulty?: SceneTemplate['difficulty'];
    tags?: string[];
  }
): SceneTemplate {
  const template: SceneTemplate = {
    id: `user_scene_${Date.now()}`,
    name: metadata.name,
    description: metadata.description,
    category: metadata.category || 'custom',
    tags: metadata.tags || [],
    difficulty: metadata.difficulty || 'medium',
    author: 'User',
    scene: {
      ...scene,
      // Remove target NPC IDs so template can be reused
      targetNpcIds: [],
    },
  };

  const existing = getUserSceneTemplates();
  existing.push(template);
  localStorage.setItem(USER_SCENE_TEMPLATES_KEY, JSON.stringify(existing));

  return template;
}

/**
 * Save an arc as a user template
 */
export function saveArcAsTemplate(
  arc: RelationshipProgressionArc,
  metadata: {
    name: string;
    description: string;
    category?: ArcTemplate['category'];
    difficulty?: ArcTemplate['difficulty'];
    estimatedDuration?: ArcTemplate['estimatedDuration'];
    tags?: string[];
  }
): ArcTemplate {
  const template: ArcTemplate = {
    id: `user_arc_${Date.now()}`,
    name: metadata.name,
    description: metadata.description,
    category: metadata.category || 'custom',
    tags: metadata.tags || [],
    difficulty: metadata.difficulty || 'medium',
    estimatedDuration: metadata.estimatedDuration || 'medium',
    author: 'User',
    arc: {
      ...arc,
      // Reset target NPC so template can be reused
      targetNpcId: 0,
    },
  };

  const existing = getUserArcTemplates();
  existing.push(template);
  localStorage.setItem(USER_ARC_TEMPLATES_KEY, JSON.stringify(existing));

  return template;
}

/**
 * Get all user-created scene templates
 */
export function getUserSceneTemplates(): SceneTemplate[] {
  const data = localStorage.getItem(USER_SCENE_TEMPLATES_KEY);
  if (!data) return [];
  try {
    return JSON.parse(data);
  } catch {
    return [];
  }
}

/**
 * Get all user-created arc templates
 */
export function getUserArcTemplates(): ArcTemplate[] {
  const data = localStorage.getItem(USER_ARC_TEMPLATES_KEY);
  if (!data) return [];
  try {
    return JSON.parse(data);
  } catch {
    return [];
  }
}

/**
 * Get all scene templates (built-in + user-created)
 */
export function getAllSceneTemplates(filter?: {
  category?: SceneTemplate['category'];
  difficulty?: SceneTemplate['difficulty'];
  tags?: string[];
}): SceneTemplate[] {
  const builtIn = getSceneTemplates(filter);
  const user = getUserSceneTemplates();

  // Apply same filters to user templates
  let filteredUser = user;
  if (filter?.category) {
    filteredUser = filteredUser.filter((t) => t.category === filter.category);
  }
  if (filter?.difficulty) {
    filteredUser = filteredUser.filter((t) => t.difficulty === filter.difficulty);
  }
  if (filter?.tags && filter.tags.length > 0) {
    filteredUser = filteredUser.filter((t) =>
      filter.tags!.some((tag) => t.tags.includes(tag))
    );
  }

  return [...builtIn, ...filteredUser];
}

/**
 * Get all arc templates (built-in + user-created)
 */
export function getAllArcTemplates(filter?: {
  category?: ArcTemplate['category'];
  difficulty?: ArcTemplate['difficulty'];
  duration?: ArcTemplate['estimatedDuration'];
  tags?: string[];
}): ArcTemplate[] {
  const builtIn = getArcTemplates(filter);
  const user = getUserArcTemplates();

  // Apply same filters to user templates
  let filteredUser = user;
  if (filter?.category) {
    filteredUser = filteredUser.filter((t) => t.category === filter.category);
  }
  if (filter?.difficulty) {
    filteredUser = filteredUser.filter((t) => t.difficulty === filter.difficulty);
  }
  if (filter?.duration) {
    filteredUser = filteredUser.filter((t) => t.estimatedDuration === filter.duration);
  }
  if (filter?.tags && filter.tags.length > 0) {
    filteredUser = filteredUser.filter((t) =>
      filter.tags!.some((tag) => t.tags.includes(tag))
    );
  }

  return [...builtIn, ...filteredUser];
}

/**
 * Delete a user template
 */
export function deleteUserSceneTemplate(id: string): void {
  const existing = getUserSceneTemplates();
  const filtered = existing.filter((t) => t.id !== id);
  localStorage.setItem(USER_SCENE_TEMPLATES_KEY, JSON.stringify(filtered));
}

/**
 * Delete a user arc template
 */
export function deleteUserArcTemplate(id: string): void {
  const existing = getUserArcTemplates();
  const filtered = existing.filter((t) => t.id !== id);
  localStorage.setItem(USER_ARC_TEMPLATES_KEY, JSON.stringify(filtered));
}
