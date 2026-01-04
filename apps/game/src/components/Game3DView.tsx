import { useEffect, useRef, useState } from 'react'
import { Engine, Scene } from '@babylonjs/core'
import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera'
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight'
import { Vector3 } from '@babylonjs/core/Maths/math.vector'
import { Color3 } from '@babylonjs/core/Maths/math.color'
import { Mesh } from '@babylonjs/core/Meshes/mesh'
import { SceneLoader } from '@babylonjs/core/Loading/sceneLoader'
import '@babylonjs/loaders/glTF'
import { BACKEND_BASE } from '../lib/backendClient'
import type { GameHotspotDTO } from '../lib/gameWorldTypes'

export interface Game3DViewProps {
  locationId: number
  authToken?: string
  hotspots: GameHotspotDTO[]
  onHotspotClick?: (hotspot: GameHotspotDTO) => void
}

export function Game3DView({ locationId, authToken, hotspots, onHotspotClick }: Game3DViewProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let engine: Engine | null = null
    let scene: Scene | null = null

    const canvas = canvasRef.current
    if (!canvas) return

    engine = new Engine(canvas, true)
    scene = new Scene(engine)

    scene.clearColor = Color3.Black().toColor4(1.0)

    const camera = new ArcRotateCamera('camera', Math.PI / 2, Math.PI / 3, 10, new Vector3(0, 1, 0), scene)
    camera.attachControl(canvas, true)

    const light = new HemisphericLight('light1', new Vector3(0, 1, 0), scene)
    light.intensity = 0.9

    const load = async () => {
      try {
        setError(null)

        // Fetch location details to get asset_id and spawn info
        const locRes = await fetch(`${BACKEND_BASE}/api/v1/game/locations/${locationId}`, {
          headers: authToken ? { Authorization: `Bearer ${authToken}` } : undefined,
        })
        if (!locRes.ok) throw new Error(`Location HTTP ${locRes.status}`)
        const loc = await locRes.json()

        if (!loc.asset_id) {
          setError('Location has no asset_id configured')
          return
        }

        // Fetch asset to get glTF URL
        const assetRes = await fetch(`${BACKEND_BASE}/api/v1/assets/${loc.asset_id}`, {
          headers: authToken ? { Authorization: `Bearer ${authToken}` } : undefined,
        })
        if (!assetRes.ok) throw new Error(`Asset HTTP ${assetRes.status}`)
        const asset = await assetRes.json()
        const gltfUrl = asset.remote_url || asset.download_url
        if (!gltfUrl) {
          setError('Asset has no remote_url/download_url')
          return
        }

        await SceneLoader.AppendAsync(gltfUrl, undefined, scene!)

        // Simple hotspot highlighting via mesh metadata
        const hotspotsByName = new Map<string, GameHotspotDTO>()
        for (const h of hotspots) {
          const meshName = h.target?.mesh?.object_name
          if (meshName) {
            hotspotsByName.set(meshName, h)
          }
        }

        scene!.meshes.forEach((mesh) => {
          const h = hotspotsByName.get(mesh.name)
          if (h) {
            mesh.isPickable = true
            mesh.outlineColor = Color3.FromHexString('#ff66aa')
            mesh.renderOutline = true
          }
        })

        scene!.onPointerObservable.add((pi) => {
          if (!pi.pickInfo?.hit || !pi.pickInfo.pickedMesh) return
          const mesh = pi.pickInfo.pickedMesh as Mesh
          const hotspot = hotspotsByName.get(mesh.name)
          if (hotspot && onHotspotClick) {
            onHotspotClick(hotspot)
          }
        })
      } catch (e: any) {
        setError(String(e?.message ?? e))
      }
    }

    load().catch((e) => setError(String(e)))

    engine.runRenderLoop(() => {
      scene?.render()
    })

    const handleResize = () => {
      engine?.resize()
    }
    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('resize', handleResize)
      scene?.dispose()
      engine?.dispose()
    }
  }, [locationId, authToken, hotspots, onHotspotClick])

  return (
    <div className="w-full h-full relative">
      {error && (
        <div className="absolute top-2 left-2 z-10 bg-red-500 text-white text-xs px-2 py-1 rounded">
          {error}
        </div>
      )}
      <canvas ref={canvasRef} className="w-full h-[480px] border border-neutral-800 rounded" />
    </div>
  )
}
