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

// Game iframe panel (defined inline since it's simple)
import { useRef, useEffect } from 'react';
import { previewBridge } from '../preview-bridge';

function GameIframePanel() {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const url = import.meta.env.VITE_GAME_URL || 'http://localhost:5174';

  useEffect(() => {
    if (iframeRef.current) {
      previewBridge.setIframe(iframeRef.current);
    }
  }, []);

  return (
    <div className="w-full h-full">
      <iframe
        ref={iframeRef}
        src={url}
        className="w-full h-full border-0"
        title="Game Frontend"
      />
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
      supportsCompactMode: true,
      supportsMultipleInstances: false,
    },
    {
      id: 'game',
      title: 'Game',
      component: GameIframePanel,
      category: 'game',
      tags: ['game', 'preview', 'play'],
      icon: '🎮',
      description: 'Game preview and testing',
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
