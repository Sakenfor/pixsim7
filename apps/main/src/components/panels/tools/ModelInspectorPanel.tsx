/**
 * ModelInspectorPanel
 *
 * Panel for viewing glTF 3D models, previewing animations,
 * and configuring contact zones for interactive tools.
 */

import { useState, useCallback, useRef } from 'react';
import { Button, useToast } from '@pixsim7/shared.ui';
import { Model3DViewport } from '@/components/3d/Model3DViewport';
import { AnimationTimeline } from '@/components/3d/AnimationTimeline';
import { useModel3DStore } from '@/stores/model3DStore';
import type { InspectorMode, RenderMode, ZoneProperties } from '@/lib/models/types';
import { formatZoneLabel } from '@/lib/models/zoneUtils';

/**
 * Collapsible section component.
 */
function Section({
  title,
  children,
  defaultOpen = true,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="border border-neutral-200 dark:border-neutral-700 rounded">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-3 py-2 bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 text-sm font-medium"
      >
        <span>{title}</span>
        <svg
          className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {isOpen && <div className="p-3">{children}</div>}
    </div>
  );
}

/**
 * Mode toggle button group.
 */
function ModeToggle() {
  const mode = useModel3DStore((s) => s.mode);
  const setMode = useModel3DStore((s) => s.setMode);

  const modes: { value: InspectorMode; label: string }[] = [
    { value: 'view', label: 'View' },
    { value: 'zones', label: 'Zones' },
    { value: 'animation', label: 'Animation' },
  ];

  return (
    <div className="flex items-center gap-1 bg-neutral-100 dark:bg-neutral-800 rounded p-0.5">
      {modes.map((m) => (
        <button
          key={m.value}
          onClick={() => setMode(m.value)}
          className={`px-3 py-1 text-sm rounded transition-colors ${
            mode === m.value
              ? 'bg-blue-500 text-white'
              : 'hover:bg-neutral-200 dark:hover:bg-neutral-700'
          }`}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}

/**
 * Render mode radio group.
 */
function RenderModeToggle() {
  const renderMode = useModel3DStore((s) => s.renderMode);
  const setRenderMode = useModel3DStore((s) => s.setRenderMode);

  const modes: { value: RenderMode; label: string }[] = [
    { value: 'solid', label: 'Solid' },
    { value: 'wireframe', label: 'Wire' },
    { value: 'zones', label: 'Zones' },
  ];

  return (
    <div className="flex items-center gap-3">
      <span className="text-sm text-neutral-600 dark:text-neutral-400">View:</span>
      {modes.map((m) => (
        <label key={m.value} className="flex items-center gap-1 text-sm cursor-pointer">
          <input
            type="radio"
            name="renderMode"
            checked={renderMode === m.value}
            onChange={() => setRenderMode(m.value)}
            className="text-blue-500"
          />
          {m.label}
        </label>
      ))}
    </div>
  );
}

/**
 * Slider control for zone properties.
 */
function PropertySlider({
  label,
  value,
  onChange,
  min = 0,
  max = 1,
  step = 0.1,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <div className="flex items-center gap-2">
      <label className="text-sm text-neutral-600 dark:text-neutral-400 w-24">{label}:</label>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="flex-1 h-2 bg-neutral-200 dark:bg-neutral-700 rounded-lg appearance-none cursor-pointer"
      />
      <span className="text-sm font-mono w-10 text-right">{value.toFixed(1)}</span>
    </div>
  );
}

/**
 * Zone property editor.
 */
function ZoneEditor({ zoneId }: { zoneId: string }) {
  const zoneConfigs = useModel3DStore((s) => s.zoneConfigs);
  const updateZoneProperty = useModel3DStore((s) => s.updateZoneProperty);
  const addZoneStatModifier = useModel3DStore((s) => s.addZoneStatModifier);
  const removeZoneStatModifier = useModel3DStore((s) => s.removeZoneStatModifier);
  const resetZone = useModel3DStore((s) => s.resetZone);

  const [newStatName, setNewStatName] = useState('');

  const config = zoneConfigs[zoneId];
  if (!config) return null;

  const handleAddModifier = () => {
    if (newStatName.trim()) {
      addZoneStatModifier(zoneId, newStatName.trim(), 1);
      setNewStatName('');
    }
  };

  return (
    <div className="space-y-3 p-3 bg-neutral-50 dark:bg-neutral-900 rounded border border-neutral-200 dark:border-neutral-700">
      {/* Label */}
      <div className="flex items-center gap-2">
        <label className="text-sm text-neutral-600 dark:text-neutral-400 w-24">Label:</label>
        <input
          type="text"
          value={config.label || formatZoneLabel(zoneId)}
          onChange={(e) => updateZoneProperty(zoneId, 'label', e.target.value)}
          className="flex-1 px-2 py-1 text-sm border border-neutral-300 dark:border-neutral-600 rounded bg-white dark:bg-neutral-800"
        />
      </div>

      {/* Color */}
      <div className="flex items-center gap-2">
        <label className="text-sm text-neutral-600 dark:text-neutral-400 w-24">Color:</label>
        <input
          type="color"
          value={config.highlightColor || '#4a9eff'}
          onChange={(e) => updateZoneProperty(zoneId, 'highlightColor', e.target.value)}
          className="w-8 h-8 rounded cursor-pointer"
        />
        <span className="text-xs font-mono text-neutral-500">{config.highlightColor}</span>
      </div>

      {/* Sensitivity */}
      <PropertySlider
        label="Sensitivity"
        value={config.sensitivity}
        onChange={(v) => updateZoneProperty(zoneId, 'sensitivity', v)}
      />

      {/* Ticklishness */}
      <PropertySlider
        label="Ticklishness"
        value={config.ticklishness || 0}
        onChange={(v) => updateZoneProperty(zoneId, 'ticklishness', v)}
      />

      {/* Pleasure */}
      <PropertySlider
        label="Pleasure"
        value={config.pleasure || 0}
        onChange={(v) => updateZoneProperty(zoneId, 'pleasure', v)}
      />

      {/* Stat Modifiers */}
      <div className="space-y-2">
        <div className="text-sm text-neutral-600 dark:text-neutral-400">Stat Modifiers:</div>
        {config.statModifiers && Object.entries(config.statModifiers).map(([stat, value]) => (
          <div key={stat} className="flex items-center gap-2 ml-4">
            <span className="text-sm">{stat}:</span>
            <input
              type="number"
              value={value}
              step={0.1}
              onChange={(e) => addZoneStatModifier(zoneId, stat, parseFloat(e.target.value))}
              className="w-16 px-2 py-1 text-sm border border-neutral-300 dark:border-neutral-600 rounded bg-white dark:bg-neutral-800"
            />
            <span className="text-xs text-neutral-500">x</span>
            <button
              onClick={() => removeZoneStatModifier(zoneId, stat)}
              className="text-red-500 hover:text-red-600 text-sm"
            >
              x
            </button>
          </div>
        ))}
        <div className="flex items-center gap-2 ml-4">
          <input
            type="text"
            value={newStatName}
            onChange={(e) => setNewStatName(e.target.value)}
            placeholder="Add modifier..."
            className="flex-1 px-2 py-1 text-sm border border-neutral-300 dark:border-neutral-600 rounded bg-white dark:bg-neutral-800"
          />
          <Button size="sm" onClick={handleAddModifier} disabled={!newStatName.trim()}>
            +
          </Button>
        </div>
      </div>

      {/* Reset button */}
      <div className="pt-2 border-t border-neutral-200 dark:border-neutral-700">
        <button
          onClick={() => resetZone(zoneId)}
          className="text-sm text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300"
        >
          Reset to defaults
        </button>
      </div>
    </div>
  );
}

/**
 * Zone list with selection.
 */
function ZoneList() {
  const parseResult = useModel3DStore((s) => s.parseResult);
  const selectedZoneId = useModel3DStore((s) => s.selectedZoneId);
  const selectZone = useModel3DStore((s) => s.selectZone);
  const zoneConfigs = useModel3DStore((s) => s.zoneConfigs);

  if (!parseResult || parseResult.zoneIds.length === 0) {
    return (
      <div className="text-sm text-neutral-500 text-center py-4">
        No zones found. Name meshes with "zone_" prefix in Blender.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="text-xs text-neutral-500 mb-2">
        Click zone in viewport or select below:
      </div>
      {parseResult.zoneIds.map((zoneId) => {
        const config = zoneConfigs[zoneId];
        const isSelected = selectedZoneId === zoneId;

        return (
          <div key={zoneId}>
            <button
              onClick={() => selectZone(isSelected ? null : zoneId)}
              className={`w-full flex items-center gap-2 px-3 py-2 rounded text-left transition-colors ${
                isSelected
                  ? 'bg-blue-100 dark:bg-blue-900/30 border border-blue-300 dark:border-blue-700'
                  : 'hover:bg-neutral-100 dark:hover:bg-neutral-800 border border-transparent'
              }`}
            >
              <div
                className="w-3 h-3 rounded"
                style={{ backgroundColor: config?.highlightColor || '#4a9eff' }}
              />
              <span className="flex-1 text-sm">
                {config?.label || formatZoneLabel(zoneId)}
              </span>
              <svg
                className={`w-4 h-4 text-neutral-400 transition-transform ${isSelected ? 'rotate-180' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {isSelected && <ZoneEditor zoneId={zoneId} />}
          </div>
        );
      })}
    </div>
  );
}

/**
 * File drop zone for model import.
 */
function ModelDropZone() {
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const toast = useToast();

  const loadModel = useModel3DStore((s) => s.loadModel);
  const modelFileName = useModel3DStore((s) => s.modelFileName);
  const isLoading = useModel3DStore((s) => s.isLoading);
  const clearModel = useModel3DStore((s) => s.clearModel);

  const handleFile = useCallback(
    (file: File) => {
      if (!file.name.match(/\.(gltf|glb)$/i)) {
        toast.error('Please select a glTF or GLB file');
        return;
      }

      const url = URL.createObjectURL(file);
      loadModel(url, file.name);
    },
    [loadModel, toast]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);

      const file = e.dataTransfer.files[0];
      if (file) {
        handleFile(file);
      }
    },
    [handleFile]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragOver(false);
  }, []);

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFile(file);
    }
  };

  if (modelFileName) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-sm text-neutral-600 dark:text-neutral-400">File:</span>
        <span className="flex-1 text-sm font-mono truncate">{modelFileName}</span>
        <Button size="sm" variant="ghost" onClick={handleClick}>
          Change
        </Button>
        <Button size="sm" variant="ghost" onClick={clearModel}>
          Clear
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".gltf,.glb"
          onChange={handleInputChange}
          className="hidden"
        />
      </div>
    );
  }

  return (
    <div
      onClick={handleClick}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
        isDragOver
          ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
          : 'border-neutral-300 dark:border-neutral-600 hover:border-blue-400'
      }`}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept=".gltf,.glb"
        onChange={handleInputChange}
        className="hidden"
      />
      <div className="text-2xl mb-2">{isLoading ? '...' : '+'}</div>
      <div className="text-sm text-neutral-600 dark:text-neutral-400">
        {isLoading ? 'Loading model...' : 'Drop glTF/GLB file or click to browse'}
      </div>
    </div>
  );
}

/**
 * Export configuration section.
 */
function ExportSection() {
  const toast = useToast();
  const exportConfig = useModel3DStore((s) => s.exportConfig);
  const modelUrl = useModel3DStore((s) => s.modelUrl);

  const handleExportJSON = useCallback(() => {
    const config = exportConfig();
    if (!config) {
      toast.error('No model loaded');
      return;
    }

    const json = JSON.stringify(config, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'tool-3d-config.json';
    a.click();
    URL.revokeObjectURL(url);

    toast.success('Configuration exported');
  }, [exportConfig, toast]);

  const handleCopyJSON = useCallback(() => {
    const config = exportConfig();
    if (!config) {
      toast.error('No model loaded');
      return;
    }

    const json = JSON.stringify(config, null, 2);
    navigator.clipboard.writeText(json);
    toast.success('Configuration copied to clipboard');
  }, [exportConfig, toast]);

  if (!modelUrl) return null;

  return (
    <div className="flex items-center gap-2">
      <Button size="sm" onClick={handleCopyJSON}>
        Copy JSON
      </Button>
      <Button size="sm" variant="secondary" onClick={handleExportJSON}>
        Export JSON
      </Button>
    </div>
  );
}

/**
 * Main Model Inspector Panel component.
 */
export function ModelInspectorPanel() {
  const modelUrl = useModel3DStore((s) => s.modelUrl);
  const error = useModel3DStore((s) => s.error);
  const mode = useModel3DStore((s) => s.mode);
  const modelScale = useModel3DStore((s) => s.modelScale);
  const setModelScale = useModel3DStore((s) => s.setModelScale);
  const settings = useModel3DStore((s) => s.settings);
  const updateSettings = useModel3DStore((s) => s.updateSettings);

  return (
    <div className="h-full w-full flex flex-col bg-neutral-50 dark:bg-neutral-950 overflow-hidden">
      {/* Viewport */}
      <div className="flex-1 min-h-[300px] border-b border-neutral-200 dark:border-neutral-800">
        {modelUrl ? (
          <Model3DViewport />
        ) : (
          <div className="h-full flex items-center justify-center bg-neutral-100 dark:bg-neutral-900">
            <div className="text-center text-neutral-500">
              <div className="text-4xl mb-2">3D</div>
              <div className="text-sm">Load a model to preview</div>
            </div>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="flex-shrink-0 overflow-y-auto p-4 space-y-4" style={{ maxHeight: '50%' }}>
        {/* Error display */}
        {error && (
          <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded text-sm text-red-600 dark:text-red-400">
            {error}
          </div>
        )}

        {/* Mode toggle */}
        <div className="flex items-center justify-between">
          <span className="text-sm text-neutral-600 dark:text-neutral-400">Mode:</span>
          <ModeToggle />
        </div>

        {/* Model section */}
        <Section title="Model" defaultOpen={!modelUrl}>
          <div className="space-y-3">
            <ModelDropZone />
            {modelUrl && (
              <>
                <div className="flex items-center gap-2">
                  <label className="text-sm text-neutral-600 dark:text-neutral-400">Scale:</label>
                  <input
                    type="number"
                    value={modelScale}
                    step={0.1}
                    min={0.1}
                    onChange={(e) => setModelScale(parseFloat(e.target.value) || 1)}
                    className="w-20 px-2 py-1 text-sm border border-neutral-300 dark:border-neutral-600 rounded bg-white dark:bg-neutral-800"
                  />
                </div>
                <RenderModeToggle />
                <div className="flex items-center gap-4 text-sm">
                  <label className="flex items-center gap-1 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.showGrid}
                      onChange={(e) => updateSettings({ showGrid: e.target.checked })}
                    />
                    Grid
                  </label>
                  <label className="flex items-center gap-1 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.showAxes}
                      onChange={(e) => updateSettings({ showAxes: e.target.checked })}
                    />
                    Axes
                  </label>
                </div>
              </>
            )}
          </div>
        </Section>

        {/* Zones section (visible when in zones mode) */}
        {mode === 'zones' && modelUrl && (
          <Section title="Zones (from vertex groups)">
            <ZoneList />
          </Section>
        )}

        {/* Animation section (visible when in animation mode) */}
        {mode === 'animation' && modelUrl && (
          <Section title="Animation">
            <AnimationTimeline />
          </Section>
        )}

        {/* Export section */}
        {modelUrl && (
          <Section title="Export" defaultOpen={false}>
            <ExportSection />
          </Section>
        )}
      </div>
    </div>
  );
}

export default ModelInspectorPanel;
