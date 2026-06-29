/**
 * MeshShape — the WebGL path of the shape registry: a tiny react-three-fiber
 * canvas rendering a real mesh (octahedron gem, tetrahedra merkaba, lathe bell,
 * …). A true depth buffer means no hollow/seam/flicker artefacts that dog
 * hand-rolled CSS-3D polyhedra, and new shapes are just a different `<geometry>`.
 *
 * COST: one WebGL context per instance — use for accent / singleton ornaments
 * (e.g. the generations widget), NOT per-item in lists (browser context limits).
 * For many cheap instances use the CSS shapes (cube). Colour must be a concrete
 * value (hex/rgb) — WebGL can't resolve `currentColor` / CSS vars.
 *
 * See plan `media-card-badge-skin`.
 */
import { Canvas, useFrame } from '@react-three/fiber';
import { useRef, type ReactNode } from 'react';
import type { Mesh } from 'three';

import type { Shape3DMotion } from './ShapeStage';

function parseDur(d: string | undefined, fallback: number): number {
  const n = d ? parseFloat(d) : NaN;
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

const REST_X = 0.34; // gentle downward tilt so the top facets always read

function SpinningMesh({
  color,
  motion,
  children,
}: {
  color: string;
  motion?: Shape3DMotion;
  children: ReactNode;
}) {
  const ref = useRef<Mesh>(null);

  useFrame((state) => {
    const m = ref.current;
    if (!m) return;
    m.rotation.x = REST_X;
    const t = state.clock.elapsedTime;
    if (!motion) {
      m.rotation.y = 0.6;
      return;
    }
    if (motion.type === 'spin') {
      m.rotation.y = (t / parseDur(motion.duration, 2.2)) * Math.PI * 2;
    } else if (motion.type === 'sway') {
      m.rotation.y = Math.sin((t / parseDur(motion.duration, 1.6)) * Math.PI * 2) * (Math.PI / 5);
    } else if (motion.type === 'toss') {
      // Fast snap in the first slice, then hold on a full turn (= rest pose).
      const period = parseDur(motion.duration, 2.4);
      const phase = (t % period) / period;
      const p = Math.min(phase / 0.18, 1);
      m.rotation.y = (1 - Math.pow(1 - p, 3)) * Math.PI * 2;
    }
  });

  return (
    <mesh ref={ref}>
      {children}
      <meshStandardMaterial color={color} flatShading metalness={0.25} roughness={0.35} />
    </mesh>
  );
}

export interface MeshShapeProps {
  size: number;
  /** Concrete colour (hex/rgb) — not `currentColor` / CSS var. */
  color: string;
  motion?: Shape3DMotion;
  /** The geometry element, e.g. <octahedronGeometry args={[1, 0]} />. */
  children: ReactNode;
}

export function MeshShape({ size, color, motion, children }: MeshShapeProps) {
  return (
    <div style={{ width: size, height: size, flexShrink: 0 }} aria-hidden>
      <Canvas
        orthographic
        camera={{ position: [0, 0, 10], zoom: size * 0.42 }}
        gl={{ alpha: true, antialias: true }}
        frameloop={motion ? 'always' : 'demand'}
        style={{ background: 'transparent' }}
        dpr={[1, 2]}
      >
        <ambientLight intensity={0.55} />
        <directionalLight position={[3, 5, 4]} intensity={1.2} />
        <directionalLight position={[-4, -2, -3]} intensity={0.35} />
        <SpinningMesh color={color} motion={motion}>
          {children}
        </SpinningMesh>
      </Canvas>
    </div>
  );
}
