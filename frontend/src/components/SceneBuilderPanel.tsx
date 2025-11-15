import { useState, useEffect } from 'react';
import { Button } from '@pixsim7/ui';
import { useGraphStore, type GraphState } from '../stores/graphStore';
import type { SelectionStrategy, PlaybackMode } from '@pixsim7/types';
import type { DraftSceneNode } from '../modules/scene-builder';
import { useToast } from '../stores/toastStore';
import { useSelectionStore } from '../stores/selectionStore';
import { logEvent } from '../lib/logging';

export function SceneBuilderPanel() {
  const toast = useToast();
  const { selectedNodeId } = useSelectionStore();
  const draft = useGraphStore((s: GraphState) => s.draft);
  const createDraft = useGraphStore((s: GraphState) => s.createDraft);
  const addNode = useGraphStore((s: GraphState) => s.addNode);
  const updateNode = useGraphStore((s: GraphState) => s.updateNode);
  const toRuntimeScene = useGraphStore((s: GraphState) => s.toRuntimeScene);

  const [nodeId, setNodeId] = useState('node_1');
  const [label, setLabel] = useState('');
  const [selectionKind, setSelectionKind] = useState<'ordered' | 'random' | 'pool'>('ordered');
  const [filterTags, setFilterTags] = useState('');
  const [progressionSteps, setProgressionSteps] = useState<Array<{ label: string; segmentIds: string }>>([
    { label: 'Step 1', segmentIds: '' }
  ]);

  // Load selected node data when selection changes
  useEffect(() => {
    if (selectedNodeId && draft) {
      const node = draft.nodes.find((n: DraftSceneNode) => n.id === selectedNodeId);
      if (node) {
        setNodeId(node.id);
        setLabel(node.metadata?.label || '');

        // Load selection strategy
        if (node.selection) {
          setSelectionKind(node.selection.kind);
          if (node.selection.kind === 'pool' && node.selection.filterTags) {
            setFilterTags(node.selection.filterTags.join(', '));
          } else {
            setFilterTags('');
          }
        }

        // Load progression steps if they exist
        if (node.playback?.kind === 'progression' && node.playback.segments) {
          const steps = node.playback.segments.map((seg: any) => ({
            label: seg.label,
            segmentIds: seg.segmentIds?.join(', ') || '',
          }));
          setProgressionSteps(steps.length > 0 ? steps : [{ label: 'Step 1', segmentIds: '' }]);
        }
      }
    }
  }, [selectedNodeId, draft]);

  function handleAddStep() {
    setProgressionSteps([...progressionSteps, { label: `Step ${progressionSteps.length + 1}`, segmentIds: '' }]);
  }

  function handleUpdateStep(index: number, field: 'label' | 'segmentIds', value: string) {
    const updated = [...progressionSteps];
    updated[index][field] = value;
    setProgressionSteps(updated);
  }

  function handleRemoveStep(index: number) {
    setProgressionSteps(progressionSteps.filter((_, i) => i !== index));
  }

  function handleSaveToDraft() {
    try {
      // Create or get draft
      if (!draft) {
        createDraft('Untitled Scene');
      }

      // Build selection strategy
      let selection: SelectionStrategy;
      if (selectionKind === 'pool') {
        const tags = filterTags.split(',').map(t => t.trim()).filter(Boolean);
        selection = { kind: 'pool', filterTags: tags.length > 0 ? tags : undefined };
      } else {
        selection = { kind: selectionKind };
      }

      // Build playback mode (progression)
      const playback: PlaybackMode = {
        kind: 'progression',
        segments: progressionSteps.map(step => ({
          label: step.label,
          segmentIds: step.segmentIds ? step.segmentIds.split(',').map(s => s.trim()) : undefined
        })),
        miniGame: { id: 'reflex', config: { rounds: 3 } }
      };

      // Add or update node
      const existingNode = draft?.nodes.find((n: DraftSceneNode) => n.id === nodeId);
      if (existingNode) {
        updateNode(nodeId, {
          selection,
          playback,
          metadata: { label }
        });
        toast.success('Node updated successfully');
      } else {
        addNode({
          id: nodeId,
          type: 'video',
          selection,
          playback,
          metadata: { label }
        });
        toast.success('Node added to draft');
      }
    } catch (error) {
      toast.error(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  function handlePreviewInGame() {
    try {
      const scene = toRuntimeScene();
      if (!scene) {
        toast.error('No scene to preview');
        return;
      }

      // TODO: Wire postMessage to game iframe
      // For now, just show a toast
      logEvent('DEBUG', 'scene_preview_ready', {
        nodeCount: scene.nodes.length,
        edgeCount: scene.edges.length,
      });
      toast.info('Preview feature coming soon - scene structure ready');
    } catch (error) {
      toast.error(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  return (
    <div className="p-4 space-y-4 overflow-y-auto h-full">
      <div className="space-y-2">
        <h3 className="text-lg font-semibold">Scene Node Editor</h3>
        <p className="text-xs text-neutral-500 dark:text-neutral-400">
          Configure a scene node with selection strategy and progression steps
        </p>
        {selectedNodeId && (
          <div className="px-3 py-2 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded text-xs">
            <span className="font-semibold text-blue-900 dark:text-blue-300">Editing: </span>
            <span className="text-blue-700 dark:text-blue-400">{selectedNodeId}</span>
          </div>
        )}
        {!selectedNodeId && (
          <div className="px-3 py-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded text-xs text-amber-700 dark:text-amber-400">
            Select a node in the graph to edit its properties
          </div>
        )}
      </div>

      <div className="space-y-3">
        {/* Node ID */}
        <div>
          <label className="block text-sm font-medium mb-1">Node ID</label>
          <input
            type="text"
            value={nodeId}
            onChange={(e) => setNodeId(e.target.value)}
            className="w-full px-3 py-2 border rounded text-sm bg-white dark:bg-neutral-800 border-neutral-300 dark:border-neutral-600"
            placeholder="e.g., node_1"
          />
        </div>

        {/* Label */}
        <div>
          <label className="block text-sm font-medium mb-1">Label (optional)</label>
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            className="w-full px-3 py-2 border rounded text-sm bg-white dark:bg-neutral-800 border-neutral-300 dark:border-neutral-600"
            placeholder="e.g., Opening scene"
          />
        </div>

        {/* Selection Strategy */}
        <div>
          <label className="block text-sm font-medium mb-1">Selection Strategy</label>
          <select
            value={selectionKind}
            onChange={(e) => setSelectionKind(e.target.value as any)}
            className="w-full px-3 py-2 border rounded text-sm bg-white dark:bg-neutral-800 border-neutral-300 dark:border-neutral-600"
          >
            <option value="ordered">Ordered</option>
            <option value="random">Random</option>
            <option value="pool">Pool (filter by tags)</option>
          </select>
        </div>

        {/* Filter Tags (only for pool) */}
        {selectionKind === 'pool' && (
          <div>
            <label className="block text-sm font-medium mb-1">Filter Tags (comma-separated)</label>
            <input
              type="text"
              value={filterTags}
              onChange={(e) => setFilterTags(e.target.value)}
              className="w-full px-3 py-2 border rounded text-sm bg-white dark:bg-neutral-800 border-neutral-300 dark:border-neutral-600"
              placeholder="e.g., intro, cafe, morning"
            />
            <p className="text-xs text-neutral-500 mt-1">
              Segments matching these tags will be selected from the pool
            </p>
          </div>
        )}

        {/* Progression Steps */}
        <div className="border-t pt-3 dark:border-neutral-700">
          <div className="flex items-center justify-between mb-2">
            <label className="block text-sm font-medium">Progression Steps</label>
            <Button size="sm" variant="secondary" onClick={handleAddStep}>
              + Add Step
            </Button>
          </div>

          <div className="space-y-2">
            {progressionSteps.map((step, index) => (
              <div key={index} className="p-3 border rounded bg-neutral-50 dark:bg-neutral-800/50 dark:border-neutral-700">
                <div className="flex items-start gap-2">
                  <div className="flex-1 space-y-2">
                    <input
                      type="text"
                      value={step.label}
                      onChange={(e) => handleUpdateStep(index, 'label', e.target.value)}
                      className="w-full px-2 py-1 border rounded text-sm bg-white dark:bg-neutral-800 border-neutral-300 dark:border-neutral-600"
                      placeholder="Step label"
                    />
                    <input
                      type="text"
                      value={step.segmentIds}
                      onChange={(e) => handleUpdateStep(index, 'segmentIds', e.target.value)}
                      className="w-full px-2 py-1 border rounded text-sm bg-white dark:bg-neutral-800 border-neutral-300 dark:border-neutral-600"
                      placeholder="Segment IDs (optional, comma-separated)"
                    />
                  </div>
                  <button
                    onClick={() => handleRemoveStep(index)}
                    className="text-red-600 hover:text-red-700 text-xs px-2 py-1"
                    disabled={progressionSteps.length === 1}
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="border-t pt-4 space-y-2 dark:border-neutral-700">
        <Button
          variant="primary"
          onClick={handleSaveToDraft}
          className="w-full"
        >
          Save to Draft
        </Button>
        <Button
          variant="secondary"
          onClick={handlePreviewInGame}
          className="w-full"
        >
          Preview in Game
        </Button>

        {draft && (
          <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded text-xs">
            <div className="font-semibold text-blue-900 dark:text-blue-300">Current Draft</div>
            <div className="text-blue-700 dark:text-blue-400 mt-1">
              {draft.title} - {draft.nodes.length} node(s)
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
