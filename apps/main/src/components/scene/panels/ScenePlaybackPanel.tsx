import { useState, useCallback, useMemo } from 'react';
import { ScenePlayer } from '@pixsim7/game.components';
import { Button, Panel, Tabs } from '@pixsim7/shared.ui';
import { useGraphStore } from '../../stores/graphStore';
import type { SceneRuntimeState } from '@pixsim7/shared.types';
import { PlaybackTimeline, type PlaybackEvent } from './PlaybackTimeline';
import { MockStateEditor } from './MockStateEditor';

export interface ScenePlaybackPanelProps {
  /** Optional start node ID (for "play from here" functionality) */
  startNodeId?: string | null;
  /** Callback when playback starts */
  onPlaybackStart?: () => void;
  /** Callback when playback stops */
  onPlaybackStop?: () => void;
}

type PlaybackMode = 'full' | 'step';

/**
 * Scene Playback Panel - In-editor scene testing
 *
 * Leverages existing ScenePlayer from @pixsim7/game-ui
 * Adds editor-specific controls (mock state, start from node, execution timeline)
 */
export function ScenePlaybackPanel({
  startNodeId = null,
  onPlaybackStart,
  onPlaybackStop,
}: ScenePlaybackPanelProps) {
  const toRuntimeScene = useGraphStore((s) => s.toRuntimeScene);
  const currentSceneId = useGraphStore((s) => s.currentSceneId);
  const scenes = useGraphStore((s) => s.scenes);

  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackMode, setPlaybackMode] = useState<PlaybackMode>('full');
  const [mockState, setMockState] = useState<Record<string, any>>({});
  const [playbackEvents, setPlaybackEvents] = useState<PlaybackEvent[]>([]);
  const [runtimeState, setRuntimeState] = useState<SceneRuntimeState | null>(null);

  // Convert current draft scene to runtime scene
  const runtimeScene = useMemo(() => {
    if (!currentSceneId) return null;
    return toRuntimeScene(currentSceneId);
  }, [currentSceneId, toRuntimeScene]);

  const currentDraftScene = currentSceneId ? scenes[currentSceneId] : null;

  // Handle state changes from ScenePlayer to track execution
  const handleStateChange = useCallback((newState: SceneRuntimeState) => {
    setRuntimeState(newState);

    // Track node execution for timeline
    const currentNode = runtimeScene?.nodes.find((n) => n.id === newState.currentNodeId);
    if (currentNode && (!playbackEvents.length || playbackEvents[playbackEvents.length - 1].nodeId !== currentNode.id)) {
      const event: PlaybackEvent = {
        nodeId: currentNode.id,
        nodeType: currentNode.type,
        label: currentNode.label || currentNode.id,
        timestamp: Date.now(),
      };
      setPlaybackEvents((prev) => [...prev, event]);
    }
  }, [runtimeScene, playbackEvents]);

  // Start playback
  const startPlayback = useCallback(() => {
    setIsPlaying(true);
    setPlaybackEvents([]);
    onPlaybackStart?.();
  }, [onPlaybackStart]);

  // Stop playback
  const stopPlayback = useCallback(() => {
    setIsPlaying(false);
    setPlaybackEvents([]);
    setRuntimeState(null);
    onPlaybackStop?.();
  }, [onPlaybackStop]);

  // No scene selected
  if (!currentDraftScene || !runtimeScene) {
    return (
      <Panel title="Scene Playback">
        <div className="p-4 text-center text-neutral-500 dark:text-neutral-400">
          <p className="mb-2">📽️</p>
          <p className="text-sm">No scene selected</p>
          <p className="text-xs mt-1">Open a scene to test playback</p>
        </div>
      </Panel>
    );
  }

  // Get start node (either specified or scene's start node)
  const effectiveStartNodeId = startNodeId || runtimeScene.startNodeId;

  return (
    <Panel title="Scene Playback" className="flex flex-col h-full">
      {/* Playback controls */}
      <div className="flex gap-2 p-3 border-b dark:border-neutral-700">
        <Button
          size="sm"
          variant="primary"
          onClick={startPlayback}
          disabled={isPlaying}
          title="Start scene playback"
        >
          ▶️ Play Scene
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={stopPlayback}
          disabled={!isPlaying}
          title="Stop playback"
        >
          ⏹️ Stop
        </Button>
        {startNodeId && (
          <span className="text-xs text-neutral-600 dark:text-neutral-400 flex items-center px-2 bg-amber-100 dark:bg-amber-900/30 rounded">
            Starting from: {startNodeId}
          </span>
        )}
      </div>

      {/* Tabs: Playback view and Mock State editor */}
      <div className="flex-1 overflow-hidden">
        <Tabs
          tabs={[
            { id: 'playback', label: 'Playback' },
            { id: 'mockState', label: 'Mock State' },
            { id: 'timeline', label: `Timeline (${playbackEvents.length})` },
          ]}
        >
          {/* Playback view */}
          <div id="playback" className="h-full overflow-auto p-4">
            {isPlaying ? (
              <ScenePlayer
                scene={runtimeScene}
                initialState={{
                  currentNodeId: effectiveStartNodeId,
                  currentSceneId: runtimeScene.id,
                  flags: mockState,
                }}
                autoAdvance={playbackMode === 'full'}
                onStateChange={handleStateChange}
              />
            ) : (
              <div className="flex items-center justify-center h-full text-neutral-500 dark:text-neutral-400">
                <div className="text-center">
                  <p className="text-4xl mb-4">▶️</p>
                  <p className="text-sm">Click "Play Scene" to start testing</p>
                  {mockState && Object.keys(mockState).length > 0 && (
                    <p className="text-xs mt-2 text-neutral-400">
                      Mock state configured: {Object.keys(mockState).length} flag(s)
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Mock state editor */}
          <div id="mockState" className="h-full overflow-auto p-4">
            <MockStateEditor state={mockState} onChange={setMockState} />
          </div>

          {/* Execution timeline */}
          <div id="timeline" className="h-full overflow-auto p-4">
            <PlaybackTimeline events={playbackEvents} />
          </div>
        </Tabs>
      </div>

      {/* Runtime info footer */}
      {runtimeState && (
        <div className="border-t dark:border-neutral-700 p-2 bg-neutral-50 dark:bg-neutral-900/50">
          <div className="text-xs text-neutral-600 dark:text-neutral-400 space-y-1">
            <div>
              <span className="font-semibold">Current Node:</span> {runtimeState.currentNodeId}
            </div>
            {Object.keys(runtimeState.flags).length > 0 && (
              <div>
                <span className="font-semibold">Flags:</span>{' '}
                {JSON.stringify(runtimeState.flags)}
              </div>
            )}
          </div>
        </div>
      )}
    </Panel>
  );
}
