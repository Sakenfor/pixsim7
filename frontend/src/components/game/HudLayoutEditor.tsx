/**
 * HUD Layout Editor Component
 *
 * Designer-friendly UI for configuring per-world HUD layouts.
 * Allows assigning world tools to regions and setting display order.
 */

import { useState, useEffect, useMemo } from 'react';
import { Panel, Button, Select } from '@pixsim7/ui';
import type { GameWorldDetail } from '../../lib/api/game';
import { updateGameWorldMeta } from '../../lib/api/game';
import { worldToolRegistry } from '../../lib/worldTools/registry';
import type {
  HudToolPlacement,
  HudRegion,
  WorldUiConfig,
} from '../../lib/worldTools/types';
import { getHudConfig } from '../../lib/worldTools/hudLayout';
import {
  loadPresets,
  createPreset,
  deletePreset,
  exportPreset,
  importPreset,
  type HudLayoutPreset,
} from '../../lib/worldTools/hudPresets';

interface HudLayoutEditorProps {
  worldDetail: GameWorldDetail;
  onSave?: (updatedWorld: GameWorldDetail) => void;
  onClose?: () => void;
}

interface ToolPlacementRow extends HudToolPlacement {
  name: string;
  description: string;
  icon?: string;
}

const VISIBILITY_CONDITION_KINDS = [
  { value: '', label: 'Always visible' },
  { value: 'session', label: 'Only when session exists' },
  { value: 'flag', label: 'When session flag is set' },
  { value: 'capability', label: 'When capability is enabled' },
  { value: 'location', label: 'At specific locations' },
  { value: 'time', label: 'During specific time' },
  { value: 'quest', label: 'When quest is active' },
  { value: 'relationship', label: 'Based on NPC relationship' },
];

const TOOL_SIZES = [
  { value: '', label: 'Default' },
  { value: 'compact', label: 'Compact' },
  { value: 'normal', label: 'Normal' },
  { value: 'expanded', label: 'Expanded' },
];

const REGIONS: { value: HudRegion; label: string }[] = [
  { value: 'top', label: 'Top' },
  { value: 'bottom', label: 'Bottom' },
  { value: 'left', label: 'Left' },
  { value: 'right', label: 'Right' },
  { value: 'overlay', label: 'Overlay' },
];

const REGION_DESCRIPTIONS: Record<HudRegion, string> = {
  top: 'Tools appear at the top of the screen',
  bottom: 'Tools appear at the bottom of the screen',
  left: 'Tools appear on the left side',
  right: 'Tools appear on the right side',
  overlay: 'Tools appear as floating overlays',
};

/**
 * HUD Layout Editor Component
 */
