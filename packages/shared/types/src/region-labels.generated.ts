// Auto-generated from composition-roles.yaml + ontology.yaml - DO NOT EDIT
// Re-run: pnpm region-labels:gen

/**
 * Label suggestion for region annotation autocomplete.
 */
export interface LabelSuggestion {
  /** Label ID (used as region label value) */
  id: string;
  /** Human-readable display label */
  label: string;
  /** Category for grouping in UI */
  group: 'builtin' | 'role' | 'part' | 'region' | 'pose';
}

/**
 * Built-in influence_region values (no mask: prefix needed).
 * These map directly to influence_region without the mask: prefix.
 */
export const BUILTIN_REGION_LABELS: LabelSuggestion[] = [
  {
    "id": "foreground",
    "label": "Foreground",
    "group": "builtin"
  },
  {
    "id": "background",
    "label": "Background",
    "group": "builtin"
  },
  {
    "id": "full",
    "label": "Full Image",
    "group": "builtin"
  },
  {
    "id": "subject",
    "label": "Subject",
    "group": "builtin"
  }
];

/**
 * Composition role labels (from composition-roles.yaml).
 */
export const COMPOSITION_ROLE_LABELS: LabelSuggestion[] = [
  {
    "id": "main_character",
    "label": "Character",
    "group": "role"
  },
  {
    "id": "companion",
    "label": "Companion",
    "group": "role"
  },
  {
    "id": "environment",
    "label": "Environment",
    "group": "role"
  },
  {
    "id": "prop",
    "label": "Prop",
    "group": "role"
  },
  {
    "id": "style_reference",
    "label": "Style Reference",
    "group": "role"
  },
  {
    "id": "effect",
    "label": "Effect",
    "group": "role"
  }
];

/**
 * Anatomy part labels (from ontology.yaml).
 */
export const ANATOMY_PART_LABELS: LabelSuggestion[] = [
  {
    "id": "shaft",
    "label": "Shaft",
    "group": "part"
  },
  {
    "id": "head",
    "label": "Head",
    "group": "part"
  },
  {
    "id": "hands",
    "label": "Hands",
    "group": "part"
  },
  {
    "id": "torso",
    "label": "Torso",
    "group": "part"
  },
  {
    "id": "buttocks",
    "label": "Buttocks",
    "group": "part"
  }
];

/**
 * Anatomy region labels (from ontology.yaml).
 */
export const ANATOMY_REGION_LABELS: LabelSuggestion[] = [
  {
    "id": "groin",
    "label": "Groin / crotch",
    "group": "region"
  },
  {
    "id": "chest",
    "label": "Chest",
    "group": "region"
  },
  {
    "id": "back",
    "label": "Back",
    "group": "region"
  },
  {
    "id": "between_legs",
    "label": "Between legs",
    "group": "region"
  }
];

/**
 * Pose labels (from ontology.yaml action_blocks).
 */
