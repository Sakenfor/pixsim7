/**
 * Dev Tool Plugin Definitions
 *
 * Defines all built-in developer tools that can be displayed
 * in the Dev Tools surface.
 *
 * These tools are registered with the plugin catalog on app startup.
 */

import type { DevToolDefinition } from '@lib/dev/devtools/types';

// Import dev tool components
// Note: AppMapPanel and TemplateAnalyticsPanel are now auto-registered from their modules
import { BackendArchitecturePanel } from '@features/panels/components/dev/BackendArchitecturePanel';
import { CapabilityTestingPanel } from '@features/panels/components/dev/CapabilityTestingPanel';
import { DependencyGraphPanel } from '@features/panels/components/dev/DependencyGraphPanel';
import { GenerationHealthView } from '@features/panels/components/dev/GenerationHealthView';
import { GizmoSurfacesPanel } from '@features/panels/components/dev/GizmoSurfacesPanel';
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

// ============================================================================
// Plugin Development Tools
// ============================================================================

export const pluginWorkspaceTool: DevToolDefinition = {
  id: 'plugin-workspace',
  label: 'Plugin Workspace',
  description: 'Develop and test plugins (UI, interactions, node types, tools)',
  icon: 'plug',
  category: 'plugins',
  routePath: '/dev/plugins',
  tags: ['plugins', 'dev', 'workspace', 'test', 'harness'],
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

// appMapTool is now auto-registered from appMapModule (features/devtools/routes/index.ts)

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

// templateAnalyticsTool is now auto-registered from templateAnalyticsModule (features/devtools/routes/index.ts)

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

export const promptLabTool: DevToolDefinition = {
  id: 'prompt-lab',
  label: 'Prompt Lab',
  description: 'Analyze, import, and browse prompts',
  icon: 'fileText',
  category: 'prompts',
  routePath: '/dev/prompt-lab',
  tags: ['prompts', 'analysis', 'import', 'library'],
};

export const promptBlockGraphTool: DevToolDefinition = {
  id: 'prompt-block-graph',
  label: 'Prompt Block Graph',
  description: 'Visualize parsed prompt blocks as a graph',
  icon: 'graph',
  category: 'prompts',
  routePath: '/dev/prompt-lab',
  tags: ['prompts', 'graph', 'analysis', 'blocks'],
};

export const actionBlockGraphTool: DevToolDefinition = {
  id: 'action-block-graph',
  label: 'Action Block Graph',
  description: 'Visualize ActionBlocks and their compatibility/composition',
  icon: 'zap',
  category: 'prompts',
  routePath: '/dev/action-block-graph',
  tags: ['action-blocks', 'graph', 'library', 'prompts'],
};

export const blockFitTool: DevToolDefinition = {
  id: 'block-fit',
  label: 'Block Fit Inspector',
  description: 'Inspect and rate how well ActionBlocks fit specific assets',
  icon: 'target',
  category: 'prompts',
  routePath: '/dev/block-fit',
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
// Codegen Tools
// ============================================================================

export const codegenTool: DevToolDefinition = {
  id: 'codegen',
  label: 'Code Generation',
  description: 'Settings for TypeScript/schema code generation scripts',
  icon: 'code',
  category: 'debug',
  tags: ['codegen', 'types', 'schema', 'generation', 'typescript'],
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
