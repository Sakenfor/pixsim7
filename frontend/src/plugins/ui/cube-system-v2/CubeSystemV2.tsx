import React, { useState, useRef, useEffect } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Box, Text, OrbitControls, Line } from '@react-three/drei';
import { Vector3, Color } from 'three';
import { animated, useSpring } from '@react-spring/three';

// Cube types with clear purposes
type CubeType = 'creation' | 'timeline' | 'assets' | 'preview' | 'history';

interface WorkspaceCube {
  id: string;
  type: CubeType;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: number;
  state: 'idle' | 'active' | 'processing' | 'connected';
  color: string;
}

// Smart workspace layouts
const WORKSPACE_LAYOUTS = {
  create: {
    creation: [0, 0, 0],
    assets: [-3, 0, 0],
    preview: [3, 0, 0],
  },
  edit: {
    timeline: [0, 0, 0],
    assets: [-2, -1.5, 0],
    preview: [2, -1.5, 0],
    history: [0, -3, 0],
  },
  review: {
    preview: [0, 0, 0],
    history: [0, -2.5, 0],
    assets: [-2.5, 0, 0],
  },
} as const;

// Individual cube component
function SmartCube({ cube, onSelect, onConnect, isSelected }: {
  cube: WorkspaceCube;
  onSelect: (id: string) => void;
  onConnect: (id: string, target: string) => void;
  isSelected: boolean;
}) {
  const meshRef = useRef<any>();
  const [hovered, setHovered] = useState(false);

  // Smooth animations
  const { scale, emissiveIntensity } = useSpring({
    scale: isSelected ? 1.2 : hovered ? 1.1 : 1,
    emissiveIntensity: isSelected ? 0.5 : hovered ? 0.3 : 0.1,
  });

  // Rotation animation when active
  useFrame((state) => {
    if (meshRef.current && cube.state === 'processing') {
      meshRef.current.rotation.y += 0.01;
    }
  });

  // Cube face content
  const getFaceContent = (face: string) => {
    const contents: Record<CubeType, Record<string, string>> = {
      creation: {
        front: '✨ Generate',
        top: '🎯 Provider',
        right: '🎨 Presets',
        left: '⚙️ Settings',
        bottom: '📊 Queue',
        back: '🔬 Advanced',
      },
      timeline: {
        front: '⏱️ Timeline',
        top: '🔍 Zoom',
        right: '📏 Grid',
        left: '🎵 Audio',
        bottom: '▶️ Play',
        back: '📝 Notes',
      },
      assets: {
        front: '📦 Recent',
        top: '⭐ Favorites',
        right: '📤 Uploads',
        left: '📑 Templates',
        bottom: '🗑️ Trash',
        back: '🗄️ Archive',
      },
      preview: {
        front: '👁️ Preview',
        top: '🎬 Controls',
        right: '📐 Settings',
        left: '🎨 Effects',
        bottom: '📊 Stats',
        back: '💾 Export',
      },
      history: {
        front: '📜 History',
        top: '🔄 Undo',
        right: '📊 Analytics',
        left: '🏷️ Versions',
        bottom: '🔍 Search',
        back: '📦 Backup',
      },
    };
    return contents[cube.type]?.[face] || '';
  };

  return (
    <animated.mesh
      ref={meshRef}
      position={cube.position}
      rotation={cube.rotation}
      scale={scale}
      onClick={() => onSelect(cube.id)}
      onPointerOver={() => setHovered(true)}
      onPointerOut={() => setHovered(false)}
    >
      <Box args={[2, 2, 2]}>
        <meshStandardMaterial
          color={cube.color}
          emissive={new Color(cube.color)}
          emissiveIntensity={emissiveIntensity as any}
          metalness={0.8}
          roughness={0.2}
          opacity={0.9}
          transparent
        />
      </Box>
      {/* Face labels */}
      <Text
        position={[0, 0, 1.01]}
        fontSize={0.3}
        color="white"
        anchorX="center"
        anchorY="middle"
      >
        {getFaceContent('front')}
      </Text>
    </animated.mesh>
  );
}

// Connection line between cubes
function CubeConnection({ from, to }: { from: Vector3; to: Vector3 }) {
  const points = [from, to];

  return (
    <Line
      points={points}
      color="#00ffff"
      lineWidth={2}
      dashed={true}
      dashScale={50}
      dashSize={1}
      dashOffset={0}
      opacity={0.6}
      transparent
    />
  );
}

