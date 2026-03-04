/**
 * Dev Tools Plugins Index
 *
 * Central place to import and export all dev tool plugins.
 * Register your custom dev tools here.
 *
 */

import {
  sessionStateViewerTool,
  generationHealthTool,
  capabilityTestingTool,
  appMapTool,
  dependencyGraphTool,
  backendArchitectureTool,
  gizmoSurfacesTool,
  promptImporterTool,
  blockFitTool,
  typesExplorerTool,
  sqlQueryExplorerTool,
  logViewerTool,
  codegenTool,
} from './tools';

// Export all plugins individually
export {
  sessionStateViewerTool,
  generationHealthTool,
  capabilityTestingTool,
  appMapTool,
  dependencyGraphTool,
  backendArchitectureTool,
  gizmoSurfacesTool,
  promptImporterTool,
  blockFitTool,
  typesExplorerTool,
  sqlQueryExplorerTool,
  logViewerTool,
  codegenTool,
};

// Export array of built-in dev tools for bulk registration
export const builtInDevTools = [
  // Session & World State
  sessionStateViewerTool,
  generationHealthTool,

  capabilityTestingTool,

  // Architecture & Graph
  appMapTool,
  dependencyGraphTool,
  backendArchitectureTool,

  // Gizmo & Surface Management
  gizmoSurfacesTool,

  // Prompt Tools
  promptImporterTool,
  blockFitTool,

  // Types & Schema
  typesExplorerTool,

  // Database & Diagnostics
  sqlQueryExplorerTool,

  // Log Viewer
  logViewerTool,

  // Codegen
  codegenTool,
];