export const POSE_LABELS: LabelSuggestion[] = [
  {
    "id": "standing_neutral",
    "label": "Standing Neutral",
    "group": "pose"
  },
  {
    "id": "standing_near",
    "label": "Standing Near",
    "group": "pose"
  },
  {
    "id": "standing_facing",
    "label": "Standing Facing Partner",
    "group": "pose"
  },
  {
    "id": "standing_embrace",
    "label": "Standing Embrace",
    "group": "pose"
  },
  {
    "id": "sitting_neutral",
    "label": "Sitting Neutral",
    "group": "pose"
  },
  {
    "id": "sitting_close",
    "label": "Sitting Close Together",
    "group": "pose"
  },
  {
    "id": "sitting_turned",
    "label": "Sitting Turned Toward",
    "group": "pose"
  },
  {
    "id": "sitting_leaning",
    "label": "Sitting Leaning Together",
    "group": "pose"
  },
  {
    "id": "lying_neutral",
    "label": "Lying Down",
    "group": "pose"
  },
  {
    "id": "lying_side",
    "label": "Lying on Side",
    "group": "pose"
  },
  {
    "id": "lying_facing",
    "label": "Lying Facing Partner",
    "group": "pose"
  },
  {
    "id": "lying_embrace",
    "label": "Lying Embracing",
    "group": "pose"
  },
  {
    "id": "leaning_wall",
    "label": "Leaning Against Wall",
    "group": "pose"
  },
  {
    "id": "leaning_rail",
    "label": "Leaning on Railing/Bar",
    "group": "pose"
  },
  {
    "id": "leaning_forward",
    "label": "Leaning Forward",
    "group": "pose"
  },
  {
    "id": "walking_neutral",
    "label": "Walking",
    "group": "pose"
  },
  {
    "id": "walking_together",
    "label": "Walking Together",
    "group": "pose"
  },
  {
    "id": "walking_holding_hands",
    "label": "Walking Holding Hands",
    "group": "pose"
  },
  {
    "id": "rising",
    "label": "Rising/Getting Up",
    "group": "pose"
  },
  {
    "id": "sitting_down",
    "label": "Sitting Down",
    "group": "pose"
  },
  {
    "id": "turning",
    "label": "Turning",
    "group": "pose"
  },
  {
    "id": "kissing",
    "label": "Kissing",
    "group": "pose"
  },
  {
    "id": "almost_kiss",
    "label": "Almost Kissing",
    "group": "pose"
  },
  {
    "id": "forehead_touch",
    "label": "Forehead Touch",
    "group": "pose"
  },
  {
    "id": "hand_holding",
    "label": "Holding Hands",
    "group": "pose"
  }
];

/**
 * All region label suggestions combined and deduplicated.
 * Use this for autocomplete dropdown.
 */
export const ALL_REGION_LABELS: LabelSuggestion[] = [
  {
    "id": "foreground",
    "label": "Foreground",
    "group": "builtin"
  },
  {
    "id": "background",
    "label": "Background",
    "group": "builtin"
  },
  {
    "id": "full",
    "label": "Full Image",
    "group": "builtin"
  },
  {
    "id": "subject",
    "label": "Subject",
    "group": "builtin"
  },
  {
    "id": "main_character",
    "label": "Character",
    "group": "role"
  },
  {
    "id": "companion",
    "label": "Companion",
    "group": "role"
  },
  {
    "id": "environment",
    "label": "Environment",
    "group": "role"
  },
  {
    "id": "prop",
    "label": "Prop",
    "group": "role"
  },
  {
    "id": "style_reference",
    "label": "Style Reference",
    "group": "role"
  },
  {
    "id": "effect",
    "label": "Effect",
    "group": "role"
  },
  {
    "id": "shaft",
    "label": "Shaft",
    "group": "part"
  },
  {
    "id": "head",
    "label": "Head",
    "group": "part"
  },
  {
    "id": "hands",
    "label": "Hands",
    "group": "part"
  },
  {
    "id": "torso",
    "label": "Torso",
    "group": "part"
  },
  {
    "id": "buttocks",
    "label": "Buttocks",
    "group": "part"
  },
  {
    "id": "groin",
    "label": "Groin / crotch",
    "group": "region"
  },
  {
    "id": "chest",
    "label": "Chest",
    "group": "region"
  },
  {
    "id": "back",
    "label": "Back",
    "group": "region"
  },
  {
    "id": "between_legs",
    "label": "Between legs",
    "group": "region"
  },
  {
    "id": "standing_neutral",
    "label": "Standing Neutral",
    "group": "pose"
  },
  {
    "id": "standing_near",
    "label": "Standing Near",
    "group": "pose"
  },
  {
    "id": "standing_facing",
    "label": "Standing Facing Partner",
    "group": "pose"
  },
  {
    "id": "standing_embrace",
    "label": "Standing Embrace",
    "group": "pose"
  },
  {
    "id": "sitting_neutral",
    "label": "Sitting Neutral",
    "group": "pose"
  },
  {
    "id": "sitting_close",
    "label": "Sitting Close Together",
    "group": "pose"
  },
  {
    "id": "sitting_turned",
    "label": "Sitting Turned Toward",
    "group": "pose"
  },
  {
    "id": "sitting_leaning",
    "label": "Sitting Leaning Together",
    "group": "pose"
  },
  {
    "id": "lying_neutral",
    "label": "Lying Down",
    "group": "pose"
  },
  {
    "id": "lying_side",
    "label": "Lying on Side",
    "group": "pose"
  },
  {
    "id": "lying_facing",
    "label": "Lying Facing Partner",
    "group": "pose"
  },
  {
    "id": "lying_embrace",
    "label": "Lying Embracing",
    "group": "pose"
  },
  {
    "id": "leaning_wall",
    "label": "Leaning Against Wall",
    "group": "pose"
  },
  {
    "id": "leaning_rail",
    "label": "Leaning on Railing/Bar",
    "group": "pose"
  },
  {
    "id": "leaning_forward",
    "label": "Leaning Forward",
    "group": "pose"
  },
  {
    "id": "walking_neutral",
    "label": "Walking",
    "group": "pose"
  },
  {
    "id": "walking_together",
    "label": "Walking Together",
    "group": "pose"
  },
  {
    "id": "walking_holding_hands",
    "label": "Walking Holding Hands",
    "group": "pose"
  },
  {
    "id": "rising",
    "label": "Rising/Getting Up",
    "group": "pose"
  },
  {
    "id": "sitting_down",
    "label": "Sitting Down",
    "group": "pose"
  },
  {
    "id": "turning",
    "label": "Turning",
    "group": "pose"
  },
  {
    "id": "kissing",
    "label": "Kissing",
    "group": "pose"
  },
  {
    "id": "almost_kiss",
    "label": "Almost Kissing",
    "group": "pose"
  },
  {
    "id": "forehead_touch",
    "label": "Forehead Touch",
    "group": "pose"
  },
  {
    "id": "hand_holding",
    "label": "Holding Hands",
    "group": "pose"
  },
  {
    "id": "face",
    "label": "Face",
    "group": "part"
  },
  {
    "id": "pose",
    "label": "Pose",
    "group": "pose"
  },
  {
    "id": "outfit",
    "label": "Outfit",
    "group": "part"
  },
  {
    "id": "clothes",
    "label": "Clothes",
    "group": "part"
  },
  {
    "id": "hair",
    "label": "Hair",
    "group": "part"
  },
  {
    "id": "expression",
    "label": "Expression",
    "group": "part"
  },
  {
    "id": "body",
    "label": "Body",
    "group": "part"
  },
  {
    "id": "upper_body",
    "label": "Upper Body",
    "group": "region"
  },
  {
    "id": "lower_body",
    "label": "Lower Body",
    "group": "region"
  }
];

