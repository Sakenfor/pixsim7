/**
 * Plugin Workspace Route (Dynamic Multi-Kind Support)
 *
 * Phase 1: Browse installed plugins (read-only)
 * Phase 2-5: Create and edit all plugin kinds with dynamic UI
 *
 * Design: Metadata-driven UI - no hardcoded plugin types
 */

import { useState, useEffect, useRef } from 'react';
import { PluginBrowser } from '../components/plugins/PluginBrowser';
import { CapabilityBrowser } from '../components/capabilities/CapabilityBrowser';
import type { PluginMeta } from '../lib/plugins/catalog';
import {
  loadProjects,
  updateProject,
  deleteProject,
  getProjectStatus,
  type PluginProject,
  type PluginProjectKind,
  createUiPluginProject,
  createInteractionProject,
  createNodeTypeProject,
  createGalleryToolProject,
  createWorldToolProject,
  installUiPluginProject,
  disableUiPluginProject,
  enableUiPluginProject,
  uninstallUiPluginProject,
  exportProject,
  importProject,
  downloadProjectAsJSON,
  type UIPluginProject,
  type InteractionPluginProject,
  type NodeTypePluginProject,
  type GalleryToolPluginProject,
  type WorldToolPluginProject,
} from '../lib/plugins/projects';
import {
  InteractionTestHarness,
  NodeTypeTestHarness,
  GalleryToolTestHarness,
  WorldToolTestHarness,
} from '../components/plugins/PluginTestHarnesses';

type TabView = 'installed' | 'projects' | 'capabilities';

// ============================================================================
// Plugin Kind Configuration (Single Source of Truth)
// ============================================================================

interface PluginKindConfig {
  kind: PluginProjectKind;
  label: string;
  icon: string;
  createProject: (label: string) => PluginProject;
  description: string;
}

const PLUGIN_KIND_CONFIGS: PluginKindConfig[] = [
  {
    kind: 'ui-plugin',
    label: 'UI Plugin',
    icon: '🎨',
    createProject: createUiPluginProject,
    description: 'Custom UI overlays and menu items',
  },
  {
    kind: 'interaction',
    label: 'Interaction',
    icon: '💬',
    createProject: createInteractionProject,
    description: 'NPC interaction behaviors',
  },
  {
    kind: 'node-type',
    label: 'Node Type',
    icon: '🔷',
    createProject: createNodeTypeProject,
    description: 'Graph node types for scenes/arcs/worlds',
  },
  {
    kind: 'gallery-tool',
    label: 'Gallery Tool',
    icon: '🖼️',
    createProject: createGalleryToolProject,
    description: 'Asset gallery extensions',
  },
  {
    kind: 'world-tool',
    label: 'World Tool',
    icon: '🌍',
    createProject: createWorldToolProject,
    description: 'World management tools',
  },
];

// ============================================================================
// Main Component
// ============================================================================

