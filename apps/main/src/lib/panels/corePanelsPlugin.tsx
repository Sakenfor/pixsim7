/**
 * Core Panels Plugin
 *
 * Built-in plugin that registers all core workspace panels.
 * Part of Task 50 Phase 50.3 - Plugin-based Panel Registry
 */

import type { PanelPlugin } from './panelPlugin';
import { registerBuiltinPanel } from '../plugins/registryBridge';
import { AssetsRoute } from '../../routes/Assets';
import { SceneBuilderPanel } from '@/components/scene/panels/SceneBuilderPanel';
import { GraphEditorHost } from '../../components/graph/GraphEditorHost';
import { InspectorPanel } from '../../components/inspector/InspectorPanel';
import { HealthPanel } from '../../components/health/HealthPanel';
import { ProviderSettingsPanel } from '../../components/provider/ProviderSettingsPanel';
import { SettingsPanel } from '../../components/settings/SettingsPanel';
import { GameThemingPanel } from '@/components/game/panels/GameThemingPanel';
import { SceneManagementPanel } from '@/components/scene/panels/SceneManagementPanel';
import { GizmoLab } from '../../routes/GizmoLab';
import { NpcBrainLab } from '../../routes/NpcBrainLab';
import { DevToolsPanel } from '@/components/panels/dev/DevToolsPanel';
import { HudDesignerPanel } from '../../components/panels/HudDesignerPanel';
import { WorldVisualRolesPanel } from '@/components/game/panels/WorldVisualRolesPanel';
import { GenerationsPanel } from '@/components/generation/GenerationsPanel';
import { GameToolsPanel } from '@/components/panels/tools/GameToolsPanel';
import { SurfaceWorkbenchPanel } from '@/components/panels/tools/SurfaceWorkbenchPanel';

// Archived game iframe panel – now a simple placeholder
function ArchivedGamePanel() {
  return (
    <div className="w-full h-full flex items-center justify-center px-4 text-sm text-neutral-600 dark:text-neutral-300 text-center">
      <div>
        <div className="font-semibold mb-1">Game panel (archived)</div>
        <div className="text-xs text-neutral-500 dark:text-neutral-400">
          The legacy game iframe frontend has been archived. Use the Game 2D view and workspace tools instead.
        </div>
      </div>
    </div>
  );
}

