/**
 * Dev Tool Plugin Definitions
 *
 * Defines all built-in developer tools that can be displayed
 * in the Dev Tools surface.
 *
 * These tools are registered with devToolRegistry on app startup.
 */

import type { DevToolDefinition } from '@lib/dev/devtools/types';

// Import dev tool components
import { SessionStateViewer } from '@features/panels/components/dev/SessionStateViewer';
import { AppMapPanel } from '@features/panels/components/dev/AppMapPanel';
import { BackendArchitecturePanel } from '@features/panels/components/dev/BackendArchitecturePanel';
import { CapabilityTestingPanel } from '@features/panels/components/dev/CapabilityTestingPanel';
import { DependencyGraphPanel } from '@features/panels/components/dev/DependencyGraphPanel';
import { GenerationHealthView } from '@features/panels/components/dev/GenerationHealthView';
import { TemplateAnalyticsPanel } from '@features/panels/components/dev/TemplateAnalyticsPanel';
import { GizmoSurfacesPanel } from '@features/panels/components/dev/GizmoSurfacesPanel';

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

export const appMapTool: DevToolDefinition = {
  id: 'app-map',
  label: 'App Map',
  description: 'Visual map of application structure and components',
  icon: 'map',
  category: 'graph',
  panelComponent: AppMapPanel,
  tags: ['architecture', 'map', 'visualization', 'structure'],
};

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

export const templateAnalyticsTool: DevToolDefinition = {
  id: 'template-analytics',
  label: 'Template Analytics',
  description: 'Analyze template usage and performance metrics',
  icon: 'barChart',
  category: 'debug',
  panelComponent: TemplateAnalyticsPanel,
  tags: ['templates', 'analytics', 'metrics', 'performance'],
};

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
