import { useState, useMemo, useRef } from 'react';
import { Button, Panel, Input, Select, Badge } from '@pixsim7/shared.ui';
import type { GameWorldDetail } from '@/lib/api/game';
import { saveGameWorldMeta } from '@/lib/api/game';
import { interactionRegistry } from '@/lib/registries';
import { InteractionConfigForm } from '@/lib/game/interactions/InteractionConfigForm';
import {
  getCombinedPresets,
  setWorldInteractionPresets,
  generatePresetId,
  getGlobalInteractionPresets,
  saveGlobalInteractionPresets,
  promotePresetToGlobal,
  copyPresetToWorld,
  downloadPresetsAsJSON,
  importPresetsFromFile,
  type InteractionPreset,
  type PresetWithScope,
  type ConflictResolution,
} from '@/lib/game/interactions/presets';

interface InteractionPresetEditorProps {
  world: GameWorldDetail;
  onWorldUpdate: (world: GameWorldDetail) => void;
}

export function InteractionPresetEditor({ world, onWorldUpdate }: InteractionPresetEditorProps) {
  const [presets, setPresets] = useState<PresetWithScope[]>(() => getCombinedPresets(world));
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null);
  const [selectedScope, setSelectedScope] = useState<'global' | 'world' | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scopeFilter, setScopeFilter] = useState<'all' | 'global' | 'world'>('all');

  // New preset form state
  const [newPresetName, setNewPresetName] = useState('');
  const [newPresetInteractionId, setNewPresetInteractionId] = useState('');
  const [newPresetCategory, setNewPresetCategory] = useState('');
  const [newPresetDescription, setNewPresetDescription] = useState('');
  const [newPresetConfig, setNewPresetConfig] = useState<any>(null);
  const [newPresetScope, setNewPresetScope] = useState<'global' | 'world'>('world');

  // Import/Export state
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [importTarget, setImportTarget] = useState<'global' | 'world'>('world');
  const [importConflictResolution, setImportConflictResolution] = useState<ConflictResolution>('rename');
  const [isImporting, setIsImporting] = useState(false);
  const [importSuccess, setImportSuccess] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const selectedPreset = useMemo(
    () => presets.find(p => p.id === selectedPresetId && p.scope === selectedScope) || null,
    [presets, selectedPresetId, selectedScope]
  );

  const filteredPresets = useMemo(() => {
    if (scopeFilter === 'all') return presets;
    return presets.filter(p => p.scope === scopeFilter);
  }, [presets, scopeFilter]);

  const selectedPlugin = useMemo(() => {
    if (isCreating && newPresetInteractionId) {
      return interactionRegistry.get(newPresetInteractionId);
    }
    if (selectedPreset) {
      return interactionRegistry.get(selectedPreset.interactionId);
    }
    return null;
  }, [isCreating, newPresetInteractionId, selectedPreset]);

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);
    try {
      // Save world presets
      const worldPresets = presets.filter(p => p.scope === 'world');
      const updatedWorld = setWorldInteractionPresets(world, worldPresets);
      await saveGameWorldMeta(world.id, updatedWorld.meta!);
      onWorldUpdate(updatedWorld);

      // Save global presets
      const globalPresets = presets.filter(p => p.scope === 'global');
      saveGlobalInteractionPresets(globalPresets);
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setIsSaving(false);
    }
  };

  const handleCreatePreset = () => {
    if (!newPresetName.trim()) {
      setError('Preset name is required');
      return;
    }
    if (!newPresetInteractionId) {
      setError('Please select an interaction plugin');
      return;
    }

    const plugin = interactionRegistry.get(newPresetInteractionId);
    if (!plugin) {
      setError(`Unknown interaction plugin: ${newPresetInteractionId}`);
      return;
    }

    const config = newPresetConfig || { ...plugin.defaultConfig, enabled: true };

    const newPreset: PresetWithScope = {
      id: generatePresetId(newPresetName),
      name: newPresetName,
      interactionId: newPresetInteractionId,
      config,
      category: newPresetCategory || undefined,
      description: newPresetDescription || undefined,
      scope: newPresetScope,
    };

    setPresets([...presets, newPreset]);
    setSelectedPresetId(newPreset.id);
    setSelectedScope(newPreset.scope);
    setIsCreating(false);
    setNewPresetName('');
    setNewPresetInteractionId('');
    setNewPresetCategory('');
    setNewPresetDescription('');
    setNewPresetConfig(null);
    setNewPresetScope('world');
    setError(null);
  };

  const handleUpdatePreset = (
    presetId: string,
    scope: 'global' | 'world',
    updates: Partial<Omit<PresetWithScope, 'id' | 'scope'>>
  ) => {
    setPresets(prevPresets =>
      prevPresets.map(p => (p.id === presetId && p.scope === scope ? { ...p, ...updates } : p))
    );
  };

  const handleDeletePreset = (presetId: string, scope: 'global' | 'world') => {
    setPresets(prevPresets => prevPresets.filter(p => !(p.id === presetId && p.scope === scope)));
    if (selectedPresetId === presetId && selectedScope === scope) {
      setSelectedPresetId(null);
      setSelectedScope(null);
    }
  };

  const handlePromoteToGlobal = (preset: PresetWithScope) => {
    if (preset.scope === 'global') return;

    try {
      const newId = generatePresetId(preset.name);
      const globalPreset: PresetWithScope = { ...preset, id: newId, scope: 'global' };
      setPresets([...presets, globalPreset]);
      setError(null);
    } catch (e: any) {
      setError(String(e?.message ?? e));
    }
  };

  const handleCopyToWorld = (preset: PresetWithScope) => {
    if (preset.scope === 'world') return;

    try {
      const newId = generatePresetId(preset.name);
      const worldPreset: PresetWithScope = { ...preset, id: newId, scope: 'world' };
      setPresets([...presets, worldPreset]);
      setError(null);
    } catch (e: any) {
      setError(String(e?.message ?? e));
    }
  };

  const handleStartCreate = () => {
    setIsCreating(true);
    setSelectedPresetId(null);
    setSelectedScope(null);
    setError(null);
  };

  const handleCancelCreate = () => {
    setIsCreating(false);
    setNewPresetName('');
    setNewPresetInteractionId('');
    setNewPresetCategory('');
    setNewPresetDescription('');
    setNewPresetConfig(null);
    setNewPresetScope('world');
    setError(null);
  };

  const handleExportAll = () => {
    const presetsToExport = filteredPresets.map(({ scope, ...preset }) => preset);
    const scopeLabel = scopeFilter === 'all' ? 'all' : scopeFilter;
    downloadPresetsAsJSON(
      presetsToExport,
      `interaction-presets-${scopeLabel}-${Date.now()}.json`,
      {
        description: `Exported ${scopeLabel} presets from ${world.name}`,
        source: world.name,
      }
    );
  };

  const handleExportSelected = () => {
    if (!selectedPreset) return;
    const { scope, ...preset } = selectedPreset;
    downloadPresetsAsJSON(
      [preset],
      `preset-${preset.id}-${Date.now()}.json`,
      {
        description: `Exported preset: ${preset.name}`,
        source: world.name,
      }
    );
  };

  const handleImportClick = () => {
    setShowImportDialog(true);
    setError(null);
    setImportSuccess(null);
  };

  const handleImportFileSelect = () => {
    fileInputRef.current?.click();
  };

  const handleImportFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    setError(null);
    setImportSuccess(null);

    try {
      const target = importTarget === 'global' ? 'global' : world.id;
      const result = await importPresetsFromFile(
        file,
        target,
        importConflictResolution,
        world
      );

      if (!result.success && result.errors.length > 0) {
        setError(result.errors.join('; '));
      } else {
        const messages = [];
        if (result.imported > 0) {
          messages.push(`Imported ${result.imported} preset${result.imported !== 1 ? 's' : ''}`);
        }
        if (result.renamed > 0) {
          messages.push(`${result.renamed} renamed due to conflicts`);
        }
        if (result.skipped > 0) {
          messages.push(`${result.skipped} skipped`);
        }
        setImportSuccess(messages.join(', '));

        // Refresh preset list
        setPresets(getCombinedPresets(world));
      }
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setIsImporting(false);
      setShowImportDialog(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const availablePlugins = interactionRegistry.getAll();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Interaction Presets</h2>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={handleStartCreate} disabled={isCreating}>
            + New Preset
          </Button>
          <Button variant="primary" size="sm" onClick={handleSave} disabled={isSaving}>
            {isSaving ? 'Saving...' : 'Save All'}
          </Button>
        </div>
      </div>

      {/* Import/Export Panel */}
      <Panel className="bg-blue-50 dark:bg-blue-950/20">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold mb-1">Import / Export Presets</h3>
            <p className="text-xs text-neutral-600 dark:text-neutral-400">
              Share presets across worlds and projects
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={handleImportClick}
              disabled={isImporting}
            >
              📥 Import
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleExportSelected}
              disabled={!selectedPreset || isCreating}
              title="Export selected preset"
            >
              📤 Export Selected
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleExportAll}
              title={`Export ${scopeFilter === 'all' ? 'all' : scopeFilter} presets`}
            >
              📦 Export {scopeFilter === 'all' ? 'All' : scopeFilter === 'global' ? 'Global' : 'World'}
            </Button>
          </div>
        </div>
      </Panel>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        onChange={handleImportFile}
        style={{ display: 'none' }}
      />

      {/* Import Dialog */}
      {showImportDialog && (
        <Panel className="border-2 border-blue-500 bg-white dark:bg-neutral-900">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Import Presets</h3>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setShowImportDialog(false)}
              >
                Cancel
              </Button>
            </div>

            <div>
              <label className="block text-xs font-medium mb-1">Import To</label>
              <Select
                size="sm"
                value={importTarget}
                onChange={(e) => setImportTarget(e.target.value as 'global' | 'world')}
              >
                <option value="world">🗺️ This World</option>
                <option value="global">🌍 Global Presets</option>
              </Select>
              <p className="text-xs text-neutral-500 mt-1">
                {importTarget === 'global'
                  ? 'Import to global presets (available in all worlds)'
                  : 'Import to this world only'}
              </p>
            </div>

            <div>
              <label className="block text-xs font-medium mb-1">If Preset ID Already Exists</label>
              <Select
                size="sm"
                value={importConflictResolution}
                onChange={(e) => setImportConflictResolution(e.target.value as ConflictResolution)}
              >
                <option value="skip">Skip (don't import duplicates)</option>
                <option value="rename">Rename (generate new ID)</option>
                <option value="overwrite">Overwrite (replace existing)</option>
              </Select>
              <p className="text-xs text-neutral-500 mt-1">
                {importConflictResolution === 'skip' && 'Presets with duplicate IDs will be skipped'}
                {importConflictResolution === 'rename' && 'Duplicate presets will get new auto-generated IDs'}
                {importConflictResolution === 'overwrite' && 'Existing presets will be replaced (use with caution!)'}
              </p>
            </div>

            <div className="flex justify-end pt-2">
              <Button
                variant="primary"
                size="sm"
                onClick={handleImportFileSelect}
                disabled={isImporting}
              >
                {isImporting ? 'Importing...' : 'Select File to Import'}
              </Button>
            </div>
          </div>
        </Panel>
      )}

      {error && <p className="text-sm text-red-500">Error: {error}</p>}
      {importSuccess && <p className="text-sm text-green-600 dark:text-green-400">✓ {importSuccess}</p>}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Presets list */}
        <Panel className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Presets ({filteredPresets.length})</h3>
            <Select
              size="sm"
              value={scopeFilter}
              onChange={(e) => setScopeFilter(e.target.value as any)}
              className="w-24"
            >
              <option value="all">All</option>
              <option value="global">🌍 Global</option>
              <option value="world">🗺️ World</option>
            </Select>
          </div>
          {filteredPresets.length === 0 ? (
            <p className="text-xs text-neutral-500">No presets defined yet. Click "New Preset" to create one.</p>
          ) : (
            <div className="space-y-1">
              {filteredPresets.map(preset => {
                const plugin = interactionRegistry.get(preset.interactionId);
                const isSelected = selectedPresetId === preset.id && selectedScope === preset.scope && !isCreating;
                return (
                  <button
                    key={`${preset.scope}-${preset.id}`}
                    className={`w-full text-left px-2 py-2 rounded text-xs border transition-colors ${
                      isSelected
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-neutral-50 dark:bg-neutral-800 border-neutral-300 dark:border-neutral-700 hover:border-blue-400'
                    }`}
                    onClick={() => {
                      setSelectedPresetId(preset.id);
                      setSelectedScope(preset.scope);
                      setIsCreating(false);
                    }}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium">
                        {plugin?.icon && `${plugin.icon} `}
                        {preset.name}
                      </span>
                      <Badge
                        color={preset.scope === 'global' ? 'blue' : 'purple'}
                        className="text-[10px]"
                      >
                        {preset.scope === 'global' ? '🌍' : '🗺️'}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-1 flex-wrap">
                      <Badge color="gray" className="text-[10px]">
                        {plugin?.name || preset.interactionId}
                      </Badge>
                      {preset.category && (
                        <Badge color="purple" className="text-[10px]">
                          {preset.category}
                        </Badge>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </Panel>

        {/* Preset editor/creator panel */}
        <Panel className="lg:col-span-2 space-y-3">
          {isCreating ? (
            <>
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">Create New Preset</h3>
                <Button size="sm" variant="secondary" onClick={handleCancelCreate}>
                  Cancel
                </Button>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium mb-1">Preset Name *</label>
                  <Input
                    size="sm"
                    value={newPresetName}
                    onChange={(e: any) => setNewPresetName(e.target.value)}
                    placeholder="e.g., Flirt (Friendly)"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium mb-1">Interaction Plugin *</label>
                  <Select
                    size="sm"
                    value={newPresetInteractionId}
                    onChange={(e) => {
                      setNewPresetInteractionId(e.target.value);
                      const plugin = interactionRegistry.get(e.target.value);
                      if (plugin) {
                        setNewPresetConfig({ ...plugin.defaultConfig, enabled: true });
                      }
                    }}
                  >
                    <option value="">Select an interaction...</option>
                    {availablePlugins.map(plugin => (
                      <option key={plugin.id} value={plugin.id}>
                        {plugin.icon && `${plugin.icon} `}
                        {plugin.name}
                      </option>
                    ))}
                  </Select>
                </div>

                <div>
                  <label className="block text-xs font-medium mb-1">Category</label>
                  <Input
                    size="sm"
                    value={newPresetCategory}
                    onChange={(e: any) => setNewPresetCategory(e.target.value)}
                    placeholder="e.g., romance, trade, combat"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium mb-1">Description</label>
                  <Input
                    size="sm"
                    value={newPresetDescription}
                    onChange={(e: any) => setNewPresetDescription(e.target.value)}
                    placeholder="Optional description"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium mb-1">Scope</label>
                  <Select
                    size="sm"
                    value={newPresetScope}
                    onChange={(e) => setNewPresetScope(e.target.value as 'global' | 'world')}
                  >
                    <option value="world">🗺️ World (this world only)</option>
                    <option value="global">🌍 Global (all worlds)</option>
                  </Select>
                </div>

                {selectedPlugin && newPresetConfig && (
                  <div className="border-t pt-3 dark:border-neutral-700">
                    <h4 className="text-xs font-semibold mb-2">Configuration</h4>
                    <InteractionConfigForm
                      plugin={selectedPlugin}
                      config={newPresetConfig}
                      onConfigChange={setNewPresetConfig}
                    />
                  </div>
                )}

                <div className="flex justify-end pt-2">
                  <Button variant="primary" size="sm" onClick={handleCreatePreset}>
                    Create Preset
                  </Button>
                </div>
              </div>
            </>
          ) : selectedPreset ? (
            <>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold">Edit Preset: {selectedPreset.name}</h3>
                  <Badge
                    color={selectedPreset.scope === 'global' ? 'blue' : 'purple'}
                    className="text-[10px]"
                  >
                    {selectedPreset.scope === 'global' ? '🌍 Global' : '🗺️ World'}
                  </Badge>
                </div>
                <div className="flex gap-2">
                  {selectedPreset.scope === 'world' && (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => handlePromoteToGlobal(selectedPreset)}
                      title="Copy to global presets"
                    >
                      → 🌍
                    </Button>
                  )}
                  {selectedPreset.scope === 'global' && (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => handleCopyToWorld(selectedPreset)}
                      title="Copy to world presets"
                    >
                      → 🗺️
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => handleDeletePreset(selectedPreset.id, selectedPreset.scope)}
                    className="text-red-600 hover:text-red-700"
                  >
                    Delete
                  </Button>
                </div>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium mb-1">Preset Name</label>
                  <Input
                    size="sm"
                    value={selectedPreset.name}
                    onChange={(e: any) =>
                      handleUpdatePreset(selectedPreset.id, selectedPreset.scope, { name: e.target.value })
                    }
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium mb-1">Interaction Plugin</label>
                  <Select
                    size="sm"
                    value={selectedPreset.interactionId}
                    onChange={(e) => {
                      const plugin = interactionRegistry.get(e.target.value);
                      if (plugin) {
                        handleUpdatePreset(selectedPreset.id, selectedPreset.scope, {
                          interactionId: e.target.value,
                          config: { ...plugin.defaultConfig, enabled: true },
                        });
                      }
                    }}
                  >
                    {availablePlugins.map(plugin => (
                      <option key={plugin.id} value={plugin.id}>
                        {plugin.icon && `${plugin.icon} `}
                        {plugin.name}
                      </option>
                    ))}
                  </Select>
                  <p className="text-xs text-neutral-500 mt-1">
                    Changing this will reset the configuration
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-medium mb-1">Category</label>
                  <Input
                    size="sm"
                    value={selectedPreset.category || ''}
                    onChange={(e: any) =>
                      handleUpdatePreset(selectedPreset.id, selectedPreset.scope, { category: e.target.value })
                    }
                    placeholder="e.g., romance, trade, combat"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium mb-1">Description</label>
                  <Input
                    size="sm"
                    value={selectedPreset.description || ''}
                    onChange={(e: any) =>
                      handleUpdatePreset(selectedPreset.id, selectedPreset.scope, { description: e.target.value })
                    }
                    placeholder="Optional description"
                  />
                </div>

                {selectedPlugin && (
                  <div className="border-t pt-3 dark:border-neutral-700">
                    <h4 className="text-xs font-semibold mb-2">Configuration</h4>
                    <InteractionConfigForm
                      plugin={selectedPlugin}
                      config={selectedPreset.config}
                      onConfigChange={(newConfig) =>
                        handleUpdatePreset(selectedPreset.id, selectedPreset.scope, { config: newConfig })
                      }
                    />
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="flex items-center justify-center h-64">
              <p className="text-sm text-neutral-500">
                Select a preset to edit or create a new one
              </p>
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
