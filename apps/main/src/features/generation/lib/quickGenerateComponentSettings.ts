export const QUICKGEN_SETTINGS_COMPONENT_ID = 'quickgen-settings';
export const QUICKGEN_ASSET_COMPONENT_ID = 'quickgen-asset';
export const QUICKGEN_PROMPT_COMPONENT_ID = 'quickgen-prompt';

export type QuickGenPromptHistoryScope = 'provider-operation' | 'operation' | 'global';

export interface QuickGenPromptSettings {
  showCounter: boolean;
  resizable: boolean;
  minHeight: number;
  variant: 'compact' | 'default';
  historyScope: QuickGenPromptHistoryScope;
  historyMaxEntries: number;
}

export const QUICKGEN_PROMPT_DEFAULTS: QuickGenPromptSettings = {
  showCounter: true,
  resizable: true,
  minHeight: 100,
  variant: 'compact',
  historyScope: 'provider-operation',
  historyMaxEntries: 80,
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
}

export const QUICKGEN_ASSET_DEFAULTS: QuickGenAssetSettings = {
  enableHoverPreview: true,
  showPlayOverlay: true,
  clickToPlay: false,
  displayMode: 'strip',
  gridColumns: 3,
};
