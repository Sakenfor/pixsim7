/**
 * MediaCardConfigPage Component
 *
 * Production configuration page for MediaCard overlay customization.
 * Allows users to visually customize badge positioning, visibility, and styling.
 */

import React, { useState, useMemo } from 'react';
import { OverlayEditor } from '@/components/overlay-editor';
import { MediaCard } from '@/components/media/MediaCard';
import type { OverlayConfiguration } from '@/lib/overlay';
import { mediaCardPresets, presetManager } from '@/lib/overlay';
import { Button } from '@pixsim/shared/ui';

// Sample media data for preview
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

export function MediaCardConfigPage() {
  // Load configuration from localStorage or use default
  const [configuration, setConfiguration] = useState<OverlayConfiguration>(() => {
    const saved = localStorage.getItem('mediaCardOverlayConfig');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return mediaCardPresets[0].configuration;
      }
    }
    return mediaCardPresets[0].configuration;
  });

  // Available widget types for MediaCard
  const availableWidgetTypes = useMemo(() => [
    { type: 'badge', name: 'Badge', icon: 'tag' },
    { type: 'button', name: 'Button', icon: 'zap' },
    { type: 'panel', name: 'Panel', icon: 'layout' },
  ], []);

  // Handle configuration changes
  const handleConfigChange = (newConfig: OverlayConfiguration) => {
    setConfiguration(newConfig);
    // Auto-save to localStorage
    localStorage.setItem('mediaCardOverlayConfig', JSON.stringify(newConfig));
  };

  // Handle preset selection
  const handlePresetSelect = async (presetId: string) => {
    const preset = await presetManager.getPreset(presetId);
    if (preset) {
      setConfiguration(preset.configuration);
      localStorage.setItem('mediaCardOverlayConfig', JSON.stringify(preset.configuration));
    }
  };

  // Save as custom preset
  const handleSaveAsPreset = async () => {
    const name = prompt('Enter preset name:');
    if (!name) return;

    try {
      await presetManager.savePreset(configuration, {
        name,
        category: 'media',
        icon: '⭐',
      });
      alert('Preset saved successfully!');
    } catch (error) {
      alert('Failed to save preset: ' + error);
    }
  };

  // Reset to default
  const handleReset = () => {
    if (confirm('Reset to default configuration?')) {
      const defaultConfig = mediaCardPresets[0].configuration;
      setConfiguration(defaultConfig);
      localStorage.setItem('mediaCardOverlayConfig', JSON.stringify(defaultConfig));
    }
  };

  // Export configuration
  const handleExport = () => {
    const json = JSON.stringify(configuration, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mediacard-config-${Date.now()}.json`;
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
          localStorage.setItem('mediaCardOverlayConfig', JSON.stringify(config));
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
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">MediaCard Badge Configuration</h1>
            <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-1">
              Customize badge positioning, visibility, and styling for media cards
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
      </div>

      {/* Editor */}
      <div className="flex-1 overflow-hidden p-6">
        <OverlayEditor
          configuration={configuration}
          onChange={handleConfigChange}
          preview={
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
          }
          presets={mediaCardPresets.map((p) => ({
            id: p.id,
            name: p.name,
            icon: p.icon,
            configuration: p.configuration,
          }))}
          onPresetSelect={handlePresetSelect}
          availableWidgetTypes={availableWidgetTypes}
        />
      </div>

      {/* Footer info */}
      <div className="border-t border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 px-6 py-3">
        <p className="text-xs text-neutral-500 dark:text-neutral-400">
          💡 Tip: Changes are auto-saved to localStorage. Use presets for quick switching
          or export your configuration to share with others.
        </p>
      </div>
    </div>
  );
}
