/**
 * Viewer Tool Presets
 *
 * Canonical contract for viewer-hosted tools that produce generation inputs.
 * Distinct from RegionDrawer (geometric annotation) — these define *what* a tool
 * does and *where* its output maps, not how it draws.
 *
 * ## B1 rollout scope
 *
 * Shipping: category 'mask' | 'edit'
 * Reserved: 'annotate' | 'reference' (not implemented, not wired)
 *
 * ## Relationship to existing systems
 *
 * - RegionDrawer: lower-level drawing primitives (rect, polygon, path).
 *   A ViewerToolPreset may *use* a RegionDrawer internally, but they're separate.
 * - OperationMetadata (types/operations.ts): describes provider operations.
 *   An 'edit' preset wraps an operation; the preset is the user-facing action.
 * - CapabilityRegistry: knows what providers support. Presets query it for availability.
 * - Analyzer catalog: knows what local analysis is possible. Presets query it for
 *   auto-mask capabilities.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Source & Category
// ─────────────────────────────────────────────────────────────────────────────

/** Where computation happens. */
export type ToolSource = 'manual' | 'local' | 'remote';

/**
 * What the tool is for.
 * B1: only 'mask' and 'edit' are implemented.
 * 'annotate' and 'reference' are reserved for future viewer tool categories
 * (region labels, pose sketching, etc.) — do not implement yet.
 */
export type ToolCategory = 'mask' | 'edit' | 'annotate' | 'reference';

// ─────────────────────────────────────────────────────────────────────────────
// Output
// ─────────────────────────────────────────────────────────────────────────────

/** What the tool produces. */
export type ToolOutputKind =
  | 'asset'             // A saved asset (mask PNG, edited image, etc.)
  | 'region_set'        // Transient region geometry (bounding boxes, segmentation polygons)
  | 'generation_edit'   // Triggers a provider operation directly (no intermediate asset)
  | 'directive_image';  // Reference image for gen (pose skeleton, depth map — future)

/**
 * Where the output maps in generation params.
 * Each preset declares exactly one mapping so the runtime knows how to wire it.
 */
export type ToolOutputMapping =
  | 'mask_url'              // params.mask_url = 'asset:N'
  | 'guidance_plan.masks'   // guidance_plan.masks[] (richer, provider-agnostic)
  | 'auto_mask_info'        // params.auto_mask_info (compat, video_modify)
  | 'composition_assets'    // composition_assets[] (for directive images — future)
  | 'direct_operation';     // No param mapping — preset triggers a generation directly

