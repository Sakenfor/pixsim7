/**
 * Interaction Preset Editor
 *
 * UI for managing interaction presets per-world.
 * Designers can create, edit, and delete reusable interaction configurations.
 */

import { useState, useMemo } from 'react';
import { Panel, Button, Input, Select, Badge } from '@pixsim7/ui';
import type { GameWorldDetail } from '../../lib/api/game';
import { interactionRegistry } from '../../lib/registries';
import { InteractionConfigForm } from '../../lib/game/interactions/InteractionConfigForm';
import type { InteractionPreset } from '../../lib/game/interactions/presets';
import {
  getWorldInteractionPresets,
  addInteractionPreset,
  updateInteractionPreset,
  deleteInteractionPreset,
  validatePreset,
  generatePresetId,
  PRESET_CATEGORIES,
  EXAMPLE_PRESETS,
  type PresetCategory,
} from '../../lib/game/interactions/presets';

interface InteractionPresetEditorProps {
  worldDetail: GameWorldDetail;
  onWorldUpdate: (world: GameWorldDetail) => void;
  onClose?: () => void;
}

type EditorMode = 'list' | 'create' | 'edit';

/**
 * Main Preset Editor Component
 */
export function InteractionPresetEditor({
  worldDetail,
  onWorldUpdate,
  onClose,
}: InteractionPresetEditorProps) {
  const [mode, setMode] = useState<EditorMode>('list');
  const [editingPreset, setEditingPreset] = useState<InteractionPreset | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Load presets from world
  const presets = useMemo(() => getWorldInteractionPresets(worldDetail), [worldDetail]);

  // Handle creating new preset
  const handleCreatePreset = (preset: InteractionPreset) => {
    setIsSaving(true);
    setError(null);

    addInteractionPreset(worldDetail.id, preset, worldDetail)
      .then((updatedWorld) => {
        onWorldUpdate(updatedWorld);
        setSuccessMessage('Preset created successfully!');
        setMode('list');
        setTimeout(() => setSuccessMessage(null), 3000);
      })
      .catch((err) => {
        setError(`Failed to create preset: ${err.message || String(err)}`);
      })
      .finally(() => {
        setIsSaving(false);
      });
  };

  // Handle updating existing preset
  const handleUpdatePreset = (presetId: string, updates: Partial<InteractionPreset>) => {
    setIsSaving(true);
    setError(null);

    updateInteractionPreset(worldDetail.id, presetId, updates, worldDetail)
      .then((updatedWorld) => {
        onWorldUpdate(updatedWorld);
        setSuccessMessage('Preset updated successfully!');
        setMode('list');
        setEditingPreset(null);
        setTimeout(() => setSuccessMessage(null), 3000);
      })
      .catch((err) => {
        setError(`Failed to update preset: ${err.message || String(err)}`);
      })
      .finally(() => {
        setIsSaving(false);
      });
  };

  // Handle deleting preset
  const handleDeletePreset = (presetId: string) => {
    if (!confirm('Are you sure you want to delete this preset?')) {
      return;
    }

    setIsSaving(true);
    setError(null);

    deleteInteractionPreset(worldDetail.id, presetId, worldDetail)
      .then((updatedWorld) => {
        onWorldUpdate(updatedWorld);
        setSuccessMessage('Preset deleted successfully!');
        setTimeout(() => setSuccessMessage(null), 3000);
      })
      .catch((err) => {
        setError(`Failed to delete preset: ${err.message || String(err)}`);
      })
      .finally(() => {
        setIsSaving(false);
      });
  };

  // Handle adding example preset
  const handleAddExample = (example: InteractionPreset) => {
    const newPreset: InteractionPreset = {
      ...example,
      id: generatePresetId(example.name),
    };

    handleCreatePreset(newPreset);
  };

  return (
    <Panel className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-neutral-800 dark:text-neutral-200">
            Interaction Presets
          </h2>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            Create reusable interaction configurations for world: {worldDetail.name}
          </p>
        </div>
        {onClose && (
          <Button size="sm" variant="ghost" onClick={onClose}>
            ✕
          </Button>
        )}
      </div>

      {error && (
        <div className="p-3 bg-red-100 dark:bg-red-900/30 border border-red-300 dark:border-red-700 rounded text-sm text-red-800 dark:text-red-200">
          {error}
        </div>
      )}

      {successMessage && (
        <div className="p-3 bg-green-100 dark:bg-green-900/30 border border-green-300 dark:border-green-700 rounded text-sm text-green-800 dark:text-green-200">
          {successMessage}
        </div>
      )}

      {mode === 'list' && (
        <PresetList
          presets={presets}
          onCreateNew={() => setMode('create')}
          onEdit={(preset) => {
            setEditingPreset(preset);
            setMode('edit');
          }}
          onDelete={handleDeletePreset}
          onAddExample={handleAddExample}
          isSaving={isSaving}
        />
      )}

      {mode === 'create' && (
        <PresetForm
          mode="create"
          onSave={handleCreatePreset}
          onCancel={() => setMode('list')}
          isSaving={isSaving}
        />
      )}

      {mode === 'edit' && editingPreset && (
        <PresetForm
          mode="edit"
          preset={editingPreset}
          onSave={(preset) => handleUpdatePreset(preset.id, preset)}
          onCancel={() => {
            setEditingPreset(null);
            setMode('list');
          }}
          isSaving={isSaving}
        />
      )}
    </Panel>
  );
}