export function HudLayoutEditor({ worldDetail, onSave, onClose }: HudLayoutEditorProps) {
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [presets, setPresets] = useState<HudLayoutPreset[]>([]);
  const [showPresetModal, setShowPresetModal] = useState(false);
  const [presetName, setPresetName] = useState('');
  const [presetDescription, setPresetDescription] = useState('');

  // Get all available tools
  const availableTools = useMemo(() => worldToolRegistry.getAll(), []);

  // Load presets on mount
  useEffect(() => {
    setPresets(loadPresets());
  }, []);

  // Initialize placements from world config
  const [placements, setPlacements] = useState<ToolPlacementRow[]>(() => {
    const config = getHudConfig(worldDetail);
    const toolMap = new Map(availableTools.map((t) => [t.id, t]));

    if (config && config.length > 0) {
      // Use existing configuration
      return config.map((placement) => {
        const tool = toolMap.get(placement.toolId);
        return {
          ...placement,
          name: tool?.name || placement.toolId,
          description: tool?.description || '',
          icon: tool?.icon,
        };
      });
    } else {
      // Create default placements for all tools
      return availableTools.map((tool, index) => ({
        toolId: tool.id,
        name: tool.name,
        description: tool.description,
        icon: tool.icon,
        region: 'top' as HudRegion,
        order: index,
      }));
    }
  });

  // Group placements by region
  const placementsByRegion = useMemo(() => {
    const groups = new Map<HudRegion, ToolPlacementRow[]>();
    for (const region of REGIONS.map((r) => r.value)) {
      groups.set(region, []);
    }

    for (const placement of placements) {
      const regionPlacements = groups.get(placement.region) || [];
      regionPlacements.push(placement);
      groups.set(placement.region, regionPlacements);
    }

    // Sort by order within each region
    for (const [region, items] of groups.entries()) {
      items.sort((a, b) => (a.order || 0) - (b.order || 0));
      groups.set(region, items);
    }

    return groups;
  }, [placements]);

  // Handle region change
  const handleRegionChange = (toolId: string, newRegion: HudRegion) => {
    setPlacements((prev) =>
      prev.map((p) =>
        p.toolId === toolId
          ? { ...p, region: newRegion }
          : p
      )
    );
  };

  // Handle order change
  const handleOrderChange = (toolId: string, newOrder: number) => {
    setPlacements((prev) =>
      prev.map((p) =>
        p.toolId === toolId
          ? { ...p, order: newOrder }
          : p
      )
    );
  };

  // Handle remove tool
  const handleRemoveTool = (toolId: string) => {
    setPlacements((prev) => prev.filter((p) => p.toolId !== toolId));
  };

  // Handle add tool
  const handleAddTool = () => {
    const usedToolIds = new Set(placements.map((p) => p.toolId));
    const unusedTools = availableTools.filter((t) => !usedToolIds.has(t.id));

    if (unusedTools.length === 0) {
      setError('All available tools are already in the layout');
      setTimeout(() => setError(null), 3000);
      return;
    }

    const toolToAdd = unusedTools[0];
    const newPlacement: ToolPlacementRow = {
      toolId: toolToAdd.id,
      name: toolToAdd.name,
      description: toolToAdd.description,
      icon: toolToAdd.icon,
      region: 'top',
      order: placements.length,
    };

    setPlacements((prev) => [...prev, newPlacement]);
  };

  // Handle visibility condition change
  const handleConditionKindChange = (toolId: string, kind: string) => {
    setPlacements((prev) =>
      prev.map((p) => {
        if (p.toolId !== toolId) return p;
        if (!kind) {
          // Remove condition
          const { visibleWhen, ...rest } = p;
          return rest as ToolPlacementRow;
        }
        // Add or update condition
        return {
          ...p,
          visibleWhen: {
            kind: kind as 'capability' | 'flag' | 'session',
            id: p.visibleWhen?.id || '',
          },
        };
      })
    );
  };

  // Handle visibility condition ID change
  const handleConditionIdChange = (toolId: string, id: string) => {
    setPlacements((prev) =>
      prev.map((p) =>
        p.toolId === toolId && p.visibleWhen
          ? { ...p, visibleWhen: { ...p.visibleWhen, id } }
          : p
      )
    );
  };

  // Handle save
  const handleSave = async () => {
    setIsSaving(true);
    setError(null);
    setSuccessMessage(null);

    try {
      // Build HUD configuration
      const hudConfig: HudToolPlacement[] = placements.map((p) => ({
        toolId: p.toolId,
        region: p.region,
        order: p.order,
        visibleWhen: p.visibleWhen,
      }));

      // Update world metadata
      const updatedMeta: Record<string, unknown> = {
        ...worldDetail.meta,
        ui: {
          ...(worldDetail.meta?.ui as Record<string, unknown> | undefined),
          hud: hudConfig,
        } as WorldUiConfig,
      };

      const updatedWorld = await updateGameWorldMeta(worldDetail.id, updatedMeta);

      setSuccessMessage('HUD layout saved successfully!');
      setTimeout(() => setSuccessMessage(null), 3000);

      if (onSave) {
        onSave(updatedWorld);
      }
    } catch (err: any) {
      setError(`Failed to save HUD layout: ${err.message || String(err)}`);
    } finally {
      setIsSaving(false);
    }
  };

  // Preset management handlers
  const handleSaveAsPreset = () => {
    if (!presetName.trim()) {
      setError('Preset name is required');
      setTimeout(() => setError(null), 3000);
      return;
    }

    try {
      const hudConfig: HudToolPlacement[] = placements.map((p) => ({
        toolId: p.toolId,
        region: p.region,
        order: p.order,
        visibleWhen: p.visibleWhen,
      }));

      createPreset(presetName.trim(), hudConfig, presetDescription.trim() || undefined);
      setPresets(loadPresets());
      setSuccessMessage(`Preset "${presetName}" created successfully!`);
      setTimeout(() => setSuccessMessage(null), 3000);
      setShowPresetModal(false);
      setPresetName('');
      setPresetDescription('');
    } catch (err: any) {
      setError(`Failed to create preset: ${err.message || String(err)}`);
    }
  };

  const handleLoadPreset = (presetId: string) => {
    const preset = presets.find((p) => p.id === presetId);
    if (!preset) {
      setError('Preset not found');
      setTimeout(() => setError(null), 3000);
      return;
    }

    // Map preset placements to tool rows
    const toolMap = new Map(availableTools.map((t) => [t.id, t]));
    const newPlacements: ToolPlacementRow[] = preset.placements.map((placement) => {
      const tool = toolMap.get(placement.toolId);
      return {
        ...placement,
        name: tool?.name || placement.toolId,
        description: tool?.description || '',
        icon: tool?.icon,
      };
    });

    setPlacements(newPlacements);
    setSuccessMessage(`Loaded preset: ${preset.name}`);
    setTimeout(() => setSuccessMessage(null), 3000);
  };

  const handleDeletePreset = (presetId: string) => {
    if (!confirm('Are you sure you want to delete this preset?')) return;

    try {
      deletePreset(presetId);
      setPresets(loadPresets());
      setSuccessMessage('Preset deleted successfully');
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err: any) {
      setError(`Failed to delete preset: ${err.message || String(err)}`);
    }
  };

  const handleExportPreset = (presetId: string) => {
    const json = exportPreset(presetId);
    if (!json) {
      setError('Failed to export preset');
      setTimeout(() => setError(null), 3000);
      return;
    }

    // Copy to clipboard
    navigator.clipboard.writeText(json).then(
      () => {
        setSuccessMessage('Preset copied to clipboard!');
        setTimeout(() => setSuccessMessage(null), 3000);
      },
      () => {
        // Fallback: download as file
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `hud-preset-${presetId}.json`;
        a.click();
        URL.revokeObjectURL(url);
      }
    );
  };

  const handleImportPreset = () => {
    const json = prompt('Paste preset JSON:');
    if (!json) return;

    try {
      const preset = importPreset(json);
      if (!preset) {
        setError('Invalid preset format');
        setTimeout(() => setError(null), 3000);
        return;
      }

      setPresets(loadPresets());
      setSuccessMessage(`Imported preset: ${preset.name}`);
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err: any) {
      setError(`Failed to import preset: ${err.message || String(err)}`);
    }
  };

  return (
    <Panel className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-neutral-800 dark:text-neutral-200">
            HUD Layout Editor
          </h2>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            Configure the HUD layout for world: {worldDetail.name}
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

      <div className="space-y-4">
        {/* Tool Placement Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-neutral-300 dark:border-neutral-700">
              <tr className="text-left">
                <th className="pb-2 font-semibold text-neutral-700 dark:text-neutral-300">Tool</th>
                <th className="pb-2 font-semibold text-neutral-700 dark:text-neutral-300">Region</th>
                <th className="pb-2 font-semibold text-neutral-700 dark:text-neutral-300">Order</th>
                <th className="pb-2 font-semibold text-neutral-700 dark:text-neutral-300">Visibility</th>
                <th className="pb-2 font-semibold text-neutral-700 dark:text-neutral-300">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
              {placements.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-4 text-center text-neutral-500 dark:text-neutral-400">
                    No tools in layout. Click "Add Tool" to add one.
                  </td>
                </tr>
              ) : (
                placements.map((placement) => (
                  <tr key={placement.toolId} className="hover:bg-neutral-50 dark:hover:bg-neutral-800/50">
                    <td className="py-2">
                      <div className="flex items-center gap-2">
                        {placement.icon && <span className="text-lg">{placement.icon}</span>}
                        <div>
                          <div className="font-medium text-neutral-800 dark:text-neutral-200">
                            {placement.name}
                          </div>
                          <div className="text-xs text-neutral-500 dark:text-neutral-400">
                            {placement.description}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="py-2">
                      <Select
                        size="sm"
                        value={placement.region}
                        onChange={(e) => handleRegionChange(placement.toolId, e.target.value as HudRegion)}
                        title={REGION_DESCRIPTIONS[placement.region]}
                      >
                        {REGIONS.map((region) => (
                          <option key={region.value} value={region.value}>
                            {region.label}
                          </option>
                        ))}
                      </Select>
                    </td>
                    <td className="py-2">
                      <input
                        type="number"
                        min="0"
                        value={placement.order || 0}
                        onChange={(e) => handleOrderChange(placement.toolId, parseInt(e.target.value, 10))}
                        className="w-20 px-2 py-1 text-sm border border-neutral-300 dark:border-neutral-700 rounded bg-white dark:bg-neutral-800 text-neutral-800 dark:text-neutral-200"
                      />
                    </td>
                    <td className="py-2">
                      <div className="space-y-1">
                        <Select
                          size="sm"
                          value={placement.visibleWhen?.kind || ''}
                          onChange={(e) => handleConditionKindChange(placement.toolId, e.target.value)}
                          title="Visibility condition"
                        >
                          {VISIBILITY_CONDITION_KINDS.map((kind) => (
                            <option key={kind.value} value={kind.value}>
                              {kind.label}
                            </option>
                          ))}
                        </Select>
                        {placement.visibleWhen && placement.visibleWhen.kind !== 'session' && (
                          <input
                            type="text"
                            placeholder={
                              placement.visibleWhen.kind === 'flag'
                                ? 'e.g., world.mode'
                                : 'e.g., game'
                            }
                            value={placement.visibleWhen.id || ''}
                            onChange={(e) => handleConditionIdChange(placement.toolId, e.target.value)}
                            className="w-full px-2 py-1 text-xs border border-neutral-300 dark:border-neutral-700 rounded bg-white dark:bg-neutral-800 text-neutral-800 dark:text-neutral-200"
                          />
                        )}
                      </div>
                    </td>
                    <td className="py-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleRemoveTool(placement.toolId)}
                        title="Remove tool from layout"
                      >
                        Remove
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Add Tool Button */}
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" onClick={handleAddTool}>
            Add Tool
          </Button>
        </div>

        {/* Preset Management */}
        <div className="space-y-3 pt-4 border-t border-neutral-300 dark:border-neutral-700">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">
              Layout Presets
            </h3>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setShowPresetModal(true)}
                title="Save current layout as a reusable preset"
              >
                Save as Preset
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={handleImportPreset}
                title="Import preset from JSON"
              >
                Import
              </Button>
            </div>
          </div>

          {presets.length === 0 ? (
            <p className="text-xs text-neutral-500 dark:text-neutral-400 italic">
              No presets saved yet. Save your current layout to create a preset.
            </p>
          ) : (
            <div className="space-y-2">
              {presets.map((preset) => (
                <div
                  key={preset.id}
                  className="flex items-center justify-between p-2 border border-neutral-300 dark:border-neutral-700 rounded bg-neutral-50 dark:bg-neutral-800/50"
                >
                  <div className="flex-1">
                    <div className="font-medium text-sm text-neutral-800 dark:text-neutral-200">
                      {preset.name}
                    </div>
                    {preset.description && (
                      <div className="text-xs text-neutral-500 dark:text-neutral-400">
                        {preset.description}
                      </div>
                    )}
                    <div className="text-xs text-neutral-400 dark:text-neutral-500">
                      {preset.placements.length} tools
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant="primary"
                      onClick={() => handleLoadPreset(preset.id)}
                      title="Load this preset"
                    >
                      Load
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleExportPreset(preset.id)}
                      title="Export to clipboard"
                    >
                      Export
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleDeletePreset(preset.id)}
                      title="Delete this preset"
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Save Preset Modal */}
        {showPresetModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <Panel className="w-full max-w-md space-y-3">
              <h3 className="text-lg font-semibold text-neutral-800 dark:text-neutral-200">
                Save Layout as Preset
              </h3>
              <div className="space-y-2">
                <div>
                  <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                    Preset Name *
                  </label>
                  <input
                    type="text"
                    value={presetName}
                    onChange={(e) => setPresetName(e.target.value)}
                    placeholder="e.g., Minimal HUD"
                    className="w-full px-3 py-2 text-sm border border-neutral-300 dark:border-neutral-700 rounded bg-white dark:bg-neutral-800 text-neutral-800 dark:text-neutral-200"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                    Description (optional)
                  </label>
                  <textarea
                    value={presetDescription}
                    onChange={(e) => setPresetDescription(e.target.value)}
                    placeholder="Describe this layout..."
                    rows={3}
                    className="w-full px-3 py-2 text-sm border border-neutral-300 dark:border-neutral-700 rounded bg-white dark:bg-neutral-800 text-neutral-800 dark:text-neutral-200"
                  />
                </div>
              </div>
              <div className="flex gap-2 justify-end">
                <Button
                  variant="secondary"
                  onClick={() => {
                    setShowPresetModal(false);
                    setPresetName('');
                    setPresetDescription('');
                  }}
                >
                  Cancel
                </Button>
                <Button variant="primary" onClick={handleSaveAsPreset}>
                  Save Preset
                </Button>
              </div>
            </Panel>
          </div>
        )}

        {/* Region Preview */}
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">
            Preview by Region
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {REGIONS.map((region) => {
              const tools = placementsByRegion.get(region.value) || [];
              return (
                <div
                  key={region.value}
                  className="p-3 border border-neutral-300 dark:border-neutral-700 rounded bg-neutral-50 dark:bg-neutral-800/50"
                >
                  <div className="font-semibold text-sm text-neutral-800 dark:text-neutral-200 mb-1">
                    {region.label}
                  </div>
                  <div className="text-xs text-neutral-500 dark:text-neutral-400 mb-2">
                    {REGION_DESCRIPTIONS[region.value]}
                  </div>
                  {tools.length === 0 ? (
                    <div className="text-xs text-neutral-400 dark:text-neutral-500 italic">
                      No tools
                    </div>
                  ) : (
                    <div className="space-y-1">
                      {tools.map((tool, index) => (
                        <div
                          key={tool.toolId}
                          className="text-xs flex items-center gap-1 text-neutral-700 dark:text-neutral-300"
                        >
                          <span className="text-neutral-400 dark:text-neutral-500">
                            {index + 1}.
                          </span>
                          {tool.icon && <span>{tool.icon}</span>}
                          <span>{tool.name}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Save Button */}
        <div className="flex gap-2 pt-2 border-t border-neutral-300 dark:border-neutral-700">
          <Button
            variant="primary"
            onClick={handleSave}
            disabled={isSaving}
          >
            {isSaving ? 'Saving...' : 'Save HUD Layout'}
          </Button>
          {onClose && (
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
          )}
        </div>
      </div>
    </Panel>
  );
}