export function PluginWorkspaceRoute() {
  const [activeTab, setActiveTab] = useState<TabView>('installed');
  const [selectedPlugin, setSelectedPlugin] = useState<PluginMeta | null>(null);

  // Projects
  const [projects, setProjects] = useState<PluginProject[]>([]);
  const [selectedProject, setSelectedProject] = useState<PluginProject | null>(null);

  // UI state
  const [showCreateMenu, setShowCreateMenu] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load projects on mount
  useEffect(() => {
    setProjects(loadProjects());
  }, []);

  // Refresh projects list
  const refreshProjects = () => {
    const loaded = loadProjects();
    setProjects(loaded);

    // Update selected project if it still exists
    if (selectedProject) {
      const updated = loaded.find((p) => p.id === selectedProject.id);
      if (updated) {
        setSelectedProject(updated);
      }
    }
  };

  // Create new project (dynamic)
  const handleCreateProject = (config: PluginKindConfig) => {
    const label = prompt(`Enter ${config.label} name:`);
    if (!label || label.trim().length === 0) return;

    const project = config.createProject(label.trim());
    refreshProjects();
    setSelectedProject(project);
    setShowCreateMenu(false);
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

  // Export project
  const handleExportProject = (project: PluginProject) => {
    downloadProjectAsJSON(project);
  };

  // Import project
  const handleImportProject = async (file: File) => {
    try {
      const text = await file.text();
      const exportData = JSON.parse(text);
      const newProject = importProject(exportData);
      refreshProjects();
      setSelectedProject(newProject);
    } catch (err: any) {
      alert(`Failed to import project: ${err.message}`);
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
          Browse installed plugins and develop custom plugins of all kinds
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
          <button
            onClick={() => setActiveTab('capabilities')}
            className={`px-4 py-2 font-medium transition-colors border-b-2 ${
              activeTab === 'capabilities'
                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100'
            }`}
          >
            Capabilities
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
              {/* Dynamic Create Button */}
              <div className="relative">
                <button
                  onClick={() => setShowCreateMenu(!showCreateMenu)}
                  className="w-full px-4 py-3 bg-blue-500 hover:bg-blue-600 text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
                >
                  <span>+</span>
                  <span>New Plugin</span>
                  <span className="text-xs">▼</span>
                </button>

                {/* Dropdown Menu */}
                {showCreateMenu && (
                  <div className="absolute z-10 mt-2 w-full bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg shadow-lg overflow-hidden">
                    {PLUGIN_KIND_CONFIGS.map((config) => (
                      <button
                        key={config.kind}
                        onClick={() => handleCreateProject(config)}
                        className="w-full px-4 py-3 text-left hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors flex items-center gap-3"
                      >
                        <span className="text-2xl">{config.icon}</span>
                        <div className="flex-1">
                          <div className="font-medium text-neutral-900 dark:text-neutral-100">
                            {config.label}
                          </div>
                          <div className="text-xs text-neutral-600 dark:text-neutral-400">
                            {config.description}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Import Button */}
              <div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json"
                  onChange={(e) => e.target.files?.[0] && handleImportProject(e.target.files[0])}
                  style={{ display: 'none' }}
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full px-4 py-2 bg-neutral-200 dark:bg-neutral-700 hover:bg-neutral-300 dark:hover:bg-neutral-600 text-neutral-900 dark:text-neutral-100 font-medium rounded-lg transition-colors"
                >
                  📥 Import Project
                </button>
              </div>

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
                      onExport={() => handleExportProject(project)}
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
                    refreshProjects();
                  }}
                  onRefresh={refreshProjects}
                />
              ) : (
                <div className="h-full flex items-center justify-center text-neutral-500 dark:text-neutral-400">
                  Select a project to edit
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab: Capabilities */}
        {activeTab === 'capabilities' && (
          <div className="flex-1 overflow-y-auto">
            <CapabilityBrowser />
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Project Card Component (Dynamic)
// ============================================================================

function ProjectCard({
  project,
  selected,
  onClick,
  onDelete,
  onExport,
}: {
  project: PluginProject;
  selected: boolean;
  onClick: () => void;
  onDelete: () => void;
  onExport: () => void;
}) {
  const status = getProjectStatus(project);
  const config = PLUGIN_KIND_CONFIGS.find((c) => c.kind === project.kind);

  return (
    <div
      className={`p-3 rounded-lg border transition-colors cursor-pointer ${
        selected
          ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
          : 'border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 hover:border-neutral-300 dark:hover:border-neutral-600'
      }`}
      onClick={onClick}
    >
      <div className="flex items-start gap-2">
        <span className="text-xl">{config?.icon || '📦'}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-medium text-neutral-900 dark:text-neutral-100 truncate">
              {project.label}
            </h3>
            <span className="text-xs px-1.5 py-0.5 rounded bg-neutral-200 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-300">
              {config?.label || project.kind}
            </span>
          </div>
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
        <div className="flex flex-col gap-1">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onExport();
            }}
            className="text-neutral-400 hover:text-blue-500 transition-colors text-sm"
            title="Export"
          >
            📥
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="text-neutral-400 hover:text-red-500 transition-colors"
            title="Delete"
          >
            ✕
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Project Editor Component (Dynamic Multi-Kind)
// ============================================================================

function ProjectEditor({
  project,
  onUpdate,
  onRefresh,
}: {
  project: PluginProject;
  onUpdate: (project: PluginProject) => void;
  onRefresh: () => void;
}) {
  const config = PLUGIN_KIND_CONFIGS.find((c) => c.kind === project.kind);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <span className="text-3xl">{config?.icon || '📦'}</span>
          <div>
            <h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">
              {project.label}
            </h2>
            <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-1">
              {config?.description || `Editing ${project.kind} project`}
            </p>
          </div>
        </div>
      </div>

      {/* Kind-Specific Editor (Dynamic Dispatch) */}
      {project.kind === 'ui-plugin' && (
        <UIPluginEditor project={project} onUpdate={onUpdate} onRefresh={onRefresh} />
      )}
      {project.kind === 'interaction' && (
        <InteractionEditor project={project} onUpdate={onUpdate} />
      )}
      {project.kind === 'node-type' && (
        <NodeTypeEditor project={project} onUpdate={onUpdate} />
      )}
      {project.kind === 'gallery-tool' && (
        <GalleryToolEditor project={project} onUpdate={onUpdate} />
      )}
      {project.kind === 'world-tool' && (
        <WorldToolEditor project={project} onUpdate={onUpdate} />
      )}
    </div>
  );
}

// ============================================================================
// UI Plugin Editor
// ============================================================================

function UIPluginEditor({
  project,
  onUpdate,
  onRefresh,
}: {
  project: UIPluginProject;
  onUpdate: (project: PluginProject) => void;
  onRefresh: () => void;
}) {
  const [isInstalling, setIsInstalling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const status = getProjectStatus(project);

  const handleInstall = async () => {
    setIsInstalling(true);
    setError(null);
    try {
      await installUiPluginProject(project);
      onRefresh();
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
      await disableUiPluginProject(project);
      onRefresh();
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
      await enableUiPluginProject(project);
      onRefresh();
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
      await uninstallUiPluginProject(project);
      onRefresh();
    } catch (err: any) {
      setError(err.message || 'Failed to uninstall plugin');
    } finally {
      setIsInstalling(false);
    }
  };

  return (
    <>
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
            Overlays/menu items from this plugin will appear globally in the app.
          </p>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="p-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
          <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
        </div>
      )}

      {/* Manifest Editor */}
      <MetadataEditor
        label="Manifest"
        fields={[
          {
            key: 'id',
            label: 'ID',
            value: project.uiManifest.id,
            onChange: (v) =>
              onUpdate({ ...project, uiManifest: { ...project.uiManifest, id: v } }),
          },
          {
            key: 'name',
            label: 'Name',
            value: project.uiManifest.name,
            onChange: (v) =>
              onUpdate({ ...project, uiManifest: { ...project.uiManifest, name: v } }),
          },
          {
            key: 'version',
            label: 'Version',
            value: project.uiManifest.version,
            onChange: (v) =>
              onUpdate({ ...project, uiManifest: { ...project.uiManifest, version: v } }),
          },
          {
            key: 'author',
            label: 'Author',
            value: project.uiManifest.author,
            onChange: (v) =>
              onUpdate({ ...project, uiManifest: { ...project.uiManifest, author: v } }),
          },
          {
            key: 'description',
            label: 'Description',
            value: project.uiManifest.description,
            onChange: (v) =>
              onUpdate({ ...project, uiManifest: { ...project.uiManifest, description: v } }),
            multiline: true,
          },
        ]}
      />

      {/* Code Editor */}
      <CodeEditor
        code={project.code}
        onChange={(code) => onUpdate({ ...project, code })}
      />

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
    </>
  );
}

// ============================================================================
// Interaction Editor
// ============================================================================

function InteractionEditor({
  project,
  onUpdate,
}: {
  project: InteractionPluginProject;
  onUpdate: (project: PluginProject) => void;
}) {
  return (
    <>
      {/* Metadata */}
      <MetadataEditor
        label="Metadata"
        fields={[
          {
            key: 'id',
            label: 'ID',
            value: project.metadata.id,
            onChange: (v) =>
              onUpdate({ ...project, metadata: { ...project.metadata, id: v } }),
          },
          {
            key: 'name',
            label: 'Name',
            value: project.metadata.name,
            onChange: (v) =>
              onUpdate({ ...project, metadata: { ...project.metadata, name: v } }),
          },
          {
            key: 'description',
            label: 'Description',
            value: project.metadata.description || '',
            onChange: (v) =>
              onUpdate({ ...project, metadata: { ...project.metadata, description: v } }),
            multiline: true,
          },
          {
            key: 'category',
            label: 'Category',
            value: project.metadata.category || '',
            onChange: (v) =>
              onUpdate({ ...project, metadata: { ...project.metadata, category: v } }),
          },
        ]}
      />

      {/* Code */}
      <CodeEditor
        code={project.code}
        onChange={(code) => onUpdate({ ...project, code })}
      />

      {/* Test Harness */}
      <div className="border-t border-neutral-200 dark:border-neutral-700 pt-6">
        <InteractionTestHarness project={project} />
      </div>
    </>
  );
}

// ============================================================================
// Node Type Editor
// ============================================================================

function NodeTypeEditor({
  project,
  onUpdate,
}: {
  project: NodeTypePluginProject;
  onUpdate: (project: PluginProject) => void;
}) {
  return (
    <>
      {/* Metadata */}
      <MetadataEditor
        label="Metadata"
        fields={[
          {
            key: 'id',
            label: 'ID',
            value: project.metadata.id,
            onChange: (v) =>
              onUpdate({ ...project, metadata: { ...project.metadata, id: v } }),
          },
          {
            key: 'name',
            label: 'Name',
            value: project.metadata.name,
            onChange: (v) =>
              onUpdate({ ...project, metadata: { ...project.metadata, name: v } }),
          },
          {
            key: 'icon',
            label: 'Icon',
            value: project.metadata.icon || '',
            onChange: (v) =>
              onUpdate({ ...project, metadata: { ...project.metadata, icon: v } }),
          },
          {
            key: 'category',
            label: 'Category',
            value: project.metadata.category || '',
            onChange: (v) =>
              onUpdate({ ...project, metadata: { ...project.metadata, category: v } }),
          },
          {
            key: 'scope',
            label: 'Scope',
            value: project.metadata.scope || 'scene',
            onChange: (v) =>
              onUpdate({ ...project, metadata: { ...project.metadata, scope: v as any } }),
          },
        ]}
      />

      {/* Code */}
      <CodeEditor
        code={project.code}
        onChange={(code) => onUpdate({ ...project, code })}
      />

      {/* Test Harness */}
      <div className="border-t border-neutral-200 dark:border-neutral-700 pt-6">
        <NodeTypeTestHarness project={project} />
      </div>
    </>
  );
}

// ============================================================================
// Gallery Tool Editor
// ============================================================================

function GalleryToolEditor({
  project,
  onUpdate,
}: {
  project: GalleryToolPluginProject;
  onUpdate: (project: PluginProject) => void;
}) {
  return (
    <>
      {/* Metadata */}
      <MetadataEditor
        label="Metadata"
        fields={[
          {
            key: 'id',
            label: 'ID',
            value: project.metadata.id,
            onChange: (v) =>
              onUpdate({ ...project, metadata: { ...project.metadata, id: v } }),
          },
          {
            key: 'name',
            label: 'Name',
            value: project.metadata.name,
            onChange: (v) =>
              onUpdate({ ...project, metadata: { ...project.metadata, name: v } }),
          },
          {
            key: 'icon',
            label: 'Icon',
            value: project.metadata.icon || '',
            onChange: (v) =>
              onUpdate({ ...project, metadata: { ...project.metadata, icon: v } }),
          },
          {
            key: 'category',
            label: 'Category',
            value: project.metadata.category || '',
            onChange: (v) =>
              onUpdate({ ...project, metadata: { ...project.metadata, category: v } }),
          },
          {
            key: 'description',
            label: 'Description',
            value: project.metadata.description || '',
            onChange: (v) =>
              onUpdate({ ...project, metadata: { ...project.metadata, description: v } }),
            multiline: true,
          },
        ]}
      />

      {/* Code */}
      <CodeEditor
        code={project.code}
        onChange={(code) => onUpdate({ ...project, code })}
      />

      {/* Test Harness */}
      <div className="border-t border-neutral-200 dark:border-neutral-700 pt-6">
        <GalleryToolTestHarness project={project} />
      </div>
    </>
  );
}

// ============================================================================
// World Tool Editor
// ============================================================================

function WorldToolEditor({
  project,
  onUpdate,
}: {
  project: WorldToolPluginProject;
  onUpdate: (project: PluginProject) => void;
}) {
  return (
    <>
      {/* Metadata */}
      <MetadataEditor
        label="Metadata"
        fields={[
          {
            key: 'id',
            label: 'ID',
            value: project.metadata.id,
            onChange: (v) =>
              onUpdate({ ...project, metadata: { ...project.metadata, id: v } }),
          },
          {
            key: 'name',
            label: 'Name',
            value: project.metadata.name,
            onChange: (v) =>
              onUpdate({ ...project, metadata: { ...project.metadata, name: v } }),
          },
          {
            key: 'icon',
            label: 'Icon',
            value: project.metadata.icon || '',
            onChange: (v) =>
              onUpdate({ ...project, metadata: { ...project.metadata, icon: v } }),
          },
          {
            key: 'category',
            label: 'Category',
            value: project.metadata.category || '',
            onChange: (v) =>
              onUpdate({ ...project, metadata: { ...project.metadata, category: v } }),
          },
          {
            key: 'description',
            label: 'Description',
            value: project.metadata.description || '',
            onChange: (v) =>
              onUpdate({ ...project, metadata: { ...project.metadata, description: v } }),
            multiline: true,
          },
        ]}
      />

      {/* Code */}
      <CodeEditor
        code={project.code}
        onChange={(code) => onUpdate({ ...project, code })}
      />

      {/* Test Harness */}
      <div className="border-t border-neutral-200 dark:border-neutral-700 pt-6">
        <WorldToolTestHarness project={project} />
      </div>
    </>
  );
}

// ============================================================================
// Reusable Components
// ============================================================================

interface MetadataField {
  key: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  multiline?: boolean;
}

function MetadataEditor({ label, fields }: { label: string; fields: MetadataField[] }) {
  return (
    <div className="space-y-3">
      <h3 className="font-medium text-neutral-900 dark:text-neutral-100">{label}</h3>
      <div className="grid grid-cols-2 gap-3">
        {fields.map((field) =>
          field.multiline ? (
            <div key={field.key} className="col-span-2">
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                {field.label}
              </label>
              <textarea
                value={field.value}
                onChange={(e) => field.onChange(e.target.value)}
                rows={2}
                className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-600 rounded-md bg-white dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          ) : (
            <div key={field.key}>
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                {field.label}
              </label>
              <input
                type="text"
                value={field.value}
                onChange={(e) => field.onChange(e.target.value)}
                className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-600 rounded-md bg-white dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          )
        )}
      </div>
    </div>
  );
}

function CodeEditor({ code, onChange }: { code: string; onChange: (code: string) => void }) {
  return (
    <div className="space-y-3">
      <h3 className="font-medium text-neutral-900 dark:text-neutral-100">Code</h3>
      <textarea
        value={code}
        onChange={(e) => onChange(e.target.value)}
        rows={20}
        className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-600 rounded-md bg-white dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
        spellCheck={false}
      />
    </div>
  );
}
