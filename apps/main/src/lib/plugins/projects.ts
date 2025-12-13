/**
 * Extended Plugin Projects Store
 *
 * Manages local plugin development projects for all plugin kinds (Phases 2-5).
 * Supports: ui-plugin, interaction, node-type, gallery-tool, world-tool
 *
 * Storage: localStorage with key 'pixsim7_plugin_projects'
 */

import type { PluginManifest, PluginBundle } from './types';
import type { InteractionPlugin, BaseInteractionConfig, FormField } from '../game/interactions/types';
import type { NodeTypeDefinition } from '@lib/registries';
import type { GalleryToolPlugin } from '../gallery/types';
import { pluginManager } from './PluginManager';

export type PluginProjectKind =
  | 'ui-plugin'
  | 'interaction'
  | 'node-type'
  | 'gallery-tool'
  | 'world-tool';

/**
 * Base metadata shared across all plugin projects
 */
interface BasePluginMetadata {
  id: string;
  name: string;
  description?: string;
  version?: string;
  author?: string;
  category?: string;
  tags?: string[];
  icon?: string;
  experimental?: boolean;
}

/**
 * Plugin project (discriminated union by kind)
 */
export type PluginProject =
  | UIPluginProject
  | InteractionPluginProject
  | NodeTypePluginProject
  | GalleryToolPluginProject
  | WorldToolPluginProject;

export interface UIPluginProject {
  id: string; // Local project ID
  kind: 'ui-plugin';
  label: string;
  createdAt: number;
  updatedAt: number;
  uiManifest: PluginManifest;
  code: string;
  linkedPluginId?: string;
}

export interface InteractionPluginProject {
  id: string;
  kind: 'interaction';
  label: string;
  createdAt: number;
  updatedAt: number;
  metadata: BasePluginMetadata;
  code: string;
  configSchema?: string; // JSON string of config fields
}

export interface NodeTypePluginProject {
  id: string;
  kind: 'node-type';
  label: string;
  createdAt: number;
  updatedAt: number;
  metadata: BasePluginMetadata & {
    scope?: 'scene' | 'arc' | 'world' | 'custom';
    userCreatable?: boolean;
  };
  code: string;
}

export interface GalleryToolPluginProject {
  id: string;
  kind: 'gallery-tool';
  label: string;
  createdAt: number;
  updatedAt: number;
  metadata: BasePluginMetadata;
  code: string;
}

export interface WorldToolPluginProject {
  id: string;
  kind: 'world-tool';
  label: string;
  createdAt: number;
  updatedAt: number;
  metadata: BasePluginMetadata;
  code: string;
}

export interface PluginProjectStore {
  projects: PluginProject[];
}

const STORAGE_KEY = 'pixsim7_plugin_projects';

// ============================================================================
// Storage Functions
// ============================================================================

export function loadProjects(): PluginProject[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];

    const store: PluginProjectStore = JSON.parse(stored);
    return store.projects || [];
  } catch (error) {
    console.error('Failed to load plugin projects:', error);
    return [];
  }
}

