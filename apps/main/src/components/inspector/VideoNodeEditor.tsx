import { Button } from '@pixsim7/shared.ui';
import { useNodeEditor } from './useNodeEditor';
import type { NodeEditorProps, VideoConfig } from './editorTypes';
import { validateVideoConfig, logValidationError } from './editorValidation';
import type { SelectionStrategy, PlaybackMode } from '@/types';
import { useAssetPickerStore, type SelectedAsset } from '@/stores/assetPickerStore';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import { useToast } from '@pixsim7/shared.ui';

export function VideoNodeEditor({ node, onUpdate }: NodeEditorProps) {
  const toast = useToast();
  const enterSelectionMode = useAssetPickerStore((s) => s.enterSelectionMode);
  const openFloatingPanel = useWorkspaceStore((s) => s.openFloatingPanel);

  const { formState, setFormState, handleApply } = useNodeEditor<VideoConfig>({
    node,
    onUpdate,
    initialState: {
      selectionKind: 'ordered',
      filterTags: '',
      progressionSteps: [{ label: 'Step 1', segmentIds: '' }],
      selectedAssetIds: [],
      advanceMinutes: undefined,
      npcId: undefined,
      speakerRole: '',
      npcState: '',
    },
    loadFromNode: (node) => {
      const metadata = node.metadata as Record<string, unknown> | undefined;

      // Try new standardized field first
      const savedConfig = metadata?.videoConfig as VideoConfig | undefined;
      if (savedConfig) {
        return savedConfig;
      }

      // Fallback: construct from old scattered fields
      const result: Partial<VideoConfig> = {};

      // Selection
      if (node.selection) {
        result.selectionKind = node.selection.kind as VideoConfig['selectionKind'];
        if (node.selection.kind === 'pool' && node.selection.filterTags) {
          result.filterTags = (node.selection.filterTags as string[]).join(', ');
        }
      }

      // Progression
      if (node.playback?.kind === 'progression' && node.playback.segments) {
        result.progressionSteps = node.playback.segments.map((seg: any) => ({
          label: seg.label,
          segmentIds: seg.segmentIds?.join(', ') || '',
        }));
      }

      // Asset IDs
      if (node.assetIds) {
        result.selectedAssetIds = node.assetIds as string[];
      }

      // Life Sim metadata
      const lifeSim = metadata?.lifeSim as Record<string, unknown> | undefined;
      if (lifeSim?.advanceMinutes !== undefined) {
        result.advanceMinutes = lifeSim.advanceMinutes as number;
      }

      // Handle both snake_case (old) and camelCase (new) field names
      result.npcId = (metadata?.npcId ?? metadata?.npc_id) as number | undefined;
      result.speakerRole = (metadata?.speakerRole ?? '') as string;
      result.npcState = (metadata?.npcState ?? metadata?.npc_state ?? '') as string;

      return result;
    },
    saveToNode: (formState, node) => {
      // Build selection strategy
      let selection: SelectionStrategy;
      if (formState.selectionKind === 'pool') {
        const tags = formState.filterTags.split(',').map(t => t.trim()).filter(Boolean);
        selection = { kind: 'pool', filterTags: tags.length > 0 ? tags : undefined };
      } else {
        selection = { kind: formState.selectionKind };
      }

      // Build playback mode
      const playback: PlaybackMode = {
        kind: 'progression',
        segments: formState.progressionSteps.map(step => ({
          label: step.label,
          segmentIds: step.segmentIds ? step.segmentIds.split(',').map(s => s.trim()) : undefined
        })),
        ...(node.metadata?.isMiniGame ? { miniGame: { id: 'reflex', config: { rounds: 3 } } } : {})
      };

      // Build Life Sim metadata
      const lifeSim: Record<string, unknown> = {};
      if (formState.advanceMinutes !== undefined) {
        lifeSim.advanceMinutes = formState.advanceMinutes;
      }

      const metadata: Record<string, unknown> = { ...(node.metadata || {}) };
      if (Object.keys(lifeSim).length > 0) {
        metadata.lifeSim = lifeSim;
      }
      if (formState.npcId !== undefined) {
        metadata.npcId = formState.npcId;
      }
      if (formState.speakerRole) {
        metadata.speakerRole = formState.speakerRole;
      }
      if (formState.npcState) {
        metadata.npcState = formState.npcState;
      }

      // Store complete config for future loads
      metadata.videoConfig = formState;

      return {
        selection,
        playback,
        metadata,
        assetIds: formState.selectedAssetIds.length > 0 ? formState.selectedAssetIds : undefined
      };
    }
  });

  // Handle browsing assets
  const handleBrowseAssets = () => {
    openFloatingPanel('gallery', 100, 100, 800, 600);
    enterSelectionMode((asset: SelectedAsset) => {
      setFormState({
        ...formState,
        selectedAssetIds: [...formState.selectedAssetIds, asset.id]
      });
      toast.success(`Added asset: ${asset.id}`);
    });
  };

  function handleAddStep() {
    setFormState({
      ...formState,
      progressionSteps: [...formState.progressionSteps, { label: `Step ${formState.progressionSteps.length + 1}`, segmentIds: '' }]
    });
  }

  function handleUpdateStep(index: number, field: 'label' | 'segmentIds', value: string) {
    const updated = [...formState.progressionSteps];
    updated[index][field] = value;
    setFormState({ ...formState, progressionSteps: updated });
  }

  function handleRemoveStep(index: number) {
    setFormState({
      ...formState,
      progressionSteps: formState.progressionSteps.filter((_, i) => i !== index)
    });
  }

  function handleRemoveAsset(assetId: string) {
    setFormState({
      ...formState,
      selectedAssetIds: formState.selectedAssetIds.filter(id => id !== assetId)
    });
  }

  function handleApplyWithValidation() {
    const validation = validateVideoConfig(formState);
    if (!validation.isValid) {
      validation.errors.forEach(error => logValidationError('VideoNodeEditor', error));
      return;
    }
    handleApply();
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

        {formState.selectedAssetIds.length > 0 ? (
          <div className="space-y-1">
            {formState.selectedAssetIds.map((assetId) => (
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
          value={formState.selectionKind}
          onChange={(e) => {
            const value = e.target.value;
            if (value === 'ordered' || value === 'random' || value === 'pool') {
              setFormState({ ...formState, selectionKind: value });
            }
          }}
          className="w-full px-3 py-2 border rounded text-sm bg-white dark:bg-neutral-800 border-neutral-300 dark:border-neutral-600"
        >
          <option value="ordered">Ordered</option>
          <option value="random">Random</option>
          <option value="pool">Pool (filter by tags)</option>
        </select>
      </div>

      {/* Filter Tags (only for pool) */}
      {formState.selectionKind === 'pool' && (
        <div>
          <label className="block text-sm font-medium mb-1">Filter Tags (comma-separated)</label>
          <input
            type="text"
            value={formState.filterTags}
            onChange={(e) => setFormState({ ...formState, filterTags: e.target.value })}
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
          {formState.progressionSteps.map((step, index) => (
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
                  disabled={formState.progressionSteps.length === 1}
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Life Sim Section */}
      <div className="border-t pt-3 dark:border-neutral-700">
        <h4 className="text-sm font-semibold mb-2">Life Sim Metadata</h4>
        <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-3">
          Configure how this node affects world time and NPC bindings
        </p>

        <div className="space-y-3">
          {/* Time Advancement */}
          <div>
            <label className="block text-sm font-medium mb-1">
              Advance World Time (minutes)
            </label>
            <input
              type="number"
              value={formState.advanceMinutes ?? ''}
              onChange={(e) => setFormState({ ...formState, advanceMinutes: e.target.value ? Number(e.target.value) : undefined })}
              className="w-full px-3 py-2 border rounded text-sm bg-white dark:bg-neutral-800 border-neutral-300 dark:border-neutral-600"
              placeholder="e.g., 15 (leave empty for no time change)"
              min="0"
              max="1440"
            />
            <p className="text-xs text-neutral-500 mt-1">
              Number of in-game minutes to advance when this node is entered (0-1440)
            </p>
          </div>

          {/* NPC ID Binding */}
          <div>
            <label className="block text-sm font-medium mb-1">
              Hard NPC Binding (optional)
            </label>
            <input
              type="number"
              value={formState.npcId ?? ''}
              onChange={(e) => setFormState({ ...formState, npcId: e.target.value ? Number(e.target.value) : undefined })}
              className="w-full px-3 py-2 border rounded text-sm bg-white dark:bg-neutral-800 border-neutral-300 dark:border-neutral-600"
              placeholder="e.g., 12 (NPC ID for identity-specific clips)"
              min="0"
            />
            <p className="text-xs text-neutral-500 mt-1">
              Lock this node to a specific NPC (bypasses role binding). Use for clips that are
              strongly tied to a character's identity.
            </p>
          </div>

          {/* Speaker Role */}
          <div>
            <label className="block text-sm font-medium mb-1">
              Speaker Role (optional)
            </label>
            <input
              type="text"
              value={formState.speakerRole}
              onChange={(e) => setFormState({ ...formState, speakerRole: e.target.value })}
              className="w-full px-3 py-2 border rounded text-sm bg-white dark:bg-neutral-800 border-neutral-300 dark:border-neutral-600"
              placeholder="e.g., lead, bartender, friend"
            />
            <p className="text-xs text-neutral-500 mt-1">
              Role from Scene.meta.cast - used for role-based NPC binding
            </p>
          </div>

          {/* NPC Expression State */}
          <div>
            <label className="block text-sm font-medium mb-1">
              NPC Expression State (optional)
            </label>
            <select
              value={formState.npcState}
              onChange={(e) => setFormState({ ...formState, npcState: e.target.value })}
              className="w-full px-3 py-2 border rounded text-sm bg-white dark:bg-neutral-800 border-neutral-300 dark:border-neutral-600"
            >
              <option value="">None</option>
              <option value="idle">Idle</option>
              <option value="talking">Talking</option>
              <option value="waiting_for_player">Waiting for Player</option>
              <option value="happy">Happy</option>
              <option value="sad">Sad</option>
              <option value="angry">Angry</option>
              <option value="surprised">Surprised</option>
              <option value="thinking">Thinking</option>
            </select>
            <p className="text-xs text-neutral-500 mt-1">
              NPC expression/emotion state for UI overlays (portraits, reactions)
            </p>
          </div>
        </div>
      </div>

      {/* Apply Button */}
      <Button variant="primary" onClick={handleApplyWithValidation} className="w-full">
        Apply Changes
      </Button>
    </div>
  );
}

// Default export for dynamic loading via nodeEditorRegistry
export default VideoNodeEditor;
