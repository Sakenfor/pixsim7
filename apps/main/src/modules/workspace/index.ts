import type { Module } from '../types';
import { registerWorkspaceFeature } from '../../lib/capabilities/registerCoreFeatures';
import { initializePanels } from '../../lib/panels/initializePanels';

/**
 * Workspace Module
 *
 * Manages scene building and timeline editing capabilities.
 * Registers workspace feature capabilities with the capability registry.
 */
export const workspaceModule: Module = {
  id: 'workspace',
  name: 'Workspace Module',

  async initialize() {
    // Register workspace capabilities (hotspots, scene builder, etc.)
    registerWorkspaceFeature();

    // Ensure core panels (panelRegistry + corePanelsPlugin) are initialized
    // even if the workspace route hasn't been visited yet. This allows
    // features like the Control Center to open workspace panels (e.g. providers)
    // as floating windows from anywhere.
    await initializePanels();
  },
};
