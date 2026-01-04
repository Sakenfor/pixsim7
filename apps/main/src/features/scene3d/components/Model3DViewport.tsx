/**
 * Model3DViewport
 *
 * React Three Fiber canvas with orbit controls for viewing 3D models.
 * Handles camera, lighting, and environment setup.
 */

import {
  OrbitControls,
  Grid,
  Environment,
  GizmoHelper,
  GizmoViewport,
  Center,
} from '@react-three/drei';
import { Canvas, useThree } from '@react-three/fiber';
import { Suspense, useRef, useEffect, useCallback } from 'react';
import * as THREE from 'three';

import { useModel3DStore } from '../stores/model3DStore';

import { ModelLoader } from './ModelLoader';
import { ZoneHighlighter } from './ZoneHighlighter';

/**
 * Loading fallback for Suspense.
 */
function LoadingIndicator() {
  return (
    <mesh>
      <boxGeometry args={[0.5, 0.5, 0.5]} />
      <meshStandardMaterial color="#666" wireframe />
    </mesh>
  );
}

/**
 * Scene lighting setup.
 */
function SceneLighting() {
  return (
    <>
      <ambientLight intensity={0.4} />
      <directionalLight
        position={[5, 10, 5]}
        intensity={1}
        castShadow
        shadow-mapSize={[1024, 1024]}
      />
      <directionalLight position={[-5, 5, -5]} intensity={0.3} />
    </>
  );
}

/**
 * Grid and axes helpers.
 */
function SceneHelpers() {
  const settings = useModel3DStore((s) => s.settings);

  return (
    <>
      {settings.showGrid && (
        <Grid
          position={[0, -0.01, 0]}
          args={[10, 10]}
          cellSize={0.5}
          cellThickness={0.5}
          cellColor="#6f6f6f"
          sectionSize={2}
          sectionThickness={1}
          sectionColor="#9d4b4b"
          fadeDistance={25}
          fadeStrength={1}
          infiniteGrid
        />
      )}
      {settings.showAxes && <axesHelper args={[2]} />}
    </>
  );
}

/**
 * Camera controller that responds to model bounding box.
 */
function CameraController() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const controlsRef = useRef<any>(null);
  const parseResult = useModel3DStore((s) => s.parseResult);

  useEffect(() => {
    if (parseResult && controlsRef.current) {
      const { center } = parseResult.boundingBox;

      // Set target to model center
      controlsRef.current.target.set(center[0], center[1], center[2]);
      controlsRef.current.update();
    }
  }, [parseResult]);

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      enableDamping
      dampingFactor={0.05}
      minDistance={0.1}
      maxDistance={100}
      enablePan
      panSpeed={0.5}
      rotateSpeed={0.5}
      zoomSpeed={0.8}
    />
  );
}

/**
 * Scene content that renders the loaded model.
 */
function SceneContent() {
  const modelUrl = useModel3DStore((s) => s.modelUrl);
  const modelScale = useModel3DStore((s) => s.modelScale);
  const mode = useModel3DStore((s) => s.mode);
  const renderMode = useModel3DStore((s) => s.renderMode);

  if (!modelUrl) {
    return <LoadingIndicator />;
  }

  return (
    <group scale={modelScale}>
      <Center>
        <Suspense fallback={<LoadingIndicator />}>
          <ModelLoader
            url={modelUrl}
            wireframe={renderMode === 'wireframe'}
            showZones={mode === 'zones' || renderMode === 'zones'}
          />
          {(mode === 'zones' || renderMode === 'zones') && (
            <ZoneHighlighter />
          )}
        </Suspense>
      </Center>
    </group>
  );
}

/**
 * Click handler for zone selection in zones mode.
 */
function ZoneClickHandler() {
  const { camera, gl, scene } = useThree();
  const mode = useModel3DStore((s) => s.mode);
  const selectZone = useModel3DStore((s) => s.selectZone);
  const setHoveredZone = useModel3DStore((s) => s.setHoveredZone);
  const parseResult = useModel3DStore((s) => s.parseResult);

  const raycaster = useRef(new THREE.Raycaster());
  const mouse = useRef(new THREE.Vector2());

  const handlePointerEvent = useCallback(
    (event: PointerEvent, isClick: boolean) => {
      if (mode !== 'zones' || !parseResult) return;

      const rect = gl.domElement.getBoundingClientRect();
      mouse.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.current.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.current.setFromCamera(mouse.current, camera);
      const intersects = raycaster.current.intersectObjects(scene.children, true);

      let foundZone: string | null = null;

      for (const intersect of intersects) {
        if (intersect.object instanceof THREE.Mesh) {
          const name = intersect.object.name;
          // Check for zone_ prefix
          if (name.toLowerCase().startsWith('zone_')) {
            foundZone = name.slice(5); // Remove 'zone_' prefix
            break;
          }
        }
      }

      if (isClick) {
        selectZone(foundZone);
      } else {
        setHoveredZone(foundZone);
      }
    },
    [mode, parseResult, camera, gl.domElement, scene, selectZone, setHoveredZone]
  );

  useEffect(() => {
    const canvas = gl.domElement;

    const handleClick = (e: PointerEvent) => handlePointerEvent(e, true);
    const handleMove = (e: PointerEvent) => handlePointerEvent(e, false);

    canvas.addEventListener('click', handleClick);
    canvas.addEventListener('pointermove', handleMove);

    return () => {
      canvas.removeEventListener('click', handleClick);
      canvas.removeEventListener('pointermove', handleMove);
    };
  }, [gl.domElement, handlePointerEvent]);

  return null;
}

export interface Model3DViewportProps {
  className?: string;
}

/**
 * Main 3D viewport component.
 */
export function Model3DViewport({ className }: Model3DViewportProps) {
  const mode = useModel3DStore((s) => s.mode);

  return (
    <div className={`relative w-full h-full ${className || ''}`}>
      <Canvas
        shadows
        gl={{
          antialias: true,
          alpha: true,
          preserveDrawingBuffer: true,
        }}
        camera={{
          position: [3, 2, 3],
          fov: 50,
          near: 0.01,
          far: 1000,
        }}
        style={{ background: 'linear-gradient(180deg, #1a1a2e 0%, #16213e 100%)' }}
      >
        <SceneLighting />
        <SceneHelpers />
        <CameraController />
        <SceneContent />
        {mode === 'zones' && <ZoneClickHandler />}

        {/* Gizmo for orientation */}
        <GizmoHelper alignment="bottom-right" margin={[80, 80]}>
          <GizmoViewport
            axisColors={['#f73e3e', '#3ef73e', '#3e3ef7']}
            labelColor="white"
          />
        </GizmoHelper>

        {/* Environment for reflections */}
        <Environment preset="city" />
      </Canvas>

      {/* Viewport overlay for mode indicator */}
      <div className="absolute top-2 left-2 text-xs text-white/60 font-mono uppercase">
        {mode} mode
      </div>
    </div>
  );
}

export default Model3DViewport;
