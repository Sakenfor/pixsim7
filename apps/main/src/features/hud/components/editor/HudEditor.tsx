/**
 * HUD Layout Editor Component
 *
 * Designer-friendly UI for configuring per-world HUD layouts.
 * Allows assigning world tools to regions and setting display order.
 *
 * Type Architecture (Task 99 Update):
 * - Uses gameplay-ui-core types (HudSurfaceConfig, HudWidgetConfig)
 * - Internally works with HudToolPlacement[] for backwards compatibility
 * - Uses mapping helpers (fromHudToolPlacements/toHudToolPlacements) when needed
 * - This allows HUD to interoperate with the unified editing-core layer
 */

import { useState, useEffect, useMemo } from 'react';
import { Button, Select, Modal, FormField, Input } from '@pixsim7/shared.ui';
import type { GameWorldDetail } from '@lib/api/game';
import { updateGameWorldMeta } from '@lib/api/game';
import { worldToolRegistry, type HudToolPlacement, type HudRegion, type WorldUiConfig, getHudConfig } from '@features/worldTools';
import {
  createPreset,
  deletePreset,
  exportPreset,
  importPreset,
  getAllPresets,
  publishPresetToWorld,
  copyWorldPresetToLocal,
  deleteWorldPreset,
  isWorldPreset,
  type HudLayoutPreset,
} from '@features/worldTools/lib/hudPresets';
import {
  getAvailableProfiles,
  saveProfileLayout,
  getProfileLayout,
  type HudProfile,
} from '@features/worldTools/lib/hudProfiles';
// Editing Core - Shared undo/redo hook
import { useUndoRedo } from '@lib/editing-core';
// Gameplay UI Core - HUD-specific config layer
import {
  type HudSurfaceConfig,
  type HudWidgetConfig,
  fromHudToolPlacements,
  toHudToolPlacements,
} from '@lib/gameplay-ui-core';
import { SurfaceWorkbench, type SurfaceWorkbenchStatus } from '@/components/surface-workbench';

