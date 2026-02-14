/**
 * Gizmo & Tool Lab
 *
 * Interactive playground for exploring all registered gizmos and tools.
 * Uses a dockview container hosting 4 panels (GizmoBrowser, ToolBrowser,
 * GizmoPlayground, ToolPlayground) which communicate via gizmoLabStore.
 * Panels are freely rearrangeable within the dockview.
 */

import { getAllGizmos, getAllTools } from '@pixsim7/interaction.gizmos';
import { Button } from '@pixsim7/shared.ui';
import type { DockviewApi } from 'dockview-core';
import { useCallback, useEffect, useMemo } from 'react';

import { useGizmoLabStore } from '@features/gizmos/stores/gizmoLabStore';
import { PanelHostDockview } from '@features/panels';
import gizmoLabGroup from '@features/panels/domain/groups/gizmo-lab';

export interface GizmoLabProps {
  sceneId?: number;
}

export function GizmoLab({ sceneId }: GizmoLabProps = {}) {
  const allGizmos = useMemo(() => getAllGizmos(), []);
  const allTools = useMemo(() => getAllTools(), []);

  const selectedGizmoId = useGizmoLabStore((s) => s.selectedGizmoId);
  const selectedToolId = useGizmoLabStore((s) => s.selectedToolId);
  const selectGizmo = useGizmoLabStore((s) => s.selectGizmo);
  const selectTool = useGizmoLabStore((s) => s.selectTool);

  // Auto-select first gizmo/tool on mount
  useEffect(() => {
    if (allGizmos.length > 0 && !selectedGizmoId) {
      selectGizmo(allGizmos[0].id);
    }
    if (allTools.length > 0 && !selectedToolId) {
      selectTool(allTools[0].id);
    }
  }, [allGizmos, allTools, selectedGizmoId, selectedToolId, selectGizmo, selectTool]);

  const panelIds = gizmoLabGroup.getPanelIds('full');

  const defaultLayout = useCallback((api: DockviewApi) => {
    gizmoLabGroup.defaultLayout?.create(
      api,
      gizmoLabGroup.panels,
      ['gizmoBrowser', 'toolBrowser', 'gizmoPlayground', 'toolPlayground'],
    );
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

      {/* Dockview container */}
      <div className="flex-1 overflow-hidden">
        <PanelHostDockview
          dockId="gizmo-lab"
          panels={panelIds}
          storageKey="gizmo-lab-dockview-layout:v1"
          panelManagerId="gizmoLab"
          defaultLayout={defaultLayout}
          minPanelsForTabs={2}
          enableContextMenu
          className="h-full"
        />
      </div>
    </div>
  );
}
