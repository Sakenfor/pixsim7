/**
 * Unified Overlay Configuration Page
 *
 * Generic overlay editor for all components in the app.
 * Currently supports: MediaCard
 * Future: VideoPlayer, HUD, Canvas overlays, etc.
 */

import React, { useState, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { OverlayEditor } from '@/components/overlay-editor';
import { MediaCard } from '@/components/media/MediaCard';
import type { OverlayConfiguration } from '@/lib/overlay';
import { mediaCardPresets, PresetManager } from '@/lib/overlay';
import { LocalStoragePresetStorage } from '@/lib/overlay/presets/presetManager';
import { APIPresetStorage, IndexedDBPresetStorage } from '@/lib/overlay/presets/storage';
import { Button, Select, Panel } from '@pixsim7/shared.ui';

// Component type configurations
type ComponentType = 'mediaCard' | 'videoPlayer' | 'hud';

interface ComponentConfig {
  id: ComponentType;
  name: string;
  description: string;
  icon: string;
  presets: typeof mediaCardPresets;
  availableWidgets: Array<{ type: string; name: string; icon?: string }>;
  samplePreview: React.ReactNode;
  storageKey: string;
}

type StorageType = 'localStorage' | 'indexedDB' | 'api';

// Sample media data for MediaCard preview
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
  tags: ['ai-generated', 'cinematic', 'landscape', 'sunset', 'mountains'],
  description: 'A beautiful cinematic landscape with mountains at sunset, generated with AI',
  createdAt: new Date().toISOString(),
  providerStatus: 'ok' as const,
  actions: {
    onOpenDetails: (id: number) => console.log('Open details', id),
    onAddToGenerate: (id: number) => console.log('Add to generate', id),
    onImageToVideo: (id: number) => console.log('Image to video', id),
  },
};

