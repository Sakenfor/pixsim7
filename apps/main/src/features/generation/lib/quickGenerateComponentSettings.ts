export const QUICKGEN_SETTINGS_COMPONENT_ID = 'quickgen-settings';
export const QUICKGEN_ASSET_COMPONENT_ID = 'quickgen-asset';
export const QUICKGEN_PROMPT_COMPONENT_ID = 'quickgen-prompt';

export type QuickGenPromptHistoryScope = 'provider-operation' | 'operation' | 'global';

export type QuickGenModerationGrain = 'auto' | 'prompt';

export type QuickGenHistoryTab = 'input' | 'edits';

export type QuickGenInputHistoryMediaFilter = 'all' | 'image' | 'video';

export interface QuickGenPromptSettings {
  showCounter: boolean;
  resizable: boolean;
  minHeight: number;
  variant: 'compact' | 'default';
  historyScope: QuickGenPromptHistoryScope;
  historyMaxEntries: number;
  /**
   * Which history view opens first when both are available (i.e. an input asset
   * is selected). Plan: quickgen-input-prompt-history.
   */
  historyDefaultTab: QuickGenHistoryTab;
  /** Max prior prompts fetched for the "This input" view (backend caps at 100). */
  inputHistoryMaxResults: number;
  /** Restrict the "This input" view to outputs of one media type. */
  inputHistoryMediaFilter: QuickGenInputHistoryMediaFilter;
  /** Show the render-moderation success-rate chip next to the char counter. */
  showModerationChip: boolean;
  /** Which scope drives the chip's headline number. */
  moderationGrain: QuickGenModerationGrain;
  /**
   * When inserting a prompt (button-group "Insert prompt") while viewing an
   * input in the carousel, automatically pin it to that input rather than the
   * shared default. Off = only route to an input that is already pinned.
   * Plan: per-asset-prompt-pin.
   */
  autoPinPromptOnInsert: boolean;
}

export const QUICKGEN_PROMPT_DEFAULTS: QuickGenPromptSettings = {
  showCounter: true,
  resizable: true,
  minHeight: 100,
  variant: 'compact',
  historyScope: 'provider-operation',
  historyMaxEntries: 80,
  historyDefaultTab: 'input',
  inputHistoryMaxResults: 100,
  inputHistoryMediaFilter: 'all',
  showModerationChip: true,
  moderationGrain: 'auto',
  autoPinPromptOnInsert: false,
};

export interface QuickGenSettingsPanelSettings {
  showOperationType: boolean;
  showProvider: boolean;
  showInputSets: boolean;
}

export const QUICKGEN_SETTINGS_DEFAULTS: QuickGenSettingsPanelSettings = {
  showOperationType: true,
  showProvider: true,
  showInputSets: true,
};

export interface QuickGenAssetSettings {
  enableHoverPreview: boolean;
  showPlayOverlay: boolean;
  clickToPlay: boolean;
  displayMode: 'strip' | 'grid' | 'carousel';
  gridColumns: number;
  /**
   * Minimum card edge (px) for the strip display mode — the `minmax()` floor
   * that drives auto-fill card size. Larger = fewer, bigger cards. Grid mode
   * sizes via `gridColumns` instead; carousel shows one card. Plan:
   * `media-card-input-time-nav`.
   */
  cardMinSize: number;
}

export const QUICKGEN_ASSET_DEFAULTS: QuickGenAssetSettings = {
  enableHoverPreview: true,
  showPlayOverlay: true,
  clickToPlay: false,
  displayMode: 'strip',
  gridColumns: 3,
  cardMinSize: 72,
};
