import { useState, useEffect } from 'react';
import { Button } from '@pixsim7/ui';
import type { DraftSceneNode } from '../../modules/scene-builder';
import type { SelectionStrategy, PlaybackMode } from '@pixsim7/types';
import { useAssetPickerStore, type SelectedAsset } from '../../stores/assetPickerStore';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { useToast } from '../../stores/toastStore';

interface VideoNodeEditorProps {
  node: DraftSceneNode;
  onUpdate: (patch: Partial<DraftSceneNode>) => void;
}

export function VideoNodeEditor({ node, onUpdate }: VideoNodeEditorProps) {
  const toast = useToast();
  const enterSelectionMode = useAssetPickerStore((s) => s.enterSelectionMode);
  const openFloatingPanel = useWorkspaceStore((s) => s.openFloatingPanel);

  const [selectionKind, setSelectionKind] = useState<'ordered' | 'random' | 'pool'>('ordered');
  const [filterTags, setFilterTags] = useState('');
  const [progressionSteps, setProgressionSteps] = useState<Array<{ label: string; segmentIds: string }>>([
    { label: 'Step 1', segmentIds: '' }
  ]);
  const [selectedAssetIds, setSelectedAssetIds] = useState<string[]>([]);

  // Load node data
  useEffect(() => {
    if (node.selection) {
      setSelectionKind(node.selection.kind);
      if (node.selection.kind === 'pool' && node.selection.filterTags) {
        setFilterTags(node.selection.filterTags.join(', '));
      } else {
        setFilterTags('');
      }
    }

    if (node.playback?.kind === 'progression' && node.playback.segments) {
      const steps = node.playback.segments.map((seg) => ({
        label: seg.label,
        segmentIds: seg.segmentIds?.join(', ') || '',
      }));
      setProgressionSteps(steps.length > 0 ? steps : [{ label: 'Step 1', segmentIds: '' }]);
    }

    // Load asset IDs if they exist
    if (node.assetIds) {
      setSelectedAssetIds(node.assetIds);
    }
  }, [node]);

  // Handle browsing assets
  const handleBrowseAssets = () => {
    // Open gallery in floating mode
    openFloatingPanel('gallery', 100, 100, 800, 600);

    // Enter selection mode with callback
    enterSelectionMode((asset: SelectedAsset) => {
      // Add asset ID to the list
      setSelectedAssetIds(prev => [...prev, asset.id]);
      toast.success(`Added asset: ${asset.id}`);
    });
  };

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

  function handleApply() {
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

    onUpdate({
      selection,
      playback,
      assetIds: selectedAssetIds.length > 0 ? selectedAssetIds : undefined
    });
  }

  function handleRemoveAsset(assetId: string) {
    setSelectedAssetIds(prev => prev.filter(id => id !== assetId));
  }

  return (
    <div className="space-y-3">
      {/* Asset Selection */}
      <div className="border-b pb-3 dark:border-neutral-700">
        <div className="flex items-center justify-between mb-2">
          <label className="block text-sm font-medium">Assets</label>
          <Button size="sm" variant="primary" onClick={handleBrowseAssets}>
            📎 Browse Assets
          </Button>
        </div>

        {selectedAssetIds.length > 0 ? (
          <div className="space-y-1">
            {selectedAssetIds.map((assetId) => (
              <div key={assetId} className="flex items-center justify-between p-2 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded text-sm">
                <span className="font-mono text-blue-700 dark:text-blue-300">{assetId}</span>
                <button
                  onClick={() => handleRemoveAsset(assetId)}
                  className="text-red-600 hover:text-red-700 text-xs px-2 py-1"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            No assets selected. Click "Browse Assets" to add media to this node.
          </p>
        )}
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

      {/* Apply Button */}
      <Button variant="primary" onClick={handleApply} className="w-full">
        Apply Changes
      </Button>
    </div>
  );
}

// Default export for dynamic loading via nodeEditorRegistry
export default VideoNodeEditor;
