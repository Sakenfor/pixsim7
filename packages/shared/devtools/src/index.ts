/**
 * Dev Tools Types
 *
 * Defines the structure for developer tools that can be registered
 * and displayed in the Dev Tools surface.
 */

import type { ComponentType } from 'react';

export type DevToolId =
  | 'session-state-viewer'
  | 'plugin-workspace'
  | 'dependency-graph'
  | 'app-map'
  | 'generation-debug'
  | string;

export type DevToolCategory =
  | 'session'
  | 'plugins'
  | 'graph'
  | 'generation'
  | 'world'
  | 'debug'
  | 'prompts'
  | 'misc';

/**
 * Option for select-type settings.
 */
export interface DevToolSettingOption {
  value: string;
  label: string;
}

/**
 * Base fields shared by all setting types.
 */
interface DevToolSettingBase {
  /** Setting key (used for storage, e.g., 'includeAllPlugins') */
  key: string;
  /** Display label for the setting */
  label: string;
  /** Optional description shown below the label */
  description?: string;
}

/**
 * Boolean toggle setting.
 */
export interface DevToolSettingBoolean extends DevToolSettingBase {
  type: 'boolean';
  defaultValue: boolean;
}

/**
 * Select dropdown setting.
 */
export interface DevToolSettingSelect extends DevToolSettingBase {
  type: 'select';
  defaultValue: string;
  options: DevToolSettingOption[];
}

/**
 * Numeric input setting.
 */
export interface DevToolSettingNumber extends DevToolSettingBase {
  type: 'number';
  defaultValue: number;
  min?: number;
  max?: number;
  step?: number;
}

/**
 * A single setting exposed by a dev tool.
 * Supports boolean toggles, select dropdowns, and numeric inputs.
 */
export type DevToolSetting =
  | DevToolSettingBoolean
  | DevToolSettingSelect
  | DevToolSettingNumber;

export interface DevToolDefinition {
  /** Unique identifier for this dev tool */
  id: DevToolId;

  /** Display label shown in UI */
  label: string;

  /** Optional description of what this tool does */
  description?: string;

  /** Optional icon name from the Icon system (e.g., 'wrench', 'globe', 'code') */
  icon?: string;

  /** Category for grouping and filtering */
  category?: DevToolCategory;

  /** React component used when the tool is shown as a panel */
  panelComponent?: ComponentType<any>;

  /** Optional route for full-page dev tools */
  routePath?: string;

  /** Optional tags for filtering/search */
  tags?: string[];

  /** Whether this tool is safe for non-dev users (defaults to false) */
  safeForNonDev?: boolean;

  /**
   * Optional settings exposed by this tool.
   * These will be rendered in DebugSettings automatically.
   * Stored in user preferences under `devtools.{toolId}.{settingKey}`.
   */
  settings?: DevToolSetting[];
}
