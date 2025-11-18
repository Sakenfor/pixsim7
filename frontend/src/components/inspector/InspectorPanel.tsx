import { useState, useEffect, lazy, Suspense } from 'react';
import { type DraftSceneNode } from '../../modules/scene-builder';
import { useGraphStore, type GraphState } from '../../stores/graphStore';
import { useSelectionStore } from '../../stores/selectionStore';
import { useToast } from '../../stores/toastStore';
import { nodeTypeRegistry } from '@pixsim7/types';
import { VideoNodeEditor } from './VideoNodeEditor';
import { ChoiceNodeEditor } from './ChoiceNodeEditor';
import { ConditionNodeEditor } from './ConditionNodeEditor';
import { MiniGameNodeEditor } from './MiniGameNodeEditor';
import { EndNodeEditor } from './EndNodeEditor';
import { SceneCallNodeEditor } from './SceneCallNodeEditor';
import { ReturnNodeEditor } from './ReturnNodeEditor';

// Dynamic editor component map
const EDITOR_COMPONENTS: Record<string, React.ComponentType<any>> = {
  VideoNodeEditor,
  ChoiceNodeEditor,
  ConditionNodeEditor,
  EndNodeEditor,
  SceneCallNodeEditor,
  ReturnNodeEditor,
  MiniGameNodeEditor,
};

export function InspectorPanel() {
  const { selectedNodeId } = useSelectionStore();
  const getCurrentScene = useGraphStore((s: GraphState) => s.getCurrentScene);
  const updateNode = useGraphStore((s: GraphState) => s.updateNode);
  const toast = useToast();
  const [selectedNode, setSelectedNode] = useState<DraftSceneNode | null>(null);
  const [label, setLabel] = useState('');

  // Get current scene
  const currentScene = getCurrentScene();

  // Load selected node when selection or scene changes
  useEffect(() => {
    if (selectedNodeId && currentScene) {
      const node = currentScene.nodes.find((n: DraftSceneNode) => n.id === selectedNodeId);
      if (node) {
        setSelectedNode(node);
        setLabel(node.metadata?.label || '');
      } else {
        setSelectedNode(null);
      }
    } else {
      setSelectedNode(null);
    }
  }, [selectedNodeId, currentScene]);

  function handleUpdateNode(patch: Partial<DraftSceneNode>) {
    if (!selectedNodeId) return;

    try {
      updateNode(selectedNodeId, patch);
      toast.success('Node updated');
    } catch (error) {
      toast.error(`Failed to update node: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  function handleLabelChange(newLabel: string) {
    setLabel(newLabel);
  }

  function handleLabelBlur() {
    if (label !== selectedNode?.metadata?.label) {
      handleUpdateNode({
        metadata: {
          ...selectedNode?.metadata,
          label: label.trim() || selectedNodeId,
        }
      });
    }
  }

  if (!selectedNodeId || !selectedNode) {
    return (
      <div className="p-4 h-full flex items-center justify-center">
        <div className="text-center space-y-2">
          <div className="text-4xl">👈</div>
          <div className="text-sm text-neutral-500 dark:text-neutral-400">
            Select a node in the graph to edit its properties
          </div>
        </div>
      </div>
    );
  }

  // Get node type definition from registry
  const nodeTypeDef = nodeTypeRegistry.get(selectedNode.type);

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="border-b p-4 bg-neutral-50 dark:bg-neutral-900">
        <div className="text-xs font-semibold text-neutral-500 dark:text-neutral-400 mb-2">
          INSPECTOR
        </div>
        <div className="space-y-2">
          {/* Node info with icon */}
          <div className="flex items-center gap-2">
            {nodeTypeDef?.icon && <span className="text-2xl">{nodeTypeDef.icon}</span>}
            <div className="flex-1">
              <div className="text-sm font-medium">{nodeTypeDef?.name ?? selectedNode.type}</div>
              {nodeTypeDef?.description && (
                <div className="text-xs text-neutral-500">{nodeTypeDef.description}</div>
              )}
            </div>
          </div>

          {/* Node ID Badge */}
          <div className="px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded text-xs font-mono inline-block">
            {selectedNodeId}
          </div>

          {/* Label Input */}
          <div>
            <label className="block text-xs font-medium mb-1">Node Label</label>
            <input
              type="text"
              value={label}
              onChange={(e) => handleLabelChange(e.target.value)}
              onBlur={handleLabelBlur}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.currentTarget.blur();
                }
              }}
              className="w-full px-3 py-2 border rounded text-sm bg-white dark:bg-neutral-800 border-neutral-300 dark:border-neutral-600"
              placeholder="Enter label..."
            />
          </div>

          {/* Node Type Badge */}
          <div>
            <span className="text-xs text-neutral-500 dark:text-neutral-400">Type: </span>
            <span className={`px-2 py-0.5 rounded text-xs font-medium ${nodeTypeDef?.bgColor || 'bg-purple-100 dark:bg-purple-900/30'} ${nodeTypeDef?.color || 'text-purple-700 dark:text-purple-300'}`}>
              {selectedNode.type}
            </span>
          </div>
        </div>
      </div>

      {/* Dynamic Editor */}
      <div className="flex-1 overflow-y-auto p-4">
        {(() => {
          // Special case: mini-game is detected by metadata, not node type
          if (selectedNode.type === 'video' && (selectedNode.metadata as any)?.isMiniGame) {
            const EditorComponent = EDITOR_COMPONENTS['MiniGameNodeEditor'];
            return EditorComponent ? <EditorComponent node={selectedNode} onUpdate={handleUpdateNode} /> : null;
          }

          // Get editor component name from registry
          const editorComponentName = nodeTypeDef?.editorComponent;
          const EditorComponent = editorComponentName
            ? EDITOR_COMPONENTS[editorComponentName]
            : null;

          if (EditorComponent) {
            return <EditorComponent node={selectedNode} onUpdate={handleUpdateNode} />;
          }

          // Fallback: show generic info for nodes without editors
          return (
            <div className="text-sm text-neutral-600 dark:text-neutral-400">
              <p className="mb-2">
                {nodeTypeDef?.name ?? 'Custom node'}: <code className="px-1 py-0.5 bg-neutral-200 dark:bg-neutral-700 rounded text-xs">{selectedNode.type}</code>
              </p>
              {nodeTypeDef?.description && (
                <p className="text-xs mb-4">{nodeTypeDef.description}</p>
              )}
              <p className="text-xs text-neutral-500">
                No editor registered for this node type.
              </p>
            </div>
          );
        })()}
      </div>
    </div>
  );
}
