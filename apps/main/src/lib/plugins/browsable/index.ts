/**
 * Widget Builder Family Configs
 *
 * Co-located configs for plugin family display in the Widget Builder.
 * Each category has its own file for easy maintenance.
 */

import type { WidgetBuilderFamilyConfig } from '@pixsim7/shared.plugins';

import { toolsConfigs } from './toolsConfigs';
import { widgetsConfigs } from './widgetsConfigs';
import { workspaceConfigs } from './workspaceConfigs';

// Re-export individual configs for direct access
export * from './workspaceConfigs';
export * from './toolsConfigs';
export * from './widgetsConfigs';

/**
 * All default Widget Builder family configs.
 * Import this to register all configs at once.
 */
export const defaultWidgetBuilderConfigs: WidgetBuilderFamilyConfig[] = [
  ...workspaceConfigs,
  ...toolsConfigs,
  ...widgetsConfigs,
];