export interface HudLayoutEditorProps {
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
 * HUD Editor Component (formerly HudLayoutEditor)
 *
 * Refactored as part of Task 101 - Modularization & Gameplay UI Core Integration
 */
export function HudEditor({ worldDetail, onSave, onClose }: HudLayoutEditorProps) {
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [presets, setPresets] = useState<HudLayoutPreset[]>([]);
  const [showPresetModal, setShowPresetModal] = useState(false);
  const [presetName, setPresetName] = useState('');
  const [presetDescription, setPresetDescription] = useState('');

  // Phase 6: Profile and view mode selection
  const [selectedProfile, setSelectedProfile] = useState<string>('default');
  const [selectedViewMode, setSelectedViewMode] = useState<'all' | 'cinematic' | 'hud-heavy' | 'debug'>('all');
  const [availableProfiles, setAvailableProfiles] = useState<HudProfile[]>([]);

  // Validation warnings
  const [warnings, setWarnings] = useState<string[]>([]);

  const statusMessages = useMemo<SurfaceWorkbenchStatus[]>(() => {
    const messages: SurfaceWorkbenchStatus[] = [];

    if (error) {
      messages.push({
        type: 'error',
        content: error,
      });
    }

    if (successMessage) {
      messages.push({
        type: 'success',
        content: successMessage,
      });
    }

    if (warnings.length > 0) {
      messages.push({
        type: 'warning',
        content: (
          <div>
            <div className="font-semibold text-sm mb-1">Layout warnings</div>
            <ul className="list-disc pl-5 text-sm space-y-1">
              {warnings.map((warning, index) => (
                <li key={index}>{warning}</li>
              ))}
            </ul>
          </div>
        ),
      });
    }

    return messages;
  }, [error, successMessage, warnings]);

  // Get all available tools
  const availableTools = useMemo(() => worldToolRegistry.getAll(), []);

  // Load presets and profiles on mount
  useEffect(() => {
    setPresets(getAllPresets(worldDetail));
    setAvailableProfiles(getAvailableProfiles());
  }, [worldDetail]);

  // Helper function to load placements for current profile/view mode
  const loadPlacementsForProfile = (profileId: string, viewMode: 'all' | 'cinematic' | 'hud-heavy' | 'debug'): ToolPlacementRow[] => {
    const toolMap = new Map(availableTools.map((t) => [t.id, t]));

    // Get profile-specific layout if view mode is not 'all'
    let config: HudToolPlacement[] | null = null;
    if (viewMode !== 'all') {
      config = getProfileLayout(worldDetail, profileId, viewMode);
    }

    // Fall back to base profile layout or default layout
    if (!config) {
      config = profileId === 'default'
        ? getHudConfig(worldDetail)
        : getProfileLayout(worldDetail, profileId) || getHudConfig(worldDetail);
    }

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
  };

  // Initialize placements with undo/redo support (Task 101: Using editing-core useUndoRedo)
  const placementsUndo = useUndoRedo<ToolPlacementRow[]>(
    loadPlacementsForProfile('default', 'all')
  );
  const placements = placementsUndo.value;
  const setPlacements = placementsUndo.set;

  // Reload placements when profile or view mode changes
  useEffect(() => {
    const newPlacements = loadPlacementsForProfile(selectedProfile, selectedViewMode);
    placementsUndo.reset(newPlacements);  // Use reset() to clear history when switching profiles
  }, [selectedProfile, selectedViewMode, worldDetail]);

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
            kind: kind as any,
            id: p.visibleWhen?.id || '',
          },
        };
      })
    );
  };

  // Handle time condition changes
  const handleTimeConditionChange = (toolId: string, field: 'dayOfWeek' | 'hourStart' | 'hourEnd', value: any) => {

    setPlacements((prev) =>
      prev.map((p) => {
        if (p.toolId !== toolId || !p.visibleWhen) return p;

        if (field === 'dayOfWeek') {
          return {
            ...p,
            visibleWhen: {
              ...p.visibleWhen,
              dayOfWeek: value === 'any' ? 'any' : parseInt(value, 10),
            },
          };
        } else if (field === 'hourStart') {
          const current = p.visibleWhen.hourRange || [0, 23];
          return {
            ...p,
            visibleWhen: {
              ...p.visibleWhen,
              hourRange: [parseInt(value, 10), current[1]],
            },
          };
        } else if (field === 'hourEnd') {
          const current = p.visibleWhen.hourRange || [0, 23];
          return {
            ...p,
            visibleWhen: {
              ...p.visibleWhen,
              hourRange: [current[0], parseInt(value, 10)],
            },
          };
        }

        return p;
      })
    );
  };

  // Handle relationship condition change
  const handleRelationshipConditionChange = (toolId: string, minLevel: number) => {

    setPlacements((prev) =>
      prev.map((p) => {
        if (p.toolId !== toolId || !p.visibleWhen) return p;
        return {
          ...p,
          visibleWhen: {
            ...p.visibleWhen,
            minRelationship: minLevel,
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

  // Phase 6: Enhanced layout control handlers
  const handleSizeChange = (toolId: string, size: string) => {

    setPlacements((prev) =>
      prev.map((p) =>
        p.toolId === toolId ? { ...p, size: size as any || undefined } : p
      )
    );
  };

  const handleCollapsedChange = (toolId: string, collapsed: boolean) => {

    setPlacements((prev) =>
      prev.map((p) =>
        p.toolId === toolId ? { ...p, defaultCollapsed: collapsed } : p
      )
    );
  };

  const handleZIndexChange = (toolId: string, zIndex: number) => {

    setPlacements((prev) =>
      prev.map((p) =>
        p.toolId === toolId
          ? { ...p, zIndex: isNaN(zIndex) ? undefined : zIndex }
          : p
      )
    );
  };

  // Undo/Redo functionality (Task 101: Now using editing-core useUndoRedo)
  // No need for manual history management - the hook handles it
  const undo = placementsUndo.undo;
  const redo = placementsUndo.redo;
  const canUndo = placementsUndo.canUndo;
  const canRedo = placementsUndo.canRedo;

  // Validation
  const validateLayout = (): string[] => {
    const warnings: string[] = [];

    // Check for tools with impossible conditions
    placements.forEach((p) => {
      if (
        p.visibleWhen?.kind === 'composite' &&
        (!p.visibleWhen.conditions || p.visibleWhen.conditions.length === 0)
      ) {
        warnings.push(`Tool "${p.name}" has composite condition with no sub-conditions`);
      }

      if (p.visibleWhen?.kind === 'time' && !p.visibleWhen.hourRange && p.visibleWhen.dayOfWeek === undefined) {
        warnings.push(`Tool "${p.name}" has time condition but no time range or day specified`);
      }

      if ((p.visibleWhen?.kind === 'location' || p.visibleWhen?.kind === 'quest' || p.visibleWhen?.kind === 'relationship') && !p.visibleWhen.id) {
        warnings.push(`Tool "${p.name}" has ${p.visibleWhen.kind} condition but no ID specified`);
      }
    });

    // Check for duplicate orders in same region
    const regionOrders = new Map<HudRegion, Set<number>>();
    placements.forEach((p) => {
      if (!regionOrders.has(p.region)) {
        regionOrders.set(p.region, new Set());
      }
      if (p.order !== undefined && regionOrders.get(p.region)!.has(p.order)) {
        warnings.push(`Duplicate order ${p.order} in ${p.region} region`);
      }
      regionOrders.get(p.region)!.add(p.order || 0);
    });

    return warnings;
  };

  // Update warnings when placements change
  useEffect(() => {
    const newWarnings = validateLayout();
    setWarnings(newWarnings);
  }, [placements]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        if (e.key === 's') {
          e.preventDefault();
          handleSave();
        }
        if (e.key === 'z' && !e.shiftKey) {
          e.preventDefault();
          undo();
        }
        if (e.key === 'z' && e.shiftKey) {
          e.preventDefault();
          redo();
        }
        if (e.key === 'y') {
          e.preventDefault();
          redo();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo, handleSave]);  // Task 101: Updated dependencies for useUndoRedo

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
        size: p.size,
        defaultCollapsed: p.defaultCollapsed,
        zIndex: p.zIndex,
        customClassName: p.customClassName,
      }));

      let updatedMeta: Record<string, unknown>;

      // Phase 6: Save to profile-specific layout if not default profile or specific view mode
      if (selectedProfile !== 'default' || selectedViewMode !== 'all') {
        const viewMode = selectedViewMode === 'all' ? undefined : selectedViewMode;
        updatedMeta = saveProfileLayout(worldDetail, selectedProfile, hudConfig, viewMode);
      } else {
        // Save to default layout
        updatedMeta = {
          ...worldDetail.meta,
          ui: {
            ...(worldDetail.meta?.ui as Record<string, unknown> | undefined),
            hud: hudConfig,
          } as WorldUiConfig,
        };
      }

      const updatedWorld = await updateGameWorldMeta(worldDetail.id, updatedMeta);

      const profileInfo = selectedProfile !== 'default' ? ` (Profile: ${selectedProfile}${selectedViewMode !== 'all' ? `, View: ${selectedViewMode}` : ''})` : '';
      setSuccessMessage(`HUD layout saved successfully!${profileInfo}`);
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
      setPresets(getAllPresets(worldDetail));
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

  const handleDeletePreset = async (presetId: string) => {
    if (!confirm('Are you sure you want to delete this preset?')) return;

    try {
      // Check if it's a world preset
      const isWorld = isWorldPreset(worldDetail, presetId);

      if (isWorld) {
        // Delete world preset
        const updatedMeta = deleteWorldPreset(worldDetail, presetId);
        if (updatedMeta) {
          const updatedWorld = await updateGameWorldMeta(worldDetail.id, updatedMeta);
          if (onSave) {
            onSave(updatedWorld);
          }
        }
      } else {
        // Delete local preset
        deletePreset(presetId);
      }

      setPresets(getAllPresets(worldDetail));
      setSuccessMessage('Preset deleted successfully');
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err: any) {
      setError(`Failed to delete preset: ${err.message || String(err)}`);
    }
  };

  // Phase 7: Publish preset to world
  const handlePublishToWorld = async (presetId: string) => {
    if (!confirm('Publish this preset to the world? It will be available to all users.')) return;

    try {
      const updatedMeta = publishPresetToWorld(worldDetail, presetId);
      if (!updatedMeta) {
        setError('Failed to publish preset');
        setTimeout(() => setError(null), 3000);
        return;
      }

      const updatedWorld = await updateGameWorldMeta(worldDetail.id, updatedMeta);
      if (onSave) {
        onSave(updatedWorld);
      }

      setPresets(getAllPresets(worldDetail));
      setSuccessMessage('Preset published to world successfully!');
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err: any) {
      setError(`Failed to publish preset: ${err.message || String(err)}`);
    }
  };

  // Phase 7: Copy world preset to local
  const handleCopyToLocal = (presetId: string) => {
    try {
      const copiedPreset = copyWorldPresetToLocal(worldDetail, presetId);
      if (!copiedPreset) {
        setError('Failed to copy preset');
        setTimeout(() => setError(null), 3000);
        return;
      }

      setPresets(getAllPresets(worldDetail));
      setSuccessMessage(`Preset copied to local: ${copiedPreset.name}`);
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err: any) {
      setError(`Failed to copy preset: ${err.message || String(err)}`);
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

      setPresets(getAllPresets(worldDetail));
      setSuccessMessage(`Imported preset: ${preset.name}`);
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err: any) {
      setError(`Failed to import preset: ${err.message || String(err)}`);
    }
  };

  // Phase 2 (Task 101): Export/Import using gameplay-ui-core converters
  const handleExportUnified = () => {
    try {
      // Convert current placements to HudSurfaceConfig
      const surfaceConfig = fromHudToolPlacements(
        placements.map(p => {
          const { name, description, icon, ...placement } = p;
          return placement;
        }),
        {
          id: `hud-export-${Date.now()}`,
          name: `${worldDetail.name} HUD Layout`,
          description: `Exported from profile: ${selectedProfile}, view mode: ${selectedViewMode}`,
          profileId: selectedProfile,
          viewMode: selectedViewMode as any,
          worldId: worldDetail.id,
        }
      );

      // Export as JSON
      const json = JSON.stringify(surfaceConfig, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `hud-layout-${worldDetail.name}-${selectedProfile}-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);

      setSuccessMessage('Layout exported successfully (HudSurfaceConfig format)');
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err: any) {
      setError(`Failed to export layout: ${err.message || String(err)}`);
      setTimeout(() => setError(null), 3000);
    }
  };

  const handleImportUnified = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.onchange = async (e: any) => {
      try {
        const file = e.target?.files?.[0];
        if (!file) return;

        const text = await file.text();
        const config: HudSurfaceConfig = JSON.parse(text);

        // Validate it's a HudSurfaceConfig
        if (!config.componentType || config.componentType !== 'hud') {
          setError('Invalid format: Not a HUD layout configuration');
          setTimeout(() => setError(null), 3000);
          return;
        }

        // Convert back to HudToolPlacement[]
        const importedPlacements = toHudToolPlacements(config);

        // Enrich with tool metadata
        const toolMap = new Map(availableTools.map(t => [t.id, t]));
        const enrichedPlacements: ToolPlacementRow[] = importedPlacements.map(p => ({
          ...p,
          name: toolMap.get(p.toolId)?.name || p.toolId,
          description: toolMap.get(p.toolId)?.description || '',
          icon: toolMap.get(p.toolId)?.icon,
        }));

        placementsUndo.set(enrichedPlacements);
        setSuccessMessage(`Imported layout: ${config.name || 'Unnamed'}`);
        setTimeout(() => setSuccessMessage(null), 3000);
      } catch (err: any) {
        setError(`Failed to import layout: ${err.message || String(err)}`);
        setTimeout(() => setError(null), 3000);
      }
    };
    input.click();
  };

  const headerActions = onClose ? (
    <Button size="sm" variant="ghost" onClick={onClose}>
      Close
    </Button>
  ) : undefined;

  const profileSelectors = (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-300 dark:border-blue-700 rounded">
      <div className="space-y-2">
        <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
          HUD Profile
        </label>
        <Select
          value={selectedProfile}
          onChange={(e) => setSelectedProfile(e.target.value)}
          className="w-full"
        >
          {availableProfiles.map((profile) => (
            <option key={profile.id} value={profile.id}>
              {profile.icon} {profile.name}
            </option>
          ))}
        </Select>
        <p className="text-xs text-neutral-600 dark:text-neutral-400">
          Choose which profile's layout to edit
        </p>
      </div>

      <div className="space-y-2">
        <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
          View Mode (Optional)
        </label>
        <Select
          value={selectedViewMode}
          onChange={(e) => setSelectedViewMode(e.target.value as any)}
          className="w-full"
        >
          <option value="all">All View Modes</option>
          <option value="cinematic">Cinematic</option>
          <option value="hud-heavy">HUD Heavy</option>
          <option value="debug">Debug</option>
        </Select>
        <p className="text-xs text-neutral-600 dark:text-neutral-400">
          Customize layout for specific view mode
        </p>
      </div>
    </div>
  );

  const undoRedoControls = (
    <div className="flex items-center gap-2 text-xs text-neutral-600 dark:text-neutral-400">
      <Button
        size="sm"
        variant="ghost"
        onClick={undo}
        disabled={!canUndo}
        title="Undo (Ctrl+Z)"
      >
        Undo
      </Button>
      <Button
        size="sm"
        variant="ghost"
        onClick={redo}
        disabled={!canRedo}
        title="Redo (Ctrl+Shift+Z or Ctrl+Y)"
      >
        Redo
      </Button>
      <span className="ml-auto">
        Tip: Use Ctrl+S to save, Ctrl+Z to undo
      </span>
    </div>
  );

  const toolPlacementTable = (
    <div className="space-y-4">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-neutral-300 dark:border-neutral-700">
            <tr className="text-left">
              <th className="pb-2 font-semibold text-neutral-700 dark:text-neutral-300">Tool</th>
              <th className="pb-2 font-semibold text-neutral-700 dark:text-neutral-300">Region</th>
              <th className="pb-2 font-semibold text-neutral-700 dark:text-neutral-300">Order</th>
              <th className="pb-2 font-semibold text-neutral-700 dark:text-neutral-300">Size</th>
              <th className="pb-2 font-semibold text-neutral-700 dark:text-neutral-300">Options</th>
              <th className="pb-2 font-semibold text-neutral-700 dark:text-neutral-300">Visibility</th>
              <th className="pb-2 font-semibold text-neutral-700 dark:text-neutral-300">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
            {placements.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-4 text-center text-neutral-500 dark:text-neutral-400">
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
                    <Select
                      size="sm"
                      value={placement.size || ''}
                      onChange={(e) => handleSizeChange(placement.toolId, e.target.value)}
                      title="Tool size variant"
                    >
                      {TOOL_SIZES.map((size) => (
                        <option key={size.value} value={size.value}>
                          {size.label}
                        </option>
                      ))}
                    </Select>
                  </td>
                  <td className="py-2">
                    <div className="flex flex-col gap-1">
                      <label className="flex items-center gap-1 text-xs cursor-pointer">
                        <input
                          type="checkbox"
                          checked={placement.defaultCollapsed || false}
                          onChange={(e) => handleCollapsedChange(placement.toolId, e.target.checked)}
                          className="cursor-pointer"
                        />
                        <span>Start collapsed</span>
                      </label>
                      {placement.region === 'overlay' && (
                        <input
                          type="number"
                          placeholder="Z-index"
                          value={placement.zIndex || ''}
                          onChange={(e) => handleZIndexChange(placement.toolId, parseInt(e.target.value, 10))}
                          className="w-20 px-1 py-0.5 text-xs border border-neutral-300 dark:border-neutral-700 rounded bg-white dark:bg-neutral-800"
                          title="Stacking order (higher = on top)"
                        />
                      )}
                    </div>
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
                      {placement.visibleWhen && placement.visibleWhen.kind === 'location' && (
                        <input
                          type="text"
                          placeholder="Location IDs (e.g., 1,3,5)"
                          value={placement.visibleWhen.id || ''}
                          onChange={(e) => handleConditionIdChange(placement.toolId, e.target.value)}
                          className="w-full px-2 py-1 text-xs border border-neutral-300 dark:border-neutral-700 rounded bg-white dark:bg-neutral-800"
                          title="Comma-separated location IDs"
                        />
                      )}
                      {placement.visibleWhen && placement.visibleWhen.kind === 'time' && (
                        <>
                          <select
                            value={placement.visibleWhen.dayOfWeek || 'any'}
                            onChange={(e) => handleTimeConditionChange(placement.toolId, 'dayOfWeek', e.target.value)}
                            className="w-full px-2 py-1 text-xs border border-neutral-300 dark:border-neutral-700 rounded bg-white dark:bg-neutral-800"
                          >
                            <option value="any">Any Day</option>
                            <option value="1">Monday</option>
                            <option value="2">Tuesday</option>
                            <option value="3">Wednesday</option>
                            <option value="4">Thursday</option>
                            <option value="5">Friday</option>
                            <option value="6">Saturday</option>
                            <option value="0">Sunday</option>
                          </select>
                          <div className="flex gap-1">
                            <input
                              type="number"
                              min="0"
                              max="23"
                              placeholder="Start hour"
                              value={placement.visibleWhen.hourRange?.[0] || ''}
                              onChange={(e) => handleTimeConditionChange(placement.toolId, 'hourStart', e.target.value)}
                              className="w-16 px-1 py-0.5 text-xs border border-neutral-300 dark:border-neutral-700 rounded bg-white dark:bg-neutral-800"
                            />
                            <span className="text-xs">to</span>
                            <input
                              type="number"
                              min="0"
                              max="23"
                              placeholder="End hour"
                              value={placement.visibleWhen.hourRange?.[1] || ''}
                              onChange={(e) => handleTimeConditionChange(placement.toolId, 'hourEnd', e.target.value)}
                              className="w-16 px-1 py-0.5 text-xs border border-neutral-300 dark:border-neutral-700 rounded bg-white dark:bg-neutral-800"
                            />
                          </div>
                        </>
                      )}
                      {placement.visibleWhen && placement.visibleWhen.kind === 'quest' && (
                        <input
                          type="text"
                          placeholder="Quest ID"
                          value={placement.visibleWhen.id || ''}
                          onChange={(e) => handleConditionIdChange(placement.toolId, e.target.value)}
                          className="w-full px-2 py-1 text-xs border border-neutral-300 dark:border-neutral-700 rounded bg-white dark:bg-neutral-800"
                        />
                      )}
                      {placement.visibleWhen && placement.visibleWhen.kind === 'relationship' && (
                        <>
                          <input
                            type="text"
                            placeholder="NPC ID"
                            value={placement.visibleWhen.id || ''}
                            onChange={(e) => handleConditionIdChange(placement.toolId, e.target.value)}
                            className="w-full px-2 py-1 text-xs border border-neutral-300 dark:border-neutral-700 rounded bg-white dark:bg-neutral-800"
                          />
                          <input
                            type="number"
                            min="0"
                            max="100"
                            placeholder="Min level (0-100)"
                            value={placement.visibleWhen.minRelationship || ''}
                            onChange={(e) => handleRelationshipConditionChange(placement.toolId, parseInt(e.target.value, 10))}
                            className="w-full px-2 py-1 text-xs border border-neutral-300 dark:border-neutral-700 rounded bg-white dark:bg-neutral-800"
                          />
                        </>
                      )}
                      {placement.visibleWhen && (placement.visibleWhen.kind === 'flag' || placement.visibleWhen.kind === 'capability') && (
                        <input
                          type="text"
                          placeholder={
                            placement.visibleWhen.kind === 'flag'
                              ? 'e.g., world.mode'
                              : 'e.g., game'
                          }
                          value={placement.visibleWhen.id || ''}
                          onChange={(e) => handleConditionIdChange(placement.toolId, e.target.value)}
                          className="w-full px-2 py-1 text-xs border border-neutral-300 dark:border-neutral-700 rounded bg-white dark:bg-neutral-800"
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
      <div className="flex gap-2">
        <Button size="sm" variant="secondary" onClick={handleAddTool}>
          Add Tool
        </Button>
      </div>
    </div>
  );

  const presetManagement = (
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
            title="Import preset from JSON (legacy format)"
          >
            Import Legacy
          </Button>
        </div>
      </div>

      <div className="p-3 bg-purple-50 dark:bg-purple-900/20 border border-purple-300 dark:border-purple-700 rounded">
        <div className="flex items-center justify-between mb-2">
          <div>
            <div className="text-sm font-semibold text-purple-800 dark:text-purple-200">
              Unified Format (HudSurfaceConfig)
            </div>
            <div className="text-xs text-purple-600 dark:text-purple-400">
              New format compatible with editing-core architecture
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={handleExportUnified}
              title="Export layout as HudSurfaceConfig JSON (unified format)"
            >
              Export
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={handleImportUnified}
              title="Import HudSurfaceConfig JSON (unified format)"
            >
              Import
            </Button>
          </div>
        </div>
        <div className="text-xs text-purple-600 dark:text-purple-400">
          Includes profile, view mode, and world context. Compatible with future overlay/HUD sharing.
        </div>
      </div>

      {presets.length === 0 ? (
        <p className="text-xs text-neutral-500 dark:text-neutral-400 italic">
          No presets saved yet. Save your current layout to create a preset.
        </p>
      ) : (
        <div className="space-y-2">
          {presets.map((preset) => {
            const isWorld = preset.scope === 'world';
            const isLocal = !isWorld;

            return (
              <div
                key={preset.id}
                className={`flex items-center justify-between p-2 border rounded ${
                  isWorld
                    ? 'border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/30'
                    : 'border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800/50'
                }`}
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <div className="font-medium text-sm text-neutral-800 dark:text-neutral-200">
                      {preset.name}
                    </div>
                    <span
                      className={`text-xs px-1.5 py-0.5 rounded ${
                        isWorld
                          ? 'bg-blue-200 dark:bg-blue-800 text-blue-800 dark:text-blue-200'
                          : 'bg-neutral-200 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-300'
                      }`}
                    >
                      {isWorld ? 'World' : 'Local'}
                    </span>
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
                <div className="flex gap-1 flex-wrap justify-end">
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={() => handleLoadPreset(preset.id)}
                    title="Load this preset"
                  >
                    Load
                  </Button>
                  {isLocal && (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => handlePublishToWorld(preset.id)}
                      title="Publish to world (share with all users)"
                    >
                      Publish
                    </Button>
                  )}
                  {isWorld && (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => handleCopyToLocal(preset.id)}
                      title="Copy to local presets"
                    >
                      Copy
                    </Button>
                  )}
                  {isLocal && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleExportPreset(preset.id)}
                      title="Export to clipboard"
                    >
                      Export
                    </Button>
                  )}
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
            );
          })}
        </div>
      )}
    </div>
  );

  const presetModal = (
    <Modal
      isOpen={showPresetModal}
      onClose={() => {
        setShowPresetModal(false);
        setPresetName('');
        setPresetDescription('');
      }}
      title="Save Layout as Preset"
      size="sm"
    >
      <div className="space-y-4">
        <FormField label="Preset Name" required size="md">
          <Input
            type="text"
            size="md"
            value={presetName}
            onChange={(e) => setPresetName(e.target.value)}
            placeholder="e.g., Minimal HUD"
          />
        </FormField>

        <FormField label="Description" optional size="md">
          <textarea
            value={presetDescription}
            onChange={(e) => setPresetDescription(e.target.value)}
            placeholder="Describe this layout..."
            rows={3}
            className="w-full px-3 py-2 text-sm border border-neutral-300 dark:border-neutral-700 rounded bg-white dark:bg-neutral-800 text-neutral-800 dark:text-neutral-200"
          />
        </FormField>
      </div>

      <div className="flex gap-2 justify-end mt-4">
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
    </Modal>
  );

  const regionPreview = (
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
  );

  const footerContent = (
    <div className="flex gap-2 flex-wrap">
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
  );

  const mainContent = (
    <div className="space-y-4">
      {profileSelectors}
      {undoRedoControls}
      {toolPlacementTable}
      {presetManagement}
      {presetModal}
      {regionPreview}
    </div>
  );

  return (
    <SurfaceWorkbench
      title="HUD Layout Editor"
      description={`Configure the HUD layout for world: ${worldDetail.name}`}
      headerActions={headerActions}
      statusMessages={statusMessages}
      mainContent={mainContent}
      footer={footerContent}
    />
  );
}
