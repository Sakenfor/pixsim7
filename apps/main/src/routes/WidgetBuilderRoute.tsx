/**
 * Widget Builder Page
 *
 * Unified visual editor for creating and configuring widgets across all surfaces:
 * - Overlay widgets (media cards, video players, HUD)
 * - Block widgets (panel-composer dashboards)
 * - Chrome widgets (header, statusbar, toolbar)
 *
 * Consolidates the previous OverlayConfig page with support for all widget surfaces.
 */

import React, { useState, useMemo, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { OverlayEditor } from '@/components/overlay-editor';
import { MediaCard } from '@/components/media/MediaCard';
import type { OverlayConfiguration } from '@lib/ui/overlay';
import { mediaCardPresets, PresetManager } from '@lib/ui/overlay';
import { LocalStoragePresetStorage } from '@lib/ui/overlay/presets/presetManager';
import { APIPresetStorage, IndexedDBPresetStorage } from '@lib/ui/overlay/presets/storage';
import { Button, Select, Panel } from '@pixsim7/shared.ui';
import { SurfaceWorkbench } from '@/components/surface-workbench';
import {
  widgetRegistry,
  overlayWidgets,
  blockWidgets,
  chromeWidgets,
  type WidgetDefinition,
  type WidgetInstance,
  type WidgetPlacement,
} from '@lib/widgets';
import {
  dockZoneRegistry,
  type DockZoneDefinition,
} from '@lib/dockview';
import {
  panelRegistry,
  getPanelsForScope,
  type PanelDefinition,
} from '@features/panels/lib';

// ============================================================================
// Types
// ============================================================================

type WidgetSurfaceType = 'browse' | 'overlay' | 'blocks' | 'chrome';
type OverlayComponentType = 'mediaCard' | 'videoPlayer' | 'hud';
type StorageType = 'localStorage' | 'indexedDB' | 'api';

interface SurfaceTypeConfig {
  id: WidgetSurfaceType;
  name: string;
  icon: string;
  description: string;
}

interface OverlayComponentConfig {
  id: OverlayComponentType;
  name: string;
  description: string;
  icon: string;
  presets: typeof mediaCardPresets;
  availableWidgets: Array<{ type: string; name: string; icon?: string }>;
  samplePreview: React.ReactNode;
  storageKey: string;
}

// ============================================================================
// Surface Type Configurations
// ============================================================================

const SURFACE_TYPES: Record<WidgetSurfaceType, SurfaceTypeConfig> = {
  browse: {
    id: 'browse',
    name: 'Browse Existing',
    icon: '🔍',
    description: 'Explore existing dock zones, panels, and widgets in the app.',
  },
  overlay: {
    id: 'overlay',
    name: 'Overlay Widgets',
    icon: '🎴',
    description: 'Widgets positioned over media (images, videos). Anchor-based positioning.',
  },
  blocks: {
    id: 'blocks',
    name: 'Block Widgets',
    icon: '📊',
    description: 'Dashboard building blocks for panel-composer. Grid-based positioning.',
  },
  chrome: {
    id: 'chrome',
    name: 'Chrome Widgets',
    icon: '🔧',
    description: 'Header, statusbar, and toolbar widgets. Area-based positioning.',
  },
};

// ============================================================================
// Overlay Component Configurations
// ============================================================================

const SAMPLE_MEDIA = {
  id: 1,
  mediaType: 'video' as const,
  providerId: 'pixverse',
  providerAssetId: 'sample-123',
  thumbUrl: 'https://via.placeholder.com/640x360/1a1a1a/ffffff?text=Sample+Video',
  remoteUrl: '',
  width: 640,
  height: 360,
  durationSec: 125,
  tags: ['ai-generated', 'cinematic', 'landscape'],
  description: 'Sample video for preview',
  createdAt: new Date().toISOString(),
  providerStatus: 'ok' as const,
  actions: {
    onOpenDetails: () => {},
    onAddToGenerate: () => {},
    onImageToVideo: () => {},
  },
};

const OVERLAY_COMPONENTS: Record<OverlayComponentType, OverlayComponentConfig> = {
  mediaCard: {
    id: 'mediaCard',
    name: 'Media Card',
    description: 'Badge positioning and styling for media cards',
    icon: '🖼️',
    presets: mediaCardPresets,
    availableWidgets: [
      { type: 'badge', name: 'Badge' },
      { type: 'button', name: 'Button' },
      { type: 'panel', name: 'Panel' },
    ],
    samplePreview: (
      <MediaCard
        {...SAMPLE_MEDIA}
        badgeConfig={{
          showPrimaryIcon: true,
          showStatusIcon: true,
          showTagsInOverlay: true,
          showFooterProvider: true,
          showGenerationBadge: true,
          showGenerationOnHoverOnly: true,
        }}
      />
    ),
    storageKey: 'mediaCardOverlayConfig',
  },
  videoPlayer: {
    id: 'videoPlayer',
    name: 'Video Player',
    description: 'Overlay controls for video playback',
    icon: '▶️',
    presets: [],
    availableWidgets: [
      { type: 'button', name: 'Button' },
      { type: 'panel', name: 'Panel' },
    ],
    samplePreview: (
      <div className="w-full aspect-video bg-neutral-800 rounded flex items-center justify-center text-neutral-400">
        Video Player Preview (Coming Soon)
      </div>
    ),
    storageKey: 'videoPlayerOverlayConfig',
  },
  hud: {
    id: 'hud',
    name: 'HUD Overlays',
    description: 'Heads-up display for game/simulation view',
    icon: '🎮',
    presets: [],
    availableWidgets: [
      { type: 'badge', name: 'Badge' },
      { type: 'button', name: 'Button' },
      { type: 'panel', name: 'Panel' },
    ],
    samplePreview: (
      <div className="w-full aspect-video bg-neutral-800 rounded flex items-center justify-center text-neutral-400">
        HUD Preview (Coming Soon)
      </div>
    ),
    storageKey: 'hudOverlayConfig',
  },
};

// ============================================================================
// Block Editor Component (for panel-composer widgets)
// ============================================================================

interface BlockEditorProps {
  instances: WidgetInstance[];
  onInstancesChange: (instances: WidgetInstance[]) => void;
}

function BlockEditor({ instances, onInstancesChange }: BlockEditorProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const availableWidgets = blockWidgets.getAll();

  const selectedInstance = instances.find((i) => i.id === selectedId);

  const handleAddWidget = (widget: WidgetDefinition) => {
    const newInstance: WidgetInstance = {
      id: `${widget.id}-${Date.now()}`,
      widgetId: widget.id,
      surface: 'panel-composer',
      placement: { grid: { x: 0, y: instances.length, w: 2, h: 2 } },
      settings: widget.defaultSettings,
    };
    onInstancesChange([...instances, newInstance]);
    setSelectedId(newInstance.id);
  };

  const handleRemove = (id: string) => {
    onInstancesChange(instances.filter((i) => i.id !== id));
    if (selectedId === id) setSelectedId(null);
  };

  const handleUpdatePlacement = (id: string, grid: { x: number; y: number; w: number; h: number }) => {
    onInstancesChange(
      instances.map((i) => (i.id === id ? { ...i, placement: { ...i.placement, grid } } : i))
    );
  };

  const sidebar = (
    <div className="space-y-4">
      {/* Widget Palette */}
      <Panel className="space-y-3">
        <h3 className="text-sm font-semibold">Available Blocks</h3>
        <div className="space-y-1">
          {availableWidgets.map((widget) => (
            <button
              key={widget.id}
              onClick={() => handleAddWidget(widget)}
              className="w-full px-3 py-2 text-left text-sm rounded hover:bg-neutral-100 dark:hover:bg-neutral-700 flex items-center gap-2"
            >
              <span>{widget.icon || '◻️'}</span>
              <span>{widget.title}</span>
            </button>
          ))}
          {availableWidgets.length === 0 && (
            <p className="text-sm text-neutral-500 py-2">No block widgets registered</p>
          )}
        </div>
      </Panel>

      {/* Instance List */}
      <Panel className="space-y-3">
        <h3 className="text-sm font-semibold">Instances ({instances.length})</h3>
        <div className="space-y-1">
          {instances.map((instance) => {
            const def = widgetRegistry.get(instance.widgetId);
            return (
              <div
                key={instance.id}
                onClick={() => setSelectedId(instance.id)}
                className={`px-3 py-2 rounded cursor-pointer flex items-center gap-2 ${
                  selectedId === instance.id
                    ? 'bg-blue-100 dark:bg-blue-900/30'
                    : 'hover:bg-neutral-100 dark:hover:bg-neutral-700'
                }`}
              >
                <span>{def?.icon || '◻️'}</span>
                <span className="flex-1 text-sm truncate">{def?.title || instance.widgetId}</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRemove(instance.id);
                  }}
                  className="text-neutral-400 hover:text-red-500"
                >
                  ✕
                </button>
              </div>
            );
          })}
        </div>
      </Panel>
    </div>
  );

  const preview = (
    <Panel className="h-full">
      <h3 className="text-sm font-semibold mb-4">Grid Preview</h3>
      <div
        className="bg-neutral-100 dark:bg-neutral-800 rounded-lg p-4 min-h-[300px]"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gridAutoRows: '80px',
          gap: '8px',
        }}
      >
        {instances.map((instance) => {
          const def = widgetRegistry.get(instance.widgetId);
          const grid = instance.placement.grid || { x: 0, y: 0, w: 1, h: 1 };
          return (
            <div
              key={instance.id}
              onClick={() => setSelectedId(instance.id)}
              className={`bg-white dark:bg-neutral-700 rounded border-2 flex items-center justify-center cursor-pointer ${
                selectedId === instance.id
                  ? 'border-blue-500'
                  : 'border-neutral-300 dark:border-neutral-600'
              }`}
              style={{
                gridColumn: `${grid.x + 1} / span ${grid.w}`,
                gridRow: `${grid.y + 1} / span ${grid.h}`,
              }}
            >
              <div className="text-center">
                <div className="text-2xl">{def?.icon || '◻️'}</div>
                <div className="text-xs text-neutral-500 mt-1">{def?.title}</div>
              </div>
            </div>
          );
        })}
        {instances.length === 0 && (
          <div className="col-span-4 row-span-3 flex items-center justify-center text-neutral-400">
            Add blocks from the palette
          </div>
        )}
      </div>
    </Panel>
  );

  const inspector = selectedInstance ? (
    <Panel className="space-y-4">
      <h3 className="text-sm font-semibold">Grid Position</h3>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-xs text-neutral-500 mb-1">Column (X)</label>
          <input
            type="number"
            min={0}
            value={selectedInstance.placement.grid?.x || 0}
            onChange={(e) =>
              handleUpdatePlacement(selectedInstance.id, {
                ...selectedInstance.placement.grid!,
                x: parseInt(e.target.value) || 0,
              })
            }
            className="w-full px-2 py-1 text-sm border rounded dark:bg-neutral-800"
          />
        </div>
        <div>
          <label className="block text-xs text-neutral-500 mb-1">Row (Y)</label>
          <input
            type="number"
            min={0}
            value={selectedInstance.placement.grid?.y || 0}
            onChange={(e) =>
              handleUpdatePlacement(selectedInstance.id, {
                ...selectedInstance.placement.grid!,
                y: parseInt(e.target.value) || 0,
              })
            }
            className="w-full px-2 py-1 text-sm border rounded dark:bg-neutral-800"
          />
        </div>
        <div>
          <label className="block text-xs text-neutral-500 mb-1">Width</label>
          <input
            type="number"
            min={1}
            value={selectedInstance.placement.grid?.w || 1}
            onChange={(e) =>
              handleUpdatePlacement(selectedInstance.id, {
                ...selectedInstance.placement.grid!,
                w: parseInt(e.target.value) || 1,
              })
            }
            className="w-full px-2 py-1 text-sm border rounded dark:bg-neutral-800"
          />
        </div>
        <div>
          <label className="block text-xs text-neutral-500 mb-1">Height</label>
          <input
            type="number"
            min={1}
            value={selectedInstance.placement.grid?.h || 1}
            onChange={(e) =>
              handleUpdatePlacement(selectedInstance.id, {
                ...selectedInstance.placement.grid!,
                h: parseInt(e.target.value) || 1,
              })
            }
            className="w-full px-2 py-1 text-sm border rounded dark:bg-neutral-800"
          />
        </div>
      </div>
    </Panel>
  ) : (
    <Panel className="h-full flex items-center justify-center">
      <p className="text-sm text-neutral-500">Select a block to edit</p>
    </Panel>
  );

  return (
    <SurfaceWorkbench
      title=""
      showHeader={false}
      sidebar={sidebar}
      preview={preview}
      inspector={inspector}
    />
  );
}

