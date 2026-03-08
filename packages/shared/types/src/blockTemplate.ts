/**
 * Block Template Types
 *
 * Types for the block template system — reusable prompt composition recipes
 * with slot-based random block selection.
 */

/** Slot constraint definition within a template */
export type TemplateSlotSelectionStrategy =
  | 'uniform'
  | 'weighted_rating'
  | 'weighted_tags'
  | 'diverse'
  | 'coherent_rerank'
  | 'llm_rerank';

export interface TemplateSlotTagQuery {
  all?: Record<string, unknown>;
  all_of?: Record<string, unknown>;
  any?: Record<string, unknown>;
  any_of?: Record<string, unknown>;
  not?: Record<string, unknown>;
  none_of?: Record<string, unknown>;
}

export interface TemplateSlotPreferences {
  boost_tags?: Record<string, unknown>;
  avoid_tags?: Record<string, unknown>;
  diversity_keys?: string[];
  novelty_weight?: number;
  coherence_weight?: number;
}

export interface TemplateSlotSelectionWeights {
  hard_match_bonus?: number;
  boost_tags?: number;
  avoid_tags?: number;
  rating?: number;
  diversity?: number;
  coherence?: number;
  novelty?: number;
}

export interface TemplateSlotSelectionConfig {
  top_k?: number;
  temperature?: number;
  fallback_strategy?: TemplateSlotSelectionStrategy;
  timeout_ms?: number;
  model?: string;
  weights?: TemplateSlotSelectionWeights;
}

export interface TemplateSlot {
  slot_index: number;
  /** Stable slot identifier for targeting control effects; optional for legacy templates. */
  key?: string | null;
  label: string;
  role?: string | null;
  category?: string | null;
  kind?: string | null;
  intent?: string | null;
  complexity_min?: string | null;
  complexity_max?: string | null;
  package_name?: string | null;
  tags?: TemplateSlotTagQuery | null;
  tag_constraints?: Record<string, unknown> | null;
  min_rating?: number | null;
  required_capabilities?: string[] | null;
  preferences?: TemplateSlotPreferences | null;
  selection_strategy: TemplateSlotSelectionStrategy;
  selection_config?: TemplateSlotSelectionConfig | null;
  weight: number;
  optional: boolean;
  fallback_text?: string | null;
  reinforcement_text?: string | null;
  intensity?: number | null;
  inherit_intensity?: boolean;
  exclude_block_ids?: string[] | null;
  composition_role_hint?: string | null;
}

/** Summary view of a block template (for lists) */
export interface BlockTemplateSummary {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  slot_count: number;
  composition_strategy: string;
  package_name?: string | null;
  tags: string[];
  is_public: boolean;
  owner_user_id?: number | null;
  owner_ref?: string | null;
  owner_username?: string | null;
  roll_count: number;
  composition_role_gap_count?: number;
  composition_role_ids?: string[];
  created_at: string;
  updated_at?: string;
}

/** Cast spec: marks a binding as castable with filter hints */
export interface CastSpec {
  label: string;
  filter_species?: string;
  filter_category?: string;
}

/** A single character binding: maps a role to a character */
export interface CharacterBinding {
  character_id: string;
  fallback_name?: string;
  cast?: CastSpec;
}

/** Character bindings map: role name -> binding */
export type CharacterBindings = Record<string, CharacterBinding>;

/** A named preset: a full saved variant of a template's editable state */
export interface TemplatePreset {
  name: string;
  slots: TemplateSlot[];
  character_bindings: CharacterBindings;
  composition_strategy: string;
  target_operation?: string;
}

/** Full block template detail */
export interface BlockTemplateDetail extends BlockTemplateSummary {
  slots: TemplateSlot[];
  created_by?: string | null;
  template_metadata: Record<string, unknown>;
  character_bindings: CharacterBindings;
  updated_at: string;
}

/** Result of rolling a single slot */
export interface SlotResult {
  label: string;
  status: 'selected' | 'skipped' | 'fallback' | 'empty' | 'reinforcement';
  match_count: number;
  reason?: string;
  fallback_text?: string;
  reinforcement_text?: string;
  selected_block_id?: string;
  selected_block_string_id?: string;
  selected_block_role?: string;
  selected_block_category?: string;
  prompt_preview?: string;
}

/** Result of rolling a template */
export interface RollResult {
  success: boolean;
  assembled_prompt: string;
  derived_analysis?: Record<string, unknown> | null;
  slot_results: SlotResult[];
  warnings: string[];
  metadata: {
    template_id: string;
    template_name: string;
    slots_total: number;
    slots_filled: number;
    slots_skipped: number;
    slots_fallback: number;
    slots_reinforcement?: number;
    composition_strategy: string;
    composition_strategy_applied?: boolean;
    seed?: number | null;
    roll_count: number;
    character_bindings?: CharacterBindings | null;
    characters_resolved?: Record<string, string> | null;
  };
}

/** Result of previewing a slot's matching blocks */
export interface SlotPreviewResult {
  count: number;
  samples: Array<{
    id: string;
    block_id: string;
    role?: string | null;
    category?: string | null;
    prompt_preview: string;
    avg_rating?: number | null;
  }>;
}