/**
 * Group display names for UI.
 */
export const LABEL_GROUP_NAMES: Record<LabelSuggestion['group'], string> = {
  builtin: 'Built-in Regions',
  role: 'Composition Roles',
  part: 'Anatomy Parts',
  region: 'Body Regions',
  pose: 'Poses',
};

/**
 * Get labels by group.
 */
export function getLabelsByGroup(group: LabelSuggestion['group']): LabelSuggestion[] {
  return ALL_REGION_LABELS.filter((l) => l.group === group);
}

/**
 * Check if a label is a built-in region (doesn't need mask: prefix).
 */
export function isBuiltinRegion(label: string): boolean {
  const normalized = label.toLowerCase().trim();
  return BUILTIN_REGION_LABELS.some((l) => l.id === normalized);
}

/**
 * Map a region label to influence_region format.
 *
 * - Built-in labels (foreground, background, full, subject) -> used as-is
 * - Subject with number (subject_1, subject:1) -> "subject:N"
 * - Everything else -> "mask:<label>"
 */
export function labelToInfluenceRegion(label: string): string {
  const normalized = label.toLowerCase().trim();

  // Built-in regions (no prefix)
  if (normalized === 'foreground') return 'foreground';
  if (normalized === 'background') return 'background';
  if (normalized === 'full') return 'full';

  // Subject with optional index
  if (normalized === 'subject') return 'subject:0';
  const subjectMatch = normalized.match(/^subject[_:]?(\d+)$/);
  if (subjectMatch) return `subject:${subjectMatch[1]}`;

  // Everything else becomes mask:<label>
  return `mask:${normalized}`;
}
