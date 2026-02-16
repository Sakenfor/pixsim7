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

import { Button, Panel } from '@pixsim7/shared.ui';
import React, { useState, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

import { Icon } from '@lib/icons';
import type { OverlayConfiguration } from '@lib/ui/overlay';
import { mediaCardPresets, PresetManager } from '@lib/ui/overlay';
import { LocalStoragePresetStorage } from '@lib/ui/overlay';
import { IndexedDBPresetStorage } from '@lib/ui/overlay';
import type { WidgetInstance } from '@lib/widgets';

import { MediaCard } from '@/components/media/MediaCard';
import { OverlayEditor } from '@/components/overlay-editor';
import { BrowseExisting } from '@/components/widget-builder/browse';
import { BlockEditor, ChromeEditor } from '@/components/widget-builder/editors';


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
  remoteUrl: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
  width: 640,
  height: 360,
  durationSec: 125,
  tags: ['ai-generated', 'cinematic', 'landscape'].map((slug) => ({
    slug,
    display_name: slug,
  })),
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
  const presetStorageKey = `${overlayConfig.storageKey}:presets`;

  // Storage selection
  const [storageType] = useState<StorageType>(
    () => (localStorage.getItem('widgetBuilderStorageType') as StorageType) || 'localStorage'
  );

  // Overlay configuration state
  const [overlayConfiguration, setOverlayConfiguration] = useState<OverlayConfiguration>(() => {
    const saved = localStorage.getItem(overlayConfig.storageKey);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return overlayConfig.presets[0]?.configuration || { id: 'default', name: 'Default', widgets: [] };
      }
    }
    return overlayConfig.presets[0]?.configuration || { id: 'default', name: 'Default', widgets: [] };
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
        storage = new LocalStoragePresetStorage(presetStorageKey); // Fallback
        break;
      default:
        storage = new LocalStoragePresetStorage(presetStorageKey);
    }
    return new PresetManager(storage);
  }, [storageType, presetStorageKey]);

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
        setOverlayConfiguration(config.presets[0]?.configuration || { id: 'default', name: 'Default', widgets: [] });
      }
    } else {
      setOverlayConfiguration(config.presets[0]?.configuration || { id: 'default', name: 'Default', widgets: [] });
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
                <Icon name={config.icon} size={16} className="mr-2" />
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
                  <Icon name={config.icon} size={14} className="mr-1" />
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
                <div className="mb-4"><Icon name={overlayConfig.icon} size={48} /></div>
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
