/**
 * Graph Editor Host
 *
 * Host component that dynamically renders a graph editor surface based on editor ID.
 * Looks up the editor definition from the graph editor registry.
 * Part of Task 53 - Graph Editor Registry & Modular Surfaces
 */

import { useMemo } from 'react';

import { graphEditorSelectors } from '@lib/plugins/catalogSelectors';

import { usePanelConfigStore } from '@features/panels';
import { useWorkspacePresets, useWorkspaceStore } from '@features/workspace';

import type { GraphEditorId } from '../../lib/editor/types';

export interface GraphEditorHostProps {
  /**
   * Graph editor ID to render
   * Defaults to 'scene-graph-v2' (the core scene graph editor)
   */
  editorId?: GraphEditorId;
}

/**
 * GraphEditorHost - Dynamically renders a graph editor surface from the registry
 */
export function GraphEditorHost({ editorId }: GraphEditorHostProps) {
  // Allow panel config to override the default editor for the Graph panel
  const panelConfig = usePanelConfigStore((s) => s.panelConfigs.graph);
  const activePresetId = useWorkspaceStore((s) => s.getActivePresetId('workspace'));
  const presets = useWorkspacePresets('workspace');

  const presetGraphEditorId = activePresetId
    ? presets.find((p) => p.id === activePresetId)?.graphEditorId
    : undefined;

  const effectiveEditorId: GraphEditorId =
    editorId ||
    (presetGraphEditorId as GraphEditorId) ||
    (panelConfig?.settings?.graphEditorId as GraphEditorId) ||
    'scene-graph-v2';

  const editorDef = useMemo(
    () => graphEditorSelectors.get(effectiveEditorId),
    [effectiveEditorId]
  );

  if (!editorDef) {
    return (
      <div className="p-4 text-sm text-red-500">
        Unknown graph editor: <code>{effectiveEditorId}</code>
        <div className="mt-2 text-xs text-neutral-500">
          Available editors: {graphEditorSelectors.getAll().map(e => e.id).join(', ')}
        </div>
      </div>
    );
  }

  const EditorComponent = editorDef.component;
  return (
    <div className="h-full flex flex-col">
      <div className="px-3 py-1 border-b border-neutral-200 dark:border-neutral-800 text-[11px] text-neutral-600 dark:text-neutral-400 flex items-center justify-between bg-neutral-50 dark:bg-neutral-900/60">
        <span className="font-medium">
          Graph editor: <span className="font-mono">{editorDef.label}</span>
        </span>
        <span className="text-[10px] text-neutral-400 dark:text-neutral-500">
          id: <span className="font-mono">{editorDef.id}</span>
        </span>
      </div>
      <div className="flex-1 min-h-0">
        <EditorComponent />
      </div>
    </div>
  );
}
