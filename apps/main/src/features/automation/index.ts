/**
 * Automation Feature Module
 *
 * Browser automation for Android devices - presets, executions, loops, and device management.
 *
 * @example
 * ```typescript
 * // Import from barrel
 * import { PresetList, ActionBuilder, ActionType } from '@features/automation';
 *
 * // Or import specific modules
 * import { getActionMeta } from '@features/automation/components/actionHelpers';
 * import type { AndroidDevice } from '@features/automation/types';
 * ```
 */

// ============================================================================
// Types (re-export all from types.ts)
// ============================================================================

export * from './types';

// ============================================================================
// Components - Device Management
// ============================================================================

export { DeviceList } from './components/DeviceList';
export { DeviceCard } from './components/DeviceCard';

// ============================================================================
// Components - Presets
// ============================================================================

export { PresetList } from './components/PresetList';
export { PresetCard } from './components/PresetCard';
export { PresetForm } from './components/PresetForm';

// ============================================================================
// Components - Executions
// ============================================================================

export { ExecutionList } from './components/ExecutionList';
export { ExecutionCard } from './components/ExecutionCard';

// ============================================================================
// Components - Loops
// ============================================================================

export { LoopList } from './components/LoopList';
export { LoopCard } from './components/LoopCard';
export { LoopForm } from './components/LoopForm';

// ============================================================================
// Components - Action Builder
// ============================================================================

export { ActionBuilder } from './components/ActionBuilder';
export { ActionParamsEditor } from './components/ActionParamsEditor';
export { ActionTypeSelect, actionGroups } from './components/ActionTypeSelect';
export { VariablesEditor } from './components/VariablesEditor';

// ============================================================================
// Utilities
// ============================================================================

export {
  EMPTY_PARAMS,
  NESTED_ACTION_TYPES,
  ACTION_META,
  CATEGORY_COLORS,
  type ActionCategory as ActionCategoryUI,
  type ActionMeta,
  type CategoryColors,
} from './components/actionConstants';

export {
  hasNestedActions,
  hasElseActions,
  getActionMeta,
  getCategoryColors,
  getActionSummary,
  getConditionResult,
  getActionTestStatus,
  type ActionTestStatus,
} from './components/actionHelpers';
// Lib - Automation Core
export * from './lib/core';
