/**
 * Plugin Projects Store
 *
 * Manages local plugin development projects (frontend-only).
 * Phase 2 focuses on UI plugins only.
 *
 * Storage: localStorage with key 'pixsim7_plugin_projects'
 */

import type { PluginManifest, PluginBundle } from './types';
import { pluginManager } from './PluginManager';

export type PluginProjectKind = 'ui-plugin';

export interface PluginProject {
  id: string; // Local project ID
  kind: PluginProjectKind;
  label: string;
  createdAt: number;
  updatedAt: number;

  // UI plugin-specific fields
  uiManifest: PluginManifest;
  code: string; // JS/TS code as string
  linkedPluginId?: string; // Installed plugin ID if installed
}

export interface PluginProjectStore {
  projects: PluginProject[];
}

const STORAGE_KEY = 'pixsim7_plugin_projects';

/**
 * Load projects from localStorage
 */
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

/**
 * Save projects to localStorage
 */
export function saveProjects(projects: PluginProject[]): void {
  try {
    const store: PluginProjectStore = { projects };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch (error) {
    console.error('Failed to save plugin projects:', error);
  }
}

/**
 * Get a single project by ID
 */
export function getProject(id: string): PluginProject | undefined {
  const projects = loadProjects();
  return projects.find((p) => p.id === id);
}

/**
 * Create a new UI plugin project with scaffold
 */
export function createUiPluginProject(label: string): PluginProject {
  const now = Date.now();
  const id = `project-${now}`;
  const pluginId = `dev-${now}`;

  const scaffold = createUiPluginScaffold(label, pluginId);

  const project: PluginProject = {
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

/**
 * Update an existing project
 */
export function updateProject(project: PluginProject): void {
  const projects = loadProjects();
  const index = projects.findIndex((p) => p.id === project.id);

  if (index !== -1) {
    project.updatedAt = Date.now();
    projects[index] = project;
    saveProjects(projects);
  }
}

/**
 * Delete a project
 */
export function deleteProject(id: string): void {
  const projects = loadProjects();
  const filtered = projects.filter((p) => p.id !== id);
  saveProjects(filtered);
}

/**
 * Create a UI plugin scaffold (manifest + code)
 */
export function createUiPluginScaffold(
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
 * This plugin adds an overlay to the game interface.
 */

/**
 * Called when the plugin is enabled
 * @param {Object} api - The plugin API
 */
async function onEnable(api) {
  const pluginId = api.getPluginId();
  console.log('Plugin enabled:', pluginId);

  // Add a simple overlay
  api.ui.addOverlay({
    id: pluginId + '-overlay',
    position: 'top-right',
    render: () => {
      const container = document.createElement('div');
      container.className = 'bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-600 rounded-lg shadow-lg p-4 max-w-sm';

      const title = document.createElement('h3');
      title.className = 'text-lg font-semibold text-neutral-900 dark:text-neutral-100 mb-2';
      title.textContent = '${label}';

      const content = document.createElement('p');
      content.className = 'text-sm text-neutral-600 dark:text-neutral-400';
      content.textContent = 'Hello from your custom plugin!';

      container.appendChild(title);
      container.appendChild(content);

      return container;
    }
  });

  // Show a notification
  api.ui.showNotification({
    message: '${label} enabled!',
    type: 'success',
    duration: 3000
  });
}

/**
 * Called when the plugin is disabled
 */
async function onDisable() {
  console.log('Plugin disabled');
}

// Export the plugin interface
export default {
  onEnable,
  onDisable
};
`;

  return { manifest, code };
}

/**
 * Install a UI plugin project
 * Creates a PluginBundle and installs it via PluginManager
 */
export async function installUiPluginProject(project: PluginProject): Promise<void> {
  const bundle: PluginBundle = {
    manifest: project.uiManifest,
    code: project.code,
  };

  try {
    // Check if already installed
    const existingPlugin = pluginManager.getPlugin(project.uiManifest.id);

    if (existingPlugin) {
      // Uninstall first, then reinstall
      await pluginManager.uninstallPlugin(project.uiManifest.id);
    }

    // Install the plugin
    await pluginManager.installPlugin(bundle);

    // Enable it
    await pluginManager.enablePlugin(project.uiManifest.id);

    // Link the project to the installed plugin
    project.linkedPluginId = project.uiManifest.id;
    updateProject(project);

    console.log(`Installed and enabled plugin: ${project.uiManifest.id}`);
  } catch (error) {
    console.error('Failed to install plugin project:', error);
    throw error;
  }
}

/**
 * Disable a UI plugin project
 */
export async function disableUiPluginProject(project: PluginProject): Promise<void> {
  if (!project.linkedPluginId) {
    throw new Error('Plugin is not installed');
  }

  try {
    await pluginManager.disablePlugin(project.linkedPluginId);
    console.log(`Disabled plugin: ${project.linkedPluginId}`);
  } catch (error) {
    console.error('Failed to disable plugin project:', error);
    throw error;
  }
}

/**
 * Enable a UI plugin project (if already installed)
 */
export async function enableUiPluginProject(project: PluginProject): Promise<void> {
  if (!project.linkedPluginId) {
    throw new Error('Plugin is not installed');
  }

  try {
    await pluginManager.enablePlugin(project.linkedPluginId);
    console.log(`Enabled plugin: ${project.linkedPluginId}`);
  } catch (error) {
    console.error('Failed to enable plugin project:', error);
    throw error;
  }
}

/**
 * Uninstall a UI plugin project
 */
export async function uninstallUiPluginProject(project: PluginProject): Promise<void> {
  if (!project.linkedPluginId) {
    throw new Error('Plugin is not installed');
  }

  try {
    await pluginManager.uninstallPlugin(project.linkedPluginId);
    project.linkedPluginId = undefined;
    updateProject(project);
    console.log(`Uninstalled plugin: ${project.uiManifest.id}`);
  } catch (error) {
    console.error('Failed to uninstall plugin project:', error);
    throw error;
  }
}

/**
 * Get the status of a plugin project
 */
export function getProjectStatus(project: PluginProject): {
  installed: boolean;
  enabled: boolean;
  error?: string;
} {
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
