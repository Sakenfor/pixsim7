import { useEffect, useState } from 'react'
import type { JobStatus, Scene } from '@pixsim7/types'
import { Button, Panel, ThemeToggle, Input } from '@pixsim7/ui'
import { ScenePlayer } from '@pixsim7/game-ui'
import { mockScene } from './scenes/mockScene'
import type { GameSessionDTO } from './lib/gameApi'
import { createGameSession, getGameSession, advanceGameSession, fetchSceneById } from './lib/gameApi'

export default function App() {
  const [health, setHealth] = useState<string>('checking...')
  const [error, setError] = useState<string | null>(null)
  const [currentScene, setCurrentScene] = useState<Scene>(mockScene)
  const [sceneError, setSceneError] = useState<string | null>(null)
  const [isSceneLoading, setIsSceneLoading] = useState(false)
  const [previewMode, setPreviewMode] = useState(false)
  const [session, setSession] = useState<GameSessionDTO | null>(null)
  const [sessionError, setSessionError] = useState<string | null>(null)
  const [isSessionLoading, setIsSessionLoading] = useState(false)
  const [edgeIdInput, setEdgeIdInput] = useState<string>('')
  const [authToken, setAuthToken] = useState<string | undefined>(
    () => (typeof window !== 'undefined' ? localStorage.getItem('access_token') || undefined : undefined),
  )

  useEffect(() => {
    fetch('/game/health')
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        const j = await r.json()
        setHealth(j.status ?? 'ok')
      })
      .catch((e) => setError(String(e)))
  }, [])

  // Listen for preview messages from editor
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const message = event.data;

      // Load scene message
      if (message?.type === 'load-scene' && message.payload?.scene) {
        console.log('[Game] Received load-scene message:', message.payload.scene);
        setCurrentScene(message.payload.scene);
        setPreviewMode(true);
        setSceneError(null);

        // Send acknowledgment
        if (event.source && 'postMessage' in event.source) {
          (event.source as Window).postMessage(
            {
              type: 'scene-loaded',
              payload: {
                sceneId: message.payload.scene.id,
                nodeCount: message.payload.scene.nodes?.length || 0,
              },
            },
            event.origin
          );
        }
      }

      if (message?.type === 'set-auth-token') {
        setAuthToken(message.payload?.token || undefined)
      }

      // Other message types can be handled here
      // play-scene, pause-scene, stop-scene, seek-to-node
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [])

  useEffect(() => {
    if (!authToken) {
      setSession(null)
      setSessionError(null)
    }
  }, [authToken])

  useEffect(() => {
    if (previewMode) return
    if (!authToken) return
    if (typeof window === 'undefined') return

    const params = new URLSearchParams(window.location.search)
    const sceneId = params.get('sceneId')
    if (!sceneId) return

    let cancelled = false
    setIsSceneLoading(true)
    setSceneError(null)

    ;(async () => {
      try {
        const scene = await fetchSceneById({
          sceneId,
          token: authToken,
        })
        if (!cancelled) {
          setCurrentScene(scene)
        }
      } catch (e: any) {
        if (!cancelled) {
          setSceneError(String(e?.message ?? e))
        }
      } finally {
        if (!cancelled) {
          setIsSceneLoading(false)
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [previewMode, authToken])

  const handleCreateSession = async () => {
    setSessionError(null)
    setIsSessionLoading(true)
    try {
      const s = await createGameSession({
        sceneId: 1,
        token: authToken,
      })
      setSession(s)
    } catch (e: any) {
      setSessionError(String(e?.message ?? e))
    } finally {
      setIsSessionLoading(false)
    }
  }

  const handleRefreshSession = async () => {
    if (!session) return
    setSessionError(null)
    setIsSessionLoading(true)
    try {
      const s = await getGameSession({
        sessionId: session.id,
        token: authToken,
      })
      setSession(s)
    } catch (e: any) {
      setSessionError(String(e?.message ?? e))
    } finally {
      setIsSessionLoading(false)
    }
  }

  const handleAdvanceSession = async () => {
    if (!session || !edgeIdInput.trim()) return
    const edgeId = Number(edgeIdInput)
    if (!Number.isFinite(edgeId)) {
      setSessionError('Edge ID must be a number')
      return
    }
    setSessionError(null)
    setIsSessionLoading(true)
    try {
      const s = await advanceGameSession({
        sessionId: session.id,
        edgeId,
        token: authToken,
      })
      setSession(s)
    } catch (e: any) {
      setSessionError(String(e?.message ?? e))
    } finally {
      setIsSessionLoading(false)
    }
  }

  const demoStatus: JobStatus = 'queued'

  return (
    <div className="p-6 space-y-4">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-semibold">PixSim7 Game Frontend</h1>
        <div className="flex items-center gap-3">
          {previewMode && (
            <div className="px-3 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded text-sm font-medium">
              ▶ Preview Mode
            </div>
          )}
          <ThemeToggle />
        </div>
      </div>
      <Panel className="space-y-2">
        <p>Health: {error ? `error: ${error}` : health}</p>
        <p>Scene: {currentScene.title || currentScene.id}</p>
        <p>Nodes: {currentScene.nodes?.length || 0} | Edges: {currentScene.edges?.length || 0}</p>
        {isSceneLoading && <p className="text-xs text-neutral-500">Loading scene…</p>}
        {sceneError && <p className="text-xs text-red-500">Scene error: {sceneError}</p>}
        {!previewMode && (
          <>
            <p>Shared types wired: demo JobStatus = {demoStatus}</p>
            <Button onClick={() => alert('Shared UI works')}>Test Shared Button</Button>
          </>
        )}
        {previewMode && (
          <Button onClick={() => { setPreviewMode(false); setCurrentScene(mockScene); }}>
            Exit Preview
          </Button>
        )}
        <div className="mt-4 space-y-2 border-t border-neutral-200 dark:border-neutral-800 pt-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium">Backend Game Session</span>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="secondary" onClick={handleCreateSession} disabled={isSessionLoading || !authToken}>
                {isSessionLoading && !session ? 'Creating…' : 'Create Session (scene 1)'}
              </Button>
              <Button size="sm" variant="secondary" onClick={handleRefreshSession} disabled={isSessionLoading || !session}>
                Refresh
              </Button>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Input
              className="max-w-[140px]"
              placeholder="Edge ID"
              value={edgeIdInput}
              onChange={(e: any) => setEdgeIdInput(e.target.value)}
            />
            <Button size="sm" variant="primary" onClick={handleAdvanceSession} disabled={isSessionLoading || !session}>
              Advance
            </Button>
          </div>
          <p className="text-xs text-neutral-500">
            Session: {authToken ? (session ? `id=${session.id}, node=${session.current_node_id}` : 'none yet') : 'login required'}
          </p>
          {sessionError && <p className="text-xs text-red-500">Session error: {sessionError}</p>}
        </div>
      </Panel>
      <ScenePlayer scene={currentScene} initialState={{ flags: { focus: 0 } }} />
    </div>
  )
}
