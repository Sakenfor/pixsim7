/**
 * Gizmo & Tool Lab
 * Interactive playground for exploring all registered gizmos and tools
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Panel, Button } from '@pixsim7/shared.ui';
import { SceneGizmoMiniGame } from '../components/minigames/SceneGizmoMiniGame';
import { InteractiveTool } from '../components/gizmos/InteractiveTool';
import type {
  GizmoDefinition,
  InteractiveTool as ToolType,
  GizmoResult,
  SceneGizmoConfig,
  Vector3D,
  TouchPattern,
} from '@pixsim7/scene.gizmos';

// Load all default packs
import {
  getAllGizmos,
  getAllTools,
} from '../lib/gizmos/loadDefaultPacks';

export interface GizmoLabProps {
  sceneId?: number;
  // Additional context can be added here as needed
}

export function GizmoLab({ sceneId }: GizmoLabProps = {}) {
  const [selectedGizmo, setSelectedGizmo] = useState<GizmoDefinition | null>(null);
  const [selectedTool, setSelectedTool] = useState<ToolType | null>(null);
  const [gizmoFilter, setGizmoFilter] = useState<string>('all');
  const [toolFilter, setToolFilter] = useState<string>('all');
  // Position tool in main area (after 320px sidebar + some margin)
  const [toolPosition, setToolPosition] = useState<Vector3D>({ x: 600, y: 400, z: 0 });
  const [pressure, setPressure] = useState(0);
  const [lastPattern, setLastPattern] = useState<TouchPattern | null>(null);

  // Get all gizmos and tools from registry
  const allGizmos = useMemo(() => getAllGizmos(), []);
  const allTools = useMemo(() => getAllTools(), []);

  // Get unique categories and types
  const categories = useMemo(() => {
    const cats = new Set(allGizmos.map(g => g.category));
    return ['all', ...Array.from(cats)];
  }, [allGizmos]);

  const toolTypes = useMemo(() => {
    const types = new Set(allTools.map(t => t.type));
    return ['all', ...Array.from(types)];
  }, [allTools]);

  // Filter gizmos and tools
  const filteredGizmos = useMemo(() => {
    if (gizmoFilter === 'all') return allGizmos;
    return allGizmos.filter(g => g.category === gizmoFilter);
  }, [allGizmos, gizmoFilter]);

  const filteredTools = useMemo(() => {
    if (toolFilter === 'all') return allTools;
    return allTools.filter(t => t.type === toolFilter);
  }, [allTools, toolFilter]);

  // Auto-select first gizmo/tool on mount
  useEffect(() => {
    if (allGizmos.length > 0 && !selectedGizmo) {
      setSelectedGizmo(allGizmos[0]);
    }
    if (allTools.length > 0 && !selectedTool) {
      setSelectedTool(allTools[0]);
    }
  }, [allGizmos, allTools, selectedGizmo, selectedTool]);

  // Reset tool position when tool changes so it appears in view
  useEffect(() => {
    if (selectedTool) {
      // Position tool in center of visible main area (accounting for 320px sidebar)
      const sidebarWidth = 320;
      const mainAreaCenterX = sidebarWidth + (window.innerWidth - sidebarWidth) / 2;
      const centerY = window.innerHeight / 2;
      setToolPosition({ x: mainAreaCenterX, y: centerY, z: 0 });
    }
  }, [selectedTool?.id]);

  // Create gizmo config from definition
  const gizmoConfig = useMemo((): SceneGizmoConfig | null => {
    if (!selectedGizmo) return null;

    // Use default config if available, otherwise create a simple one
    const baseConfig = selectedGizmo.defaultConfig || {};

    return {
      zones: baseConfig.zones || [
        { id: 'zone1', position: { x: 0, y: 0, z: 0 }, radius: 50, label: 'Zone 1' },
        { id: 'zone2', position: { x: 100, y: 0, z: 0 }, radius: 50, label: 'Zone 2' },
        { id: 'zone3', position: { x: 0, y: 100, z: 0 }, radius: 50, label: 'Zone 3' },
      ],
      // Prefer defaultConfig.style if set, otherwise fall back to gizmo id
      // This allows gizmos to specify a different renderer style than their id
      style: (baseConfig.style ?? selectedGizmo.id) as any,
      visual: baseConfig.visual,
      physics: baseConfig.physics,
      audio: baseConfig.audio,
      gestures: baseConfig.gestures,
    };
  }, [selectedGizmo]);

  const handleGizmoResult = useCallback((result: GizmoResult) => {
    console.log('[GizmoLab] Gizmo result:', result);
  }, []);

  return (
    <div className="h-screen flex flex-col bg-neutral-50 dark:bg-neutral-950">
      {/* Header */}
      <header className="border-b border-neutral-200 dark:border-neutral-800 p-4 bg-white dark:bg-neutral-900">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-semibold">Gizmo & Tool Lab</h1>
              {sceneId && (
                <span className="px-2 py-0.5 text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-400 rounded">
                  Scene #{sceneId}
                </span>
              )}
            </div>
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              Explore {allGizmos.length} gizmos and {allTools.length} tools from the registry
            </p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => window.history.back()}
          >
            Back
          </Button>
        </div>
      </header>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left sidebar */}
        <aside className="w-80 border-r border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 overflow-y-auto">
          <div className="p-4 space-y-6">
            {/* Gizmos section */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold">Gizmos</h2>
                <select
                  className="text-xs px-2 py-1 rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800"
                  value={gizmoFilter}
                  onChange={(e) => setGizmoFilter(e.target.value)}
                >
                  {categories.map(cat => (
                    <option key={cat} value={cat}>
                      {cat === 'all' ? 'All Categories' : cat}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                {filteredGizmos.map(gizmo => (
                  <button
                    key={gizmo.id}
                    onClick={() => setSelectedGizmo(gizmo)}
                    className={`w-full text-left px-3 py-2 rounded text-sm transition-colors ${
                      selectedGizmo?.id === gizmo.id
                        ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-900 dark:text-blue-100'
                        : 'hover:bg-neutral-100 dark:hover:bg-neutral-800'
                    }`}
                  >
                    <div className="font-medium">{gizmo.name}</div>
                    <div className="text-xs text-neutral-500 dark:text-neutral-400">
                      {gizmo.id} • {gizmo.category}
                    </div>
                    {gizmo.tags && (
                      <div className="flex gap-1 mt-1">
                        {gizmo.tags.slice(0, 3).map(tag => (
                          <span
                            key={tag}
                            className="text-xs px-1.5 py-0.5 rounded bg-neutral-200 dark:bg-neutral-700"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Tools section */}
            <div className="space-y-3 pt-4 border-t border-neutral-200 dark:border-neutral-700">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold">Tools</h2>
                <select
                  className="text-xs px-2 py-1 rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800"
                  value={toolFilter}
                  onChange={(e) => setToolFilter(e.target.value)}
                >
                  {toolTypes.map(type => (
                    <option key={type} value={type}>
                      {type === 'all' ? 'All Types' : type}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                {filteredTools.map(tool => (
                  <button
                    key={tool.id}
                    onClick={() => setSelectedTool(tool)}
                    className={`w-full text-left px-3 py-2 rounded text-sm transition-colors ${
                      selectedTool?.id === tool.id
                        ? 'bg-green-100 dark:bg-green-900/30 text-green-900 dark:text-green-100'
                        : 'hover:bg-neutral-100 dark:hover:bg-neutral-800'
                    }`}
                  >
                    <div className="font-medium capitalize">{tool.id}</div>
                    <div className="text-xs text-neutral-500 dark:text-neutral-400">
                      {tool.type} • {tool.visual.model}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </aside>

        {/* Main playground area */}
        <main className="flex-1 overflow-auto p-6">
          <div className="max-w-6xl mx-auto space-y-6">
            {/* Gizmo Playground */}
            <Panel className="p-6">
              <h3 className="text-lg font-semibold mb-4">Gizmo Playground</h3>
              {selectedGizmo && gizmoConfig ? (
                <div className="space-y-4">
                  <div className="bg-neutral-100 dark:bg-neutral-800 rounded p-2 text-sm">
                    <div className="font-medium">{selectedGizmo.name}</div>
                    <div className="text-xs text-neutral-500 dark:text-neutral-400">
                      {selectedGizmo.description || 'No description'}
                    </div>
                  </div>

                  <div className="relative h-96 bg-white dark:bg-neutral-900 rounded border border-neutral-200 dark:border-neutral-700 overflow-hidden">
                    <SceneGizmoMiniGame
                      config={gizmoConfig}
                      onResult={handleGizmoResult}
                    />
                  </div>

                  <div className="text-xs text-neutral-500 dark:text-neutral-400">
                    Interact with the gizmo above. Check console for results.
                  </div>
                </div>
              ) : (
                <div className="text-center py-12 text-neutral-500 dark:text-neutral-400">
                  Select a gizmo from the sidebar to preview
                </div>
              )}
            </Panel>

            {/* Tool Playground */}
            <Panel className="p-6">
              <h3 className="text-lg font-semibold mb-4">Tool Playground</h3>
              {selectedTool ? (
                <div className="space-y-4">
                  <div className="bg-neutral-100 dark:bg-neutral-800 rounded p-2 text-sm">
                    <div className="font-medium capitalize">{selectedTool.id}</div>
                    <div className="text-xs text-neutral-500 dark:text-neutral-400">
                      Type: {selectedTool.type} • Model: {selectedTool.visual.model}
                    </div>
                    <div className="mt-2 flex gap-2">
                      <span className="text-xs">
                        Pressure: {pressure.toFixed(2)}
                      </span>
                      {lastPattern && (
                        <span className="text-xs">
                          Last pattern: {lastPattern}
                        </span>
                      )}
                    </div>
                  </div>

                  <div
                    className="relative h-96 bg-gradient-to-br from-neutral-100 to-neutral-200 dark:from-neutral-800 dark:to-neutral-900 rounded border border-neutral-200 dark:border-neutral-700 overflow-hidden"
                    style={{ isolation: 'isolate' }}
                  >
                    <div className="absolute inset-0" style={{ position: 'relative' }}>
                      <InteractiveTool
                        tool={selectedTool}
                        position={toolPosition}
                        onPositionChange={setToolPosition}
                        onPressureChange={setPressure}
                        onPatternDetected={setLastPattern}
                        isActive={true}
                      />
                    </div>
                    <div className="absolute bottom-2 left-2 text-xs text-neutral-500 dark:text-neutral-400 pointer-events-none z-10">
                      Move your mouse around and click/drag to interact
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-12 text-neutral-500 dark:text-neutral-400">
                  Select a tool from the sidebar to preview
                </div>
              )}
            </Panel>
          </div>
        </main>
      </div>
    </div>
  );
}
