import { useState, useEffect, useCallback } from 'react';
import type { DraftSceneNode } from '@domain/sceneBuilder';
import type { NodeEditorProps } from './editorTypes';

// Re-export for convenience
export type { NodeEditorProps } from './editorTypes';

export interface UseNodeEditorOptions<T> {
  /** Initial form state */
  initialState: T;
  /** Load form state from node data */
  loadFromNode: (node: DraftSceneNode) => Partial<T>;
  /** Convert form state to node update patch */
  saveToNode: (formState: T, node: DraftSceneNode) => Partial<DraftSceneNode>;
}

/**
 * Common hook for node editors that handles:
 * - Loading node data into form state
 * - Saving form state back to node
 * - Apply handler logic
 * 
 * @example
 * ```tsx
 * const { formState, setFormState, handleApply, updateField } = useNodeEditor({
 *   node,
 *   onUpdate,
 *   initialState: { endType: 'neutral', message: '' },
 *   loadFromNode: (node) => {
 *     const config = (node.metadata as any)?.endConfig;
 *     return config ? { endType: config.endType, message: config.message } : {};
 *   },
 *   saveToNode: (formState, node) => ({
 *     metadata: { ...node.metadata, endConfig: formState }
 *   })
 * });
 * ```
 */
export function useNodeEditor<T extends Record<string, any>>(
  props: NodeEditorProps & UseNodeEditorOptions<T>
) {
  const { node, onUpdate, initialState, loadFromNode, saveToNode } = props;
  const [formState, setFormState] = useState<T>(initialState);

  // Load node data into form state
  useEffect(() => {
    const loadedData = loadFromNode(node);
    if (Object.keys(loadedData).length > 0) {
      setFormState(prev => ({ ...prev, ...loadedData }));
    }
  }, [node, loadFromNode]);

  // Apply changes to node
  const handleApply = useCallback(() => {
    const patch = saveToNode(formState, node);
    onUpdate(patch);
  }, [formState, node, onUpdate, saveToNode]);

  // Helper to update a single field
  const updateField = useCallback(<K extends keyof T>(field: K, value: T[K]) => {
    setFormState(prev => ({ ...prev, [field]: value }));
  }, []);

  return {
    formState,
    setFormState,
    handleApply,
    updateField,
  };
}
