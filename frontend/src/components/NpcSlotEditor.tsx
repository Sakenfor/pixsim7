import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { Button, Panel, Badge, Input, Select } from '@pixsim7/ui';
import { getAsset, type AssetResponse } from '../lib/api/assets';
import type { GameLocationDetail, GameWorldDetail, NpcSlot2d } from '../lib/api/game';
import { getNpcSlots, setNpcSlots, saveGameLocationMeta } from '../lib/api/game';
import { interactionRegistry } from '../lib/registries';
import { InteractionConfigForm } from '../lib/game/interactions/InteractionConfigForm';
import {
  getCombinedPresets,
  applyPresetToSlot,
  getRecommendedPresets,
  type PresetWithScope,
  type SuggestionContext,
} from '../lib/game/interactions/presets';

interface NpcSlotEditorProps {
  location: GameLocationDetail;
  world?: GameWorldDetail | null;
  onLocationUpdate: (location: GameLocationDetail) => void;
}

export function NpcSlotEditor({ location, world, onLocationUpdate }: NpcSlotEditorProps) {
  const [slots, setSlots] = useState<NpcSlot2d[]>([]);
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
  const [backgroundAsset, setBackgroundAsset] = useState<AssetResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Load presets from world and global storage
  const presets = useMemo(() => {
    return getCombinedPresets(world);
  }, [world]);

  // Load slots from location meta
  useEffect(() => {
    const loadedSlots = getNpcSlots(location);
    setSlots(loadedSlots);
  }, [location]);

  // Load background asset
  useEffect(() => {
    if (!location.asset_id) {
      setBackgroundAsset(null);
      return;
    }

    setIsLoading(true);
    setError(null);
    (async () => {
      try {
        const asset = await getAsset(location.asset_id!);
        if (asset.media_type === 'image' || asset.media_type === 'video') {
          setBackgroundAsset(asset);
        } else {
          setBackgroundAsset(null);
          setError('Location asset is not an image or video');
        }
      } catch (e: any) {
        setError(String(e?.message ?? e));
        setBackgroundAsset(null);
      } finally {
        setIsLoading(false);
      }
    })();
  }, [location.asset_id]);

  const handleBackgroundClick = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;

    // Check if we clicked on an existing slot
    const clickedSlot = slots.find(slot => {
      const dx = Math.abs(slot.x - x);
      const dy = Math.abs(slot.y - y);
      return dx < 0.05 && dy < 0.05; // 5% tolerance
    });

    if (clickedSlot) {
      setSelectedSlotId(clickedSlot.id);
    } else {
      // Create a new slot
      const newSlot: NpcSlot2d = {
        id: `slot_${Date.now()}`,
        x: Math.max(0, Math.min(1, x)),
        y: Math.max(0, Math.min(1, y)),
        roles: [],
        fixedNpcId: null,
      };
      setSlots([...slots, newSlot]);
      setSelectedSlotId(newSlot.id);
    }
  }, [slots]);

  const updateSlot = (id: string, updates: Partial<NpcSlot2d>) => {
    setSlots(prevSlots =>
      prevSlots.map(slot => (slot.id === id ? { ...slot, ...updates } : slot))
    );
  };

  const removeSlot = (id: string) => {
    setSlots(prevSlots => prevSlots.filter(slot => slot.id !== id));
    if (selectedSlotId === id) {
      setSelectedSlotId(null);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);
    try {
      const updatedLocation = setNpcSlots(location, slots);
      await saveGameLocationMeta(location.id, updatedLocation.meta!);
      onLocationUpdate(updatedLocation);
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setIsSaving(false);
    }
  };

  const selectedSlot = slots.find(s => s.id === selectedSlotId);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">2D NPC Slot Layout</h2>
        <Button
          variant="primary"
          size="sm"
          onClick={handleSave}
          disabled={isSaving}
        >
          {isSaving ? 'Saving...' : 'Save Slots'}
        </Button>
      </div>

      {error && <p className="text-sm text-red-500">Error: {error}</p>}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Background with clickable slots */}
        <div className="lg:col-span-2 space-y-2">
          <p className="text-sm text-neutral-500">Click on the background to add NPC slots</p>
          {isLoading ? (
            <div className="flex items-center justify-center h-96 bg-neutral-100 dark:bg-neutral-800 rounded">
              <span className="text-sm text-neutral-500">Loading background...</span>
            </div>
          ) : backgroundAsset && backgroundAsset.file_url ? (
            <div
              ref={containerRef}
              className="relative w-full aspect-video bg-black/80 rounded overflow-hidden cursor-crosshair"
              onClick={handleBackgroundClick}
            >
              {backgroundAsset.media_type === 'image' ? (
                <img
                  src={backgroundAsset.file_url}
                  alt="location background"
                  className="w-full h-full object-cover"
                />
              ) : (
                <video
                  src={backgroundAsset.file_url}
                  className="w-full h-full object-cover"
                  muted
                  loop
                  autoPlay
                  playsInline
                />
              )}

              {/* Render NPC slots as markers */}
              {slots.map(slot => {
                const isSelected = slot.id === selectedSlotId;
                return (
                  <div
                    key={slot.id}
                    className={`absolute w-8 h-8 -ml-4 -mt-4 rounded-full border-2 flex items-center justify-center text-xs font-bold cursor-pointer transition-all ${
                      isSelected
                        ? 'bg-blue-500 border-white scale-125 z-10'
                        : 'bg-green-500/80 border-white/80 hover:scale-110'
                    }`}
                    style={{
                      left: `${slot.x * 100}%`,
                      top: `${slot.y * 100}%`,
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedSlotId(slot.id);
                    }}
                    title={`${slot.id} - ${slot.roles?.join(', ') || 'No roles'}`}
                  >
                    <span className="text-white">
                      {slot.fixedNpcId ? `#${slot.fixedNpcId}` : 'S'}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex items-center justify-center h-96 bg-neutral-100 dark:bg-neutral-800 rounded">
              <p className="text-sm text-neutral-500">
                No background asset configured for this location
              </p>
            </div>
          )}

          {/* Slots list */}
          <Panel className="space-y-2">
            <h3 className="text-sm font-semibold">All Slots ({slots.length})</h3>
            {slots.length === 0 ? (
              <p className="text-xs text-neutral-500">No slots defined yet. Click on the background to add one.</p>
            ) : (
              <div className="space-y-1">
                {slots.map(slot => (
                  <button
                    key={slot.id}
                    className={`w-full text-left px-2 py-1 rounded text-xs border transition-colors ${
                      selectedSlotId === slot.id
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-neutral-50 dark:bg-neutral-800 border-neutral-300 dark:border-neutral-700 hover:border-blue-400'
                    }`}
                    onClick={() => setSelectedSlotId(slot.id)}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{slot.id}</span>
                      <div className="flex items-center gap-1">
                        {slot.fixedNpcId && (
                          <Badge color="yellow" className="text-[10px]">
                            NPC #{slot.fixedNpcId}
                          </Badge>
                        )}
                        <Badge color="gray" className="text-[10px]">
                          {Math.round(slot.x * 100)}%, {Math.round(slot.y * 100)}%
                        </Badge>
                      </div>
                    </div>
                    {slot.roles && slot.roles.length > 0 && (
                      <div className="mt-1">
                        {slot.roles.map(role => (
                          <Badge key={role} color="blue" className="text-[10px] mr-1">
                            {role}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </button>
                ))}
              </div>
            )}
          </Panel>
        </div>

        {/* Slot editor panel */}
        <Panel className="space-y-3">
          <h3 className="text-sm font-semibold">
            {selectedSlot ? `Edit Slot: ${selectedSlot.id}` : 'Select a Slot'}
          </h3>
          {selectedSlot ? (
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium mb-1">Slot ID</label>
                <Input
                  size="sm"
                  value={selectedSlot.id}
                  onChange={(e: any) => updateSlot(selectedSlot.id, { id: e.target.value })}
                  placeholder="e.g., bench_left"
                />
              </div>

              <div>
                <label className="block text-xs font-medium mb-1">Position</label>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-neutral-500">X</label>
                    <Input
                      size="sm"
                      type="number"
                      value={selectedSlot.x}
                      onChange={(e: any) =>
                        updateSlot(selectedSlot.id, {
                          x: Math.max(0, Math.min(1, Number(e.target.value))),
                        })
                      }
                      step="0.01"
                      min="0"
                      max="1"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-neutral-500">Y</label>
                    <Input
                      size="sm"
                      type="number"
                      value={selectedSlot.y}
                      onChange={(e: any) =>
                        updateSlot(selectedSlot.id, {
                          y: Math.max(0, Math.min(1, Number(e.target.value))),
                        })
                      }
                      step="0.01"
                      min="0"
                      max="1"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium mb-1">Roles (comma-separated)</label>
                <Input
                  size="sm"
                  value={selectedSlot.roles?.join(', ') || ''}
                  onChange={(e: any) =>
                    updateSlot(selectedSlot.id, {
                      roles: e.target.value
                        .split(',')
                        .map((r: string) => r.trim())
                        .filter(Boolean),
                    })
                  }
                  placeholder="e.g., bartender, shopkeeper"
                />
                <p className="text-xs text-neutral-500 mt-1">
                  Roles help match NPCs to slots at runtime
                </p>
              </div>

              <div>
                <label className="block text-xs font-medium mb-1">Fixed NPC ID (optional)</label>
                <Input
                  size="sm"
                  type="number"
                  value={selectedSlot.fixedNpcId || ''}
                  onChange={(e: any) =>
                    updateSlot(selectedSlot.id, {
                      fixedNpcId: e.target.value ? Number(e.target.value) : null,
                    })
                  }
                  placeholder="Leave empty for dynamic assignment"
                />
                <p className="text-xs text-neutral-500 mt-1">
                  If set, this slot is reserved for a specific NPC
                </p>
              </div>

              {/* Phase 9: Conflict Warnings */}
              {(() => {
                const conflicts = validateActivePresets(selectedSlot.interactions || {});
                const summary = getConflictSummary(conflicts);

                if (conflicts.length === 0) return null;

                return (
                  <div className="border-t pt-3 dark:border-neutral-700 mb-3">
                    <div className="p-2 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-xs font-semibold text-orange-900 dark:text-orange-100">
                          ⚠️ Preset Conflicts Detected
                        </span>
                        <div className="flex gap-1">
                          {summary.errors > 0 && (
                            <Badge color="red" className="text-[10px]">
                              {summary.errors} error{summary.errors !== 1 ? 's' : ''}
                            </Badge>
                          )}
                          {summary.warnings > 0 && (
                            <Badge color="yellow" className="text-[10px]">
                              {summary.warnings} warning{summary.warnings !== 1 ? 's' : ''}
                            </Badge>
                          )}
                          {summary.info > 0 && (
                            <Badge color="blue" className="text-[10px]">
                              {summary.info} info
                            </Badge>
                          )}
                        </div>
                      </div>
                      <div className="space-y-1">
                        {conflicts.map((conflict, idx) => (
                          <div
                            key={idx}
                            className={`text-xs p-2 rounded ${
                              conflict.severity === 'error'
                                ? 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800'
                                : conflict.severity === 'warning'
                                ? 'bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800'
                                : 'bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800'
                            }`}
                          >
                            <div className="font-medium mb-1">{conflict.message}</div>
                            {conflict.suggestion && (
                              <div className="text-[10px] opacity-75">
                                💡 {conflict.suggestion}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Interactions Section */}
              <div className="border-t pt-3 dark:border-neutral-700">
                <h4 className="text-xs font-semibold mb-2">Interactions</h4>

                {interactionRegistry.getAll().map((plugin) => {
                  // Get config for this plugin (new format only)
                  const interactions = selectedSlot.interactions || {};
                  const config = (interactions as any)[plugin.id] || null;
                  const enabled = config?.enabled ?? false;

                  // Get presets for this plugin
                  const pluginPresets = presets.filter(p => p.interactionId === plugin.id);

                  // Phase 8: Get recommended presets based on context
                  const suggestionContext: SuggestionContext = {
                    npcRole: selectedSlot.npcRole,
                    worldTags: (world?.meta as any)?.tags || [],
                    world: world,
                    interactionId: plugin.id,
                  };
                  const recommendedPresets = getRecommendedPresets(presets, suggestionContext, 30, 3);

                  return (
                    <div key={plugin.id} className="mb-3">
                      <label className="flex items-center gap-2 mb-2">
                        <input
                          type="checkbox"
                          checked={enabled}
                          onChange={(e) => {
                            const newConfig = e.target.checked
                              ? { ...plugin.defaultConfig, enabled: true }
                              : { enabled: false };

                            updateSlot(selectedSlot.id, {
                              interactions: {
                                ...selectedSlot.interactions,
                                [plugin.id]: newConfig,
                              },
                            });
                          }}
                          className="rounded"
                        />
                        <span className="text-xs font-medium">
                          {plugin.icon && `${plugin.icon} `}
                          {plugin.name}
                        </span>
                      </label>

                      {/* Phase 8: Recommended Presets */}
                      {enabled && recommendedPresets.length > 0 && (
                        <div className="ml-6 mb-2 p-2 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded">
                          <div className="flex items-center gap-1 mb-1">
                            <span className="text-xs font-semibold text-blue-900 dark:text-blue-100">
                              ⭐ Recommended
                            </span>
                            <span className="text-xs text-blue-600 dark:text-blue-400">
                              (based on context)
                            </span>
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {recommendedPresets.map(recommended => (
                              <button
                                key={recommended.id}
                                className="px-2 py-1 text-xs bg-white dark:bg-neutral-800 border border-blue-300 dark:border-blue-700 rounded hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors"
                                onClick={() => {
                                  updateSlot(selectedSlot.id, {
                                    interactions: {
                                      ...selectedSlot.interactions,
                                      [plugin.id]: applyPresetToSlot(recommended),
                                    },
                                  });
                                }}
                                title={recommended.reasons.join(', ')}
                              >
                                {recommended.scope === 'global' ? '🌍 ' : '🗺️ '}
                                {recommended.name}
                                <span className="ml-1 text-blue-600 dark:text-blue-400 font-semibold">
                                  {recommended.score}
                                </span>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Preset Selector */}
                      {enabled && pluginPresets.length > 0 && (
                        <div className="ml-6 mb-2 p-2 bg-neutral-50 dark:bg-neutral-800 rounded">
                          <label className="block text-xs text-neutral-500 mb-1">
                            All Presets:
                          </label>
                          <div className="flex gap-2">
                            <Select
                              size="sm"
                              id={`preset-${plugin.id}`}
                              className="flex-1"
                            >
                              <option value="">Choose a preset...</option>
                              {pluginPresets.map(preset => {
                                const scopedPreset = preset as PresetWithScope;
                                return (
                                  <option key={preset.id} value={preset.id}>
                                    {scopedPreset.scope === 'global' ? '🌍 ' : '🗺️ '}
                                    {preset.name}
                                    {preset.category ? ` [${preset.category}]` : ''}
                                  </option>
                                );
                              })}
                            </Select>
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => {
                                const selectEl = document.getElementById(`preset-${plugin.id}`) as HTMLSelectElement;
                                const presetId = selectEl?.value;
                                if (!presetId) return;

                                const preset = pluginPresets.find(p => p.id === presetId);
                                if (preset) {
                                  updateSlot(selectedSlot.id, {
                                    interactions: {
                                      ...selectedSlot.interactions,
                                      [plugin.id]: applyPresetToSlot(preset),
                                    },
                                  });
                                }
                              }}
                            >
                              Apply
                            </Button>
                          </div>
                          <p className="text-xs text-neutral-400 mt-1">
                            🌍 = Global preset, 🗺️ = World preset
                          </p>
                        </div>
                      )}

                      {enabled && (
                        <InteractionConfigForm
                          plugin={plugin}
                          config={config}
                          onConfigChange={(newConfig) =>
                            updateSlot(selectedSlot.id, {
                              interactions: {
                                ...selectedSlot.interactions,
                                [plugin.id]: newConfig,
                              },
                            })
                          }
                        />
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="flex justify-end">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => removeSlot(selectedSlot.id)}
                  className="text-red-600 hover:text-red-700"
                >
                  Remove Slot
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-xs text-neutral-500">
              Click on a slot marker to edit its properties
            </p>
          )}
        </Panel>
      </div>
    </div>
  );
}