export const corePanelsPlugin: PanelPlugin = {
  id: 'core-panels',
  name: 'Core Workspace Panels',
  version: '1.0.0',
  description: 'Built-in workspace panels for PixSim7',
  author: 'PixSim7 Team',

  panels: [
    {
      id: 'gallery',
      title: 'Gallery',
      component: AssetsRoute,
      category: 'workspace',
      tags: ['assets', 'media', 'images'],
      icon: '🖼️',
      description: 'Browse and manage project assets',
      supportsCompactMode: false,
      supportsMultipleInstances: false,
    },
    {
      id: 'scene',
      title: 'Scene Builder',
      component: SceneBuilderPanel,
      category: 'scene',
      tags: ['scene', 'builder', 'editor'],
      icon: '🎬',
      description: 'Build and edit individual scenes',
      contextLabel: 'scene',
      supportsCompactMode: false,
      supportsMultipleInstances: false,
    },
    {
      id: 'graph',
      title: 'Graph',
      component: GraphEditorHost,
      category: 'workspace',
      tags: ['graph', 'nodes', 'flow'],
      icon: '🔀',
      description: 'Visual node-based editor',
      // Core Flow View: The canonical logic/flow editor for designing scenes, nodes, choices, transitions
      coreEditorRole: 'flow-view',
      contextLabel: (ctx) =>
        ctx.scene.title
          ? `Scene: ${ctx.scene.title}${ctx.world.id ? ` • World #${ctx.world.id}` : ''}`
          : ctx.world.id
            ? `World #${ctx.world.id}`
            : undefined,
      supportsCompactMode: false,
      supportsMultipleInstances: false,
    },
    {
      id: 'inspector',
      title: 'Inspector',
      component: InspectorPanel,
      category: 'workspace',
      tags: ['inspector', 'properties', 'details'],
      icon: '🔍',
      description: 'Inspect and edit node properties',
      supportsCompactMode: false,
      supportsMultipleInstances: false,
    },
    {
      id: 'health',
      title: 'Health',
      component: HealthPanel,
      category: 'system',
      tags: ['health', 'monitoring', 'validation', 'diagnostics'],
      icon: '❤️',
      description: 'System health and validation',
      contextLabel: 'preset',
      supportsCompactMode: true,
      supportsMultipleInstances: false,
    },
    {
      id: 'game',
      title: 'Game',
      component: ArchivedGamePanel,
      category: 'game',
      tags: ['game', 'preview', 'play'],
      icon: '🎮',
      description: 'Legacy game iframe frontend (archived). Use Game2D route for the core Game View.',
      // Core Game View: The canonical runtime/play viewport (legacy - see Game2D route for active implementation)
      coreEditorRole: 'game-view',
      contextLabel: 'session',
      supportsCompactMode: false,
      supportsMultipleInstances: false,
    },
    {
      id: 'providers',
      title: 'Provider Settings',
      component: ProviderSettingsPanel,
      category: 'system',
      tags: ['providers', 'api', 'settings'],
      icon: '🔌',
      description: 'API provider settings and configuration',
      supportsCompactMode: false,
      supportsMultipleInstances: false,
    },
    {
      id: 'settings',
      title: 'Settings',
      component: SettingsPanel,
      category: 'utilities',
      tags: ['settings', 'configuration', 'preferences'],
      icon: '⚙️',
      description: 'Application settings and preferences',
      supportsCompactMode: false,
      supportsMultipleInstances: false,
    },
    {
      id: 'gizmo-lab',
      title: 'Gizmo Lab',
      component: GizmoLab,
      category: 'tools',
      tags: ['gizmos', 'lab', 'experimental', 'testing'],
      icon: '🧪',
      description: 'Gizmo testing laboratory',
      supportsCompactMode: false,
      supportsMultipleInstances: false,
    },
    {
      id: 'npc-brain-lab',
      title: 'NPC Brain Lab',
      component: NpcBrainLab,
      category: 'tools',
      tags: ['npc', 'ai', 'brain', 'behavior'],
      icon: '🧠',
      description: 'NPC behavior testing and debugging',
      supportsCompactMode: false,
      supportsMultipleInstances: false,
    },
    {
      id: 'game-theming',
      title: 'Game Theming',
      component: GameThemingPanel,
      category: 'game',
      tags: ['theming', 'customization', 'appearance'],
      icon: '🎨',
      description: 'Game theme and appearance customization',
      contextLabel: 'world',
      supportsCompactMode: false,
      supportsMultipleInstances: false,
    },
    {
      id: 'scene-management',
      title: 'Scene Management',
      component: SceneManagementPanel,
      category: 'scene',
      tags: ['scene', 'management', 'workflow', 'organization'],
      icon: '📚',
      description: 'Unified scene workflow management',
      contextLabel: 'scene',
      supportsCompactMode: false,
      supportsMultipleInstances: false,
    },
    {
      id: 'dev-tools',
      title: 'Dev Tools',
      component: DevToolsPanel,
      category: 'dev',
      tags: ['dev', 'debug', 'tools', 'diagnostics', 'developer'],
      icon: '🧰',
      description: 'Developer tools and diagnostics',
      supportsCompactMode: false,
      supportsMultipleInstances: false,
    },
    {
      id: 'hud-designer',
      title: 'HUD Designer',
      component: HudDesignerPanel,
      category: 'tools',
      tags: ['hud', 'designer', 'layout', 'ui', 'widgets'],
      icon: '🎨',
      description: 'Design HUD layouts using widget compositions',
      supportsCompactMode: false,
      supportsMultipleInstances: false,
    },
    {
      id: 'world-visual-roles',
      title: 'World Visual Roles',
      component: WorldVisualRolesPanel,
      category: 'game',
      tags: ['world', 'assets', 'visual', 'binding', 'roles', 'portraits'],
      icon: '🖼️',
      description: 'Bind gallery assets to world visual roles (portraits, POV, backgrounds)',
      contextLabel: 'world',
      supportsCompactMode: false,
      supportsMultipleInstances: false,
    },
    {
      id: 'generations',
      title: 'Generations',
      component: GenerationsPanel,
      category: 'workspace',
      tags: ['generations', 'jobs', 'status', 'monitoring', 'tracking'],
      icon: '⚡',
      description: 'Track and manage generation jobs',
      supportsCompactMode: false,
      supportsMultipleInstances: false,
    },
    {
      id: 'game-tools',
      title: 'Game Tools',
      component: GameToolsPanel,
      category: 'tools',
      tags: ['game', 'tools', 'catalog', 'world', 'interactions', 'widgets'],
      icon: '🛠️',
      description: 'Browse world tools, interactions, HUD widgets, and dev plugins',
      supportsCompactMode: false,
      supportsMultipleInstances: false,
    },
    {
      id: 'surface-workbench',
      title: 'Surface Workbench',
      component: SurfaceWorkbenchPanel,
      category: 'tools',
      tags: ['surfaces', 'hud', 'overlay', 'gizmo', 'editor'],
      icon: '[]',
      description: 'Inspect available surfaces (HUD, overlay, gizmo) for the active context',
      contextLabel: (ctx) =>
        ctx.scene.title
          ? `Scene: ${ctx.scene.title}`
          : ctx.world.id
            ? `World #${ctx.world.id}`
            : undefined,
      supportsCompactMode: false,
      supportsMultipleInstances: false,
    },
  ],

  initialize(registry) {
    console.log('Initializing core panels plugin...');

    // Register all built-in panels with the unified plugin system
    for (const panel of this.panels) {
      registerBuiltinPanel(panel);
    }

    console.log(`Registered ${this.panels.length} core panels as plugins`);
  },

  cleanup() {
    console.log('Cleaning up core panels plugin...');
    // Cleanup is handled by the plugin manager
  },
};
