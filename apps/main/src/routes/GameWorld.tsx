import { useEffect, useState } from 'react';
import { Button, Panel, Input, Select } from '@pixsim7/shared.ui';
import type { GameLocationSummary, GameLocationDetail, GameHotspotDTO, GameWorldSummary, GameWorldDetail } from '../lib/api/game';
import { listGameLocations, getGameLocation, saveGameLocationHotspots, listGameWorlds, getGameWorld } from '../lib/api/game';
import type { HotspotActionType } from '@pixsim7/game.engine';
import { NpcSlotEditor } from '../components/NpcSlotEditor';
import { InteractionPresetEditor } from '../components/game/InteractionPresetEditor';
import { InteractionPresetUsagePanel } from '../components/game/InteractionPresetUsagePanel';

export function GameWorld() {
  const [locations, setLocations] = useState<GameLocationSummary[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<GameLocationDetail | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState<Record<number, boolean>>({});
  const [activeTab, setActiveTab] = useState<'hotspots' | '2d-layout' | 'presets' | 'usage'>('hotspots');
  const [worlds, setWorlds] = useState<GameWorldSummary[]>([]);
  const [selectedWorldId, setSelectedWorldId] = useState<number | null>(null);
  const [worldDetail, setWorldDetail] = useState<GameWorldDetail | null>(null);

  useEffect(() => {
    (async () => {
      try {
        setError(null);
        const [locs, worldsList] = await Promise.all([
          listGameLocations(),
          listGameWorlds(),
        ]);
        setLocations(locs);
        setWorlds(worldsList);
        if (!selectedId && locs.length > 0) {
          setSelectedId(locs[0].id);
        }
        if (!selectedWorldId && worldsList.length > 0) {
          setSelectedWorldId(worldsList[0].id);
        }
      } catch (e: any) {
        setError(String(e?.message ?? e));
      }
    })();
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    setIsLoading(true);
    setError(null);
    (async () => {
      try {
        const d = await getGameLocation(selectedId);
        setDetail(d);
      } catch (e: any) {
        setError(String(e?.message ?? e));
      } finally {
        setIsLoading(false);
      }
    })();
  }, [selectedId]);

  useEffect(() => {
    if (!selectedWorldId) {
      setWorldDetail(null);
      return;
    }
    (async () => {
      try {
        const w = await getGameWorld(selectedWorldId);
        setWorldDetail(w);
      } catch (e: any) {
        console.error('Failed to load world:', e);
        setWorldDetail(null);
      }
    })();
  }, [selectedWorldId]);

  const handleHotspotChange = (index: number, patch: Partial<GameHotspotDTO>) => {
    if (!detail) return;
    const nextHotspots = detail.hotspots.map((h, i) =>
      i === index ? { ...h, ...patch } : h,
    );
    setDetail({ ...detail, hotspots: nextHotspots });
  };

  const handleActionChange = (
    index: number,
    field: 'type' | 'scene_id' | 'target_location_id' | 'npc_id',
    value: string | number | null
  ) => {
    if (!detail) return;
    const h = detail.hotspots[index];
    const meta: any = { ...(h.meta || {}) };
    const action: any = { ...(meta.action || {}) };

    if (field === 'type') {
      // When changing type, reset action to only have the new type
      meta.action = { type: value || undefined };
    } else {
      action[field] = value || undefined;
      // Clean up undefined values
      if (!action[field]) {
        delete action[field];
      }
      meta.action = action;
    }

    handleHotspotChange(index, { meta });
  };

  const handleAddHotspot = () => {
    if (!detail) return;
    setDetail({
      ...detail,
      hotspots: [
        ...detail.hotspots,
        { object_name: '', hotspot_id: '', linked_scene_id: undefined, meta: {} },
      ],
    });
  };

  const handleRemoveHotspot = (index: number) => {
    if (!detail) return;
    setDetail({
      ...detail,
      hotspots: detail.hotspots.filter((_, i) => i !== index),
    });
  };

  const handleSave = async () => {
    if (!detail) return;
    setIsLoading(true);
    setError(null);
    try {
      const cleaned = detail.hotspots.filter(h => h.object_name && h.hotspot_id);
      const saved = await saveGameLocationHotspots(detail.id, cleaned);
      setDetail(saved);
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setIsLoading(false);
    }
  };

  const toggleAdvanced = (index: number) => {
    setShowAdvanced(prev => ({ ...prev, [index]: !prev[index] }));
  };

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-semibold">Game World Editor</h1>
      {error && <p className="text-sm text-red-500">Error: {error}</p>}
      <Panel className="space-y-3">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium">Location</label>
            <Select
              value={selectedId ? String(selectedId) : ''}
              onChange={(e: any) => setSelectedId(e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">Select location...</option>
              {locations.map(loc => (
                <option key={loc.id} value={loc.id}>{loc.name}</option>
              ))}
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium">World</label>
            <Select
              value={selectedWorldId ? String(selectedWorldId) : ''}
              onChange={(e: any) => setSelectedWorldId(e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">Select world...</option>
              {worlds.map(world => (
                <option key={world.id} value={world.id}>{world.name}</option>
              ))}
            </Select>
          </div>
          {activeTab === 'hotspots' && (
            <Button size="sm" variant="primary" onClick={handleSave} disabled={!detail || isLoading}>
              {isLoading ? 'Saving…' : 'Save Hotspots'}
            </Button>
          )}
        </div>
        {detail && (
          <div className="space-y-3">
            <p className="text-xs text-neutral-500">
              Asset ID: {detail.asset_id ?? 'none'} | Default spawn: {detail.default_spawn ?? 'none'}
            </p>

            {/* Tab Navigation */}
            <div className="flex gap-2 border-b border-neutral-200 dark:border-neutral-700">
              <button
                className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'hotspots'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200'
                }`}
                onClick={() => setActiveTab('hotspots')}
              >
                Hotspots
              </button>
              <button
                className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === '2d-layout'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200'
                }`}
                onClick={() => setActiveTab('2d-layout')}
              >
                2D Layout
              </button>
              <button
                className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'presets'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200'
                }`}
                onClick={() => setActiveTab('presets')}
              >
                Interaction Presets
              </button>
              <button
                className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'usage'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200'
                }`}
                onClick={() => setActiveTab('usage')}
              >
                Usage Stats (Dev)
              </button>
            </div>

            {/* Tab Content */}
            {activeTab === 'hotspots' ? (
              <>
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold">Hotspots</h2>
                  <Button size="sm" variant="secondary" onClick={handleAddHotspot}>
                    + Add Hotspot
                  </Button>
                </div>
                <div className="space-y-3">
              {detail.hotspots.map((h, idx) => {
                const meta: any = h.meta || {};
                const action: any = meta.action || {};
                const actionType: HotspotActionType | '' = action.type ?? '';

                return (
                  <div
                    key={idx}
                    className="p-3 border rounded bg-neutral-50 dark:bg-neutral-800/50 dark:border-neutral-700 space-y-2"
                  >
                    {/* Basic Hotspot Info */}
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <Input
                        placeholder="object_name (from glTF)"
                        value={h.object_name}
                        onChange={(e: any) => handleHotspotChange(idx, { object_name: e.target.value })}
                      />
                      <Input
                        placeholder="hotspot_id"
                        value={h.hotspot_id}
                        onChange={(e: any) => handleHotspotChange(idx, { hotspot_id: e.target.value })}
                      />
                      <Input
                        placeholder="linked_scene_id (fallback)"
                        value={h.linked_scene_id ?? ''}
                        onChange={(e: any) => {
                          const v = e.target.value.trim();
                          handleHotspotChange(idx, {
                            linked_scene_id: v ? Number(v) : undefined,
                          });
                        }}
                      />
                    </div>

                    {/* Structured Action Controls */}
                    <div className="border-t pt-2 dark:border-neutral-700">
                      <label className="block text-xs font-semibold mb-1">Hotspot Action</label>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <label className="block text-xs text-neutral-600 dark:text-neutral-400 mb-1">
                            Action Type
                          </label>
                          <Select
                            value={actionType}
                            onChange={(e: any) => handleActionChange(idx, 'type', e.target.value)}
                          >
                            <option value="">None</option>
                            <option value="play_scene">Play Scene</option>
                            <option value="change_location">Change Location</option>
                            <option value="npc_talk">NPC Talk</option>
                          </Select>
                        </div>

                        {/* Conditional Action Fields */}
                        {actionType === 'play_scene' && (
                          <div>
                            <label className="block text-xs text-neutral-600 dark:text-neutral-400 mb-1">
                              Scene ID
                            </label>
                            <Input
                              placeholder="Scene ID"
                              value={action.scene_id ?? ''}
                              onChange={(e: any) => {
                                const v = e.target.value.trim();
                                handleActionChange(idx, 'scene_id', v ? Number(v) : null);
                              }}
                            />
                            <p className="text-xs text-neutral-500 mt-0.5">
                              Leave empty to use linked_scene_id
                            </p>
                          </div>
                        )}

                        {actionType === 'change_location' && (
                          <div>
                            <label className="block text-xs text-neutral-600 dark:text-neutral-400 mb-1">
                              Target Location ID
                            </label>
                            <Input
                              placeholder="Location ID"
                              value={action.target_location_id ?? ''}
                              onChange={(e: any) => {
                                const v = e.target.value.trim();
                                handleActionChange(idx, 'target_location_id', v ? Number(v) : null);
                              }}
                            />
                          </div>
                        )}

                        {actionType === 'npc_talk' && (
                          <div>
                            <label className="block text-xs text-neutral-600 dark:text-neutral-400 mb-1">
                              NPC ID
                            </label>
                            <Input
                              placeholder="NPC ID"
                              value={action.npc_id ?? ''}
                              onChange={(e: any) => {
                                const v = e.target.value.trim();
                                handleActionChange(idx, 'npc_id', v ? Number(v) : null);
                              }}
                            />
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Advanced: Raw Meta JSON */}
                    <div className="border-t pt-2 dark:border-neutral-700">
                      <button
                        onClick={() => toggleAdvanced(idx)}
                        className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                      >
                        {showAdvanced[idx] ? '▼ Hide' : '▶ Show'} Advanced (Raw Meta JSON)
                      </button>
                      {showAdvanced[idx] && (
                        <div className="mt-2">
                          <Input
                            placeholder="Raw meta JSON (for advanced use)"
                            value={h.meta ? JSON.stringify(h.meta) : ''}
                            onChange={(e: any) => {
                              const v = e.target.value.trim();
                              let parsed: Record<string, unknown> | undefined;
                              if (v) {
                                try {
                                  parsed = JSON.parse(v);
                                } catch {
                                  parsed = h.meta ?? {};
                                }
                              }
                              handleHotspotChange(idx, { meta: parsed });
                            }}
                            className="font-mono text-xs"
                          />
                        </div>
                      )}
                    </div>

                    {/* Remove Button */}
                    <div className="flex justify-end">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => handleRemoveHotspot(idx)}
                        className="text-xs text-red-600 hover:text-red-700"
                      >
                        Remove Hotspot
                      </Button>
                    </div>
                  </div>
                );
              })}
                  {detail.hotspots.length === 0 && (
                    <p className="text-xs text-neutral-500 text-center py-4">
                      No hotspots yet. Click "Add Hotspot" above to create one.
                    </p>
                  )}
                </div>
              </>
            ) : activeTab === '2d-layout' ? (
              /* 2D Layout Tab */
              <NpcSlotEditor
                location={detail}
                world={worldDetail}
                onLocationUpdate={(updatedLocation) => setDetail(updatedLocation)}
              />
            ) : activeTab === 'presets' && worldDetail ? (
              /* Interaction Presets Tab */
              <InteractionPresetEditor
                world={worldDetail}
                onWorldUpdate={(updatedWorld) => setWorldDetail(updatedWorld)}
              />
            ) : activeTab === 'usage' ? (
              /* Usage Statistics Tab */
              <InteractionPresetUsagePanel world={worldDetail} />
            ) : (
              <div className="flex items-center justify-center h-64">
                <p className="text-sm text-neutral-500">
                  Select a world to manage interaction presets
                </p>
              </div>
            )}
          </div>
        )}
      </Panel>
    </div>
  );
}
