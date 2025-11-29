/**
 * Preset Playlist Builder Component
 *
 * Phase 10: Allows designers to create and manage sequenced interaction presets
 */

import { useState, useMemo } from 'react';
import { Button, Panel, Input, Select, Badge, Checkbox } from '@pixsim7/shared.ui';
import type { GameWorldDetail } from '@/lib/api/game';
import { saveGameWorldMeta } from '@/lib/api/game';
import {
  getCombinedPlaylists,
  getCombinedPresets,
  generatePlaylistId,
  getGlobalPlaylists,
  saveGlobalPlaylists,
  addGlobalPlaylist,
  addWorldPlaylist,
  updateGlobalPlaylist,
  updateWorldPlaylist,
  deleteGlobalPlaylist,
  deleteWorldPlaylist,
  validatePlaylist,
  type PresetPlaylist,
  type PlaylistWithScope,
  type PlaylistItem,
  type PlaylistCondition,
  type PresetWithScope,
} from '@/lib/game/interactions/presets';

interface PresetPlaylistBuilderProps {
  world: GameWorldDetail;
  onWorldUpdate: (world: GameWorldDetail) => void;
}

export function PresetPlaylistBuilder({ world, onWorldUpdate }: PresetPlaylistBuilderProps) {
  const [playlists, setPlaylists] = useState<PlaylistWithScope[]>(
    () => getCombinedPlaylists(world)
  );
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string | null>(null);
  const [selectedScope, setSelectedScope] = useState<'global' | 'world' | null>(null);
  const [scopeFilter, setScopeFilter] = useState<'all' | 'global' | 'world'>('all');
  const [isCreating, setIsCreating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // New playlist form state
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [newPlaylistDescription, setNewPlaylistDescription] = useState('');
  const [newPlaylistCategory, setNewPlaylistCategory] = useState('');
  const [newPlaylistScope, setNewPlaylistScope] = useState<'global' | 'world'>('world');
  const [newPlaylistLoop, setNewPlaylistLoop] = useState(false);
  const [newPlaylistMaxLoops, setNewPlaylistMaxLoops] = useState<number | undefined>(undefined);
  const [newPlaylistItems, setNewPlaylistItems] = useState<PlaylistItem[]>([]);

  const availablePresets = useMemo(() => getCombinedPresets(world), [world]);

  const selectedPlaylist = useMemo(
    () => playlists.find(p => p.id === selectedPlaylistId && p.scope === selectedScope) || null,
    [playlists, selectedPlaylistId, selectedScope]
  );

  const filteredPlaylists = useMemo(() => {
    if (scopeFilter === 'all') return playlists;
    return playlists.filter(p => p.scope === scopeFilter);
  }, [playlists, scopeFilter]);

  const handleSelectPlaylist = (playlist: PlaylistWithScope) => {
    setSelectedPlaylistId(playlist.id);
    setSelectedScope(playlist.scope);
    setIsCreating(false);
    setError(null);
  };

  const handleStartCreate = () => {
    setIsCreating(true);
    setSelectedPlaylistId(null);
    setSelectedScope(null);
    setNewPlaylistName('');
    setNewPlaylistDescription('');
    setNewPlaylistCategory('');
    setNewPlaylistScope('world');
    setNewPlaylistLoop(false);
    setNewPlaylistMaxLoops(undefined);
    setNewPlaylistItems([]);
    setError(null);
  };

  const handleCreatePlaylist = async () => {
    if (!newPlaylistName.trim()) {
      setError('Playlist name is required');
      return;
    }

    if (newPlaylistItems.length === 0) {
      setError('Playlist must have at least one item');
      return;
    }

    const id = generatePlaylistId(newPlaylistName);
    const newPlaylist: PresetPlaylist = {
      id,
      name: newPlaylistName.trim(),
      description: newPlaylistDescription.trim() || undefined,
      category: newPlaylistCategory.trim() || undefined,
      items: newPlaylistItems,
      loop: newPlaylistLoop,
      maxLoops: newPlaylistLoop ? newPlaylistMaxLoops : undefined,
    };

    try {
      if (newPlaylistScope === 'global') {
        addGlobalPlaylist(newPlaylist);
      } else {
        await addWorldPlaylist(world.id, newPlaylist, world);
      }

      setPlaylists(getCombinedPlaylists(world));
      setSelectedPlaylistId(id);
      setSelectedScope(newPlaylistScope);
      setIsCreating(false);
      setError(null);
    } catch (e: any) {
      setError(String(e?.message ?? e));
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);

    try {
      // Refresh world data if needed
      onWorldUpdate(world);
      setPlaylists(getCombinedPlaylists(world));
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeletePlaylist = async (playlist: PlaylistWithScope) => {
    if (!confirm(`Delete playlist "${playlist.name}"?`)) return;

    try {
      if (playlist.scope === 'global') {
        deleteGlobalPlaylist(playlist.id);
      } else {
        await deleteWorldPlaylist(world.id, playlist.id, world);
      }

      setPlaylists(getCombinedPlaylists(world));
      if (selectedPlaylistId === playlist.id) {
        setSelectedPlaylistId(null);
        setSelectedScope(null);
      }
    } catch (e: any) {
      setError(String(e?.message ?? e));
    }
  };

  const handleAddItem = () => {
    setNewPlaylistItems([
      ...newPlaylistItems,
      {
        presetId: availablePresets[0]?.id || '',
        delayMs: undefined,
        condition: undefined,
        stopOnFailure: false,
      },
    ]);
  };

  const handleUpdateItem = (index: number, updates: Partial<PlaylistItem>) => {
    const updated = [...newPlaylistItems];
    updated[index] = { ...updated[index], ...updates };
    setNewPlaylistItems(updated);
  };

  const handleRemoveItem = (index: number) => {
    setNewPlaylistItems(newPlaylistItems.filter((_, i) => i !== index));
  };

  const handleMoveItemUp = (index: number) => {
    if (index === 0) return;
    const updated = [...newPlaylistItems];
    [updated[index - 1], updated[index]] = [updated[index], updated[index - 1]];
    setNewPlaylistItems(updated);
  };

  const handleMoveItemDown = (index: number) => {
    if (index === newPlaylistItems.length - 1) return;
    const updated = [...newPlaylistItems];
    [updated[index], updated[index + 1]] = [updated[index + 1], updated[index]];
    setNewPlaylistItems(updated);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Preset Playlists (Phase 10)</h2>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={handleStartCreate} disabled={isCreating}>
            + New Playlist
          </Button>
          <Button variant="primary" size="sm" onClick={handleSave} disabled={isSaving}>
            {isSaving ? 'Saving...' : 'Save All'}
          </Button>
        </div>
      </div>

      {error && <p className="text-sm text-red-500">Error: {error}</p>}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Playlists list */}
        <Panel className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Playlists ({filteredPlaylists.length})</h3>
            <Select
              size="sm"
              value={scopeFilter}
              onChange={(e) => setScopeFilter(e.target.value as typeof scopeFilter)}
            >
              <option value="all">All</option>
              <option value="global">🌍 Global</option>
              <option value="world">🗺️ World</option>
            </Select>
          </div>

          <div className="space-y-1 max-h-96 overflow-y-auto">
            {filteredPlaylists.map((playlist) => (
              <div
                key={`${playlist.scope}-${playlist.id}`}
                className={`p-2 rounded cursor-pointer border ${
                  selectedPlaylistId === playlist.id && selectedScope === playlist.scope
                    ? 'bg-blue-100 dark:bg-blue-900 border-blue-500'
                    : 'hover:bg-neutral-100 dark:hover:bg-neutral-800 border-transparent'
                }`}
                onClick={() => handleSelectPlaylist(playlist)}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1">
                      <span className="text-sm font-medium truncate">{playlist.name}</span>
                      <Badge color={playlist.scope === 'global' ? 'blue' : 'purple'} className="text-xs">
                        {playlist.scope === 'global' ? '🌍' : '🗺️'}
                      </Badge>
                    </div>
                    <p className="text-xs text-neutral-500 truncate">{playlist.items.length} steps</p>
                  </div>
                  <Button
                    size="xs"
                    variant="secondary"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeletePlaylist(playlist);
                    }}
                    className="text-red-600"
                  >
                    ✕
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </Panel>

        {/* Playlist editor */}
        <Panel className="lg:col-span-2">
          {isCreating ? (
            <div className="space-y-4">
              <h3 className="text-sm font-semibold">Create New Playlist</h3>

              <div>
                <label className="block text-xs font-medium mb-1">Name *</label>
                <Input
                  size="sm"
                  value={newPlaylistName}
                  onChange={(e) => setNewPlaylistName(e.target.value)}
                  placeholder="e.g., Romance Sequence"
                />
              </div>

              <div>
                <label className="block text-xs font-medium mb-1">Description</label>
                <Input
                  size="sm"
                  value={newPlaylistDescription}
                  onChange={(e) => setNewPlaylistDescription(e.target.value)}
                  placeholder="What does this playlist do?"
                />
              </div>

              <div>
                <label className="block text-xs font-medium mb-1">Category</label>
                <Input
                  size="sm"
                  value={newPlaylistCategory}
                  onChange={(e) => setNewPlaylistCategory(e.target.value)}
                  placeholder="e.g., romance, quest"
                />
              </div>

              <div>
                <label className="block text-xs font-medium mb-1">Scope</label>
                <Select
                  size="sm"
                  value={newPlaylistScope}
                  onChange={(e) => setNewPlaylistScope(e.target.value as 'global' | 'world')}
                >
                  <option value="world">🗺️ This World Only</option>
                  <option value="global">🌍 Global (All Worlds)</option>
                </Select>
              </div>

              <div className="flex items-center gap-2">
                <Checkbox
                  checked={newPlaylistLoop}
                  onChange={(e) => setNewPlaylistLoop(e.target.checked)}
                />
                <label className="text-xs font-medium">Loop playlist</label>
                {newPlaylistLoop && (
                  <Input
                    type="number"
                    size="sm"
                    value={newPlaylistMaxLoops || ''}
                    onChange={(e) => setNewPlaylistMaxLoops(e.target.value ? parseInt(e.target.value) : undefined)}
                    placeholder="Max loops (blank = infinite)"
                    className="w-48"
                  />
                )}
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-xs font-medium">Playlist Items *</label>
                  <Button size="xs" variant="secondary" onClick={handleAddItem}>
                    + Add Step
                  </Button>
                </div>

                {newPlaylistItems.length === 0 ? (
                  <p className="text-xs text-neutral-500 text-center py-4">
                    No items yet. Click "+ Add Step" to begin.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {newPlaylistItems.map((item, index) => {
                      const preset = availablePresets.find(p => p.id === item.presetId);
                      return (
                        <div key={index} className="border rounded p-2 space-y-2 bg-neutral-50 dark:bg-neutral-900">
                          <div className="flex items-start gap-2">
                            <span className="text-xs font-semibold text-neutral-500 mt-1">#{index + 1}</span>
                            <div className="flex-1 space-y-2">
                              <Select
                                size="sm"
                                value={item.presetId}
                                onChange={(e) => handleUpdateItem(index, { presetId: e.target.value })}
                              >
                                {availablePresets.map(p => (
                                  <option key={p.id} value={p.id}>
                                    {p.name} ({p.scope === 'global' ? '🌍' : '🗺️'})
                                  </option>
                                ))}
                              </Select>

                              <div className="grid grid-cols-2 gap-2">
                                <div>
                                  <label className="text-xs text-neutral-600 dark:text-neutral-400">Delay (ms)</label>
                                  <Input
                                    type="number"
                                    size="sm"
                                    value={item.delayMs || ''}
                                    onChange={(e) => handleUpdateItem(index, {
                                      delayMs: e.target.value ? parseInt(e.target.value) : undefined
                                    })}
                                    placeholder="0"
                                  />
                                </div>
                                <div className="flex items-end">
                                  <Checkbox
                                    checked={item.stopOnFailure || false}
                                    onChange={(e) => handleUpdateItem(index, { stopOnFailure: e.target.checked })}
                                  />
                                  <label className="text-xs ml-1">Stop on failure</label>
                                </div>
                              </div>
                            </div>
                            <div className="flex flex-col gap-1">
                              <Button
                                size="xs"
                                variant="secondary"
                                onClick={() => handleMoveItemUp(index)}
                                disabled={index === 0}
                              >
                                ↑
                              </Button>
                              <Button
                                size="xs"
                                variant="secondary"
                                onClick={() => handleMoveItemDown(index)}
                                disabled={index === newPlaylistItems.length - 1}
                              >
                                ↓
                              </Button>
                              <Button
                                size="xs"
                                variant="secondary"
                                onClick={() => handleRemoveItem(index)}
                                className="text-red-600"
                              >
                                ✕
                              </Button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setIsCreating(false)}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  variant="primary"
                  onClick={handleCreatePlaylist}
                >
                  Create Playlist
                </Button>
              </div>
            </div>
          ) : selectedPlaylist ? (
            <div className="space-y-4">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-sm font-semibold">{selectedPlaylist.name}</h3>
                  <p className="text-xs text-neutral-500 mt-1">
                    {selectedPlaylist.description || 'No description'}
                  </p>
                </div>
                <Badge color={selectedPlaylist.scope === 'global' ? 'blue' : 'purple'}>
                  {selectedPlaylist.scope === 'global' ? '🌍 Global' : '🗺️ World'}
                </Badge>
              </div>

              {selectedPlaylist.loop && (
                <div className="bg-blue-50 dark:bg-blue-900/20 p-2 rounded">
                  <p className="text-xs">
                    🔁 Loops {selectedPlaylist.maxLoops ? `up to ${selectedPlaylist.maxLoops} times` : 'infinitely'}
                  </p>
                </div>
              )}

              <div>
                <h4 className="text-xs font-semibold mb-2">Playlist Steps ({selectedPlaylist.items.length})</h4>
                <div className="space-y-2">
                  {selectedPlaylist.items.map((item, index) => {
                    const preset = availablePresets.find(p => p.id === item.presetId);
                    return (
                      <div key={index} className="border rounded p-2 bg-neutral-50 dark:bg-neutral-900">
                        <div className="flex items-start gap-2">
                          <span className="text-xs font-semibold text-neutral-500">#{index + 1}</span>
                          <div className="flex-1">
                            <div className="font-medium text-sm">
                              {preset ? preset.name : `Missing: ${item.presetId}`}
                              {!preset && <Badge color="red" className="ml-1 text-xs">Missing</Badge>}
                            </div>
                            {item.delayMs && (
                              <p className="text-xs text-neutral-500">⏱️ Delay: {item.delayMs}ms</p>
                            )}
                            {item.stopOnFailure && (
                              <p className="text-xs text-orange-600">⚠️ Stop on failure</p>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {(() => {
                const validation = validatePlaylist(selectedPlaylist, availablePresets);
                if (!validation.valid) {
                  return (
                    <div className="bg-red-50 dark:bg-red-900/20 p-3 rounded border border-red-200 dark:border-red-800">
                      <p className="text-xs font-semibold text-red-900 dark:text-red-100 mb-1">
                        ⚠️ Validation Issues
                      </p>
                      <ul className="text-xs text-red-800 dark:text-red-200">
                        {validation.missingPresets.map(presetId => (
                          <li key={presetId}>• Missing preset: {presetId}</li>
                        ))}
                      </ul>
                    </div>
                  );
                }
                return null;
              })()}
            </div>
          ) : (
            <div className="text-center py-12 text-neutral-500">
              <p className="text-sm">
                Select a playlist to view details or create a new one
              </p>
            </div>
          )}
        </Panel>
      </div>

      <Panel className="p-3 bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-800">
        <h3 className="text-xs font-semibold mb-2 text-purple-900 dark:text-purple-100">
          About Preset Playlists (Phase 10)
        </h3>
        <ul className="text-xs text-purple-800 dark:text-purple-200 space-y-1">
          <li>• Playlists sequence multiple interaction presets to execute in order</li>
          <li>• Add delays between steps to create timed interactions</li>
          <li>• Configure conditions (flags, state) for conditional execution</li>
          <li>• Enable looping for repeating interaction patterns</li>
          <li>• Playlists degrade gracefully if referenced presets are missing</li>
          <li>• Assign playlists to NPC slots or hotspots instead of individual presets</li>
        </ul>
      </Panel>
    </div>
  );
}
