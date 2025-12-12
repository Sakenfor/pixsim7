/**
 * Settings Schema Types
 *
 * Defines the schema for declarative settings that modules can expose.
 * Settings are organized into categories (tabs) and groups (sections).
 */

import type { ReactNode } from 'react';

/** Supported setting field types */
export type SettingFieldType =
  | 'toggle'      // boolean switch
  | 'select'      // dropdown with options
  | 'range'       // slider with min/max
  | 'number'      // numeric input
  | 'text'        // text input
  | 'color'       // color picker
  | 'custom';     // custom React component

/** Base setting field definition */
export interface BaseSettingField {
  /** Unique ID within the category */
  id: string;
  /** Display label */
  label: string;
  /** Optional description shown below the label */
  description?: string;
  /** Field type */
  type: SettingFieldType;
  /** Whether this setting requires app restart */
  requiresRestart?: boolean;
  /** Condition to show/hide this field based on other settings */
  showWhen?: (values: Record<string, any>) => boolean;
  /** Whether the field is disabled */
  disabled?: boolean | ((values: Record<string, any>) => boolean);
}

/** Toggle (boolean) setting */
export interface ToggleSettingField extends BaseSettingField {
  type: 'toggle';
  defaultValue?: boolean;
}

/** Select (dropdown) setting */
export interface SelectSettingField extends BaseSettingField {
  type: 'select';
  options: { value: string; label: string }[];
  defaultValue?: string;
}

/** Range (slider) setting */
export interface RangeSettingField extends BaseSettingField {
  type: 'range';
  min: number;
  max: number;
  step?: number;
  defaultValue?: number;
  /** Optional format function for display (e.g., value => `${value}%`) */
  format?: (value: number) => string;
}

/** Number input setting */
export interface NumberSettingField extends BaseSettingField {
  type: 'number';
  min?: number;
  max?: number;
  step?: number;
  defaultValue?: number;
  placeholder?: string;
}

/** Text input setting */
export interface TextSettingField extends BaseSettingField {
  type: 'text';
  defaultValue?: string;
  placeholder?: string;
  maxLength?: number;
}

/** Color picker setting */
export interface ColorSettingField extends BaseSettingField {
  type: 'color';
  defaultValue?: string;
}

/** Custom component setting */
export interface CustomSettingField extends BaseSettingField {
  type: 'custom';
  /** Custom component to render */
  component: React.ComponentType<{
    value: any;
    onChange: (value: any) => void;
    disabled?: boolean;
  }>;
  defaultValue?: any;
}

/** Union of all setting field types */
export type SettingField =
  | ToggleSettingField
  | SelectSettingField
  | RangeSettingField
  | NumberSettingField
  | TextSettingField
  | ColorSettingField
  | CustomSettingField;

/** A group of related settings within a tab */
export interface SettingGroup {
  /** Unique ID within the tab */
  id: string;
  /** Optional group title */
  title?: string;
  /** Optional group description */
  description?: string;
  /** Fields in this group */
  fields: SettingField[];
}

/** A tab within a settings category */
export interface SettingTab {
  /** Unique ID within the category */
  id: string;
  /** Display label */
  label: string;
  /** Optional icon */
  icon?: string | ReactNode;
  /** Groups of settings in this tab */
  groups: SettingGroup[];
  /** Optional footer content (e.g., keyboard shortcuts hint) */
  footer?: ReactNode;
}

/** Settings category (top-level navigation item) */
export interface SettingCategory {
  /** Unique category ID */
  id: string;
  /** Display label */
  label: string;
  /** Optional icon */
  icon?: string | ReactNode;
  /** Sort order (lower = earlier) */
  order?: number;
  /** Tabs within this category (if multiple), or null for single-page */
  tabs?: SettingTab[];
  /** Direct groups (for categories without tabs) */
  groups?: SettingGroup[];
  /** Store hook that provides { get, set } for reading/writing values */
  useStore: () => SettingStoreAdapter;
}

/** Adapter interface for connecting settings to a store */
export interface SettingStoreAdapter {
  /** Get the current value for a setting field */
  get: (fieldId: string) => any;
  /** Set a value for a setting field */
  set: (fieldId: string, value: any) => void;
  /** Get all current values (for showWhen conditions) */
  getAll: () => Record<string, any>;
}

/** Registration options when a module registers settings */
export interface SettingRegistration {
  /** Category to register under (creates new if doesn't exist) */
  categoryId: string;
  /** Category metadata (only needed when creating new category) */
  category?: Omit<SettingCategory, 'id' | 'tabs' | 'groups' | 'useStore'>;
  /** Tab to add (if category uses tabs) */
  tab?: SettingTab;
  /** Groups to add (if category doesn't use tabs) */
  groups?: SettingGroup[];
  /** Store adapter hook */
  useStore: () => SettingStoreAdapter;
}
