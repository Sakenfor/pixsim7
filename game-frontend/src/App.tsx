import { useEffect, useState } from 'react'
import type { JobStatus, Scene } from '@pixsim7/types'
import { Button, Panel, ThemeToggle } from '@pixsim7/ui'
import { ScenePlayer } from './components/ScenePlayer'
import { mockScene } from './scenes/mockScene'

export default function App() {
  const [health, setHealth] = useState<string>('checking...')
  const [error, setError] = useState<string | null>(null)
  const [currentScene, setCurrentScene] = useState<Scene>(mockScene)
  const [previewMode, setPreviewMode] = useState(false)

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

      // Other message types can be handled here
      // play-scene, pause-scene, stop-scene, seek-to-node
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [])

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
      </Panel>
      <ScenePlayer scene={currentScene} initialState={{ flags: { focus: 0 } }} />
    </div>
  )
}
