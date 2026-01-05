// Automation-related types
//
// This file re-exports types from the backend OpenAPI schema for type safety.
// DO NOT add manual type definitions here - add them to the backend instead.

import type { ApiComponents } from '@pixsim7/shared.types';

// =============================================================================
// Backend Types (from OpenAPI)
// =============================================================================

/** Device type: 'bluestacks' | 'mumu' | 'nox' | 'ld' | 'genymotion' | 'adb' */
export type DeviceType = ApiComponents['schemas']['DeviceType'];

/** Connection method: 'adb' | 'uiautomator2' */
export type ConnectionMethod = ApiComponents['schemas']['ConnectionMethod'];

/** Device status: 'online' | 'offline' | 'busy' | 'error' */
export type DeviceStatus = ApiComponents['schemas']['DeviceStatus'];

/** Automation status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled' */
export type AutomationStatus = ApiComponents['schemas']['AutomationStatus'];

/** Loop status: 'active' | 'paused' | 'stopped' | 'error' */
export type LoopStatus = ApiComponents['schemas']['LoopStatus'];

/** Loop selection mode: 'most_credits' | 'least_credits' | 'round_robin' | 'specific_accounts' */
export type LoopSelectionMode = ApiComponents['schemas']['LoopSelectionMode'];

/** Preset execution mode: 'SINGLE' | 'SHARED_LIST' | 'PER_ACCOUNT' */
export type PresetExecutionMode = ApiComponents['schemas']['PresetExecutionMode'];

/** Android device */
export type AndroidDevice = ApiComponents['schemas']['AndroidDevice'];

/** App action preset */
export type AppActionPreset = ApiComponents['schemas']['AppActionPreset'];

/** Automation execution */
export type AutomationExecution = ApiComponents['schemas']['AutomationExecution'];

/** Execution loop */
export type ExecutionLoop = ApiComponents['schemas']['ExecutionLoop'];

// =============================================================================
// Frontend-Only Types (not in backend)
// These types are used only in the frontend and don't need backend alignment.
// =============================================================================

/**
 * Action type enum for automation actions.
 * NOTE: This is frontend-only - the backend uses dynamic action schemas.
 */
export enum ActionType {
  // Basic actions
  WAIT = 'wait',
  LAUNCH_APP = 'launch_app',
  OPEN_DEEPLINK = 'open_deeplink',
  START_ACTIVITY = 'start_activity',
  EXIT_APP = 'exit_app',
  CLICK_COORDS = 'click_coords',
  TYPE_TEXT = 'type_text',
  PRESS_BACK = 'press_back',
  EMULATOR_BACK = 'emulator_back',
  PRESS_HOME = 'press_home',
  SWIPE = 'swipe',
  SCREENSHOT = 'screenshot',

  // Element-based actions
  WAIT_FOR_ELEMENT = 'wait_for_element',
  CLICK_ELEMENT = 'click_element',

  // Conditional actions
  IF_ELEMENT_EXISTS = 'if_element_exists',
  IF_ELEMENT_NOT_EXISTS = 'if_element_not_exists',

  // Control flow
  REPEAT = 'repeat',
  CALL_PRESET = 'call_preset',
}

// Match modes for string comparison in element selectors
export enum MatchMode {
  EXACT = 'exact',
  CONTAINS = 'contains',
  STARTS_WITH = 'starts_with',
  ENDS_WITH = 'ends_with',
  REGEX = 'regex',
}

// Variable types for reusable values in presets
export enum VariableType {
  ELEMENT = 'element',   // Element selector (resource_id, text, content_desc)
  TEXT = 'text',         // Text value (for type_text, etc.)
  NUMBER = 'number',     // Numeric value (for wait times, coords, etc.)
  COORDS = 'coords',     // X,Y coordinates
}

// Element selector definition
export interface ElementSelector {
  resource_id?: string;
  text?: string;
  text_match_mode?: MatchMode;
  content_desc?: string;
  content_desc_match_mode?: MatchMode;
}

// Variable definition
export interface PresetVariable {
  name: string;          // Variable name (used as $name in actions)
  type: VariableType;
  description?: string;  // Optional description
  // Value depends on type:
  element?: ElementSelector;  // For ELEMENT type
  text?: string;              // For TEXT type
  number?: number;            // For NUMBER type
  coords?: { x: number; y: number };  // For COORDS type
}

export interface ActionDefinition {
  type: ActionType;
  params: Record<string, any>;
  enabled?: boolean; // Default true - allows temporarily disabling actions
  continue_on_error?: boolean; // Default true - continue automation even if this action fails
  comment?: string; // Optional comment/note to describe what this action does
}

export interface DeviceScanResult {
  scanned: number;
  added: number;
  updated: number;
  offline: number;
}

// Action Schema types for dynamic UI generation
export type ActionParameterType = 'string' | 'integer' | 'float' | 'boolean' | 'nested_actions';

export type ActionCategory = 'basic' | 'interaction' | 'element' | 'control_flow' | 'timing' | 'advanced';

export interface ActionParameter {
  name: string;
  type: ActionParameterType;
  required: boolean;
  default?: any;
  description: string;
  min?: number;
  max?: number;
  options?: string[];
  placeholder?: string;
}

export interface ActionSchema {
  type: string;
  display_name: string;
  description: string;
  category: ActionCategory;
  icon?: string;
  parameters: ActionParameter[];
  supports_nesting: boolean;
  examples: ActionDefinition[];
}

export interface ActionSchemasResponse {
  schemas: ActionSchema[];
  total: number;
}

export interface ActionSchemasByCategoryResponse {
  categories: Record<ActionCategory, ActionSchema[]>;
}

// Loop run response with multiple executions
export interface LoopRunResponse {
  status: 'queued' | 'skipped';
  executions_created?: number;
  executions?: Array<{
    id: number;
    task_id: string;
    account_id: number;
  }>;
}
