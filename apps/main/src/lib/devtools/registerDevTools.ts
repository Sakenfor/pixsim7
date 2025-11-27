/**
 * Register Dev Tools
 *
 * Central initialization for all built-in developer tools.
 * This should be called once at app startup.
 */

import { devToolRegistry } from './devToolRegistry';

// Import dev tool components
import { SessionStateViewer } from '../../components/legacy/SessionStateViewer';
import { AppMapPanel } from '../../components/dev/AppMapPanel';
import { BackendArchitecturePanel } from '../../components/dev/BackendArchitecturePanel';
import { CapabilityTestingPanel } from '../../components/dev/CapabilityTestingPanel';
import { DependencyGraphPanel } from '../../components/dev/DependencyGraphPanel';
import { GenerationHealthView } from '../../components/dev/GenerationHealthView';
import { TemplateAnalyticsPanel } from '../../components/dev/TemplateAnalyticsPanel';
import { GizmoSurfacesPanel } from '../../components/devtools/GizmoSurfacesPanel';

/**
 * Register all built-in dev tools
 */
export function registerDevTools(): void {
  // Session & World State Tools
  devToolRegistry.register({
    id: 'session-state-viewer',
    label: 'Session State Viewer',
    description: 'Inspect GameSession flags, relationships, and world time',
    icon: 'dY',
    category: 'session',
    panelComponent: SessionStateViewer,
    tags: ['session', 'debug', 'state', 'world', 'relationships'],
  });

  devToolRegistry.register({
    id: 'generation-health',
    label: 'Generation Health',
    description: 'Monitor content generation health and diagnostics',
    icon: 'dY?',
    category: 'generation',
    panelComponent: GenerationHealthView,
    tags: ['generation', 'health', 'diagnostics', 'content'],
  });

  // Plugin Development Tools
  devToolRegistry.register({
    id: 'plugin-workspace',
    label: 'Plugin Workspace',
    description: 'Develop and test plugins (UI, interactions, node types, tools)',
    icon: 'dY"O',
    category: 'plugins',
    routePath: '/dev/plugins',
    tags: ['plugins', 'dev', 'workspace', 'test', 'harness'],
  });

  devToolRegistry.register({
    id: 'capability-testing',
    label: 'Capability Testing',
    description: 'Test and validate system capabilities',
    icon: 's',
    category: 'debug',
    panelComponent: CapabilityTestingPanel,
    tags: ['capabilities', 'testing', 'validation'],
  });

  // Architecture & Graph Tools
  devToolRegistry.register({
    id: 'app-map',
    label: 'App Map',
    description: 'Visual map of application structure and components',
    icon: 'dY-,?',
    category: 'graph',
    panelComponent: AppMapPanel,
    tags: ['architecture', 'map', 'visualization', 'structure'],
  });

  devToolRegistry.register({
    id: 'dependency-graph',
    label: 'Dependency Graph',
    description: 'Visualize module dependencies and relationships',
    icon: 'dY"S',
    category: 'graph',
    panelComponent: DependencyGraphPanel,
    tags: ['dependencies', 'graph', 'architecture', 'modules'],
  });

  devToolRegistry.register({
    id: 'backend-architecture',
    label: 'Backend Architecture',
    description: 'View backend service architecture and data flow',
    icon: 'dY?-,?',
    category: 'graph',
    panelComponent: BackendArchitecturePanel,
    tags: ['backend', 'architecture', 'services', 'api'],
  });

  // Analytics & Metrics Tools
  devToolRegistry.register({
    id: 'template-analytics',
    label: 'Template Analytics',
    description: 'Analyze template usage and performance metrics',
    icon: 'dY"^',
    category: 'debug',
    panelComponent: TemplateAnalyticsPanel,
    tags: ['templates', 'analytics', 'metrics', 'performance'],
  });

  // Gizmo & Surface Management
  devToolRegistry.register({
    id: 'gizmo-surfaces',
    label: 'Gizmo Surfaces',
    description: 'Manage gizmo overlays and debug dashboard surfaces',
    icon: 'dYZr',
    category: 'debug',
    panelComponent: GizmoSurfacesPanel,
    tags: ['gizmos', 'surfaces', 'overlays', 'dashboards', 'debug'],
  });

  // Prompt tools
  devToolRegistry.register({
    id: 'prompt-lab',
    label: 'Prompt Lab',
    description: 'Analyze, import, and browse prompts',
    icon: '',
    category: 'prompts',
    routePath: '/dev/prompt-lab',
    tags: ['prompts', 'analysis', 'import', 'library'],
  });

  console.log(`[DevToolRegistry] Registered ${devToolRegistry.getAll().length} dev tools`);
}
