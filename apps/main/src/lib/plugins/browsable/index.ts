/**
 * Browsable Family Configs
 *
 * Co-located configs for all browsable plugin families.
 * Each category has its own file for easy maintenance.
 */

import type { BrowsableFamilyConfig } from '@pixsim7/shared.plugins';

import { toolsConfigs } from './toolsConfigs';
import { widgetsConfigs } from './widgetsConfigs';
import { workspaceConfigs } from './workspaceConfigs';

// Re-export individual configs for direct access
export * from './workspaceConfigs';
export * from './toolsConfigs';
export * from './widgetsConfigs';

/**
 * All default browsable family configs.
 * Import this to register all configs at once.
 */
export const defaultBrowsableConfigs: BrowsableFamilyConfig[] = [
  ...workspaceConfigs,
  ...toolsConfigs,
  ...widgetsConfigs,
];
