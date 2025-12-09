import { useMemo, useState } from 'react';
import clsx from 'clsx';
import {
  SurfaceWorkbench,
  type SurfaceWorkbenchStatus,
} from '@/components/surface-workbench';
import { useEditorContext } from '@/lib/context/editorContext';
import {
  gizmoSurfaceRegistry,
  type GizmoSurfaceContext,
  type GizmoSurfaceDefinition,
} from '@/lib/gizmos/surfaceRegistry';

type SurfaceModeFilter = 'all' | 'panel' | 'overlay' | 'hud';

const MODE_OPTIONS: Array<{ id: SurfaceModeFilter; label: string }> = [
  { id: 'all', label: 'All types' },
  { id: 'panel', label: 'Panels' },
  { id: 'overlay', label: 'Overlays' },
  { id: 'hud', label: 'HUD' },
];

const CONTEXT_LABELS: Record<GizmoSurfaceContext, string> = {
  'scene-editor': 'Scene Editor',
  'game-2d': 'Game 2D View',
  'game-3d': 'Game 3D View',
  playground: 'Playground',
  workspace: 'Workspace',
  hud: 'HUD Overlay',
};

const CATEGORY_LABELS: Record<string, string> = {
  scene: 'Scene Surfaces',
  world: 'World Dashboards',
  npc: 'NPC & Relationship',
  debug: 'Debug Tools',
  custom: 'Custom / Plugin',
};

function deriveContext(ctx: ReturnType<typeof useEditorContext>): GizmoSurfaceContext {
  const { primaryView, mode } = ctx.editor;

  // Prefer editor.primaryView/mode as the primary signal
  if (primaryView === 'game') {
    if (mode === 'layout') {
      return 'hud';
    }
    return 'game-2d';
  }

  if (primaryView === 'flow') {
    if (ctx.scene.id) {
      return 'scene-editor';
    }
    return 'workspace';
  }

  if (primaryView === 'world') {
    if (mode === 'layout') {
      return 'hud';
    }
    return 'workspace';
  }

  // Fallback to runtime mode and presets for legacy flows
  if (ctx.runtime.mode === 'playtest' || ctx.runtime.mode === 'game-2d') {
    return 'game-2d';
  }
  if (ctx.runtime.mode === 'hud') {
    return 'hud';
  }
  if (ctx.workspace.activePresetId?.toLowerCase().includes('playtest')) {
    return 'game-2d';
  }
  if (ctx.scene.id) {
    return 'scene-editor';
  }

  return 'workspace';
}

function formatCategory(category?: string): string {
  if (!category) return 'Other Surfaces';
  return CATEGORY_LABELS[category] ?? category.replace(/^\w/, (c) => c.toUpperCase());
}

function getModesForSurface(surface: GizmoSurfaceDefinition): string[] {
  const modes: string[] = [];
  if (surface.panelComponent) modes.push('Panel');
  if (surface.overlayComponent) modes.push('Overlay');
  if (surface.hudComponent) modes.push('HUD');
  return modes.length > 0 ? modes : ['Unspecified'];
}

