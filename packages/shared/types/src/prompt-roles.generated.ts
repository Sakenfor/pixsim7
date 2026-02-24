// Auto-generated from prompt roles vocabulary - DO NOT EDIT
// Re-run: pnpm prompt-roles:gen
//
// Source: merged plugin prompt_roles.yaml files under pixsim7/backend/main/plugins/<plugin>/vocabularies/

export const PROMPT_ROLES = ["action","camera","character","mood","other","romance","setting"] as const;

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
  "action": "Action",
  "camera": "Camera",
  "character": "Character",
  "mood": "Mood",
  "other": "Other",
  "romance": "Romance",
  "setting": "Setting"
} as const satisfies Record<PromptRoleId, string>;

/**
 * Role descriptions for UI display.
 */
export const PROMPT_ROLE_DESCRIPTIONS = {
  "action": "Actions, movement, behaviors, or interactions",
  "camera": "Camera and shot instructions",
  "character": "Descriptions of people, creatures, or beings",
  "mood": "Emotional tone or atmosphere",
  "other": "Unclassified or technical content",
  "romance": "Romantic or intimate content",
  "setting": "Environment, location, or time of day"
} as const satisfies Record<PromptRoleId, string>;

/**
 * Role priority map (higher = more important).
 */
export const PROMPT_ROLE_PRIORITIES = {
  "action": 30,
  "camera": 10,
  "character": 20,
  "mood": 50,
  "other": 0,
  "romance": 60,
  "setting": 40
} as const satisfies Record<PromptRoleId, number>;

/**
 * Priority order for prompt roles (highest first).
 */
export const PROMPT_ROLE_PRIORITY = ["romance","mood","setting","action","character","camera","other"] as const satisfies readonly PromptRoleId[];

/**
 * Role aliases (lowercased).
 */
export const PROMPT_ROLE_ALIASES = {
  "action": [],
  "camera": [],
  "character": [],
  "mood": [],
  "other": [],
  "romance": [],
  "setting": []
} as const satisfies Record<PromptRoleId, readonly string[]>;

/**
 * Prompt role -> composition role mapping.
 * Composition role IDs are normalized (no "role:" prefix).
 */
export const PROMPT_ROLE_TO_COMPOSITION_ROLE = {
  "action": "animation:action",
  "camera": "camera:angle",
  "character": "entities:main_character",
  "mood": "materials:atmosphere",
  "romance": "materials:romance",
  "setting": "world:environment"
} as const satisfies Partial<Record<PromptRoleId, string>>;

/**
 * Prompt role color names.
 * Derived from prompt roles vocab (or composition role color if inherited).
 */
export const PROMPT_ROLE_COLORS = {
  "action": "cyan",
  "camera": "slate",
  "character": "blue",
  "mood": "pink",
  "other": "gray",
  "romance": "pink",
  "setting": "green"
} as const satisfies Record<PromptRoleId, string>;