// ============================================================================
// Chrome Editor Component (for header/statusbar widgets)
// ============================================================================

interface ChromeEditorProps {
  instances: WidgetInstance[];
  onInstancesChange: (instances: WidgetInstance[]) => void;
}

function ChromeEditor({ instances, onInstancesChange }: ChromeEditorProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const availableWidgets = chromeWidgets.getAll();

  const selectedInstance = instances.find((i) => i.id === selectedId);

  const handleAddWidget = (widget: WidgetDefinition, area: string) => {
    const areaInstances = instances.filter((i) => i.placement.area === area);
    const newInstance: WidgetInstance = {
      id: `${widget.id}-${Date.now()}`,
      widgetId: widget.id,
      surface: 'header',
      placement: { area, order: areaInstances.length },
      settings: widget.defaultSettings,
    };
    onInstancesChange([...instances, newInstance]);
    setSelectedId(newInstance.id);
  };

  const handleRemove = (id: string) => {
    onInstancesChange(instances.filter((i) => i.id !== id));
    if (selectedId === id) setSelectedId(null);
  };

  const handleUpdatePlacement = (id: string, area: string, order: number) => {
    onInstancesChange(
      instances.map((i) => (i.id === id ? { ...i, placement: { area, order } } : i))
    );
  };

  const getInstancesForArea = (area: string) =>
    instances
      .filter((i) => i.placement.area === area)
      .sort((a, b) => (a.placement.order || 0) - (b.placement.order || 0));

  const sidebar = (
    <div className="space-y-4">
      <Panel className="space-y-3">
        <h3 className="text-sm font-semibold">Available Widgets</h3>
        <div className="space-y-1">
          {availableWidgets.map((widget) => (
            <div key={widget.id} className="flex items-center gap-2">
              <span className="w-6 text-center">{widget.icon || '◻️'}</span>
              <span className="flex-1 text-sm">{widget.title}</span>
              <div className="flex gap-1">
                {['left', 'center', 'right'].map((area) => (
                  <button
                    key={area}
                    onClick={() => handleAddWidget(widget, area)}
                    className="px-2 py-1 text-xs bg-neutral-200 dark:bg-neutral-700 rounded hover:bg-neutral-300 dark:hover:bg-neutral-600"
                    title={`Add to ${area}`}
                  >
                    {area[0].toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
          ))}
          {availableWidgets.length === 0 && (
            <p className="text-sm text-neutral-500 py-2">No chrome widgets registered</p>
          )}
        </div>
      </Panel>

      <Panel className="space-y-3">
        <h3 className="text-sm font-semibold">Instances ({instances.length})</h3>
        {instances.map((instance) => {
          const def = widgetRegistry.get(instance.widgetId);
          return (
            <div
              key={instance.id}
              onClick={() => setSelectedId(instance.id)}
              className={`px-3 py-2 rounded cursor-pointer flex items-center gap-2 ${
                selectedId === instance.id
                  ? 'bg-blue-100 dark:bg-blue-900/30'
                  : 'hover:bg-neutral-100 dark:hover:bg-neutral-700'
              }`}
            >
              <span>{def?.icon || '◻️'}</span>
              <div className="flex-1 min-w-0">
                <div className="text-sm truncate">{def?.title}</div>
                <div className="text-xs text-neutral-500">{instance.placement.area}</div>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleRemove(instance.id);
                }}
                className="text-neutral-400 hover:text-red-500"
              >
                ✕
              </button>
            </div>
          );
        })}
      </Panel>
    </div>
  );

  const preview = (
    <Panel className="h-full">
      <h3 className="text-sm font-semibold mb-4">Header Preview</h3>
      <div className="bg-neutral-800 text-white rounded-lg p-2">
        <div className="flex items-center justify-between h-10">
          {['left', 'center', 'right'].map((area) => (
            <div
              key={area}
              className={`flex items-center gap-2 ${area === 'center' ? 'flex-1 justify-center' : ''}`}
            >
              {getInstancesForArea(area).map((instance) => {
                const def = widgetRegistry.get(instance.widgetId);
                return (
                  <div
                    key={instance.id}
                    onClick={() => setSelectedId(instance.id)}
                    className={`px-3 py-1 rounded cursor-pointer ${
                      selectedId === instance.id
                        ? 'bg-blue-500'
                        : 'bg-neutral-700 hover:bg-neutral-600'
                    }`}
                  >
                    <span className="mr-1">{def?.icon}</span>
                    <span className="text-sm">{def?.title}</span>
                  </div>
                );
              })}
              {getInstancesForArea(area).length === 0 && (
                <span className="text-xs text-neutral-500">{area}</span>
              )}
            </div>
          ))}
        </div>
      </div>
    </Panel>
  );

  const inspector = selectedInstance ? (
    <Panel className="space-y-4">
      <h3 className="text-sm font-semibold">Placement</h3>
      <div>
        <label className="block text-xs text-neutral-500 mb-1">Area</label>
        <select
          value={selectedInstance.placement.area || 'right'}
          onChange={(e) =>
            handleUpdatePlacement(
              selectedInstance.id,
              e.target.value,
              selectedInstance.placement.order || 0
            )
          }
          className="w-full px-2 py-1 text-sm border rounded dark:bg-neutral-800"
        >
          <option value="left">Left</option>
          <option value="center">Center</option>
          <option value="right">Right</option>
        </select>
      </div>
      <div>
        <label className="block text-xs text-neutral-500 mb-1">Order</label>
        <input
          type="number"
          min={0}
          value={selectedInstance.placement.order || 0}
          onChange={(e) =>
            handleUpdatePlacement(
              selectedInstance.id,
              selectedInstance.placement.area || 'right',
              parseInt(e.target.value) || 0
            )
          }
          className="w-full px-2 py-1 text-sm border rounded dark:bg-neutral-800"
        />
      </div>
    </Panel>
  ) : (
    <Panel className="h-full flex items-center justify-center">
      <p className="text-sm text-neutral-500">Select a widget to edit</p>
    </Panel>
  );

  return (
    <SurfaceWorkbench
      title=""
      showHeader={false}
      sidebar={sidebar}
      preview={preview}
      inspector={inspector}
    />
  );
}

// ============================================================================
// Browse Existing Component
// ============================================================================

function BrowseExisting() {
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
  const [selectedPanelId, setSelectedPanelId] = useState<string | null>(null);

  // Get all dock zones dynamically from registry
  const dockZones = useMemo(() => dockZoneRegistry.getAll(), []);

  // Get panels for selected zone
  const panelsForZone = useMemo(() => {
    if (!selectedZoneId) return [];
    const zone = dockZoneRegistry.get(selectedZoneId);
    if (!zone?.panelScope) return [];
    return getPanelsForScope(zone.panelScope);
  }, [selectedZoneId]);

  // Get all registered panels
  const allPanels = useMemo(() => panelRegistry.getAll(), []);

  // Get all registered widgets
  const allWidgets = useMemo(() => widgetRegistry.getAll(), []);

  // Selected panel details
  const selectedPanel = useMemo(
    () => (selectedPanelId ? panelRegistry.get(selectedPanelId) : null),
    [selectedPanelId]
  );

  const sidebar = (
    <div className="space-y-4">
      {/* Dock Zones */}
      <Panel className="space-y-3">
        <h3 className="text-sm font-semibold">Dock Zones ({dockZones.length})</h3>
        <div className="space-y-1">
          {dockZones.map((zone) => (
            <button
              key={zone.id}
              onClick={() => {
                setSelectedZoneId(zone.id);
                setSelectedPanelId(null);
              }}
              className={`w-full px-3 py-2 text-left text-sm rounded transition-colors ${
                selectedZoneId === zone.id
                  ? 'bg-blue-100 dark:bg-blue-900/30 border border-blue-300 dark:border-blue-700'
                  : 'hover:bg-neutral-100 dark:hover:bg-neutral-700'
              }`}
            >
              <div className="font-medium">{zone.label}</div>
              <div className="text-xs text-neutral-500">
                {zone.dockviewId} • {zone.panelScope || 'no scope'}
              </div>
            </button>
          ))}
          {dockZones.length === 0 && (
            <p className="text-sm text-neutral-500 py-2">No dock zones registered</p>
          )}
        </div>
      </Panel>

      {/* Panels for selected zone */}
      {selectedZoneId && (
        <Panel className="space-y-3">
          <h3 className="text-sm font-semibold">
            Panels in {dockZoneRegistry.get(selectedZoneId)?.label} ({panelsForZone.length})
          </h3>
          <div className="space-y-1 max-h-[300px] overflow-y-auto">
            {panelsForZone.map((panel) => (
              <button
                key={panel.id}
                onClick={() => setSelectedPanelId(panel.id)}
                className={`w-full px-3 py-2 text-left text-sm rounded transition-colors ${
                  selectedPanelId === panel.id
                    ? 'bg-blue-100 dark:bg-blue-900/30 border border-blue-300 dark:border-blue-700'
                    : 'hover:bg-neutral-100 dark:hover:bg-neutral-700'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span>{panel.icon || '📄'}</span>
                  <span className="font-medium">{panel.title || panel.id}</span>
                </div>
                {panel.description && (
                  <div className="text-xs text-neutral-500 mt-1 truncate">
                    {panel.description}
                  </div>
                )}
              </button>
            ))}
            {panelsForZone.length === 0 && (
              <p className="text-sm text-neutral-500 py-2">No panels for this zone</p>
            )}
          </div>
        </Panel>
      )}

      {/* Widget Registry Stats */}
      <Panel className="space-y-3">
        <h3 className="text-sm font-semibold">Widget Registry</h3>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="px-3 py-2 bg-neutral-100 dark:bg-neutral-800 rounded">
            <div className="text-2xl font-bold">{allWidgets.length}</div>
            <div className="text-xs text-neutral-500">Total Widgets</div>
          </div>
          <div className="px-3 py-2 bg-neutral-100 dark:bg-neutral-800 rounded">
            <div className="text-2xl font-bold">{allPanels.length}</div>
            <div className="text-xs text-neutral-500">Total Panels</div>
          </div>
        </div>
      </Panel>
    </div>
  );

  const preview = (
    <Panel className="h-full">
      <h3 className="text-sm font-semibold mb-4">Registry Overview</h3>

      {/* Dock Zones Visual */}
      <div className="space-y-4">
        <div>
          <h4 className="text-xs font-medium text-neutral-500 uppercase mb-2">Dock Zones</h4>
          <div className="flex gap-2 flex-wrap">
            {dockZones.map((zone) => (
              <div
                key={zone.id}
                onClick={() => {
                  setSelectedZoneId(zone.id);
                  setSelectedPanelId(null);
                }}
                className={`px-4 py-3 rounded-lg cursor-pointer transition-colors ${
                  selectedZoneId === zone.id
                    ? 'bg-blue-500 text-white'
                    : 'bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700'
                }`}
              >
                <div className="font-medium">{zone.label}</div>
                <div className={`text-xs ${selectedZoneId === zone.id ? 'text-blue-100' : 'text-neutral-500'}`}>
                  {getPanelsForScope(zone.panelScope || '').length} panels
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Widgets by Surface */}
        <div>
          <h4 className="text-xs font-medium text-neutral-500 uppercase mb-2">Widgets by Surface</h4>
          <div className="grid grid-cols-3 gap-2">
            <div className="px-3 py-2 bg-neutral-100 dark:bg-neutral-800 rounded text-center">
              <div className="text-lg font-bold">{overlayWidgets.getAll().length}</div>
              <div className="text-xs text-neutral-500">Overlay</div>
            </div>
            <div className="px-3 py-2 bg-neutral-100 dark:bg-neutral-800 rounded text-center">
              <div className="text-lg font-bold">{blockWidgets.getAll().length}</div>
              <div className="text-xs text-neutral-500">Blocks</div>
            </div>
            <div className="px-3 py-2 bg-neutral-100 dark:bg-neutral-800 rounded text-center">
              <div className="text-lg font-bold">{chromeWidgets.getAll().length}</div>
              <div className="text-xs text-neutral-500">Chrome</div>
            </div>
          </div>
        </div>

        {/* All Widgets List */}
        <div>
          <h4 className="text-xs font-medium text-neutral-500 uppercase mb-2">All Widgets</h4>
          <div className="grid grid-cols-2 gap-2 max-h-[200px] overflow-y-auto">
            {allWidgets.map((widget) => (
              <div
                key={widget.id}
                className="px-3 py-2 bg-neutral-50 dark:bg-neutral-800/50 rounded text-sm flex items-center gap-2"
              >
                <span>{widget.icon || '◻️'}</span>
                <div className="flex-1 min-w-0">
                  <div className="truncate">{widget.title}</div>
                  <div className="text-xs text-neutral-500 truncate">
                    {widget.surfaces?.join(', ')}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Panel>
  );

  const inspector = selectedPanel ? (
    <Panel className="space-y-4">
      <div className="flex items-center gap-2">
        <span className="text-2xl">{selectedPanel.icon || '📄'}</span>
        <div>
          <h3 className="text-sm font-semibold">{selectedPanel.title || selectedPanel.id}</h3>
          <p className="text-xs text-neutral-500">{selectedPanel.id}</p>
        </div>
      </div>

      {selectedPanel.description && (
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          {selectedPanel.description}
        </p>
      )}

      <div className="space-y-2">
        <h4 className="text-xs font-medium text-neutral-500 uppercase">Properties</h4>

        <div className="text-sm space-y-1">
          <div className="flex justify-between">
            <span className="text-neutral-500">Category</span>
            <span>{selectedPanel.category || 'none'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-neutral-500">Available In</span>
            <span>{selectedPanel.availableIn?.join(', ') || 'all'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-neutral-500">Multiple Instances</span>
            <span>{selectedPanel.supportsMultipleInstances ? 'Yes' : 'No'}</span>
          </div>
          {selectedPanel.tags && selectedPanel.tags.length > 0 && (
            <div className="flex justify-between">
              <span className="text-neutral-500">Tags</span>
              <span>{selectedPanel.tags.join(', ')}</span>
            </div>
          )}
        </div>
      </div>

      {selectedPanel.settingsComponent && (
        <div className="pt-3 border-t border-neutral-200 dark:border-neutral-700">
          <p className="text-xs text-green-600 dark:text-green-400">
            ✓ Has settings component
          </p>
        </div>
      )}

      {selectedPanel.settingsSchema && (
        <div className="pt-3 border-t border-neutral-200 dark:border-neutral-700">
          <p className="text-xs text-green-600 dark:text-green-400">
            ✓ Has settings schema
          </p>
        </div>
      )}
    </Panel>
  ) : (
    <Panel className="h-full flex items-center justify-center">
      <div className="text-center text-neutral-500">
        <p className="text-sm">Select a panel to view details</p>
        <p className="text-xs mt-1">or select a dock zone first</p>
      </div>
    </Panel>
  );

  return (
    <SurfaceWorkbench
      title=""
      showHeader={false}
      sidebar={sidebar}
      preview={preview}
      inspector={inspector}
    />
  );
}

// ============================================================================
// Main Widget Builder Page
// ============================================================================

export function WidgetBuilderRoute() {
  const [searchParams, setSearchParams] = useSearchParams();

  // Surface type selection
  const surfaceType = (searchParams.get('surface') as WidgetSurfaceType) || 'browse';
  const surfaceConfig = SURFACE_TYPES[surfaceType];

  // Overlay component selection (when surface is overlay)
  const overlayComponent = (searchParams.get('component') as OverlayComponentType) || 'mediaCard';
  const overlayConfig = OVERLAY_COMPONENTS[overlayComponent];

  // Storage selection
  const [storageType, setStorageType] = useState<StorageType>(
    () => (localStorage.getItem('widgetBuilderStorageType') as StorageType) || 'localStorage'
  );

  // Overlay configuration state
  const [overlayConfiguration, setOverlayConfiguration] = useState<OverlayConfiguration>(() => {
    const saved = localStorage.getItem(overlayConfig.storageKey);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return overlayConfig.presets[0]?.configuration || { id: 'default', widgets: [] };
      }
    }
    return overlayConfig.presets[0]?.configuration || { id: 'default', widgets: [] };
  });

  // Block instances state
  const [blockInstances, setBlockInstances] = useState<WidgetInstance[]>(() => {
    const saved = localStorage.getItem('widgetBuilder:blocks');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return [];
      }
    }
    return [];
  });

  // Chrome instances state
  const [chromeInstances, setChromeInstances] = useState<WidgetInstance[]>(() => {
    const saved = localStorage.getItem('widgetBuilder:chrome');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return [];
      }
    }
    return [];
  });

  // Preset manager for overlays
  const presetManager = useMemo(() => {
    let storage;
    switch (storageType) {
      case 'indexedDB':
        storage = new IndexedDBPresetStorage();
        break;
      case 'api':
        storage = new LocalStoragePresetStorage(); // Fallback
        break;
      default:
        storage = new LocalStoragePresetStorage();
    }
    return new PresetManager(storage);
  }, [storageType]);

  // Handle surface type change
  const handleSurfaceChange = (newSurface: WidgetSurfaceType) => {
    setSearchParams({ surface: newSurface });
  };

  // Handle overlay component change
  const handleOverlayComponentChange = (newComponent: OverlayComponentType) => {
    setSearchParams({ surface: 'overlay', component: newComponent });
    const config = OVERLAY_COMPONENTS[newComponent];
    const saved = localStorage.getItem(config.storageKey);
    if (saved) {
      try {
        setOverlayConfiguration(JSON.parse(saved));
      } catch {
        setOverlayConfiguration(config.presets[0]?.configuration || { id: 'default', widgets: [] });
      }
    } else {
      setOverlayConfiguration(config.presets[0]?.configuration || { id: 'default', widgets: [] });
    }
  };

  // Handle overlay config change
  const handleOverlayConfigChange = (config: OverlayConfiguration) => {
    setOverlayConfiguration(config);
    localStorage.setItem(overlayConfig.storageKey, JSON.stringify(config));
  };

  // Handle block instances change
  const handleBlockInstancesChange = (instances: WidgetInstance[]) => {
    setBlockInstances(instances);
    localStorage.setItem('widgetBuilder:blocks', JSON.stringify(instances));
  };

  // Handle chrome instances change
  const handleChromeInstancesChange = (instances: WidgetInstance[]) => {
    setChromeInstances(instances);
    localStorage.setItem('widgetBuilder:chrome', JSON.stringify(instances));
  };

  // Handle preset selection
  const handlePresetSelect = async (presetId: string) => {
    const preset = await presetManager.getPreset(presetId);
    if (preset) {
      setOverlayConfiguration(preset.configuration);
      localStorage.setItem(overlayConfig.storageKey, JSON.stringify(preset.configuration));
    }
  };

  // Export
  const handleExport = () => {
    let data: any;
    let filename: string;

    switch (surfaceType) {
      case 'overlay':
        data = overlayConfiguration;
        filename = `overlay-${overlayComponent}`;
        break;
      case 'blocks':
        data = { instances: blockInstances };
        filename = 'blocks';
        break;
      case 'chrome':
        data = { instances: chromeInstances };
        filename = 'chrome';
        break;
    }

    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `widget-builder-${filename}-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Import
  const handleImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = JSON.parse(e.target?.result as string);
          switch (surfaceType) {
            case 'overlay':
              if (data.widgets) {
                handleOverlayConfigChange(data);
              }
              break;
            case 'blocks':
              if (data.instances) {
                handleBlockInstancesChange(data.instances);
              }
              break;
            case 'chrome':
              if (data.instances) {
                handleChromeInstancesChange(data.instances);
              }
              break;
          }
        } catch {
          alert('Failed to import: Invalid JSON');
        }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  return (
    <div className="h-screen flex flex-col bg-neutral-50 dark:bg-neutral-900">
      {/* Header */}
      <div className="border-b border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 px-6 py-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold">Widget Builder</h1>
            <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-1">
              Create and configure widgets for any surface
            </p>
          </div>

          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={handleImport}>
              Import
            </Button>
            <Button variant="ghost" size="sm" onClick={handleExport}>
              Export
            </Button>
          </div>
        </div>

        {/* Surface type selector */}
        <div className="flex items-center gap-4 pb-4 border-b border-neutral-200 dark:border-neutral-700">
          <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
            Surface:
          </label>
          <div className="flex gap-2">
            {Object.values(SURFACE_TYPES).map((config) => (
              <button
                key={config.id}
                onClick={() => handleSurfaceChange(config.id)}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  surfaceType === config.id
                    ? 'bg-blue-600 text-white'
                    : 'bg-neutral-200 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-300 dark:hover:bg-neutral-600'
                }`}
              >
                <span className="mr-2">{config.icon}</span>
                {config.name}
              </button>
            ))}
          </div>
        </div>

        {/* Overlay component selector (only for overlay surface) */}
        {surfaceType === 'overlay' && (
          <div className="flex items-center gap-4 pt-4">
            <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
              Component:
            </label>
            <div className="flex gap-2">
              {Object.values(OVERLAY_COMPONENTS).map((config) => (
                <button
                  key={config.id}
                  onClick={() => handleOverlayComponentChange(config.id)}
                  className={`px-3 py-1.5 rounded text-sm transition-colors ${
                    overlayComponent === config.id
                      ? 'bg-neutral-800 dark:bg-neutral-200 text-white dark:text-neutral-900'
                      : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-700'
                  }`}
                >
                  <span className="mr-1">{config.icon}</span>
                  {config.name}
                </button>
              ))}
            </div>
          </div>
        )}

        <p className="text-sm text-neutral-500 mt-3">{surfaceConfig.description}</p>
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-hidden p-6">
        {surfaceType === 'browse' && <BrowseExisting />}

        {surfaceType === 'overlay' && (
          overlayConfig.presets.length > 0 ? (
            <OverlayEditor
              configuration={overlayConfiguration}
              onChange={handleOverlayConfigChange}
              preview={overlayConfig.samplePreview}
              presets={overlayConfig.presets.map((p) => ({
                id: p.id,
                name: p.name,
                icon: p.icon,
                configuration: p.configuration,
              }))}
              onPresetSelect={handlePresetSelect}
              availableWidgetTypes={overlayConfig.availableWidgets}
            />
          ) : (
            <Panel className="h-full flex items-center justify-center">
              <div className="text-center">
                <div className="text-6xl mb-4">{overlayConfig.icon}</div>
                <h2 className="text-xl font-bold mb-2">{overlayConfig.name}</h2>
                <p className="text-neutral-500">Presets coming soon</p>
              </div>
            </Panel>
          )
        )}

        {surfaceType === 'blocks' && (
          <BlockEditor instances={blockInstances} onInstancesChange={handleBlockInstancesChange} />
        )}

        {surfaceType === 'chrome' && (
          <ChromeEditor instances={chromeInstances} onInstancesChange={handleChromeInstancesChange} />
        )}
      </div>
    </div>
  );
}

export default WidgetBuilderRoute;
