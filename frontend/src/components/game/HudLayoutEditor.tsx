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

  // Get all available tools
  const availableTools = useMemo(() => worldToolRegistry.getAll(), []);

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
                <th className="pb-2 font-semibold text-neutral-700 dark:text-neutral-300">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
              {placements.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-4 text-center text-neutral-500 dark:text-neutral-400">
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