// Main cube system component
export function CubeSystemV2() {
  const [workspace, setWorkspace] = useState<keyof typeof WORKSPACE_LAYOUTS>('create');
  const [selectedCube, setSelectedCube] = useState<string | null>(null);
  const [cubes, setCubes] = useState<WorkspaceCube[]>([
    {
      id: 'creation',
      type: 'creation',
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: 1,
      state: 'idle',
      color: '#6366f1', // Indigo
    },
    {
      id: 'assets',
      type: 'assets',
      position: [-3, 0, 0],
      rotation: [0, 0, 0],
      scale: 1,
      state: 'idle',
      color: '#8b5cf6', // Purple
    },
    {
      id: 'preview',
      type: 'preview',
      position: [3, 0, 0],
      rotation: [0, 0, 0],
      scale: 1,
      state: 'idle',
      color: '#ec4899', // Pink
    },
  ]);

  // Smart workspace switching
  const switchWorkspace = (newWorkspace: keyof typeof WORKSPACE_LAYOUTS) => {
    setWorkspace(newWorkspace);
    const layout = WORKSPACE_LAYOUTS[newWorkspace];

    setCubes(prev => prev.map(cube => {
      const position = layout[cube.type as keyof typeof layout];
      if (position) {
        return { ...cube, position: position as [number, number, number] };
      }
      return cube;
    }));
  };

  return (
    <div className="fixed inset-0 z-50 bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900">
      {/* 3D Canvas */}
      <Canvas camera={{ position: [0, 0, 10], fov: 60 }}>
        <ambientLight intensity={0.5} />
        <pointLight position={[10, 10, 10]} intensity={1} />
        <pointLight position={[-10, -10, -10]} intensity={0.5} />

        {/* Cubes */}
        {cubes.map(cube => (
          <SmartCube
            key={cube.id}
            cube={cube}
            isSelected={selectedCube === cube.id}
            onSelect={setSelectedCube}
            onConnect={() => {}}
          />
        ))}

        {/* Camera controls */}
        <OrbitControls
          enablePan={true}
          enableZoom={true}
          enableRotate={true}
          maxDistance={20}
          minDistance={5}
        />

        {/* Grid helper */}
        <gridHelper args={[20, 20]} opacity={0.2} />
      </Canvas>

      {/* Minimal UI overlay */}
      <div className="absolute top-4 left-4 space-y-2">
        <div className="bg-black/60 backdrop-blur-md rounded-lg p-3 text-white">
          <h3 className="text-sm font-bold mb-2">Workspace Mode</h3>
          <div className="flex gap-2">
            {Object.keys(WORKSPACE_LAYOUTS).map(mode => (
              <button
                key={mode}
                onClick={() => switchWorkspace(mode as keyof typeof WORKSPACE_LAYOUTS)}
                className={`px-3 py-1 rounded text-xs transition-all ${
                  workspace === mode
                    ? 'bg-blue-500 text-white'
                    : 'bg-white/20 hover:bg-white/30'
                }`}
              >
                {mode.charAt(0).toUpperCase() + mode.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Cube info panel */}
      {selectedCube && (
        <div className="absolute bottom-4 left-4 bg-black/60 backdrop-blur-md rounded-lg p-4 text-white max-w-sm">
          <h3 className="font-bold mb-2">
            {selectedCube.charAt(0).toUpperCase() + selectedCube.slice(1)} Cube
          </h3>
          <p className="text-sm text-gray-300 mb-3">
            Rotate the cube to access different functions.
            Drag near other cubes to create connections.
          </p>
          <div className="flex gap-2">
            <button className="px-3 py-1 bg-blue-500 rounded text-sm hover:bg-blue-600 transition-colors">
              Expand
            </button>
            <button className="px-3 py-1 bg-purple-500 rounded text-sm hover:bg-purple-600 transition-colors">
              Connect
            </button>
          </div>
        </div>
      )}

      {/* Quick tips */}
      <div className="absolute top-4 right-4 bg-black/40 backdrop-blur-md rounded-lg p-3 text-white text-xs max-w-xs">
        <div className="font-bold mb-1">🎮 Controls</div>
        <div className="space-y-1 text-gray-300">
          <div>🖱️ Click: Select cube</div>
          <div>🔄 Drag: Rotate view</div>
          <div>📍 Scroll: Zoom</div>
          <div>✨ Double-click: Expand cube</div>
        </div>
      </div>
    </div>
  );
}