export function SurfaceWorkbenchPanel() {
  const editorContext = useEditorContext();
  const [modeFilter, setModeFilter] = useState<SurfaceModeFilter>('panel');
  const [showAllContexts, setShowAllContexts] = useState(false);

  const derivedContext = useMemo(
    () => deriveContext(editorContext),
    [
      editorContext.editor.primaryView,
      editorContext.editor.mode,
      editorContext.runtime.mode,
      editorContext.scene.id,
      editorContext.workspace.activePresetId,
    ]
  );

  const contextLabel = CONTEXT_LABELS[derivedContext] ?? 'Workspace';

  const surfaces = useMemo(() => {
    const all = gizmoSurfaceRegistry.getSortedByPriority();
    if (showAllContexts) {
      return all;
    }
    return all.filter((surface) => {
      if (!surface.supportsContexts || surface.supportsContexts.length === 0) {
        return true;
      }
      return surface.supportsContexts.includes(derivedContext);
    });
  }, [derivedContext, showAllContexts]);

  const filteredSurfaces = useMemo(() => {
    return surfaces.filter((surface) => {
      switch (modeFilter) {
        case 'panel':
          return Boolean(surface.panelComponent);
        case 'overlay':
          return Boolean(surface.overlayComponent);
        case 'hud':
          return Boolean(surface.hudComponent);
        default:
          return true;
      }
    });
  }, [surfaces, modeFilter]);

  const groupedSurfaces = useMemo(() => {
    const groups = new Map<string, GizmoSurfaceDefinition[]>();
    filteredSurfaces.forEach((surface) => {
      const key = surface.category ?? 'custom';
      const list = groups.get(key) ?? [];
      list.push(surface);
      groups.set(key, list);
    });

    return Array.from(groups.entries()).map(([category, items]) => ({
      category,
      items,
    }));
  }, [filteredSurfaces]);

  const statusMessages = useMemo<SurfaceWorkbenchStatus[]>(() => {
    const worldText = editorContext.world.id
      ? `World #${editorContext.world.id}`
      : 'No active world';
    const sceneText = editorContext.scene.title
      ? `Scene: ${editorContext.scene.title}`
      : editorContext.scene.id
        ? `Scene ID: ${editorContext.scene.id}`
        : 'No scene selected';
    const runtimeText = editorContext.editor.mode
      ? `Editor mode: ${editorContext.editor.mode}`
      : editorContext.runtime.mode
        ? `Runtime: ${editorContext.runtime.mode}`
        : 'No active mode';

    const messages: SurfaceWorkbenchStatus[] = [
      {
        type: 'info',
        content: (
          <div className="space-y-1 text-sm">
            <div className="font-semibold text-neutral-800 dark:text-neutral-100">
              Context Snapshot
            </div>
            <div className="text-neutral-700 dark:text-neutral-300 space-y-0.5">
              <div>{worldText}</div>
              <div>{sceneText}</div>
              <div>{runtimeText}</div>
            </div>
            <div className="text-xs text-neutral-500 dark:text-neutral-400">
              Viewing surfaces for {contextLabel}
            </div>
          </div>
        ),
      },
    ];

    if (filteredSurfaces.length === 0) {
      messages.push({
        type: 'warning',
        content: (
          <div className="text-sm">
            No surfaces match the current context and filter. Try enabling "Show all contexts"
            or choosing a different surface type.
          </div>
        ),
      });
    }

    return messages;
  }, [
    contextLabel,
    editorContext.editor.mode,
    editorContext.runtime.mode,
    editorContext.scene.id,
    editorContext.scene.title,
    editorContext.world.id,
    filteredSurfaces.length,
  ]);

  const sidebar = (
    <div className="space-y-4 text-sm">
      <div className="space-y-2">
        <div className="font-semibold text-neutral-800 dark:text-neutral-100">
          Active Context
        </div>
        <p className="text-xs text-neutral-500 dark:text-neutral-400">
          Derived automatically from world, scene, and runtime state.
        </p>
        <div className="text-sm font-medium text-neutral-900 dark:text-neutral-50">
          {contextLabel}
        </div>
        <label className="flex items-center gap-2 text-xs text-neutral-600 dark:text-neutral-400">
          <input
            type="checkbox"
            checked={showAllContexts}
            onChange={(e) => setShowAllContexts(e.target.checked)}
            className="cursor-pointer"
          />
          Show all contexts
        </label>
      </div>

      <div className="space-y-2">
        <div className="font-semibold text-neutral-800 dark:text-neutral-100">Surface Type</div>
        <div className="flex flex-wrap gap-1.5">
          {MODE_OPTIONS.map((option) => (
            <button
              key={option.id}
              onClick={() => setModeFilter(option.id)}
              className={clsx(
                'px-2 py-1 text-xs rounded border transition-colors',
                modeFilter === option.id
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'border-neutral-300 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300 hover:border-blue-400 dark:hover:border-blue-400'
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-1">
        <div className="font-semibold text-neutral-800 dark:text-neutral-100">
          Workspace Snapshot
        </div>
        <div className="text-xs text-neutral-600 dark:text-neutral-400">
          Preset:{' '}
          {editorContext.workspace.activePresetId ?? 'Unpinned'}
        </div>
        <div className="text-xs text-neutral-600 dark:text-neutral-400">
          Panels in layout: {editorContext.workspace.activePanels.length || '0'}
        </div>
      </div>
    </div>
  );

  const mainContent = (
    <div className="space-y-4">
      {groupedSurfaces.length === 0 ? (
        <div className="rounded border border-dashed border-neutral-300 dark:border-neutral-700 p-6 text-center text-sm text-neutral-500 dark:text-neutral-400">
          No surfaces available for the current filters.
        </div>
      ) : (
        groupedSurfaces.map(({ category, items }) => (
          <section
            key={category}
            className="border border-neutral-200 dark:border-neutral-800 rounded-lg overflow-hidden"
          >
            <header className="px-4 py-3 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900/40 flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold text-neutral-800 dark:text-neutral-100">
                  {formatCategory(category)}
                </div>
                <div className="text-xs text-neutral-500 dark:text-neutral-400">
                  {items.length} surface{items.length === 1 ? '' : 's'}
                </div>
              </div>
              <div className="text-xs text-neutral-500 dark:text-neutral-400">
                Context: {contextLabel}
              </div>
            </header>
            <div className="p-4 grid gap-3 md:grid-cols-2">
              {items.map((surface) => (
                <article
                  key={surface.id}
                  className="border border-neutral-200 dark:border-neutral-800 rounded-md p-3 flex flex-col gap-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-sm font-semibold text-neutral-800 dark:text-neutral-100">
                        {surface.label}
                      </div>
                      <div className="text-xs text-neutral-500 dark:text-neutral-400 font-mono">
                        {surface.id}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1 justify-end">
                      {getModesForSurface(surface).map((mode) => (
                        <span
                          key={`${surface.id}-${mode}`}
                          className="px-1.5 py-0.5 text-[11px] rounded bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 border border-neutral-200 dark:border-neutral-700"
                        >
                          {mode}
                        </span>
                      ))}
                    </div>
                  </div>
                  {surface.description && (
                    <p className="text-xs text-neutral-600 dark:text-neutral-400 line-clamp-2">
                      {surface.description}
                    </p>
                  )}
                  <div className="text-[11px] text-neutral-500 dark:text-neutral-400 flex flex-wrap gap-2">
                    {surface.supportsContexts && surface.supportsContexts.length > 0 && (
                      <span>
                        Contexts:{' '}
                        {surface.supportsContexts
                          .map((ctx) => CONTEXT_LABELS[ctx] ?? ctx)
                          .join(', ')}
                      </span>
                    )}
                    {surface.tags && surface.tags.length > 0 && (
                      <span>
                        Tags:{' '}
                        {surface.tags.map((tag) => `#${tag}`).join(' ')}
                      </span>
                    )}
                  </div>
                </article>
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );

  return (
    <SurfaceWorkbench
      title="Surface Workbench"
      description="Inspect HUD, overlay, and gizmo surfaces available to this workspace."
      showHeader={false}
      sidebar={sidebar}
      mainContent={mainContent}
      statusMessages={statusMessages}
    />
  );
}

