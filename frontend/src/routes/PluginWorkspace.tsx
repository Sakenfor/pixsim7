/**
 * Plugin Workspace Route
 *
 * Phase 1: Browse installed plugins (read-only)
 * Phase 2: Create and edit UI plugin projects with live preview
 */

import { useState, useEffect } from 'react';
import { PluginBrowser } from '../components/plugins/PluginBrowser';
import type { PluginMeta } from '../lib/plugins/catalog';
import {
  loadProjects,
  createUiPluginProject,
  updateProject,
  deleteProject,
  installUiPluginProject,
  disableUiPluginProject,
  enableUiPluginProject,
  uninstallUiPluginProject,
  getProjectStatus,
  type PluginProject,
} from '../lib/plugins/projects';

type TabView = 'installed' | 'projects';

export function PluginWorkspaceRoute() {
  const [activeTab, setActiveTab] = useState<TabView>('installed');
  const [selectedPlugin, setSelectedPlugin] = useState<PluginMeta | null>(null);

  // Phase 2: Projects
  const [projects, setProjects] = useState<PluginProject[]>([]);
  const [selectedProject, setSelectedProject] = useState<PluginProject | null>(null);

  // Load projects on mount
  useEffect(() => {
    setProjects(loadProjects());
  }, []);

  // Refresh projects list
  const refreshProjects = () => {
    setProjects(loadProjects());
  };

  // Create new project
  const handleCreateProject = () => {
    const label = prompt('Enter plugin name:');
    if (!label || label.trim().length === 0) return;

    const project = createUiPluginProject(label.trim());
    refreshProjects();
    setSelectedProject(project);
  };

  // Delete project
  const handleDeleteProject = (project: PluginProject) => {
    if (!confirm(`Delete project "${project.label}"?`)) return;

    deleteProject(project.id);
    refreshProjects();
    if (selectedProject?.id === project.id) {
      setSelectedProject(null);
    }
  };

  return (
    <div className="h-full flex flex-col bg-neutral-50 dark:bg-neutral-900">
      {/* Header */}
      <div className="bg-white dark:bg-neutral-800 border-b border-neutral-200 dark:border-neutral-700 px-6 py-4">
        <h1 className="text-2xl font-semibold text-neutral-900 dark:text-neutral-100">
          Plugin Workspace
        </h1>
        <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-1">
          Browse installed plugins and develop custom UI plugins
        </p>

        {/* Tabs */}
        <div className="flex gap-4 mt-4 border-b border-neutral-200 dark:border-neutral-700">
          <button
            onClick={() => setActiveTab('installed')}
            className={`px-4 py-2 font-medium transition-colors border-b-2 ${
              activeTab === 'installed'
                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100'
            }`}
          >
            Installed Plugins
          </button>
          <button
            onClick={() => setActiveTab('projects')}
            className={`px-4 py-2 font-medium transition-colors border-b-2 ${
              activeTab === 'projects'
                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100'
            }`}
          >
            Projects ({projects.length})
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden flex">
        {/* Tab: Installed Plugins */}
        {activeTab === 'installed' && (
          <div className="flex-1 overflow-y-auto p-6">
            <PluginBrowser
              onSelectPlugin={setSelectedPlugin}
              selectedPluginId={selectedPlugin?.id}
            />
          </div>
        )}

        {/* Tab: Projects */}
        {activeTab === 'projects' && (
          <div className="flex-1 flex overflow-hidden">
            {/* Project list */}
            <div className="w-80 border-r border-neutral-200 dark:border-neutral-700 overflow-y-auto p-4 space-y-4">
              <button
                onClick={handleCreateProject}
                className="w-full px-4 py-3 bg-blue-500 hover:bg-blue-600 text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                <span>+</span>
                <span>New UI Plugin</span>
              </button>

              {projects.length === 0 ? (
                <div className="text-center py-8 text-neutral-500 dark:text-neutral-400 text-sm">
                  No projects yet. Create one to get started!
                </div>
              ) : (
                <div className="space-y-2">
                  {projects.map((project) => (
                    <ProjectCard
                      key={project.id}
                      project={project}
                      selected={selectedProject?.id === project.id}
                      onClick={() => setSelectedProject(project)}
                      onDelete={() => handleDeleteProject(project)}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Project editor */}
            <div className="flex-1 overflow-y-auto">
              {selectedProject ? (
                <ProjectEditor
                  project={selectedProject}
                  onUpdate={(updated) => {
                    updateProject(updated);
                    setSelectedProject(updated);
                    refreshProjects();
                  }}
                  onInstall={async () => {
                    await installUiPluginProject(selectedProject);
                    refreshProjects();
                    setSelectedProject({ ...selectedProject }); // Force re-render
                  }}
                  onDisable={async () => {
                    await disableUiPluginProject(selectedProject);
                    refreshProjects();
                    setSelectedProject({ ...selectedProject });
                  }}
                  onEnable={async () => {
                    await enableUiPluginProject(selectedProject);
                    refreshProjects();
                    setSelectedProject({ ...selectedProject });
                  }}
                  onUninstall={async () => {
                    await uninstallUiPluginProject(selectedProject);
                    refreshProjects();
                    setSelectedProject({ ...selectedProject });
                  }}
                />
              ) : (
                <div className="h-full flex items-center justify-center text-neutral-500 dark:text-neutral-400">
                  Select a project to edit
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Project card component
function ProjectCard({
  project,
  selected,
  onClick,
  onDelete,
}: {
  project: PluginProject;
  selected: boolean;
  onClick: () => void;
  onDelete: () => void;
}) {
  const status = getProjectStatus(project);

  return (
    <div
      className={`p-3 rounded-lg border transition-colors cursor-pointer ${
        selected
          ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
          : 'border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 hover:border-neutral-300 dark:hover:border-neutral-600'
      }`}
      onClick={onClick}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <h3 className="font-medium text-neutral-900 dark:text-neutral-100 truncate">
            {project.label}
          </h3>
          <p className="text-xs text-neutral-600 dark:text-neutral-400 mt-1">
            Updated {new Date(project.updatedAt).toLocaleDateString()}
          </p>
          {status.installed && (
            <span
              className={`inline-block mt-2 px-2 py-0.5 text-xs font-medium rounded ${
                status.enabled
                  ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300'
                  : 'bg-neutral-100 dark:bg-neutral-700 text-neutral-600 dark:text-neutral-400'
              }`}
            >
              {status.enabled ? 'Enabled' : 'Disabled'}
            </span>
          )}
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="text-neutral-400 hover:text-red-500 transition-colors"
        >
          ✕
        </button>
      </div>
    </div>
  );
}

// Project editor component
function ProjectEditor({
  project,
  onUpdate,
  onInstall,
  onDisable,
  onEnable,
  onUninstall,
}: {
  project: PluginProject;
  onUpdate: (project: PluginProject) => void;
  onInstall: () => Promise<void>;
  onDisable: () => Promise<void>;
  onEnable: () => Promise<void>;
  onUninstall: () => Promise<void>;
}) {
  const [isInstalling, setIsInstalling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const status = getProjectStatus(project);

  const handleInstall = async () => {
    setIsInstalling(true);
    setError(null);
    try {
      await onInstall();
    } catch (err: any) {
      setError(err.message || 'Failed to install plugin');
    } finally {
      setIsInstalling(false);
    }
  };

  const handleDisable = async () => {
    setIsInstalling(true);
    setError(null);
    try {
      await onDisable();
    } catch (err: any) {
      setError(err.message || 'Failed to disable plugin');
    } finally {
      setIsInstalling(false);
    }
  };

  const handleEnable = async () => {
    setIsInstalling(true);
    setError(null);
    try {
      await onEnable();
    } catch (err: any) {
      setError(err.message || 'Failed to enable plugin');
    } finally {
      setIsInstalling(false);
    }
  };

  const handleUninstall = async () => {
    if (!confirm('Uninstall this plugin?')) return;
    setIsInstalling(true);
    setError(null);
    try {
      await onUninstall();
    } catch (err: any) {
      setError(err.message || 'Failed to uninstall plugin');
    } finally {
      setIsInstalling(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">
          {project.label}
        </h2>
        <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-1">
          Editing UI plugin project
        </p>
      </div>

      {/* Status */}
      {status.installed && (
        <div
          className={`p-4 rounded-lg ${
            status.error
              ? 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800'
              : status.enabled
              ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800'
              : 'bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700'
          }`}
        >
          <div className="flex items-center gap-2">
            <span className="font-medium text-neutral-900 dark:text-neutral-100">
              Plugin Status:
            </span>
            <span
              className={`px-2 py-0.5 text-xs font-medium rounded ${
                status.enabled
                  ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300'
                  : 'bg-neutral-100 dark:bg-neutral-700 text-neutral-600 dark:text-neutral-400'
              }`}
            >
              {status.enabled ? 'Enabled' : 'Disabled'}
            </span>
          </div>
          {status.error && (
            <p className="text-sm text-red-700 dark:text-red-400 mt-2">{status.error}</p>
          )}
          <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-2">
            Overlays/menu items from this plugin will appear globally in the app (via PluginOverlays).
            Open Game2D or other routes to see them.
          </p>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="p-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
          <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
        </div>
      )}

      {/* Manifest */}
      <div className="space-y-3">
        <h3 className="font-medium text-neutral-900 dark:text-neutral-100">Manifest</h3>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
              ID
            </label>
            <input
              type="text"
              value={project.uiManifest.id}
              onChange={(e) =>
                onUpdate({
                  ...project,
                  uiManifest: { ...project.uiManifest, id: e.target.value },
                })
              }
              className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-600 rounded-md bg-white dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
              Name
            </label>
            <input
              type="text"
              value={project.uiManifest.name}
              onChange={(e) =>
                onUpdate({
                  ...project,
                  uiManifest: { ...project.uiManifest, name: e.target.value },
                })
              }
              className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-600 rounded-md bg-white dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
              Version
            </label>
            <input
              type="text"
              value={project.uiManifest.version}
              onChange={(e) =>
                onUpdate({
                  ...project,
                  uiManifest: { ...project.uiManifest, version: e.target.value },
                })
              }
              className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-600 rounded-md bg-white dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
              Author
            </label>
            <input
              type="text"
              value={project.uiManifest.author}
              onChange={(e) =>
                onUpdate({
                  ...project,
                  uiManifest: { ...project.uiManifest, author: e.target.value },
                })
              }
              className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-600 rounded-md bg-white dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
            Description
          </label>
          <textarea
            value={project.uiManifest.description}
            onChange={(e) =>
              onUpdate({
                ...project,
                uiManifest: { ...project.uiManifest, description: e.target.value },
              })
            }
            rows={2}
            className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-600 rounded-md bg-white dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Code Editor */}
      <div className="space-y-3">
        <h3 className="font-medium text-neutral-900 dark:text-neutral-100">Code</h3>
        <textarea
          value={project.code}
          onChange={(e) => onUpdate({ ...project, code: e.target.value })}
          rows={20}
          className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-600 rounded-md bg-white dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
          spellCheck={false}
        />
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        {!status.installed ? (
          <button
            onClick={handleInstall}
            disabled={isInstalling}
            className="px-4 py-2 bg-blue-500 hover:bg-blue-600 disabled:bg-neutral-400 text-white font-medium rounded-md transition-colors"
          >
            {isInstalling ? 'Installing...' : 'Install & Enable (Dev)'}
          </button>
        ) : (
          <>
            {status.enabled ? (
              <button
                onClick={handleDisable}
                disabled={isInstalling}
                className="px-4 py-2 bg-yellow-500 hover:bg-yellow-600 disabled:bg-neutral-400 text-white font-medium rounded-md transition-colors"
              >
                {isInstalling ? 'Disabling...' : 'Disable'}
              </button>
            ) : (
              <button
                onClick={handleEnable}
                disabled={isInstalling}
                className="px-4 py-2 bg-green-500 hover:bg-green-600 disabled:bg-neutral-400 text-white font-medium rounded-md transition-colors"
              >
                {isInstalling ? 'Enabling...' : 'Enable'}
              </button>
            )}
            <button
              onClick={handleInstall}
              disabled={isInstalling}
              className="px-4 py-2 bg-blue-500 hover:bg-blue-600 disabled:bg-neutral-400 text-white font-medium rounded-md transition-colors"
            >
              {isInstalling ? 'Reinstalling...' : 'Reinstall (Update)'}
            </button>
            <button
              onClick={handleUninstall}
              disabled={isInstalling}
              className="px-4 py-2 bg-red-500 hover:bg-red-600 disabled:bg-neutral-400 text-white font-medium rounded-md transition-colors"
            >
              {isInstalling ? 'Uninstalling...' : 'Uninstall'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
