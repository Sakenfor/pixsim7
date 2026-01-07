import { useEffect, useRef, useState } from 'react'
import type { Scene, SceneRuntimeState } from '@pixsim7/shared.types'
import type { MiniGameResult } from '@pixsim7/scene.gizmos'
import { Button, Panel } from '@pixsim7/shared.ui'
import { MiniGameHost } from './minigames/MiniGameHost'
import { getDefaultNextEdge } from '@pixsim7/game.engine'
import { useSceneRuntime } from '@pixsim7/game.react'

export interface ScenePlayerProps {
  scene: Scene  // Primary scene (for backwards compatibility)
  scenes?: Record<string, Scene>  // Scene bundle for multi-scene support
  initialState?: Partial<SceneRuntimeState>
  autoAdvance?: boolean
  onStateChange?: (s: SceneRuntimeState) => void
}

export function ScenePlayer({ scene, scenes, initialState, autoAdvance = false, onStateChange }: ScenePlayerProps) {
  const {
    state,
    currentScene,
    currentNode,
    outgoingEdges,
    playableEdges,
    selectedSegment,
    progression,
    atLastProgression,
    callDepth,
    setState,
    chooseEdge,
    advanceProgression,
    executeSceneCall,
    executeReturn,
  } = useSceneRuntime({
    scene,
    scenes,
    initialState,
    autoAdvance,
    onStateChange,
  })
  const totalSegments = progression?.segments.length || 0
  const [isPlaying, setIsPlaying] = useState(true)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const sourceUrl = selectedSegment?.url || currentNode?.mediaUrl || ''

  // Configure video element on source/node changes
  useEffect(() => {
    const v = videoRef.current
    if (!v || !sourceUrl) return
    setError(null)
    setIsLoading(true)
    v.src = sourceUrl
    v.currentTime = 0
    v.muted = true // allow autoplay in most browsers
    const play = async () => {
      try {
        await v.play()
        setIsPlaying(true)
      } catch (e: any) {
        setIsPlaying(false)
      } finally {
        setIsLoading(false)
      }
    }
    // wait for metadata then optionally seek to loop start
    const onLoadedMeta = () => {
      const pb = currentNode?.playback
      if (pb && pb.kind === 'loopSegment') {
        const start = pb.start ?? 0
        v.currentTime = Math.max(0, start)
      }
      void play()
    }
    const onError = () => {
      setError('Failed to load video')
      setIsLoading(false)
    }
    v.addEventListener('loadedmetadata', onLoadedMeta)
    v.addEventListener('error', onError)
    return () => {
      v.removeEventListener('loadedmetadata', onLoadedMeta)
      v.removeEventListener('error', onError)
    }
  }, [sourceUrl, currentNode?.playback])

  // Enforce loop segment ranges
  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    const pb = currentNode?.playback
    if (pb?.kind !== 'loopSegment') return
    const start = pb.start ?? 0
    const end = pb.end
    const onTime = () => {
      if (typeof end === 'number' && v.currentTime >= end - 0.05) {
        v.currentTime = Math.max(0, start)
        if (!v.paused) void v.play()
      }
    }
    v.addEventListener('timeupdate', onTime)
    return () => v.removeEventListener('timeupdate', onTime)
  }, [currentNode?.playback])

  // On ended, if there is a default edge or single playable edge and not in progression, choose it
  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    const onEnded = () => {
      // Use getDefaultNextEdge with autoAdvance=true to get edge if applicable
      const edge = getDefaultNextEdge({ scene: currentScene, state, autoAdvance: true, node: currentNode })
      if (edge) {
        chooseEdge(edge)
      } else {
        // if no edge, loop video
        v.currentTime = 0
        void v.play().catch(() => {})
      }
    }
    v.addEventListener('ended', onEnded)
    return () => v.removeEventListener('ended', onEnded)
  }, [currentScene, state, currentNode, chooseEdge])

  function togglePlay() {
    const v = videoRef.current
    if (!v) return
    if (v.paused) {
      v.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false))
    } else {
      v.pause()
      setIsPlaying(false)
    }
  }

  return (
    <div className="space-y-4">
      <Panel className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-lg">Scene Player</h3>
          <div className="flex items-center gap-2">
            {callDepth > 0 && (
              <span className="text-xs px-2 py-0.5 rounded bg-cyan-100 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-300">
                📞 Depth: {callDepth}
              </span>
            )}
            <span className="text-xs px-2 py-0.5 rounded bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">
              {currentScene.title || currentScene.id}
            </span>
            <span className="text-xs px-2 py-0.5 rounded bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300">
              {currentNode?.type || 'unknown'}
            </span>
            <span className="text-xs text-neutral-500">Node: {currentNode?.id}</span>
          </div>
        </div>

        {/* Video Node */}
        {currentNode?.type === 'video' && (currentNode.mediaUrl || selectedSegment) && (
          <div className="relative aspect-video w-full bg-black/90 text-white">
            <video ref={videoRef} className="w-full h-full" playsInline />
            {/* overlay controls */}
            <div className="absolute bottom-2 left-2 right-2 flex flex-col gap-2 pointer-events-none">
              <div className="pointer-events-auto flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="secondary" onClick={togglePlay}>{isPlaying ? 'Pause' : 'Play'}</Button>
                  {selectedSegment && (
                    <span className="px-2 py-0.5 rounded bg-white/10 text-xs">Seg: {selectedSegment.id}</span>
                  )}
                </div>
                <div className="text-xs opacity-80">{isLoading ? 'Loading…' : error ? error : currentNode.label}</div>
              </div>
              {/* segment indicator row */}
              {selectedSegment && (
                <div className="pointer-events-auto flex items-center flex-wrap gap-1 text-xs opacity-90">
                  {selectedSegment.tags?.map((t) => (
                    <span key={t} className="px-2 py-0.5 rounded bg-white/10">#{t}</span>
                  ))}
                  {progression && (state.progressionIndex ?? -1) >= 0 && (
                    <span className="ml-auto px-2 py-0.5 rounded bg-brand-600/80">Step {state.progressionIndex! + 1} / {totalSegments}</span>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Choice Node */}
        {currentNode?.type === 'choice' && (
          <div className="p-4 bg-neutral-100 dark:bg-neutral-800 rounded">
            <p className="text-sm mb-4">{currentNode.label || 'Make a choice:'}</p>
            <div className="flex flex-col gap-2">
              {currentNode.choices?.map((choice, idx) => (
                <Button
                  key={idx}
                  variant="primary"
                  onClick={() => {
                    // Find edge to target node
                    const edge = outgoingEdges.find(e => e.to === choice.targetNodeId)
                    if (edge) chooseEdge(edge)
                  }}
                >
                  {choice.label}
                </Button>
              ))}
            </div>
          </div>
        )}

        {/* Condition Node */}
        {currentNode?.type === 'condition' && (
          <div className="p-4 bg-amber-100 dark:bg-amber-900/20 rounded">
            <p className="text-sm mb-2">⚖️ Evaluating condition...</p>
            <p className="text-xs text-neutral-600 dark:text-neutral-400 font-mono">
              {currentNode.condition?.key} {currentNode.condition?.op} {JSON.stringify(currentNode.condition?.value)}
            </p>
            <Button
              variant="secondary"
              className="mt-4"
              onClick={() => {
                // Evaluate condition
                const conditionMet = currentNode.condition
                  ? (() => {
                      const v = state.flags[currentNode.condition.key]
                      switch (currentNode.condition.op) {
                        case 'eq': return v === currentNode.condition.value
                        case 'neq': return v !== currentNode.condition.value
                        case 'gt': return v > currentNode.condition.value
                        case 'lt': return v < currentNode.condition.value
                        case 'gte': return v >= currentNode.condition.value
                        case 'lte': return v <= currentNode.condition.value
                        default: return v === currentNode.condition.value
                      }
                    })()
                  : false

                // Find appropriate edge
                const targetId = conditionMet ? currentNode.trueTargetNodeId : currentNode.falseTargetNodeId
                const edge = outgoingEdges.find(e => e.to === targetId)
                if (edge) chooseEdge(edge)
              }}
            >
              Evaluate
            </Button>
          </div>
        )}

        {/* End Node */}
        {currentNode?.type === 'end' && (
          <div className={`p-6 rounded text-center ${
            currentNode.endType === 'success' ? 'bg-green-100 dark:bg-green-900/20' :
            currentNode.endType === 'failure' ? 'bg-red-100 dark:bg-red-900/20' :
            'bg-neutral-100 dark:bg-neutral-800'
          }`}>
            <div className="text-4xl mb-4">
              {currentNode.endType === 'success' ? '🎉' :
               currentNode.endType === 'failure' ? '💔' : '🏁'}
            </div>
            <h4 className="font-semibold text-lg mb-2">
              {currentNode.endType === 'success' ? 'Success!' :
               currentNode.endType === 'failure' ? 'Game Over' :
               'The End'}
            </h4>
            {currentNode.endMessage && (
              <p className="text-sm text-neutral-600 dark:text-neutral-400">{currentNode.endMessage}</p>
            )}
          </div>
        )}

        {/* Scene Call Node */}
        {currentNode?.type === 'scene_call' && (
          <div className="p-4 bg-cyan-100 dark:bg-cyan-900/20 rounded">
            <p className="text-sm mb-2">📞 Calling scene: {currentNode.targetSceneId}</p>
            {scenes && scenes[currentNode.targetSceneId!] ? (
              <>
                <p className="text-xs text-neutral-600 dark:text-neutral-400 mb-2">
                  Parameters: {JSON.stringify(currentNode.parameterBindings || {})}
                </p>
                <p className="text-xs text-neutral-600 dark:text-neutral-400 mb-2">
                  Call depth: {callDepth}
                </p>
                <Button
                  variant="primary"
                  className="mt-4"
                  onClick={() => executeSceneCall(currentNode)}
                >
                  Execute Call
                </Button>
              </>
            ) : (
              <p className="text-xs text-red-600 dark:text-red-400">
                Error: Target scene "{currentNode.targetSceneId}" not found
              </p>
            )}
          </div>
        )}

        {/* Return Node */}
        {currentNode?.type === 'return' && (
          <div className="p-4 bg-orange-100 dark:bg-orange-900/20 rounded">
            <p className="text-sm mb-2">🔙 Returning through: {currentNode.returnPointId || 'default'}</p>
            {callDepth > 0 ? (
              <>
                <p className="text-xs text-neutral-600 dark:text-neutral-400 mb-2">
                  Return values: {JSON.stringify(currentNode.returnValues || {})}
                </p>
                <p className="text-xs text-neutral-600 dark:text-neutral-400 mb-2">
                  Call depth: {callDepth}
                </p>
                <Button
                  variant="primary"
                  className="mt-4"
                  onClick={() => executeReturn(currentNode)}
                >
                  Return to Caller
                </Button>
              </>
            ) : (
              <p className="text-xs text-amber-600 dark:text-amber-400">
                Warning: No call stack to return from - this is the root scene
              </p>
            )}
          </div>
        )}
        {progression && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-neutral-500">Progression:</span>
            {progression.segments.map((seg, i) => (
              <span key={i} className={"px-2 py-0.5 rounded text-xs " + (i === (state.progressionIndex ?? -1) ? 'bg-brand-600 text-white' : 'bg-neutral-200 dark:bg-neutral-700')}>{seg.label}</span>
            ))}
            <Button size="sm" variant="secondary" disabled={atLastProgression} onClick={advanceProgression}>Step</Button>
          </div>
        )}
        {progression && (state.progressionIndex ?? -1) >= 0 && currentNode?.media && (
          <div className="flex items-center gap-2 text-xs text-neutral-500">
            <span>Step clips:</span>
            {progression.segments[state.progressionIndex!]?.segmentIds?.map(id => (
              <span key={id} className={"px-2 py-0.5 rounded " + (selectedSegment?.id === id ? 'bg-brand-600 text-white' : 'bg-neutral-200 dark:bg-neutral-700')}>
                {id}
              </span>
            ))}
            {!progression.segments[state.progressionIndex!]?.segmentIds && (
              <span className="px-2 py-0.5 rounded bg-neutral-200 dark:bg-neutral-700">from pool</span>
            )}
          </div>
        )}
        {progression?.miniGame && (
          <MiniGameHost
            miniGameId={progression.miniGame.id}
            config={progression.miniGame.config}
            onResult={(result: MiniGameResult) => {
              // Handle standardized mini-game result types
              switch (result.type) {
                case 'stat':
                  // Update a specific stat/flag
                  setState(s => {
                    const currentValue = (s.flags[result.stat] ?? 0) as number;
                    let newValue: number;

                    switch (result.operation) {
                      case 'set':
                        newValue = result.value;
                        break;
                      case 'multiply':
                        newValue = currentValue * result.value;
                        break;
                      case 'add':
                      default:
                        newValue = currentValue + result.value;
                        break;
                    }

                    return {
                      ...s,
                      flags: { ...s.flags, [result.stat]: newValue }
                    };
                  });
                  break;

                case 'flag':
                  // Set a single flag
                  setState(s => ({
                    ...s,
                    flags: { ...s.flags, [result.key]: result.value }
                  }));
                  break;

                case 'flags':
                  // Set multiple flags at once
                  setState(s => ({
                    ...s,
                    flags: { ...s.flags, ...result.flags }
                  }));
                  break;

                case 'segment':
                  // Navigate to a specific segment (for gizmo mini-games)
                  console.log('[ScenePlayer] Gizmo segment navigation:', result.segmentId, result.intensity, result.transition);
                  // TODO: Implement segment navigation when needed
                  break;

                case 'error':
                  // Handle mini-game error
                  console.error('[ScenePlayer] Mini-game error:', result.error, result.message);
                  break;

                case 'none':
                  // No-op result
                  break;

                default:
                  console.warn('[ScenePlayer] Unknown mini-game result type:', result);
              }
            }}
          />
        )}
        <div className="text-xs text-neutral-500">Flags: {JSON.stringify(state.flags)}</div>
      </Panel>

      {/* Edge-based choices (for video nodes and nodes without built-in choices) */}
      {currentNode?.type !== 'choice' && currentNode?.type !== 'end' && currentNode?.type !== 'return' && (
        <Panel className="space-y-2">
          <h4 className="font-medium">Transitions</h4>
          {progression && (state.progressionIndex ?? -1) < (totalSegments - 1) && (
            <div className="text-xs text-neutral-500">Complete progression to unlock transitions.</div>
          )}
          <div className="flex flex-wrap gap-2">
            {playableEdges.map(edge => (
              <Button
                key={edge.id}
                size="sm"
                variant="primary"
                disabled={!!progression && (state.progressionIndex ?? -1) < (totalSegments - 1)}
                onClick={() => chooseEdge(edge)}
              >
                {edge.label || 'Continue'}
              </Button>
            ))}
            {playableEdges.length === 0 && (
              <span className="text-xs text-neutral-500">No available transitions.</span>
            )}
          </div>
        </Panel>
      )}
    </div>
  )
}
