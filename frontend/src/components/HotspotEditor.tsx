/**
 * Hotspot Editor Component
 *
 * Enhanced hotspot editing with support for:
 * - Basic hotspot actions (play_scene, change_location, npc_talk)
 * - Plugin-based interactions (similar to NPC slots)
 * - Interaction preset palette
 */

import { useState, useMemo } from 'react';
import { Button, Panel, Input, Select, Badge } from '@pixsim7/ui';
import type { GameHotspotDTO, GameWorldDetail } from '../lib/api/game';
import type { HotspotActionType } from '@pixsim7/game-core';
import { interactionRegistry } from '../lib/registries';
import { InteractionConfigForm } from '../lib/game/interactions/InteractionConfigForm';
import {
  getCombinedPresets,
  applyPresetToSlot,
  getRecommendedPresets,
  type InteractionPreset,
  type PresetWithScope,
  type SuggestionContext,
} from '../lib/game/interactions/presets';

interface HotspotEditorProps {
  hotspots: GameHotspotDTO[];
  worldDetail?: GameWorldDetail | null;
  onChange: (hotspots: GameHotspotDTO[]) => void;
}

/**
 * Hotspot interactions stored in meta.interactions
 * Same structure as NPC slot interactions
 */
interface HotspotInteractions {
  [interactionId: string]: {
    enabled: boolean;
    [key: string]: any;
  };
}

