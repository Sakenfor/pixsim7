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
  docBrowserTool,
  plansTool,
  agentObservabilityTool,
  gizmoSurfacesTool,
  promptImporterTool,
  blockFitTool,
  typesExplorerTool,
  sqlQueryExplorerTool,
  logViewerTool,
  testOverviewTool,
  codegenTool,
  contentMapTool,
  performanceTool,
} from './tools';

// Export all plugins individually
export {
  sessionStateViewerTool,
  generationHealthTool,
  capabilityTestingTool,
  appMapTool,
  docBrowserTool,
  plansTool,
  agentObservabilityTool,
  gizmoSurfacesTool,
  promptImporterTool,
  blockFitTool,
  typesExplorerTool,
  sqlQueryExplorerTool,
  logViewerTool,
  testOverviewTool,
  codegenTool,
  contentMapTool,
  performanceTool,
};

// Export array of built-in dev tools for bulk registration
export const builtInDevTools = [
  // Session & World State
  sessionStateViewerTool,
  generationHealthTool,

  capabilityTestingTool,

  // Architecture & Graph
  appMapTool,
  docBrowserTool,
  plansTool,
  agentObservabilityTool,

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

  // Testing
  testOverviewTool,

  // Codegen
  codegenTool,

  // Content Map
  contentMapTool,

  // Performance
  performanceTool,
];
