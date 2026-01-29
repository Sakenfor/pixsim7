export const QUICKGEN_PROMPT_COMPONENT_ID = 'quickgen-prompt';
export const QUICKGEN_SETTINGS_COMPONENT_ID = 'quickgen-settings';

export interface QuickGenPromptSettings {
  showCounter: boolean;
  resizable: boolean;
  minHeight: number;
  variant: 'compact' | 'default';
}

export const QUICKGEN_PROMPT_DEFAULTS: QuickGenPromptSettings = {
  showCounter: true,
  resizable: true,
  minHeight: 100,
  variant: 'compact',
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
