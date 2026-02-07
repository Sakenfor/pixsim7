// Auto-generated from prompt roles vocabulary - DO NOT EDIT
// Re-run: pnpm prompt-roles:gen
//
// Source: pixsim7/backend/main/plugins/starter_pack/vocabularies/prompt_roles.yaml

export const PROMPT_ROLES = ["character","action","setting","mood","romance","camera","other"] as const;

/**
 * Core prompt role type, derived from vocab.
 * Only includes core roles - not plugin-contributed ones.
 */
export type PromptRoleId = typeof PROMPT_ROLES[number];

/**
 * Flexible prompt role ID type that includes core + plugin roles.
 */
export type PromptRole = PromptRoleId | (string & {});

/**
 * Role labels for UI display.
 */
export const PROMPT_ROLE_LABELS = {
  "character": "Character",
  "action": "Action",
  "setting": "Setting",
  "mood": "Mood",
  "romance": "Romance",
  "camera": "Camera",
  "other": "Other"
} as const satisfies Record<PromptRoleId, string>;

/**
 * Role descriptions for UI display.
 */
export const PROMPT_ROLE_DESCRIPTIONS = {
  "character": "Descriptions of people, creatures, or beings",
  "action": "Actions, movement, behaviors, or interactions",
  "setting": "Environment, location, or time of day",
  "mood": "Emotional tone or atmosphere",
  "romance": "Romantic or intimate content",
  "camera": "Camera and shot instructions",
  "other": "Unclassified or technical content"
} as const satisfies Record<PromptRoleId, string>;

/**
 * Role priority map (higher = more important).
 */
export const PROMPT_ROLE_PRIORITIES = {
  "character": 20,
  "action": 30,
  "setting": 40,
  "mood": 50,
  "romance": 60,
  "camera": 10,
  "other": 0
} as const satisfies Record<PromptRoleId, number>;

/**
 * Priority order for prompt roles (highest first).
 */
export const PROMPT_ROLE_PRIORITY = ["romance","mood","setting","action","character","camera","other"] as const satisfies readonly PromptRoleId[];

/**
 * Role aliases (lowercased).
 */
export const PROMPT_ROLE_ALIASES = {
  "character": [],
  "action": [],
  "setting": [],
  "mood": [],
  "romance": [],
  "camera": [],
  "other": []
} as const satisfies Record<PromptRoleId, readonly string[]>;

/**
 * Prompt role -> composition role mapping.
 * Composition role IDs are normalized (no "role:" prefix).
 */
export const PROMPT_ROLE_TO_COMPOSITION_ROLE = {
  "character": "main_character",
  "action": "effect",
  "setting": "environment",
  "mood": "style_reference",
  "romance": "style_reference",
  "camera": "effect"
} as const satisfies Partial<Record<PromptRoleId, string>>;

/**
 * Prompt role color names.
 * Derived from prompt roles vocab (or composition role color if inherited).
 */
export const PROMPT_ROLE_COLORS = {
  "character": "blue",
  "action": "cyan",
  "setting": "green",
  "mood": "pink",
  "romance": "pink",
  "camera": "cyan",
  "other": "gray"
} as const satisfies Record<PromptRoleId, string>;