// ─────────────────────────────────────────────────────────────────────────────
// Execution lifecycle (for async tools)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Runtime state of a tool execution.
 * Manual tools skip this entirely (they're synchronous canvas operations).
 * Local/remote tools use it to track async work.
 */
export type ToolExecutionState = 'idle' | 'pending' | 'running' | 'completed' | 'failed';

export interface ViewerToolExecution {
  presetId: string;
  state: ToolExecutionState;
  /** 0–1 progress for tools that report it. */
  progress?: number;
  /** Human-readable error when state is 'failed'. */
  error?: string;
  /** Asset ID produced on completion (when outputKind is 'asset'). */
  resultAssetId?: number;
  startedAt?: number;
  completedAt?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Availability
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Why a preset is unavailable. Shown in UI as a disabled reason.
 * When `available` is true, `reason` is omitted.
 */
export type PresetAvailability =
  | { available: true }
  | { available: false; reason: string };

// ─────────────────────────────────────────────────────────────────────────────
// ViewerToolPreset — the core contract
// ─────────────────────────────────────────────────────────────────────────────

export interface ViewerToolPreset {
  /** Stable identifier (e.g. 'manual-draw', 'auto-segment', 'remove-text'). */
  id: string;
  /** Display label. */
  label: string;
  /** Icon name from the app icon set. */
  icon?: string;
  /** Where computation happens. */
  source: ToolSource;
  /** What the tool is for. */
  category: ToolCategory;
  /** What the tool produces. */
  outputKind: ToolOutputKind;
  /** Where the output maps in generation params. */
  outputMapping: ToolOutputMapping;

  // ── Optional bindings ────────────────────────────────────────────────────

  /** Provider that backs this tool (remote source only). */
  providerId?: string;
  /** Analyzer that backs this tool (local source only). */
  analyzerId?: string;

  // ── Constraints ──────────────────────────────────────────────────────────

  /** Tool requires the user to select a region first (e.g. inpaint-selection). */
  requiresSelection?: boolean;
  /** Tool only works on images. */
  requiresImage?: boolean;
  /** Tool only works on video. */
  requiresVideo?: boolean;
  /** Tool needs an async execution lifecycle. Manual tools are always sync. */
  isAsync?: boolean;
  /** Optional prompt-tool preset ID used for prompt-box execution handoff. */
  promptToolPresetId?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// MaskToolOption — temporary B1 subset alias
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Narrowed alias for mask-lane work during B1 rollout.
 * Remove once broader categories ship and call sites use ViewerToolPreset directly.
 */
export type MaskToolOption = ViewerToolPreset & { category: 'mask' | 'edit' };

// ─────────────────────────────────────────────────────────────────────────────
// Built-in presets
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Manual brush/polygon mask drawing.
 * This is the current default — always available when the mask overlay is active.
 */
export const PRESET_MANUAL_DRAW: ViewerToolPreset = {
  id: 'manual-draw',
  label: 'Draw Mask',
  icon: 'paintbrush',
  source: 'manual',
  category: 'mask',
  outputKind: 'asset',
  outputMapping: 'mask_url',
};

/**
 * Manual polygon/lasso mask drawing (variant of manual-draw with polygon mode).
 * Same output path, different default interaction mode.
 */
export const PRESET_MANUAL_POLYGON: ViewerToolPreset = {
  id: 'manual-polygon',
  label: 'Lasso Mask',
  icon: 'penTool',
  source: 'manual',
  category: 'mask',
  outputKind: 'asset',
  outputMapping: 'mask_url',
};

// ── Placeholder presets (not wired yet — included to prove the contract) ────

/**
 * Auto-segment: local analyzer produces mask regions from a point/box prompt.
 * Placeholder — will be backed by a real analyzer in Phase 2.
 */
export const PRESET_AUTO_SEGMENT: ViewerToolPreset = {
  id: 'auto-segment',
  label: 'Auto Segment',
  icon: 'wand',
  source: 'local',
  category: 'mask',
  outputKind: 'asset',
  outputMapping: 'mask_url',
  requiresImage: true,
  isAsync: true,
};

/**
 * Remove object: provider-backed edit that uses a mask selection.
 * Placeholder — will be wired via provider capability in Phase 3.
 */
export const PRESET_REMOVE_OBJECT: ViewerToolPreset = {
  id: 'remove-object',
  label: 'Remove Object',
  icon: 'eraser',
  source: 'remote',
  category: 'edit',
  outputKind: 'generation_edit',
  outputMapping: 'direct_operation',
  requiresSelection: true,
  requiresImage: true,
  isAsync: true,
  promptToolPresetId: 'edit/remove-object',
};

// ─────────────────────────────────────────────────────────────────────────────
// Preset collection & helpers
// ─────────────────────────────────────────────────────────────────────────────

/** All known built-in presets. */
export const BUILTIN_PRESETS: readonly ViewerToolPreset[] = [
  PRESET_MANUAL_DRAW,
  PRESET_MANUAL_POLYGON,
  PRESET_AUTO_SEGMENT,
  PRESET_REMOVE_OBJECT,
];

/** Type guard for mask-lane presets (B1 scope). */
export function isMaskPreset(preset: ViewerToolPreset): preset is MaskToolOption {
  return preset.category === 'mask' || preset.category === 'edit';
}

/** Get all built-in presets for a category. */
export function getPresetsByCategory(category: ToolCategory): ViewerToolPreset[] {
  return BUILTIN_PRESETS.filter((p) => p.category === category);
}

/**
 * Resolve availability for a preset given current context.
 * This is a pure function — it doesn't read stores.
 * Callers pass in the relevant state (hasImage, hasSelection, analyzers, providers).
 */
export function resolvePresetAvailability(
  preset: ViewerToolPreset,
  context: {
    hasImage?: boolean;
    hasVideo?: boolean;
    hasSelection?: boolean;
    availableAnalyzerIds?: string[];
    availableProviderIds?: string[];
  },
): PresetAvailability {
  if (preset.requiresImage && !context.hasImage) {
    return { available: false, reason: 'Requires an image' };
  }
  if (preset.requiresVideo && !context.hasVideo) {
    return { available: false, reason: 'Requires a video' };
  }
  if (preset.requiresSelection && !context.hasSelection) {
    return { available: false, reason: 'Select a region first' };
  }
  if (preset.source === 'local' && preset.analyzerId) {
    if (!context.availableAnalyzerIds?.includes(preset.analyzerId)) {
      return { available: false, reason: `Analyzer "${preset.analyzerId}" not available` };
    }
  }
  if (preset.source === 'remote' && preset.providerId) {
    if (!context.availableProviderIds?.includes(preset.providerId)) {
      return { available: false, reason: `Provider "${preset.providerId}" not available` };
    }
  }
  return { available: true };
}
