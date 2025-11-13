import { useState, useEffect } from 'react';
import { type DraftSceneNode } from '../../modules/scene-builder';
import { useGraphStore, type GraphState } from '../../stores/graphStore';
import { useSelectionStore } from '../../stores/selectionStore';
import { useToast } from '../../stores/toastStore';
import { VideoNodeEditor } from './VideoNodeEditor';
import { ChoiceNodeEditor } from './ChoiceNodeEditor';
import { ConditionNodeEditor } from './ConditionNodeEditor';
import { MiniGameNodeEditor } from './MiniGameNodeEditor';
import { EndNodeEditor } from './EndNodeEditor';

export function InspectorPanel() {
  const { selectedNodeId } = useSelectionStore();
  const draft = useGraphStore((s: GraphState) => s.draft);
  const updateNode = useGraphStore((s: GraphState) => s.updateNode);
  const toast = useToast();
  const [selectedNode, setSelectedNode] = useState<DraftSceneNode | null>(null);
  const [label, setLabel] = useState('');

  // Load selected node when selection or draft changes
  useEffect(() => {
    if (selectedNodeId && draft) {
      const node = draft.nodes.find((n: DraftSceneNode) => n.id === selectedNodeId);
      if (node) {
        setSelectedNode(node);
        setLabel(node.metadata?.label || '');
      } else {
        setSelectedNode(null);
      }
    } else {
      setSelectedNode(null);
    }
  }, [selectedNodeId, draft]);

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

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="border-b p-4 bg-neutral-50 dark:bg-neutral-900">
        <div className="text-xs font-semibold text-neutral-500 dark:text-neutral-400 mb-2">
          INSPECTOR
        </div>
        <div className="space-y-2">
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
            <span className="px-2 py-0.5 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded text-xs font-medium">
              {selectedNode.type}
            </span>
          </div>
        </div>
      </div>

      {/* Type-specific Editor */}
      <div className="flex-1 overflow-y-auto p-4">
        {selectedNode.type === 'video' && (
          <VideoNodeEditor node={selectedNode} onUpdate={handleUpdateNode} />
        )}
        {selectedNode.type === 'choice' && (
          <ChoiceNodeEditor node={selectedNode} onUpdate={handleUpdateNode} />
        )}
        {selectedNode.type === 'condition' && (
          <ConditionNodeEditor node={selectedNode} onUpdate={handleUpdateNode} />
        )}
        {(selectedNode.type === 'video' && (selectedNode.metadata as any)?.isMiniGame) && (
          <MiniGameNodeEditor node={selectedNode} onUpdate={handleUpdateNode} />
        )}
        {selectedNode.type === 'end' && (
          <EndNodeEditor node={selectedNode} onUpdate={handleUpdateNode} />
        )}
      </div>
    </div>
  );
}
