import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@pixsim7/ui';
import { useGraphStore, type GraphState } from '../stores/graphStore';
import type { SelectionStrategy, PlaybackMode } from '@pixsim7/types';
import type { DraftSceneNode } from '../modules/scene-builder';
import { useToast } from '../stores/toastStore';
import { useSelectionStore } from '../stores/selectionStore';
import { useWorldContextStore } from '../stores/worldContextStore';
import { logEvent } from '../lib/logging';
import { previewBridge } from '../lib/preview-bridge';

export function SceneBuilderPanel() {
  const toast = useToast();
  const navigate = useNavigate();
  const { selectedNodeId } = useSelectionStore();
  const { worldId, locationId } = useWorldContextStore();
  const currentSceneId = useGraphStore((s: GraphState) => s.currentSceneId);
  const getCurrentScene = useGraphStore((s: GraphState) => s.getCurrentScene);
  const createScene = useGraphStore((s: GraphState) => s.createScene);
  const addNode = useGraphStore((s: GraphState) => s.addNode);
  const updateNode = useGraphStore((s: GraphState) => s.updateNode);
  const toRuntimeScene = useGraphStore((s: GraphState) => s.toRuntimeScene);

  // Get current scene
  const currentScene = getCurrentScene();

  const [nodeId, setNodeId] = useState('node_1');
  const [label, setLabel] = useState('');
  const [selectionKind, setSelectionKind] = useState<'ordered' | 'random' | 'pool'>('ordered');
  const [filterTags, setFilterTags] = useState('');
  const [progressionSteps, setProgressionSteps] = useState<Array<{ label: string; segmentIds: string }>>([
    { label: 'Step 1', segmentIds: '' }
  ]);

  // Life Sim fields
  const [advanceMinutes, setAdvanceMinutes] = useState<number | ''>('');
  const [npcId, setNpcId] = useState<number | ''>('');

  // Phase 4: NPC Expression fields
  const [speakerRole, setSpeakerRole] = useState<string>('');
  const [npcState, setNpcState] = useState<string>('');

  // Load selected node data when selection changes
  useEffect(() => {
    if (selectedNodeId && currentScene) {
      const node = currentScene.nodes.find((n: DraftSceneNode) => n.id === selectedNodeId);
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

        // Load Life Sim metadata
        const lifeSim: any = node.metadata?.lifeSim || {};
        setAdvanceMinutes(lifeSim.advanceMinutes ?? '');
        setNpcId((node.metadata as any)?.npc_id ?? '');

        // Load Phase 4: Speaker role and NPC expression state
        setSpeakerRole((node.metadata as any)?.speakerRole ?? '');
        setNpcState((node.metadata as any)?.npc_state ?? '');
      }
    }
  }, [selectedNodeId, currentScene]);

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
      // Create or get scene
      if (!currentSceneId) {
        createScene('Untitled Scene');
        toast.info('Creating new scene. Please save again.');
        return;
      }

      if (!currentScene) {
        toast.error('No active scene');
        return;
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

      // Build Life Sim metadata
      const lifeSim: any = {};
      if (advanceMinutes !== '') {
        lifeSim.advanceMinutes = advanceMinutes;
      }

      const metadata: any = { label };
      if (Object.keys(lifeSim).length > 0) {
        metadata.lifeSim = lifeSim;
      }
      if (npcId !== '') {
        metadata.npc_id = npcId;
      }

      // Phase 4: Speaker role and NPC expression state
      if (speakerRole) {
        metadata.speakerRole = speakerRole;
      }
      if (npcState) {
        metadata.npc_state = npcState;
      }

      // Add or update node
      const existingNode = currentScene.nodes.find((n: DraftSceneNode) => n.id === nodeId);
      if (existingNode) {
        updateNode(nodeId, {
          selection,
          playback,
          metadata
        });
        toast.success('Node updated successfully');
      } else {
        addNode({
          id: nodeId,
          type: 'video',
          selection,
          playback,
          metadata
        });
        toast.success('Node added to scene');
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

      logEvent('DEBUG', 'scene_preview_ready', {
        nodeCount: scene.nodes.length,
        edgeCount: scene.edges.length,
      });

      const success = previewBridge.loadScene(scene, true);
      if (success) {
        toast.success('Scene sent to game preview');
      } else {
        toast.warning('Game iframe not available - ensure the game panel is open');
      }
    } catch (error) {
      toast.error(`Preview error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  function handlePlayIn2D() {
    // Phase 5: "Play from here in 2D" - navigate to Game2D with scene context
    if (!currentSceneId) {
      toast.error('No scene selected');
      return;
    }

    if (!worldId) {
      toast.warning('No world selected - please select a world first');
      return;
    }

    // Build URL with query params for world, location, and scene
    const params = new URLSearchParams();
    params.set('worldId', String(worldId));
    if (locationId) {
      params.set('locationId', String(locationId));
    }
    params.set('sceneId', currentSceneId);
    if (selectedNodeId) {
      params.set('nodeId', selectedNodeId);
    }

    logEvent('DEBUG', 'play_in_2d', { worldId, locationId, sceneId: currentSceneId, nodeId: selectedNodeId });
    navigate(`/game-2d?${params.toString()}`);
    toast.success('Opening scene in 2D game...');
  }

  return (
    <div className="p-4 space-y-4 overflow-y-auto h-full">
      <div className="space-y-2">
        <h3 className="text-lg font-semibold">Scene Node Editor</h3>
        <p className="text-xs text-neutral-500 dark:text-neutral-400">
          Configure a scene node with selection strategy and progression steps
        </p>
        {/* World/Location Context Indicator */}
        {(worldId || locationId) && (
          <div className="px-3 py-2 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded text-xs">
            <span className="font-semibold text-green-900 dark:text-green-300">Context: </span>
            <span className="text-green-700 dark:text-green-400">
              {worldId ? `World ${worldId}` : 'No World'}
              {locationId ? ` • Location ${locationId}` : ''}
            </span>
          </div>
        )}
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
                value={advanceMinutes}
                onChange={(e) => setAdvanceMinutes(e.target.value ? Number(e.target.value) : '')}
                className="w-full px-3 py-2 border rounded text-sm bg-white dark:bg-neutral-800 border-neutral-300 dark:border-neutral-600"
                placeholder="e.g., 15 (leave empty for no time change)"
                min="0"
              />
              <p className="text-xs text-neutral-500 mt-1">
                Number of in-game minutes to advance when this node is entered
              </p>
            </div>

            {/* NPC ID Binding */}
            <div>
              <label className="block text-sm font-medium mb-1">
                Hard NPC Binding (optional)
              </label>
              <input
                type="number"
                value={npcId}
                onChange={(e) => setNpcId(e.target.value ? Number(e.target.value) : '')}
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
                value={speakerRole}
                onChange={(e) => setSpeakerRole(e.target.value)}
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
                value={npcState}
                onChange={(e) => setNpcState(e.target.value)}
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
        <Button
          variant="secondary"
          onClick={handlePlayIn2D}
          className="w-full"
          disabled={!worldId || !currentSceneId}
        >
          ▶ Play from Here in 2D
        </Button>

        {currentScene && (
          <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded text-xs">
            <div className="font-semibold text-blue-900 dark:text-blue-300">Current Scene</div>
            <div className="text-blue-700 dark:text-blue-400 mt-1">
              {currentScene.title} - {currentScene.nodes.length} node(s)
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
