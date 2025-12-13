import { useRef, useEffect, useState } from 'react';
import { DockviewReact } from 'dockview';
import type { DockviewReadyEvent, IDockviewPanelProps } from 'dockview-core';
import 'dockview/dist/styles/dockview.css';
import { useWorkspaceStore, type PanelId, type LayoutNode } from '@/stores/workspaceStore';
import { panelRegistry, initializePanels, type ContextLabelStrategy, type CoreEditorRole } from '@lib/ui/panels';
import { initializeWidgets } from '@lib/ui/composer';
import type { PanelHeaderCategory } from '@/components/panels/shared/PanelHeader';
import { PanelHeader } from '@/components/panels/shared/PanelHeader';
import { useEditorContext, type EditorContext, type EditorMode } from '@lib/context/editorContext';

/**
 * Get a human-readable mode label for display in panel headers.
 */
function getModeLabel(mode: EditorMode): string | null {
  switch (mode) {
    case 'play':
      return 'Play';
    case 'edit-flow':
      return 'Edit Flow';
    case 'layout':
      return 'Layout';
    case 'debug':
      return 'Debug';
    default:
      return null;
  }
}

/**
 * Resolve a context label from a strategy and editor context.
 * For core editors, includes mode information in the label.
 */
function resolveContextLabel(
  strategy: ContextLabelStrategy | undefined,
  ctx: EditorContext,
  coreEditorRole?: CoreEditorRole
): string | undefined {
  let baseLabel: string | undefined;

  if (strategy) {
    if (typeof strategy === 'function') {
      baseLabel = strategy(ctx);
    } else {
      switch (strategy) {
        case 'scene':
          baseLabel = ctx.scene.title ?? undefined;
          break;
        case 'world':
          baseLabel = ctx.world.id ? `World #${ctx.world.id}` : undefined;
          break;
        case 'session':
          baseLabel = ctx.runtime.sessionId
            ? `Session #${ctx.runtime.sessionId}`
            : ctx.world.id
              ? `World #${ctx.world.id}`
              : undefined;
          break;
        case 'preset':
          baseLabel = ctx.workspace.activePresetId
            ? `Preset: ${ctx.workspace.activePresetId}`
            : undefined;
          break;
      }
    }
  }

  // For core editors, prefix with mode label if available
  if (coreEditorRole) {
    const modeLabel = getModeLabel(ctx.editor.mode);

    // Build enhanced label for core editors
    // e.g., "Play • Session #1" or "Edit Flow • Scene: intro"
    if (modeLabel) {
      if (baseLabel) {
        return `${modeLabel} • ${baseLabel}`;
      }
      return modeLabel;
    }
  }

  return baseLabel;
}

// Wrapper for panels to provide data-panel-id and a common header
function PanelWrapper(props: IDockviewPanelProps<{ panelId: PanelId }>) {
  const { params } = props;
  const panelId = params?.panelId;

  const ctx = useEditorContext();

  if (!panelId) {
    return <div className="p-4 text-red-500">Error: No panel ID</div>;
  }

  const panelDef = panelRegistry.get(panelId);

  if (!panelDef) {
    return <div className="p-4 text-red-500">Unknown panel: {panelId}</div>;
  }

  const Component = panelDef.component;

  // Resolve context label from panel definition strategy
  // Pass coreEditorRole so core editors get enhanced labels with mode info
  const contextLabel = resolveContextLabel(panelDef.contextLabel, ctx, panelDef.coreEditorRole);

  return (
    <div className="h-full w-full flex flex-col bg-white dark:bg-neutral-900" data-panel-id={panelId}>
      <PanelHeader
        title={panelDef.title}
        category={panelDef.category as PanelHeaderCategory}
        contextLabel={contextLabel}
      />
      <div className="flex-1 min-h-0 overflow-auto">
        <Component />
      </div>
    </div>
  );
}

/** Get panel title from registry, with id as fallback */
const getPanelTitle = (id: PanelId): string =>
  panelRegistry.get(id)?.title ?? id;

// Helper to convert tree layout to Dockview panels
function applyLayoutToDockview(
  api: DockviewReadyEvent['api'],
  layout: LayoutNode<PanelId> | null,
  titles: Record<PanelId, string>
) {
  // Clear existing panels (defensively guard against stale/undefined ids)
  const existingPanels = api.panels.map((p) => p.id).filter(Boolean);
  existingPanels.forEach((id) => {
    try {
      api.removePanel(id);
    } catch (e) {
      // If Dockview already removed this panel or its group, ignore
      // to avoid hard failures when syncing layouts.
      // console.warn('Failed to remove panel', id, e);
    }
  });

  if (!layout) return;

  let panelCounter = 0;

  // Recursively build panels from LayoutNode tree
  const buildPanels = (
    node: LayoutNode<PanelId>,
    referencePanel?: string,
    direction?: 'left' | 'right' | 'above' | 'below'
  ): string => {
    if (typeof node === 'string') {
      // Leaf node - create panel
      const baseId = `${node}-panel-${panelCounter++}`;
      // Ensure the id is unique in the current Dockview instance
      let panelId = baseId;
      let suffix = 1;
      while (api.panels.some((p) => p.id === panelId)) {
        panelId = `${baseId}-${suffix++}`;
      }
      api.addPanel({
        id: panelId,
        component: 'panel',
        params: { panelId: node },
        title: titles[node],
        position: referencePanel
          ? { direction: direction!, referencePanel }
          : undefined,
      });
      return panelId;
    }

    // Branch node - recursively create children
    const firstPanelId = buildPanels(node.first, referencePanel, direction);

    // Determine direction for second panel
    const secondDirection = node.direction === 'row' ? 'right' : 'below';
    const secondPanelId = buildPanels(node.second, firstPanelId, secondDirection);

    return firstPanelId;
  };

  buildPanels(layout);
}