export function saveProjects(projects: PluginProject[]): void {
  try {
    const store: PluginProjectStore = { projects };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch (error) {
    console.error('Failed to save plugin projects:', error);
  }
}

export function getProject(id: string): PluginProject | undefined {
  const projects = loadProjects();
  return projects.find((p) => p.id === id);
}

export function updateProject(project: PluginProject): void {
  const projects = loadProjects();
  const index = projects.findIndex((p) => p.id === project.id);

  if (index !== -1) {
    project.updatedAt = Date.now();
    projects[index] = project;
    saveProjects(projects);
  }
}

export function deleteProject(id: string): void {
  const projects = loadProjects();
  const filtered = projects.filter((p) => p.id !== id);
  saveProjects(filtered);
}

// ============================================================================
// UI Plugin Functions (Phase 2)
// ============================================================================

export function createUiPluginProject(label: string): UIPluginProject {
  const now = Date.now();
  const id = `project-${now}`;
  const pluginId = `dev-${now}`;

  const scaffold = createUiPluginScaffold(label, pluginId);

  const project: UIPluginProject = {
    id,
    kind: 'ui-plugin',
    label,
    createdAt: now,
    updatedAt: now,
    uiManifest: scaffold.manifest,
    code: scaffold.code,
  };

  const projects = loadProjects();
  projects.push(project);
  saveProjects(projects);

  return project;
}

function createUiPluginScaffold(
  label: string,
  pluginId: string
): { manifest: PluginManifest; code: string } {
  const manifest: PluginManifest = {
    id: pluginId,
    name: label,
    version: '0.1.0',
    author: 'local-dev',
    description: `A custom UI plugin: ${label}`,
    type: 'ui-overlay',
    permissions: ['read:session', 'ui:overlay', 'storage', 'notifications'],
    main: 'index.js',
  };

  const code = `/**
 * ${label}
 *
 * A custom UI plugin for PixSim7.
 */

async function onEnable(api) {
  const pluginId = api.getPluginId();

  api.ui.addOverlay({
    id: pluginId + '-overlay',
    position: 'top-right',
    render: () => {
      const container = document.createElement('div');
      container.className = 'bg-white dark:bg-neutral-800 border rounded-lg shadow-lg p-4 max-w-sm';

      const title = document.createElement('h3');
      title.className = 'text-lg font-semibold mb-2';
      title.textContent = '${label}';

      container.appendChild(title);
      return container;
    }
  });

  api.ui.showNotification({
    message: '${label} enabled!',
    type: 'success',
    duration: 3000
  });
}

async function onDisable() {
  console.log('Plugin disabled');
}

export default { onEnable, onDisable };
`;

  return { manifest, code };
}

export async function installUiPluginProject(project: UIPluginProject): Promise<void> {
  const bundle: PluginBundle = {
    manifest: project.uiManifest,
    code: project.code,
  };

  const existingPlugin = pluginManager.getPlugin(project.uiManifest.id);
  if (existingPlugin) {
    await pluginManager.uninstallPlugin(project.uiManifest.id);
  }

  await pluginManager.installPlugin(bundle);
  await pluginManager.enablePlugin(project.uiManifest.id);

  project.linkedPluginId = project.uiManifest.id;
  updateProject(project);
}

export async function disableUiPluginProject(project: UIPluginProject): Promise<void> {
  if (project.linkedPluginId) {
    await pluginManager.disablePlugin(project.linkedPluginId);
  }
}

export async function enableUiPluginProject(project: UIPluginProject): Promise<void> {
  if (project.linkedPluginId) {
    await pluginManager.enablePlugin(project.linkedPluginId);
  }
}

export async function uninstallUiPluginProject(project: UIPluginProject): Promise<void> {
  if (project.linkedPluginId) {
    await pluginManager.uninstallPlugin(project.linkedPluginId);
    project.linkedPluginId = undefined;
    updateProject(project);
  }
}

// ============================================================================
// Interaction Plugin Functions (Phase 3)
// ============================================================================

export function createInteractionProject(label: string): InteractionPluginProject {
  const now = Date.now();
  const id = `project-${now}`;
  const pluginId = `dev-interaction-${now}`;

  const scaffold = createInteractionScaffold(label, pluginId);

  const project: InteractionPluginProject = {
    id,
    kind: 'interaction',
    label,
    createdAt: now,
    updatedAt: now,
    metadata: scaffold.metadata,
    code: scaffold.code,
    configSchema: JSON.stringify(scaffold.configFields, null, 2),
  };

  const projects = loadProjects();
  projects.push(project);
  saveProjects(projects);

  return project;
}

function createInteractionScaffold(label: string, pluginId: string) {
  const metadata: BasePluginMetadata = {
    id: pluginId,
    name: label,
    description: `Custom interaction: ${label}`,
    version: '0.1.0',
    author: 'local-dev',
    category: 'custom',
    tags: ['dev'],
  };

  const configFields: FormField[] = [
    {
      key: 'enabled',
      label: 'Enabled',
      type: 'boolean',
      description: 'Enable/disable this interaction',
    },
    {
      key: 'successChance',
      label: 'Success Chance',
      type: 'number',
      description: 'Base success probability (0-100)',
      min: 0,
      max: 100,
    },
  ];

  const code = `/**
 * ${label}
 *
 * Custom NPC interaction plugin.
 */

// Default configuration
export const defaultConfig = {
  enabled: true,
  successChance: 75
};

// Config form fields
export const configFields = ${JSON.stringify(configFields, null, 2)};

// Execute the interaction
export async function execute(config, context) {
  const { state, api, session, onSuccess, onError } = context;

  console.log('Executing ${label}', { config, state });

  // Example: Random success/fail based on config
  const roll = Math.random() * 100;
  const success = roll < config.successChance;

  if (success) {
    onSuccess(\`${label} succeeded! (rolled \${roll.toFixed(1)})\`);
    return { success: true, message: '${label} successful!' };
  } else {
    onError(\`${label} failed (rolled \${roll.toFixed(1)})\`);
    return { success: false, message: '${label} failed' };
  }
}

// Optional: Check if interaction is available
export function isAvailable(context) {
  return true; // Always available
}

// Optional: Validate configuration
export function validate(config) {
  if (config.successChance < 0 || config.successChance > 100) {
    return 'Success chance must be between 0 and 100';
  }
  return null;
}

// Export the plugin definition
export default {
  id: '${pluginId}',
  name: '${label}',
  description: '${metadata.description}',
  version: '${metadata.version}',
  category: '${metadata.category}',
  tags: ${JSON.stringify(metadata.tags)},
  defaultConfig,
  configFields,
  execute,
  isAvailable,
  validate
};
`;

  return { metadata, configFields, code };
}

// ============================================================================
// Node Type Plugin Functions (Phase 3)
// ============================================================================

export function createNodeTypeProject(label: string): NodeTypePluginProject {
  const now = Date.now();
  const id = `project-${now}`;
  const nodeId = `dev-node-${now}`;

  const scaffold = createNodeTypeScaffold(label, nodeId);

  const project: NodeTypePluginProject = {
    id,
    kind: 'node-type',
    label,
    createdAt: now,
    updatedAt: now,
    metadata: scaffold.metadata,
    code: scaffold.code,
  };

  const projects = loadProjects();
  projects.push(project);
  saveProjects(projects);

  return project;
}

function createNodeTypeScaffold(label: string, nodeId: string) {
  const metadata = {
    id: nodeId,
    name: label,
    description: `Custom node type: ${label}`,
    version: '0.1.0',
    author: 'local-dev',
    category: 'custom' as const,
    scope: 'scene' as const,
    icon: '⚡',
    userCreatable: true,
  };

  const code = `/**
 * ${label}
 *
 * Custom node type plugin.
 */

// Default data for new nodes
export const defaultData = {
  value: '',
  enabled: true
};

// Node type definition
export default {
  id: '${nodeId}',
  name: '${label}',
  description: '${metadata.description}',
  icon: '${metadata.icon}',
  category: '${metadata.category}',
  scope: '${metadata.scope}',
  version: '${metadata.version}',
  defaultData,
  userCreatable: true,

  // Optional: validation function
  validate: (data) => {
    if (!data.value || data.value.trim().length === 0) {
      return 'Value is required';
    }
    return null;
  },

  // Optional: custom ports
  ports: {
    inputs: [
      { id: 'in', label: 'In', position: 'top', color: '#3b82f6' }
    ],
    outputs: [
      { id: 'out', label: 'Out', position: 'bottom', color: '#10b981' }
    ]
  }
};
`;

  return { metadata, code };
}

// ============================================================================
// Gallery Tool Plugin Functions (Phase 4)
// ============================================================================

export function createGalleryToolProject(label: string): GalleryToolPluginProject {
  const now = Date.now();
  const id = `project-${now}`;
  const toolId = `dev-gallery-${now}`;

  const scaffold = createGalleryToolScaffold(label, toolId);

  const project: GalleryToolPluginProject = {
    id,
    kind: 'gallery-tool',
    label,
    createdAt: now,
    updatedAt: now,
    metadata: scaffold.metadata,
    code: scaffold.code,
  };

  const projects = loadProjects();
  projects.push(project);
  saveProjects(projects);

  return project;
}

function createGalleryToolScaffold(label: string, toolId: string) {
  const metadata: BasePluginMetadata = {
    id: toolId,
    name: label,
    description: `Custom gallery tool: ${label}`,
    version: '0.1.0',
    author: 'local-dev',
    category: 'utility',
    icon: '🔧',
  };

  const code = `/**
 * ${label}
 *
 * Custom gallery tool plugin.
 */

import { createElement } from 'react';

// Render function for the tool
export function render(context) {
  const { assets, selectedAssets, filters, refresh } = context;

  return createElement('div', {
    className: 'p-4 space-y-3'
  }, [
    createElement('h3', {
      key: 'title',
      className: 'font-medium text-neutral-900 dark:text-neutral-100'
    }, '${label}'),

    createElement('p', {
      key: 'count',
      className: 'text-sm text-neutral-600 dark:text-neutral-400'
    }, \`Showing \${assets.length} assets\`),

    createElement('button', {
      key: 'refresh',
      onClick: refresh,
      className: 'px-3 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600'
    }, 'Refresh Gallery')
  ]);
}

// Optional: determine visibility
export function whenVisible(context) {
  return true; // Always visible
}

// Export the plugin
export default {
  id: '${toolId}',
  name: '${label}',
  description: '${metadata.description}',
  icon: '${metadata.icon}',
  category: '${metadata.category}',
  render,
  whenVisible
};
`;

  return { metadata, code };
}

// ============================================================================
// World Tool Plugin Functions (Phase 4)
// ============================================================================

export function createWorldToolProject(label: string): WorldToolPluginProject {
  const now = Date.now();
  const id = `project-${now}`;
  const toolId = `dev-world-${now}`;

  const scaffold = createWorldToolScaffold(label, toolId);

  const project: WorldToolPluginProject = {
    id,
    kind: 'world-tool',
    label,
    createdAt: now,
    updatedAt: now,
    metadata: scaffold.metadata,
    code: scaffold.code,
  };

  const projects = loadProjects();
  projects.push(project);
  saveProjects(projects);

  return project;
}

function createWorldToolScaffold(label: string, toolId: string) {
  const metadata: BasePluginMetadata = {
    id: toolId,
    name: label,
    description: `Custom world tool: ${label}`,
    version: '0.1.0',
    author: 'local-dev',
    category: 'custom',
    icon: '🌍',
  };

  const code = `/**
 * ${label}
 *
 * Custom world tool plugin.
 */

import { createElement } from 'react';

// Render function for the tool
export function render(context) {
  const { world, gameSession, worldTime, location, locationNpcs } = context;

  return createElement('div', {
    className: 'p-4 space-y-3'
  }, [
    createElement('h3', {
      key: 'title',
      className: 'font-medium text-neutral-900 dark:text-neutral-100'
    }, '${label}'),

    createElement('div', {
      key: 'info',
      className: 'text-sm space-y-1'
    }, [
      createElement('p', { key: 'world' }, \`World: \${world?.title || 'None'}\`),
      createElement('p', { key: 'time' }, \`Time: Day \${worldTime.day}, Hour \${worldTime.hour}\`),
      createElement('p', { key: 'npcs' }, \`NPCs here: \${locationNpcs.length}\`)
    ])
  ]);
}

// Optional: determine visibility
export function whenVisible(context) {
  return context.world !== null; // Only show when in a world
}

// Export the plugin
export default {
  id: '${toolId}',
  name: '${label}',
  description: '${metadata.description}',
  icon: '${metadata.icon}',
  category: '${metadata.category}',
  render,
  whenVisible
};
`;

  return { metadata, code };
}

// ============================================================================
// Export/Import Functions (Phase 5)
// ============================================================================

export interface PluginExportFormat {
  kind: PluginProjectKind;
  version: string; // Export format version
  data: any; // Kind-specific data
}

export function exportProject(project: PluginProject): PluginExportFormat {
  switch (project.kind) {
    case 'ui-plugin':
      return {
        kind: 'ui-plugin',
        version: '1.0',
        data: {
          manifest: project.uiManifest,
          code: project.code,
        },
      };

    case 'interaction':
      return {
        kind: 'interaction',
        version: '1.0',
        data: {
          metadata: project.metadata,
          code: project.code,
          configSchema: project.configSchema,
        },
      };

    case 'node-type':
      return {
        kind: 'node-type',
        version: '1.0',
        data: {
          metadata: project.metadata,
          code: project.code,
        },
      };

    case 'gallery-tool':
      return {
        kind: 'gallery-tool',
        version: '1.0',
        data: {
          metadata: project.metadata,
          code: project.code,
        },
      };

    case 'world-tool':
      return {
        kind: 'world-tool',
        version: '1.0',
        data: {
          metadata: project.metadata,
          code: project.code,
        },
      };
  }
}

export function importProject(exportData: PluginExportFormat): PluginProject {
  const now = Date.now();
  const projectId = `project-${now}`;

  switch (exportData.kind) {
    case 'ui-plugin':
      const uiProject: UIPluginProject = {
        id: projectId,
        kind: 'ui-plugin',
        label: exportData.data.manifest.name,
        createdAt: now,
        updatedAt: now,
        uiManifest: exportData.data.manifest,
        code: exportData.data.code,
      };
      const projects = loadProjects();
      projects.push(uiProject);
      saveProjects(projects);
      return uiProject;

    case 'interaction':
      const interactionProject: InteractionPluginProject = {
        id: projectId,
        kind: 'interaction',
        label: exportData.data.metadata.name,
        createdAt: now,
        updatedAt: now,
        metadata: exportData.data.metadata,
        code: exportData.data.code,
        configSchema: exportData.data.configSchema,
      };
      const projects2 = loadProjects();
      projects2.push(interactionProject);
      saveProjects(projects2);
      return interactionProject;

    case 'node-type':
      const nodeTypeProject: NodeTypePluginProject = {
        id: projectId,
        kind: 'node-type',
        label: exportData.data.metadata.name,
        createdAt: now,
        updatedAt: now,
        metadata: exportData.data.metadata,
        code: exportData.data.code,
      };
      const projects3 = loadProjects();
      projects3.push(nodeTypeProject);
      saveProjects(projects3);
      return nodeTypeProject;

    case 'gallery-tool':
      const galleryProject: GalleryToolPluginProject = {
        id: projectId,
        kind: 'gallery-tool',
        label: exportData.data.metadata.name,
        createdAt: now,
        updatedAt: now,
        metadata: exportData.data.metadata,
        code: exportData.data.code,
      };
      const projects4 = loadProjects();
      projects4.push(galleryProject);
      saveProjects(projects4);
      return galleryProject;

    case 'world-tool':
      const worldProject: WorldToolPluginProject = {
        id: projectId,
        kind: 'world-tool',
        label: exportData.data.metadata.name,
        createdAt: now,
        updatedAt: now,
        metadata: exportData.data.metadata,
        code: exportData.data.code,
      };
      const projects5 = loadProjects();
      projects5.push(worldProject);
      saveProjects(projects5);
      return worldProject;

    default:
      throw new Error(`Unknown plugin kind: ${(exportData as any).kind}`);
  }
}

export function downloadProjectAsJSON(project: PluginProject): void {
  const exportData = exportProject(project);
  const json = JSON.stringify(exportData, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = `plugin-${project.kind}-${project.metadata?.id || (project as any).uiManifest?.id || project.id}.json`;
  a.click();

  URL.revokeObjectURL(url);
}

// ============================================================================
// Utility Functions
// ============================================================================

export function getProjectStatus(project: PluginProject): {
  installed: boolean;
  enabled: boolean;
  error?: string;
} {
  if (project.kind === 'ui-plugin') {
    if (!project.linkedPluginId) {
      return { installed: false, enabled: false };
    }

    const pluginEntry = pluginManager.getPlugin(project.linkedPluginId);
    if (!pluginEntry) {
      return { installed: false, enabled: false };
    }

    return {
      installed: true,
      enabled: pluginEntry.state === 'enabled',
      error: pluginEntry.error,
    };
  }

  // For other kinds, they're not "installed" in the traditional sense
  // They're dev-registered when the project is active
  return { installed: false, enabled: false };
}