export function HotspotEditor({ hotspots, worldDetail, onChange }: HotspotEditorProps) {
  const [showAdvanced, setShowAdvanced] = useState<Record<number, boolean>>({});
  const [expandedInteractions, setExpandedInteractions] = useState<Record<number, boolean>>({});

  // Load presets from world and global storage
  const availablePresets = useMemo(
    () => getCombinedPresets(worldDetail),
    [worldDetail]
  );

  const handleHotspotChange = (index: number, patch: Partial<GameHotspotDTO>) => {
    const next = hotspots.map((h, i) => (i === index ? { ...h, ...patch } : h));
    onChange(next);
  };

  const handleActionChange = (
    index: number,
    field: 'type' | 'scene_id' | 'target_location_id' | 'npc_id',
    value: string | number | null
  ) => {
    const h = hotspots[index];
    const meta: any = { ...(h.meta || {}) };
    const action: any = { ...(meta.action || {}) };

    if (field === 'type') {
      meta.action = { type: value || undefined };
    } else {
      action[field] = value || undefined;
      if (!action[field]) {
        delete action[field];
      }
      meta.action = action;
    }

    handleHotspotChange(index, { meta });
  };

  const handleAddHotspot = () => {
    onChange([
      ...hotspots,
      { object_name: '', hotspot_id: '', linked_scene_id: undefined, meta: {} },
    ]);
  };

  const handleRemoveHotspot = (index: number) => {
    onChange(hotspots.filter((_, i) => i !== index));
  };

  const toggleAdvanced = (index: number) => {
    setShowAdvanced((prev) => ({ ...prev, [index]: !prev[index] }));
  };

  const toggleInteractions = (index: number) => {
    setExpandedInteractions((prev) => ({ ...prev, [index]: !prev[index] }));
  };

  // Apply preset to hotspot
  const applyPreset = (index: number, preset: InteractionPreset) => {
    const h = hotspots[index];
    const meta: any = { ...(h.meta || {}) };
    const interactions: HotspotInteractions = { ...(meta.interactions || {}) };

    const presetConfig = applyPresetToSlot(preset);
    interactions[preset.interactionId] = presetConfig;

    handleHotspotChange(index, {
      meta: { ...meta, interactions },
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Hotspots</h2>
        <Button size="sm" variant="secondary" onClick={handleAddHotspot}>
          + Add Hotspot
        </Button>
      </div>

      {hotspots.map((h, idx) => {
        const meta: any = h.meta || {};
        const action: any = meta.action || {};
        const actionType: HotspotActionType | '' = action.type ?? '';
        const interactions: HotspotInteractions = meta.interactions || {};

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

            {/* Interactions Section */}
            <div className="border-t pt-2 dark:border-neutral-700">
              <button
                onClick={() => toggleInteractions(idx)}
                className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
              >
                {expandedInteractions[idx] ? '▼' : '▶'} Interactions
                {Object.keys(interactions).filter((id) => interactions[id]?.enabled).length >
                  0 && (
                  <Badge color="blue" className="text-[10px] ml-1">
                    {
                      Object.keys(interactions).filter((id) => interactions[id]?.enabled)
                        .length
                    }
                  </Badge>
                )}
              </button>

              {expandedInteractions[idx] && (
                <div className="mt-2 space-y-2">
                  {/* Phase 8: Recommended Presets */}
                  {(() => {
                    const suggestionContext: SuggestionContext = {
                      worldTags: (worldDetail?.meta as any)?.tags || [],
                      situationTags: ['hotspot'],
                      world: worldDetail,
                    };
                    const recommendedPresets = getRecommendedPresets(availablePresets, suggestionContext, 30, 3);

                    if (recommendedPresets.length > 0) {
                      return (
                        <div className="p-2 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded">
                          <div className="flex items-center gap-1 mb-2">
                            <span className="text-xs font-semibold text-yellow-900 dark:text-yellow-100">
                              ⭐ Recommended Presets
                            </span>
                            <span className="text-xs text-yellow-600 dark:text-yellow-400">
                              (based on context)
                            </span>
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {recommendedPresets.map((recommended) => (
                              <button
                                key={recommended.id}
                                onClick={() => applyPreset(idx, recommended)}
                                className="px-2 py-1 text-xs bg-white dark:bg-neutral-800 border border-yellow-300 dark:border-yellow-700 rounded hover:bg-yellow-100 dark:hover:bg-yellow-900/40 transition-colors"
                                title={recommended.reasons.join(', ')}
                              >
                                {recommended.scope === 'global' ? '🌍 ' : '🗺️ '}
                                {recommended.name}
                                <span className="ml-1 text-yellow-600 dark:text-yellow-400 font-semibold">
                                  {recommended.score}
                                </span>
                              </button>
                            ))}
                          </div>
                        </div>
                      );
                    }
                    return null;
                  })()}

                  {/* Preset Palette */}
                  {availablePresets.length > 0 && (
                    <div className="p-2 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-semibold text-blue-900 dark:text-blue-100">
                          All Presets
                        </span>
                        <Badge color="blue" className="text-[10px]">
                          {availablePresets.length}
                        </Badge>
                      </div>
                      <div className="space-y-1">
                        {availablePresets.slice(0, 5).map((preset) => {
                          const scopedPreset = preset as PresetWithScope;
                          return (
                            <button
                              key={preset.id}
                              onClick={() => applyPreset(idx, preset)}
                              className="w-full text-left px-2 py-1.5 text-xs bg-white dark:bg-neutral-800 border border-blue-200 dark:border-blue-700 rounded hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors"
                            >
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-1.5">
                                  {preset.icon && <span>{preset.icon}</span>}
                                  <span className="font-medium">{preset.name}</span>
                                  <Badge
                                    color={scopedPreset.scope === 'global' ? 'blue' : 'purple'}
                                    className="text-[10px]"
                                  >
                                    {scopedPreset.scope === 'global' ? '🌍' : '🗺️'}
                                  </Badge>
                                </div>
                                <Badge color="gray" className="text-[10px]">
                                  {preset.interactionId}
                                </Badge>
                              </div>
                              {preset.description && (
                                <div className="text-[10px] text-neutral-600 dark:text-neutral-400 mt-0.5">
                                  {preset.description}
                                </div>
                              )}
                            </button>
                          );
                        })}
                        {availablePresets.length > 5 && (
                          <div className="text-[10px] text-neutral-500 dark:text-neutral-400 text-center pt-1">
                            +{availablePresets.length - 5} more presets available
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {availablePresets.length === 0 && worldDetail && (
                    <div className="p-2 bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-200 dark:border-neutral-700 rounded">
                      <p className="text-xs text-neutral-600 dark:text-neutral-400">
                        No interaction presets defined for this world.
                      </p>
                    </div>
                  )}

                  <div className="border-t border-neutral-200 dark:border-neutral-700 pt-2">
                    <h5 className="text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                      Manual Configuration
                    </h5>
                  </div>

                  {/* Interaction Plugins */}
                  {interactionRegistry.getAll().map((plugin) => {
                    const config = interactions[plugin.id] || null;
                    const enabled = config?.enabled ?? false;

                    return (
                      <div key={plugin.id} className="mb-2">
                        <label className="flex items-center gap-2 mb-2">
                          <input
                            type="checkbox"
                            checked={enabled}
                            onChange={(e) => {
                              const newConfig = e.target.checked
                                ? { ...plugin.defaultConfig, enabled: true }
                                : { enabled: false };

                              const newInteractions = {
                                ...interactions,
                                [plugin.id]: newConfig,
                              };

                              handleHotspotChange(idx, {
                                meta: {
                                  ...meta,
                                  interactions: newInteractions,
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

                        {enabled && (
                          <InteractionConfigForm
                            plugin={plugin}
                            config={config}
                            onConfigChange={(newConfig) => {
                              const newInteractions = {
                                ...interactions,
                                [plugin.id]: newConfig,
                              };

                              handleHotspotChange(idx, {
                                meta: {
                                  ...meta,
                                  interactions: newInteractions,
                                },
                              });
                            }}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
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

      {hotspots.length === 0 && (
        <p className="text-xs text-neutral-500 text-center py-4">
          No hotspots yet. Click "Add Hotspot" above to create one.
        </p>
      )}
    </div>
  );
}
