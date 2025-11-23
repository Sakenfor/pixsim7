/**
 * Graph Editor Host
 *
 * Host component that dynamically renders a graph editor surface based on editor ID.
 * Looks up the editor definition from the graph editor registry.
 * Part of Task 53 - Graph Editor Registry & Modular Surfaces
 */

import { useMemo } from 'react';
import { graphEditorRegistry } from '../../lib/graph/editorRegistry';
import type { GraphEditorId } from '../../lib/graph/types';

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
export function GraphEditorHost({ editorId = 'scene-graph-v2' }: GraphEditorHostProps) {
  const editorDef = useMemo(() => graphEditorRegistry.get(editorId), [editorId]);

  if (!editorDef) {
    return (
      <div className="p-4 text-sm text-red-500">
        Unknown graph editor: <code>{editorId}</code>
        <div className="mt-2 text-xs text-neutral-500">
          Available editors: {graphEditorRegistry.getAll().map(e => e.id).join(', ')}
        </div>
      </div>
    );
  }

  const EditorComponent = editorDef.component;
  return <EditorComponent />;
}