// Component configurations
const COMPONENT_CONFIGS: Record<ComponentType, ComponentConfig> = {
  mediaCard: {
    id: 'mediaCard',
    name: 'Media Card',
    description: 'Customize badge positioning, visibility, and styling for media cards',
    icon: '🎴',
    presets: mediaCardPresets,
    availableWidgets: [
      { type: 'badge', name: 'Badge', icon: 'tag' },
      { type: 'button', name: 'Button', icon: 'zap' },
      { type: 'panel', name: 'Panel', icon: 'layout' },
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
    description: 'Configure overlay controls for video playback',
    icon: '▶️',
    presets: [], // TODO: Create video player presets
    availableWidgets: [
      { type: 'button', name: 'Button', icon: 'zap' },
      { type: 'panel', name: 'Panel', icon: 'layout' },
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
    description: 'Configure heads-up display overlays for game/simulation view',
    icon: '🎮',
    presets: [], // TODO: Create HUD presets
    availableWidgets: [
      { type: 'badge', name: 'Badge', icon: 'tag' },
      { type: 'button', name: 'Button', icon: 'zap' },
      { type: 'panel', name: 'Panel', icon: 'layout' },
    ],
    samplePreview: (
      <div className="w-full aspect-video bg-neutral-800 rounded flex items-center justify-center text-neutral-400">
        HUD Preview (Coming Soon)
      </div>
    ),
    storageKey: 'hudOverlayConfig',
  },
};

export function OverlayConfig() {
  const [searchParams, setSearchParams] = useSearchParams();

  // Get component type from URL or default to mediaCard
  const componentType = (searchParams.get('component') as ComponentType) || 'mediaCard';
  const componentConfig = COMPONENT_CONFIGS[componentType];

  // Storage selection
  const [storageType, setStorageType] = useState<StorageType>(() => {
    return (localStorage.getItem('overlayPresetStorageType') as StorageType) || 'localStorage';
  });

  const [apiConfig, setApiConfig] = useState(() => {
    const saved = localStorage.getItem('overlayPresetApiConfig');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return { baseUrl: '', authToken: '' };
      }
    }
    return { baseUrl: '', authToken: '' };
  });

  // Initialize preset manager
  const manager = useMemo(() => {
    let storage;
    switch (storageType) {
      case 'indexedDB':
        storage = new IndexedDBPresetStorage();
        break;
      case 'api':
        if (apiConfig.baseUrl) {
          storage = new APIPresetStorage({
            baseUrl: apiConfig.baseUrl,
            authToken: apiConfig.authToken || undefined,
          });
        } else {
          storage = new LocalStoragePresetStorage();
        }
        break;
      case 'localStorage':
      default:
        storage = new LocalStoragePresetStorage();
        break;
    }
    return new PresetManager(storage);
  }, [storageType, apiConfig]);

  // Load configuration
  const [configuration, setConfiguration] = useState<OverlayConfiguration>(() => {
    const saved = localStorage.getItem(componentConfig.storageKey);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return componentConfig.presets[0]?.configuration || { id: 'default', widgets: [] };
      }
    }
    return componentConfig.presets[0]?.configuration || { id: 'default', widgets: [] };
  });

  // Handle component type change
  const handleComponentTypeChange = (newType: ComponentType) => {
    setSearchParams({ component: newType });
    // Load saved config for new component type
    const newConfig = COMPONENT_CONFIGS[newType];
    const saved = localStorage.getItem(newConfig.storageKey);
    if (saved) {
      try {
        setConfiguration(JSON.parse(saved));
      } catch {
        setConfiguration(newConfig.presets[0]?.configuration || { id: 'default', widgets: [] });
      }
    } else {
      setConfiguration(newConfig.presets[0]?.configuration || { id: 'default', widgets: [] });
    }
  };

  // Handle configuration changes
  const handleConfigChange = (newConfig: OverlayConfiguration) => {
    setConfiguration(newConfig);
    localStorage.setItem(componentConfig.storageKey, JSON.stringify(newConfig));
  };

  // Handle storage type change
  const handleStorageTypeChange = (newType: StorageType) => {
    setStorageType(newType);
    localStorage.setItem('overlayPresetStorageType', newType);
  };

  // Handle API config change
  const handleApiConfigChange = (baseUrl: string, authToken: string) => {
    const newConfig = { baseUrl, authToken };
    setApiConfig(newConfig);
    localStorage.setItem('overlayPresetApiConfig', JSON.stringify(newConfig));
  };

  // Handle preset selection
  const handlePresetSelect = async (presetId: string) => {
    const preset = await manager.getPreset(presetId);
    if (preset) {
      setConfiguration(preset.configuration);
      localStorage.setItem(componentConfig.storageKey, JSON.stringify(preset.configuration));
    }
  };

  // Save as custom preset
  const handleSaveAsPreset = async () => {
    const name = prompt('Enter preset name:');
    if (!name) return;

    try {
      await manager.savePreset(configuration, {
        name,
        category: componentType,
        icon: componentConfig.icon,
      });
      alert('Preset saved successfully!');
    } catch (error) {
      alert('Failed to save preset: ' + error);
    }
  };

  // Reset to default
  const handleReset = () => {
    if (confirm('Reset to default configuration?')) {
      const defaultConfig = componentConfig.presets[0]?.configuration || { id: 'default', widgets: [] };
      setConfiguration(defaultConfig);
      localStorage.setItem(componentConfig.storageKey, JSON.stringify(defaultConfig));
    }
  };

  // Export configuration
  const handleExport = () => {
    const json = JSON.stringify(configuration, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${componentType}-config-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Import configuration
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
          const config = JSON.parse(e.target?.result as string);
          setConfiguration(config);
          localStorage.setItem(componentConfig.storageKey, JSON.stringify(config));
          alert('Configuration imported successfully!');
        } catch (error) {
          alert('Failed to import configuration: ' + error);
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
            <h1 className="text-2xl font-bold">Overlay Configuration</h1>
            <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-1">
              Customize overlay positioning, visibility, and styling for any component
            </p>
          </div>

          {/* Action buttons */}
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={handleImport}>
              Import
            </Button>
            <Button variant="ghost" size="sm" onClick={handleExport}>
              Export
            </Button>
            <Button variant="secondary" size="sm" onClick={handleSaveAsPreset}>
              Save as Preset
            </Button>
            <Button variant="ghost" size="sm" onClick={handleReset}>
              Reset
            </Button>
          </div>
        </div>

        {/* Component selector */}
        <div className="flex items-center gap-4 pb-4 border-b border-neutral-200 dark:border-neutral-700">
          <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
            Component Type:
          </label>
          <div className="flex gap-2">
            {Object.values(COMPONENT_CONFIGS).map((config) => (
              <button
                key={config.id}
                onClick={() => handleComponentTypeChange(config.id)}
                className={`
                  px-4 py-2 rounded-md text-sm font-medium transition-colors
                  ${componentType === config.id
                    ? 'bg-blue-600 text-white'
                    : 'bg-neutral-200 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-300 dark:hover:bg-neutral-600'
                  }
                `}
              >
                <span className="mr-2">{config.icon}</span>
                {config.name}
              </button>
            ))}
          </div>
        </div>

        {/* Current component description */}
        <div className="flex items-center gap-4 pt-4 pb-4 border-b border-neutral-200 dark:border-neutral-700">
          <div className="text-sm text-neutral-600 dark:text-neutral-400">
            <span className="mr-2">{componentConfig.icon}</span>
            {componentConfig.description}
          </div>
        </div>

        {/* Storage selector */}
        <div className="flex items-center gap-4 pt-4">
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
              Storage Backend:
            </label>
            <Select
              value={storageType}
              onChange={(e) => handleStorageTypeChange(e.target.value as StorageType)}
              className="w-40"
            >
              <option value="localStorage">LocalStorage</option>
              <option value="indexedDB">IndexedDB</option>
              <option value="api">API</option>
            </Select>
          </div>

          {/* API configuration inputs */}
          {storageType === 'api' && (
            <>
              <div className="flex items-center gap-2">
                <label className="text-sm text-neutral-600 dark:text-neutral-400">
                  API URL:
                </label>
                <input
                  type="text"
                  value={apiConfig.baseUrl}
                  onChange={(e) => handleApiConfigChange(e.target.value, apiConfig.authToken)}
                  placeholder="https://api.example.com"
                  className="px-2 py-1 text-sm border border-neutral-300 dark:border-neutral-600 rounded bg-white dark:bg-neutral-800 w-64"
                />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-sm text-neutral-600 dark:text-neutral-400">
                  Auth Token:
                </label>
                <input
                  type="password"
                  value={apiConfig.authToken}
                  onChange={(e) => handleApiConfigChange(apiConfig.baseUrl, e.target.value)}
                  placeholder="Optional"
                  className="px-2 py-1 text-sm border border-neutral-300 dark:border-neutral-600 rounded bg-white dark:bg-neutral-800 w-48"
                />
              </div>
            </>
          )}

          {/* Storage info */}
          <div className="ml-auto text-xs text-neutral-500 dark:text-neutral-400">
            {storageType === 'localStorage' && '💾 Browser storage (5MB limit)'}
            {storageType === 'indexedDB' && '📦 IndexedDB (50MB+ capacity, offline-first)'}
            {storageType === 'api' && '☁️ Remote API (sync across devices)'}
          </div>
        </div>
      </div>

      {/* Editor or Coming Soon message */}
      <div className="flex-1 overflow-hidden p-6">
        {componentConfig.presets.length > 0 ? (
          <OverlayEditor
            configuration={configuration}
            onChange={handleConfigChange}
            preview={componentConfig.samplePreview}
            presets={componentConfig.presets.map((p) => ({
              id: p.id,
              name: p.name,
              icon: p.icon,
              configuration: p.configuration,
            }))}
            onPresetSelect={handlePresetSelect}
            availableWidgetTypes={componentConfig.availableWidgets}
          />
        ) : (
          <Panel className="h-full flex items-center justify-center">
            <div className="text-center">
              <div className="text-6xl mb-4">{componentConfig.icon}</div>
              <h2 className="text-xl font-bold mb-2">{componentConfig.name} - Coming Soon</h2>
              <p className="text-neutral-600 dark:text-neutral-400">
                Presets and configuration for this component are not yet available.
              </p>
            </div>
          </Panel>
        )}
      </div>

      {/* Footer info */}
      <div className="border-t border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 px-6 py-3">
        <p className="text-xs text-neutral-500 dark:text-neutral-400">
          💡 Tip: Changes are auto-saved. Use presets for quick switching or export your configuration to share with others.
        </p>
      </div>
    </div>
  );
}