export function DockviewWorkspace() {
  const apiRef = useRef<DockviewReadyEvent['api'] | null>(null);
  const [isReady, setIsReady] = useState(false);
  const lastAppliedLayoutRef = useRef<LayoutNode<PanelId> | null>(null);

  const dockviewLayout = useWorkspaceStore((s) => s.dockviewLayout);
  const currentLayout = useWorkspaceStore((s) => s.currentLayout);
  const setDockviewLayout = useWorkspaceStore((s) => s.setDockviewLayout);
  const isLocked = useWorkspaceStore((s) => s.isLocked);

  // Initialize panels and widgets on mount
  useEffect(() => {
    Promise.all([
      initializePanels(),
      Promise.resolve(initializeWidgets()),
    ]).catch(error => {
      console.error('Failed to initialize:', error);
    });
  }, []);

  const onReady = (event: DockviewReadyEvent) => {
    apiRef.current = event.api;
    setIsReady(true);

    // Load saved layout or create default
    if (dockviewLayout) {
      try {
        event.api.fromJSON(dockviewLayout);
      } catch (error) {
        console.error('Failed to load layout:', error);
        createDefaultLayout(event.api);
      }
    } else {
      createDefaultLayout(event.api);
    }

    // Set locked state
    if (isLocked) {
      event.api.groups.forEach((group) => {
        group.locked = 'no-drop-target';
      });
    }
  };

  const createDefaultLayout = (api: DockviewReadyEvent['api']) => {
    // Create default layout similar to mosaic default
    const galleryPanel = api.addPanel({
      id: 'gallery-panel',
      component: 'panel',
      params: { panelId: 'gallery' as PanelId },
      title: getPanelTitle('gallery'),
      position: { direction: 'left' },
    });

    api.addPanel({
      id: 'health-panel',
      component: 'panel',
      params: { panelId: 'health' as PanelId },
      title: getPanelTitle('health'),
      position: { direction: 'below', referencePanel: 'gallery-panel' },
    });

    api.addPanel({
      id: 'graph-panel',
      component: 'panel',
      params: { panelId: 'graph' as PanelId },
      title: getPanelTitle('graph'),
      position: { direction: 'right' },
    });

    api.addPanel({
      id: 'inspector-panel',
      component: 'panel',
      params: { panelId: 'inspector' as PanelId },
      title: getPanelTitle('inspector'),
      position: { direction: 'right', referencePanel: 'graph-panel' },
    });

    api.addPanel({
      id: 'game-panel',
      component: 'panel',
      params: { panelId: 'game' as PanelId },
      title: getPanelTitle('game'),
      position: { direction: 'below', referencePanel: 'inspector-panel' },
    });
  };

  // Save layout on changes
  useEffect(() => {
    if (!apiRef.current || !isReady) return;

    const disposable = apiRef.current.onDidLayoutChange(() => {
      if (apiRef.current) {
        const layout = apiRef.current.toJSON();
        setDockviewLayout(layout);
      }
    });

    return () => {
      disposable.dispose();
    };
  }, [isReady, setDockviewLayout]);

  // Update locked state
  useEffect(() => {
    if (!apiRef.current) return;

    apiRef.current.groups.forEach((group) => {
      if (isLocked) {
        group.locked = 'no-drop-target';
      } else {
        group.locked = false;
      }
    });
  }, [isLocked]);

  // Handle preset loading and panel restoration from currentLayout
  useEffect(() => {
    if (!apiRef.current || !isReady) return;
    if (!currentLayout) return;

    // Only apply if the layout actually changed
    if (currentLayout === lastAppliedLayoutRef.current) return;

    lastAppliedLayoutRef.current = currentLayout;

    // Build panel titles from registry
    const panelTitles: Record<PanelId, string> = {} as any;
    panelRegistry.getAll().forEach(panel => {
      panelTitles[panel.id] = panel.title;
    });

    applyLayoutToDockview(apiRef.current, currentLayout, panelTitles);
  }, [currentLayout, isReady]);

  const components = {
    panel: PanelWrapper,
  };

  return (
    <div className="h-full w-full dockview-theme-dark">
      <DockviewReact
        components={components}
        onReady={onReady}
        className="dockview-theme-dark"
        watermarkComponent={() => (
          <div className="flex items-center justify-center h-full text-white/20 text-sm">
            Pixsim7 Workspace
          </div>
        )}
      />
    </div>
  );
}
