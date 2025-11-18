import type { Module } from '../types';
import { registerWorkspaceFeature } from '../../lib/capabilities/registerCoreFeatures';

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
    registerWorkspaceFeature();
    // Future: Register workspace-specific plugins if needed
  },
};
