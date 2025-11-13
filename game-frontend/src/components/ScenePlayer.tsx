import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Scene, SceneNode, SceneEdge, SceneRuntimeState, PlaybackMode, MediaSegment, SelectionStrategy } from '@pixsim7/types'
import { Button, Panel } from '@pixsim7/ui'
import { ReflexMiniGame } from './minigames/ReflexMiniGame'

interface ScenePlayerProps {
  scene: Scene
  initialState?: Partial<SceneRuntimeState>
  autoAdvance?: boolean
  onStateChange?: (s: SceneRuntimeState) => void
}

function evaluateEdgeConditions(edge: SceneEdge, flags: Record<string, any>): boolean {
  if (!edge.conditions || edge.conditions.length === 0) return true
  return edge.conditions.every(c => {
    const v = flags[c.key]
    switch (c.op) {
      case 'neq': return v !== c.value
      case 'gt': return v > c.value
      case 'lt': return v < c.value
      case 'gte': return v >= c.value
      case 'lte': return v <= c.value
      case 'includes': return Array.isArray(v) && v.includes(c.value)
      case 'eq':
      default:
        return v === c.value
    }
  })
}

function applyEffects(effects: SceneEdge['effects'], prev: Record<string, any>): Record<string, any> {
  if (!effects || effects.length === 0) return prev
  const next = { ...prev }
  for (const eff of effects) {
    const cur = next[eff.key]
    switch (eff.op) {
      case 'inc': next[eff.key] = (typeof cur === 'number' ? cur : 0) + (eff.value ?? 1); break
      case 'dec': next[eff.key] = (typeof cur === 'number' ? cur : 0) - (eff.value ?? 1); break
      case 'push': next[eff.key] = Array.isArray(cur) ? [...cur, eff.value] : [eff.value]; break
      case 'flag': next[eff.key] = true; break
      case 'set':
      default: next[eff.key] = eff.value
    }
  }
  return next
}

function isProgression(playback?: PlaybackMode): playback is Extract<PlaybackMode, { kind: 'progression' }> {
  return playback?.kind === 'progression'
}

export function ScenePlayer({ scene, initialState, autoAdvance = false, onStateChange }: ScenePlayerProps) {
  const [state, setState] = useState<SceneRuntimeState>(() => ({
    currentNodeId: initialState?.currentNodeId || scene.startNodeId,
    flags: initialState?.flags || {},
    progressionIndex: initialState?.progressionIndex,
  }))
  const [isPlaying, setIsPlaying] = useState(true)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)

  const currentNode: SceneNode | undefined = useMemo(
    () => scene.nodes.find(n => n.id === state.currentNodeId),
    [scene, state.currentNodeId]
  )

  const outgoingEdges = useMemo<SceneEdge[]>(() => scene.edges.filter(e => e.from === state.currentNodeId), [scene, state.currentNodeId])
  const playableEdges = useMemo(() => outgoingEdges.filter(e => evaluateEdgeConditions(e, state.flags)), [outgoingEdges, state.flags])

  // Handle progression playback (multi-step within a single node before choosing edges)
  const progression = isProgression(currentNode?.playback) ? currentNode?.playback : undefined
  const totalSegments = progression?.segments.length || 0
  const atLastProgression = progression && state.progressionIndex !== undefined && state.progressionIndex >= totalSegments - 1

  const advanceProgression = useCallback(() => {
    if (!progression) return
    setState(s => ({ ...s, progressionIndex: s.progressionIndex == null ? 0 : Math.min(totalSegments - 1, s.progressionIndex + 1) }))
  }, [progression, totalSegments])

  const chooseEdge = useCallback((edge: SceneEdge) => {
    setState(s => {
      const flags = applyEffects(edge.effects, s.flags)
      return { currentNodeId: edge.to, flags, progressionIndex: undefined }
    })
  }, [])

  // Auto advance if only one edge & no progression
  useEffect(() => {
    if (!autoAdvance) return
    if (progression && (state.progressionIndex ?? -1) < (totalSegments - 1)) return
    if (playableEdges.length === 1 && !progression) {
      chooseEdge(playableEdges[0])
    }
  }, [autoAdvance, playableEdges, chooseEdge, progression, state.progressionIndex, totalSegments])

  useEffect(() => { onStateChange?.(state) }, [state, onStateChange])

  // Select segment based on selection strategy
  const selectedSegment: MediaSegment | undefined = useMemo(() => {
    const media = currentNode?.media
    if (!media || media.length === 0) return undefined
    const sel = currentNode?.selection || { kind: 'ordered' as const }
    const pick = (list: MediaSegment[], idx = 0) => list[Math.max(0, Math.min(list.length - 1, idx))]

    // If progression defines segmentIds for current step, honor that first
    if (progression && (state.progressionIndex ?? -1) >= 0) {
      const seg = progression.segments[state.progressionIndex!]
      if (seg?.segmentIds && seg.segmentIds.length) {
        // ordered within specified ids
        const ids = seg.segmentIds
        const idx = 0
        const found = media.find(m => m.id === ids[idx])
        return found || media[0]
      }
    }

    switch (sel.kind) {
      case 'random': {
        const r = Math.floor(Math.random() * media.length)
        return media[r]
      }
      case 'pool': {
        const pool = sel.filterTags?.length ? media.filter(m => m.tags?.some(t => sel.filterTags!.includes(t))) : media
        const count = Math.max(1, sel.count ?? 1)
        const r = pool.length ? pool[Math.min(pool.length - 1, Math.floor(Math.random() * pool.length))] : media[0]
        return r
      }
      case 'ordered':
      default:
        return pick(media, 0)
    }
  }, [currentNode?.media, currentNode?.selection, progression, state.progressionIndex])

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
      if (progression && (state.progressionIndex ?? -1) < (totalSegments - 1)) return
      const defaultEdge = playableEdges.find(e => e.isDefault)
      const edge = defaultEdge || (playableEdges.length === 1 ? playableEdges[0] : undefined)
      if (edge) chooseEdge(edge)
      else {
        // if no edge, loop video
        v.currentTime = 0
        void v.play().catch(() => {})
      }
    }
    v.addEventListener('ended', onEnded)
    return () => v.removeEventListener('ended', onEnded)
  }, [playableEdges, chooseEdge, progression, state.progressionIndex, totalSegments])

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
          <span className="text-xs text-neutral-500">Node: {currentNode?.id}</span>
        </div>
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
        {isProgression(currentNode?.playback) && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-neutral-500">Progression:</span>
            {currentNode.playback.segments.map((seg, i) => (
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
        {progression?.miniGame?.id === 'reflex' && (
          <ReflexMiniGame
            config={progression.miniGame.config as any}
            onResult={(success, score) => {
              setState(s => ({ ...s, flags: { ...s.flags, focus: (s.flags.focus ?? 0) + (success ? 2 : 0) } }))
            }}
          />
        )}
        <div className="text-xs text-neutral-500">Flags: {JSON.stringify(state.flags)}</div>
      </Panel>

      <Panel className="space-y-2">
        <h4 className="font-medium">Choices</h4>
        {progression && (state.progressionIndex ?? -1) < (totalSegments - 1) && (
          <div className="text-xs text-neutral-500">Complete progression to unlock choices.</div>
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
    </div>
  )
}
