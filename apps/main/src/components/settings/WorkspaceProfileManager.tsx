/**
 * Workspace Profile Manager
 *
 * Create, manage, and switch between workspace profiles/presets.
 * Part of Task 50 Phase 50.2 - Panel Configuration UI
 */

import { useState } from 'react';
import { useWorkspaceStore } from '../../stores/workspaceStore';

export function WorkspaceProfileManager() {
  const presets = useWorkspaceStore((s) => s.presets);
  const currentLayout = useWorkspaceStore((s) => s.currentLayout);
  const loadPreset = useWorkspaceStore((s) => s.loadPreset);
  const savePreset = useWorkspaceStore((s) => s.savePreset);
  const deletePreset = useWorkspaceStore((s) => s.deletePreset);

  const [newPresetName, setNewPresetName] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);

  const handleSavePreset = () => {
    if (newPresetName.trim()) {
      savePreset(newPresetName.trim());
      setNewPresetName('');
      setShowCreateForm(false);
    }
  };

  const handleDeletePreset = (id: string) => {
    if (confirm('Are you sure you want to delete this preset?')) {
      deletePreset(id);
    }
  };

  return (
    <div className="h-full flex flex-col bg-white dark:bg-neutral-900">
      {/* Header */}
      <div className="border-b border-neutral-200 dark:border-neutral-700 p-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold">Workspace Profiles</h2>
          <button
            onClick={() => setShowCreateForm(!showCreateForm)}
            className="px-3 py-1 bg-blue-500 hover:bg-blue-600 text-white rounded text-sm transition-colors"
          >
            {showCreateForm ? 'Cancel' : '+ New Profile'}
          </button>
        </div>

        {/* Create Form */}
        {showCreateForm && (
          <div className="p-4 bg-neutral-50 dark:bg-neutral-800 rounded-lg border border-neutral-200 dark:border-neutral-700">
            <h3 className="text-sm font-semibold mb-3">Create New Profile</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-neutral-600 dark:text-neutral-400 mb-1">
                  Profile Name
                </label>
                <input
                  type="text"
                  value={newPresetName}
                  onChange={(e) => setNewPresetName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSavePreset()}
                  placeholder="e.g., Testing Mode"
                  className="w-full px-3 py-2 border rounded text-sm bg-white dark:bg-neutral-900 border-neutral-300 dark:border-neutral-600"
                  autoFocus
                />
              </div>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                💡 This will save your current workspace layout as a new profile
              </p>
              <button
                onClick={handleSavePreset}
                disabled={!newPresetName.trim()}
                className="w-full px-3 py-2 bg-blue-500 hover:bg-blue-600 disabled:bg-neutral-300 disabled:cursor-not-allowed text-white rounded text-sm transition-colors"
              >
                Save Current Layout
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Profile List */}
      <div className="flex-1 overflow-y-auto p-4">
        {presets.length === 0 ? (
          <div className="text-center py-8 text-neutral-500">
            No profiles available. Create one to get started!
          </div>
        ) : (
          <div className="space-y-3">
            {presets.map((preset) => (
              <ProfileCard
                key={preset.id}
                preset={preset}
                onLoad={() => loadPreset(preset.id)}
                onDelete={() => handleDeletePreset(preset.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// Profile Card Component
function ProfileCard({
  preset,
  onLoad,
  onDelete,
}: {
  preset: any;
  onLoad: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="p-4 rounded-lg border-2 border-neutral-200 dark:border-neutral-700 hover:border-blue-500 dark:hover:border-blue-500 transition-all">
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          {preset.icon && <span className="text-2xl">{preset.icon}</span>}
          <div>
            <h3 className="font-semibold text-sm flex items-center gap-2">
              {preset.name}
              {preset.isDefault && (
                <span className="px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-full text-xs">
                  Default
                </span>
              )}
            </h3>
            {preset.description && (
              <p className="text-xs text-neutral-600 dark:text-neutral-400 mt-1">
                {preset.description}
              </p>
            )}
            {preset.createdAt && (
              <p className="text-xs text-neutral-500 dark:text-neutral-500 mt-1">
                Created: {new Date(preset.createdAt).toLocaleDateString()}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Layout Preview (simplified) */}
      <div className="mb-3 p-2 bg-neutral-100 dark:bg-neutral-800 rounded text-xs">
        <div className="text-neutral-600 dark:text-neutral-400">
          Layout: {preset.layout ? 'Custom' : 'Empty'}
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <button
          onClick={onLoad}
          className="flex-1 px-3 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded text-sm transition-colors"
        >
          Load Profile
        </button>
        {!preset.isDefault && (
          <button
            onClick={onDelete}
            className="px-3 py-2 bg-red-100 dark:bg-red-900/30 hover:bg-red-200 dark:hover:bg-red-900/50 text-red-700 dark:text-red-300 rounded text-sm transition-colors"
          >
            Delete
          </button>
        )}
      </div>
    </div>
  );
}
