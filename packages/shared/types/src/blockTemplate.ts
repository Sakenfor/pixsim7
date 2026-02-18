/**
 * Block Template Types
 *
 * Types for the block template system — reusable prompt composition recipes
 * with slot-based random block selection.
 */

/** Slot constraint definition within a template */
export interface TemplateSlot {
  slot_index: number;
  label: string;
  role?: string | null;
  category?: string | null;
  kind?: string | null;
  intent?: string | null;
  complexity_min?: string | null;
  complexity_max?: string | null;
  package_name?: string | null;
  tag_constraints?: Record<string, unknown> | null;
  min_rating?: number | null;
  selection_strategy: 'uniform' | 'weighted_rating';
  weight: number;
  optional: boolean;
  fallback_text?: string | null;
  exclude_block_ids?: string[] | null;
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
  roll_count: number;
  created_at: string;
}

/** Full block template detail */
export interface BlockTemplateDetail extends BlockTemplateSummary {
  slots: TemplateSlot[];
  created_by?: string | null;
  template_metadata: Record<string, unknown>;
  updated_at: string;
}

/** Result of rolling a single slot */
export interface SlotResult {
  label: string;
  status: 'selected' | 'skipped' | 'fallback' | 'empty';
  match_count: number;
  reason?: string;
  fallback_text?: string;
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
    composition_strategy: string;
    seed?: number | null;
    roll_count: number;
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
