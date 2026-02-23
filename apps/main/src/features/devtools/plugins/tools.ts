/**
 * Dev Tool Plugin Definitions
 *
 * Defines all built-in developer tools that can be displayed
 * in the Dev Tools surface.
 *
 * These tools are registered with the plugin catalog on app startup.
 */

import type { DevToolDefinition } from '@pixsim7/shared.devtools.core';

import { buildDevtoolsUrl } from '@lib/dev/devtools/devtoolsUrl';

// Import dev tool components
import { BackendArchitecturePanel } from '@features/panels/components/dev/BackendArchitecturePanel';
import { CapabilityTestingPanel } from '@features/panels/components/dev/CapabilityTestingPanel';
import { DependencyGraphPanel } from '@features/panels/components/dev/DependencyGraphPanel';
import { GenerationHealthView } from '@features/panels/components/dev/GenerationHealthView';
import { GizmoSurfacesPanel } from '@features/panels/components/dev/GizmoSurfacesPanel';
import { LogViewerPanel } from '@features/panels/components/dev/LogViewerPanel';
import { SessionStateViewer } from '@features/panels/components/dev/SessionStateViewer';
import { SqlQueryExplorerPanel } from '@features/panels/components/dev/SqlQueryExplorerPanel';
import { TypesExplorerPanel } from '@features/panels/components/dev/TypesExplorerPanel';

// ============================================================================
// Session & World State Tools
// ============================================================================

export const sessionStateViewerTool: DevToolDefinition = {
  id: 'session-state-viewer',
  label: 'Session State Viewer',
  description: 'Inspect GameSession flags, relationships, and world time',
  icon: 'globe',
  category: 'session',
  panelComponent: SessionStateViewer,
  tags: ['session', 'debug', 'state', 'world', 'relationships'],
};

export const generationHealthTool: DevToolDefinition = {
  id: 'generation-health',
  label: 'Generation Health',
  description: 'Monitor content generation health and diagnostics',
  icon: 'heart',
  category: 'generation',
  panelComponent: GenerationHealthView,
  tags: ['generation', 'health', 'diagnostics', 'content'],
};

export const capabilityTestingTool: DevToolDefinition = {
  id: 'capability-testing',
  label: 'Capability Testing',
  description: 'Test and validate system capabilities',
  icon: 'checkCircle',
  category: 'debug',
  panelComponent: CapabilityTestingPanel,
  tags: ['capabilities', 'testing', 'validation'],
};

// ============================================================================
// Architecture & Graph Tools
// ============================================================================

export const dependencyGraphTool: DevToolDefinition = {
  id: 'dependency-graph',
  label: 'Dependency Graph',
  description: 'Visualize module dependencies and relationships',
  icon: 'graph',
  category: 'graph',
  panelComponent: DependencyGraphPanel,
  tags: ['dependencies', 'graph', 'architecture', 'modules'],
};

export const backendArchitectureTool: DevToolDefinition = {
  id: 'backend-architecture',
  label: 'Backend Architecture',
  description: 'View backend service architecture and data flow',
  icon: 'code',
  category: 'graph',
  panelComponent: BackendArchitecturePanel,
  tags: ['backend', 'architecture', 'services', 'api'],
};

// ============================================================================
// Analytics & Metrics Tools
// ============================================================================

// ============================================================================
// Gizmo & Surface Management
// ============================================================================

export const gizmoSurfacesTool: DevToolDefinition = {
  id: 'gizmo-surfaces',
  label: 'Gizmo Surfaces',
  description: 'Manage gizmo overlays and debug dashboard surfaces',
  icon: 'sliders',
  category: 'debug',
  panelComponent: GizmoSurfacesPanel,
  tags: ['gizmos', 'surfaces', 'overlays', 'dashboards', 'debug'],
};

// ============================================================================
// Prompt Tools
// ============================================================================

export const promptImporterTool: DevToolDefinition = {
  id: 'prompt-importer',
  label: 'Prompt Importer',
  description: 'Import prompts from external sources',
  icon: 'fileText',
  category: 'prompts',
  routePath: buildDevtoolsUrl('/dev/prompt-importer'),
  tags: ['prompts', 'import', 'library'],
};

export const blockFitTool: DevToolDefinition = {
  id: 'block-fit',
  label: 'Block Fit Inspector',
  description: 'Inspect and rate how well ActionBlocks fit specific assets',
  icon: 'target',
  category: 'prompts',
  routePath: buildDevtoolsUrl('/dev/block-fit'),
  tags: ['action-blocks', 'assets', 'fit', 'feedback'],
};

// ============================================================================
// Types & Schema Tools
// ============================================================================

export const typesExplorerTool: DevToolDefinition = {
  id: 'types-explorer',
  label: 'Types Explorer',
  description: 'Browse generated types: composition roles, region labels, OpenAPI',
  icon: 'fileCode',
  category: 'debug',
  panelComponent: TypesExplorerPanel,
  tags: ['types', 'openapi', 'schema', 'generated', 'composition', 'roles', 'labels'],
  safeForNonDev: true,
};

// ============================================================================
// Database & Diagnostics Tools
// ============================================================================

export const sqlQueryExplorerTool: DevToolDefinition = {
  id: 'sql-query-explorer',
  label: 'SQL Query Explorer',
  description: 'Run read-only SQL queries for diagnostics and data exploration',
  icon: 'database',
  category: 'debug',
  panelComponent: SqlQueryExplorerPanel,
  tags: ['sql', 'database', 'diagnostics', 'query', 'admin'],
  safeForNonDev: false, // Admin only
};

// ============================================================================
// Log Viewer
// ============================================================================

export const logViewerTool: DevToolDefinition = {
  id: 'log-viewer',
  label: 'Log Viewer',
  description: 'Query and inspect structured backend logs, trace jobs and requests',
  icon: 'fileText',
  category: 'debug',
  panelComponent: LogViewerPanel,
  tags: ['logs', 'trace', 'debug', 'worker', 'pipeline', 'jobs', 'requests', 'errors'],
  safeForNonDev: true,
};

// ============================================================================
// Codegen Tools
// ============================================================================

export const codegenTool: DevToolDefinition = {
  id: 'codegen',
  label: 'Code Generation',
  description: 'Run and verify workspace code generation tasks',
  icon: 'code',
  category: 'debug',
  routePath: buildDevtoolsUrl('/dev/codegen'),
  tags: ['codegen', 'types', 'schema', 'generation', 'typescript'],
  safeForNonDev: false,
  settings: [
    {
      type: 'boolean',
      key: 'includeAllPlugins',
      label: 'Include All Plugins',
      description: 'Include all plugin vocabularies in generated types (default: only marked plugins)',
      defaultValue: false,
    },
  ],
};
