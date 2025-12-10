/**
 * Register Dev Tools
 *
 * Central initialization for all built-in developer tools.
 * This should be called once at app startup.
 */

import { devToolRegistry } from './devToolRegistry';

// Import dev tool components
import { SessionStateViewer } from '@/components/panels/dev/SessionStateViewer';
import { AppMapPanel } from '@/components/panels/dev/AppMapPanel';
import { BackendArchitecturePanel } from '@/components/panels/dev/BackendArchitecturePanel';
import { CapabilityTestingPanel } from '@/components/panels/dev/CapabilityTestingPanel';
import { DependencyGraphPanel } from '@/components/panels/dev/DependencyGraphPanel';
import { GenerationHealthView } from '@/components/panels/dev/GenerationHealthView';
import { TemplateAnalyticsPanel } from '@/components/panels/dev/TemplateAnalyticsPanel';
import { GizmoSurfacesPanel } from '@/components/panels/dev/GizmoSurfacesPanel';

/**
 * Register all built-in dev tools
 */
export function registerDevTools(): void {
  // Session & World State Tools
  devToolRegistry.register({
    id: 'session-state-viewer',
    label: 'Session State Viewer',
    description: 'Inspect GameSession flags, relationships, and world time',
    icon: 'globe',
    category: 'session',
    panelComponent: SessionStateViewer,
    tags: ['session', 'debug', 'state', 'world', 'relationships'],
  });

  devToolRegistry.register({
    id: 'generation-health',
    label: 'Generation Health',
    description: 'Monitor content generation health and diagnostics',
    icon: 'heart',
    category: 'generation',
    panelComponent: GenerationHealthView,
    tags: ['generation', 'health', 'diagnostics', 'content'],
  });

  // Plugin Development Tools
  devToolRegistry.register({
    id: 'plugin-workspace',
    label: 'Plugin Workspace',
    description: 'Develop and test plugins (UI, interactions, node types, tools)',
    icon: 'plug',
    category: 'plugins',
    routePath: '/dev/plugins',
    tags: ['plugins', 'dev', 'workspace', 'test', 'harness'],
  });

  devToolRegistry.register({
    id: 'capability-testing',
    label: 'Capability Testing',
    description: 'Test and validate system capabilities',
    icon: 'checkCircle',
    category: 'debug',
    panelComponent: CapabilityTestingPanel,
    tags: ['capabilities', 'testing', 'validation'],
  });

  // Architecture & Graph Tools
  devToolRegistry.register({
    id: 'app-map',
    label: 'App Map',
    description: 'Visual map of application structure and components',
    icon: 'map',
    category: 'graph',
    panelComponent: AppMapPanel,
    tags: ['architecture', 'map', 'visualization', 'structure'],
  });

  devToolRegistry.register({
    id: 'dependency-graph',
    label: 'Dependency Graph',
    description: 'Visualize module dependencies and relationships',
    icon: 'graph',
    category: 'graph',
    panelComponent: DependencyGraphPanel,
    tags: ['dependencies', 'graph', 'architecture', 'modules'],
  });

  devToolRegistry.register({
    id: 'backend-architecture',
    label: 'Backend Architecture',
    description: 'View backend service architecture and data flow',
    icon: 'code',
    category: 'graph',
    panelComponent: BackendArchitecturePanel,
    tags: ['backend', 'architecture', 'services', 'api'],
  });

  // Analytics & Metrics Tools
  devToolRegistry.register({
    id: 'template-analytics',
    label: 'Template Analytics',
    description: 'Analyze template usage and performance metrics',
    icon: 'barChart',
    category: 'debug',
    panelComponent: TemplateAnalyticsPanel,
    tags: ['templates', 'analytics', 'metrics', 'performance'],
  });

  // Gizmo & Surface Management
  devToolRegistry.register({
    id: 'gizmo-surfaces',
    label: 'Gizmo Surfaces',
    description: 'Manage gizmo overlays and debug dashboard surfaces',
    icon: 'sliders',
    category: 'debug',
    panelComponent: GizmoSurfacesPanel,
    tags: ['gizmos', 'surfaces', 'overlays', 'dashboards', 'debug'],
  });

  // Prompt tools
  devToolRegistry.register({
    id: 'prompt-lab',
    label: 'Prompt Lab',
    description: 'Analyze, import, and browse prompts',
    icon: 'fileText',
    category: 'prompts',
    routePath: '/dev/prompt-lab',
    tags: ['prompts', 'analysis', 'import', 'library'],
  });

  devToolRegistry.register({
    id: 'prompt-block-graph',
    label: 'Prompt Block Graph',
    description: 'Visualize parsed prompt blocks as a graph',
    icon: 'graph',
    category: 'prompts',
    routePath: '/dev/prompt-lab',
    tags: ['prompts', 'graph', 'analysis', 'blocks'],
  });

  devToolRegistry.register({
    id: 'action-block-graph',
    label: 'Action Block Graph',
    description: 'Visualize ActionBlocks and their compatibility/composition',
    icon: 'zap',
    category: 'prompts',
    routePath: '/dev/action-block-graph',
    tags: ['action-blocks', 'graph', 'library', 'prompts'],
  });

  // Block/image fit tools
  devToolRegistry.register({
    id: 'block-fit',
    label: 'Block Fit Inspector',
    description: 'Inspect and rate how well ActionBlocks fit specific assets',
    icon: 'target',
    category: 'prompts',
    routePath: '/dev/block-fit',
    tags: ['action-blocks', 'assets', 'fit', 'feedback'],
  });

  console.log(`[DevToolRegistry] Registered ${devToolRegistry.getAll().length} dev tools`);
}