/**
 * Preset List View
 */
interface PresetListProps {
  presets: InteractionPreset[];
  onCreateNew: () => void;
  onEdit: (preset: InteractionPreset) => void;
  onDelete: (presetId: string) => void;
  onAddExample: (example: InteractionPreset) => void;
  isSaving: boolean;
}

function PresetList({ presets, onCreateNew, onEdit, onDelete, onAddExample, isSaving }: PresetListProps) {
  const [filterCategory, setFilterCategory] = useState<string>('all');

  const filteredPresets = useMemo(() => {
    if (filterCategory === 'all') return presets;
    return presets.filter((p) => p.category === filterCategory);
  }, [presets, filterCategory]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Select
            size="sm"
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
          >
            <option value="all">All Categories</option>
            {Object.entries(PRESET_CATEGORIES).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </Select>
          <span className="text-xs text-neutral-500 dark:text-neutral-400">
            {filteredPresets.length} preset{filteredPresets.length !== 1 ? 's' : ''}
          </span>
        </div>
        <Button size="sm" variant="primary" onClick={onCreateNew} disabled={isSaving}>
          + New Preset
        </Button>
      </div>

      {presets.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-sm text-neutral-500 dark:text-neutral-400 mb-4">
            No presets defined yet. Create your first preset or add an example.
          </p>
          <div className="flex flex-col gap-2 items-center">
            <Button size="sm" variant="primary" onClick={onCreateNew}>
              Create First Preset
            </Button>
            <div className="text-xs text-neutral-500 dark:text-neutral-400">or add an example:</div>
            <div className="flex flex-wrap gap-2 justify-center">
              {EXAMPLE_PRESETS.map((example) => (
                <Button
                  key={example.id}
                  size="sm"
                  variant="secondary"
                  onClick={() => onAddExample(example)}
                  disabled={isSaving}
                >
                  {example.icon} {example.name}
                </Button>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="space-y-2">
            {filteredPresets.map((preset) => (
              <div
                key={preset.id}
                className="p-3 border border-neutral-300 dark:border-neutral-700 rounded hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      {preset.icon && <span className="text-lg">{preset.icon}</span>}
                      <h3 className="font-semibold text-sm text-neutral-800 dark:text-neutral-200">
                        {preset.name}
                      </h3>
                      {preset.category && (
                        <Badge color="blue" className="text-xs">
                          {PRESET_CATEGORIES[preset.category as PresetCategory] || preset.category}
                        </Badge>
                      )}
                    </div>
                    {preset.description && (
                      <p className="text-xs text-neutral-600 dark:text-neutral-400 mb-2">
                        {preset.description}
                      </p>
                    )}
                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-neutral-500 dark:text-neutral-400">
                        Type: {preset.interactionId}
                      </span>
                      {preset.tags && preset.tags.length > 0 && (
                        <>
                          <span className="text-neutral-400">•</span>
                          <div className="flex gap-1">
                            {preset.tags.slice(0, 3).map((tag) => (
                              <Badge key={tag} color="gray" className="text-[10px]">
                                {tag}
                              </Badge>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => onEdit(preset)}
                      disabled={isSaving}
                    >
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => onDelete(preset.id)}
                      disabled={isSaving}
                      className="text-red-600 hover:text-red-700"
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {presets.length > 0 && (
            <div className="pt-2 border-t border-neutral-300 dark:border-neutral-700">
              <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-2">
                Add example presets:
              </p>
              <div className="flex flex-wrap gap-2">
                {EXAMPLE_PRESETS.map((example) => (
                  <Button
                    key={example.id}
                    size="sm"
                    variant="secondary"
                    onClick={() => onAddExample(example)}
                    disabled={isSaving}
                  >
                    {example.icon} {example.name}
                  </Button>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/**
 * Preset Creation/Edit Form
 */
interface PresetFormProps {
  mode: 'create' | 'edit';
  preset?: InteractionPreset;
  onSave: (preset: InteractionPreset) => void;
  onCancel: () => void;
  isSaving: boolean;
}

function PresetForm({ mode, preset, onSave, onCancel, isSaving }: PresetFormProps) {
  const [name, setName] = useState(preset?.name || '');
  const [description, setDescription] = useState(preset?.description || '');
  const [interactionId, setInteractionId] = useState(preset?.interactionId || '');
  const [category, setCategory] = useState<string>(preset?.category || 'custom');
  const [icon, setIcon] = useState(preset?.icon || '');
  const [tags, setTags] = useState<string>(preset?.tags?.join(', ') || '');
  const [config, setConfig] = useState<Record<string, any>>(preset?.config || {});

  const availablePlugins = interactionRegistry.getAll();
  const selectedPlugin = interactionId ? interactionRegistry.get(interactionId) : null;

  const handleSubmit = () => {
    const newPreset: InteractionPreset = {
      id: preset?.id || generatePresetId(name),
      name,
      description,
      interactionId,
      category,
      icon,
      tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
      config,
    };

    const validationError = validatePreset(newPreset);
    if (validationError) {
      alert(validationError);
      return;
    }

    onSave(newPreset);
  };

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-neutral-800 dark:text-neutral-200">
        {mode === 'create' ? 'Create New Preset' : 'Edit Preset'}
      </h3>

      <div className="space-y-3">
        <div>
          <label className="block text-sm font-medium mb-1">Preset Name *</label>
          <Input
            value={name}
            onChange={(e: any) => setName(e.target.value)}
            placeholder="e.g., Flirt (Friendly)"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Description</label>
          <Input
            value={description}
            onChange={(e: any) => setDescription(e.target.value)}
            placeholder="Describe what this preset does"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium mb-1">Icon/Emoji</label>
            <Input
              value={icon}
              onChange={(e: any) => setIcon(e.target.value)}
              placeholder="e.g., 💕"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Category</label>
            <Select value={category} onChange={(e) => setCategory(e.target.value)}>
              {Object.entries(PRESET_CATEGORIES).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Tags (comma-separated)</label>
          <Input
            value={tags}
            onChange={(e: any) => setTags(e.target.value)}
            placeholder="e.g., romance, friendly, low-risk"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Interaction Type *</label>
          <Select
            value={interactionId}
            onChange={(e) => {
              const newInteractionId = e.target.value;
              setInteractionId(newInteractionId);
              // Reset config when changing interaction type
              const plugin = interactionRegistry.get(newInteractionId);
              if (plugin) {
                setConfig(plugin.defaultConfig);
              }
            }}
          >
            <option value="">Select interaction type...</option>
            {availablePlugins.map((plugin) => (
              <option key={plugin.id} value={plugin.id}>
                {plugin.icon && `${plugin.icon} `}
                {plugin.name}
              </option>
            ))}
          </Select>
        </div>

        {selectedPlugin && (
          <div className="pt-3 border-t border-neutral-300 dark:border-neutral-700">
            <h4 className="text-sm font-semibold mb-2">Configure Interaction</h4>
            <InteractionConfigForm
              plugin={selectedPlugin}
              config={{ ...selectedPlugin.defaultConfig, ...config }}
              onConfigChange={setConfig}
            />
          </div>
        )}
      </div>

      <div className="flex gap-2 pt-2 border-t border-neutral-300 dark:border-neutral-700">
        <Button variant="primary" onClick={handleSubmit} disabled={isSaving || !name || !interactionId}>
          {isSaving ? 'Saving...' : mode === 'create' ? 'Create Preset' : 'Save Changes'}
        </Button>
        <Button variant="secondary" onClick={onCancel} disabled={isSaving}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
