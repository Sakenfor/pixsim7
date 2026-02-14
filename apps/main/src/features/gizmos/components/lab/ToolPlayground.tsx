/**
 * Tool Playground
 *
 * Renders the currently selected tool in an interactive canvas.
 * Reads selection from gizmoLabStore.
 */

import type { Vector3D, TouchPattern } from '@pixsim7/interaction.gizmos';
import { Panel } from '@pixsim7/shared.ui';
import { useState, useEffect } from 'react';

import { InteractiveTool } from '@features/gizmos';

import { useSelectedTool } from '../../stores/gizmoLabStore';

export function ToolPlayground() {
  const selectedTool = useSelectedTool();
  const [toolPosition, setToolPosition] = useState<Vector3D>({ x: 600, y: 400, z: 0 });
  const [pressure, setPressure] = useState(0);
  const [lastPattern, setLastPattern] = useState<TouchPattern | null>(null);

  // Reset tool position when tool changes so it appears in view
  useEffect(() => {
    if (selectedTool) {
      const sidebarWidth = 320;
      const mainAreaCenterX = sidebarWidth + (window.innerWidth - sidebarWidth) / 2;
      const centerY = window.innerHeight / 2;
      setToolPosition({ x: mainAreaCenterX, y: centerY, z: 0 });
    }
  }, [selectedTool?.id]);

  return (
    <Panel className="p-6 h-full">
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
          Select a tool from the browser to preview
        </div>
      )}
    </Panel>
  );
}
