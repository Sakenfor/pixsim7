import { useMemo } from 'react';
import { useControlCubeStore } from '../../stores/controlCubeStore';
import type { CubeConnection, CubeMessage } from '../../stores/controlCubeStore';

interface ConnectionPoint {
  x: number;
  y: number;
}

export function CubeConnectionsOverlay() {
  const cubes = useControlCubeStore((s) => s.cubes);
  const connections = useControlCubeStore((s) => s.connections);
  const messages = useControlCubeStore((s) => s.messages);
  const linkingMode = useControlCubeStore((s) => s.linkingMode);
  const linkingFromCube = useControlCubeStore((s) => s.linkingFromCube);

  // Calculate connection endpoints
  const connectionLines = useMemo(() => {
    return Object.values(connections).map((conn) => {
      const fromCube = cubes[conn.fromCubeId];
      const toCube = cubes[conn.toCubeId];

      if (!fromCube || !toCube || !fromCube.visible || !toCube.visible) {
        return null;
      }

      // Calculate face position (center of cube face)
      const fromPoint = getCubeFaceCenter(fromCube, conn.fromFace);
      const toPoint = getCubeFaceCenter(toCube, conn.toFace);

      return {
        connection: conn,
        from: fromPoint,
        to: toPoint,
      };
    }).filter(Boolean);
  }, [cubes, connections]);

  // Calculate message positions on connections
  const messagePositions = useMemo(() => {
    return messages.map((msg) => {
      const conn = Object.values(connections).find(
        (c) => c.fromCubeId === msg.fromCubeId && c.toCubeId === msg.toCubeId
      );

      if (!conn) return null;

      const fromCube = cubes[msg.fromCubeId];
      const toCube = cubes[msg.toCubeId];

      if (!fromCube || !toCube) return null;

      const from = getCubeFaceCenter(fromCube, conn.fromFace);
      const to = getCubeFaceCenter(toCube, conn.toFace);

      // Calculate position along line based on time
      const elapsed = Date.now() - msg.timestamp;
      const duration = 1000; // 1 second travel time
      const progress = Math.min(elapsed / duration, 1);

      return {
        message: msg,
        x: from.x + (to.x - from.x) * progress,
        y: from.y + (to.y - from.y) * progress,
        color: conn.color || '#8b5cf6',
      };
    }).filter(Boolean);
  }, [messages, connections, cubes]);

  return (
    <svg
      className="fixed inset-0 pointer-events-none z-[9998]"
      style={{ width: '100%', height: '100%' }}
    >
      <defs>
        {/* Arrowhead markers */}
        <marker
          id="arrowhead-blue"
          markerWidth="10"
          markerHeight="10"
          refX="9"
          refY="3"
          orient="auto"
        >
          <polygon points="0 0, 10 3, 0 6" fill="#3b82f6" />
        </marker>
        <marker
          id="arrowhead-green"
          markerWidth="10"
          markerHeight="10"
          refX="9"
          refY="3"
          orient="auto"
        >
          <polygon points="0 0, 10 3, 0 6" fill="#10b981" />
        </marker>
        <marker
          id="arrowhead-purple"
          markerWidth="10"
          markerHeight="10"
          refX="9"
          refY="3"
          orient="auto"
        >
          <polygon points="0 0, 10 3, 0 6" fill="#8b5cf6" />
        </marker>

        {/* Glow filter for active connections */}
        <filter id="glow">
          <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
          <feMerge>
            <feMergeNode in="coloredBlur"/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>
      </defs>

      {/* Draw connections */}
      {connectionLines.map((line) => {
        if (!line) return null;

        const { connection, from, to } = line;
        const color = connection.color || '#8b5cf6';
        const markerId =
          color === '#3b82f6' ? 'arrowhead-blue' :
          color === '#10b981' ? 'arrowhead-green' :
          'arrowhead-purple';

        // Use curved path for better visuals
        const midX = (from.x + to.x) / 2;
        const midY = (from.y + to.y) / 2;
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const offset = 30;
        const controlX = midX - dy * offset / Math.sqrt(dx * dx + dy * dy);
        const controlY = midY + dx * offset / Math.sqrt(dx * dx + dy * dy);

        return (
          <g key={connection.id}>
            {/* Connection line */}
            <path
              d={`M ${from.x} ${from.y} Q ${controlX} ${controlY} ${to.x} ${to.y}`}
              stroke={color}
              strokeWidth="2"
              fill="none"
              markerEnd={`url(#${markerId})`}
              opacity="0.6"
              filter="url(#glow)"
            />

            {/* Connection type label */}
            {connection.type && (
              <text
                x={controlX}
                y={controlY - 10}
                fill="white"
                fontSize="10"
                textAnchor="middle"
                className="pointer-events-none select-none"
                style={{ textShadow: '0 0 4px rgba(0,0,0,0.8)' }}
              >
                {connection.type}
              </text>
            )}
          </g>
        );
      })}

      {/* Draw messages as animated particles */}
      {messagePositions.map((pos) => {
        if (!pos) return null;

        return (
          <g key={pos.message.id}>
            {/* Message particle */}
            <circle
              cx={pos.x}
              cy={pos.y}
              r="6"
              fill={pos.color}
              opacity="0.9"
              filter="url(#glow)"
            />
            <circle
              cx={pos.x}
              cy={pos.y}
              r="3"
              fill="white"
              opacity="0.8"
            />
          </g>
        );
      })}

      {/* Draw linking preview line */}
      {linkingMode && linkingFromCube && (
        <line
          x1={getCubeFaceCenter(cubes[linkingFromCube.cubeId], linkingFromCube.face).x}
          y1={getCubeFaceCenter(cubes[linkingFromCube.cubeId], linkingFromCube.face).y}
          x2={getCubeFaceCenter(cubes[linkingFromCube.cubeId], linkingFromCube.face).x}
          y2={getCubeFaceCenter(cubes[linkingFromCube.cubeId], linkingFromCube.face).y}
          stroke="#ffffff"
          strokeWidth="2"
          strokeDasharray="5,5"
          opacity="0.5"
        >
          <animate
            attributeName="stroke-dashoffset"
            from="0"
            to="10"
            dur="0.5s"
            repeatCount="indefinite"
          />
        </line>
      )}
    </svg>
  );
}

// Helper to get center point of a cube face
function getCubeFaceCenter(
  cube: { position: { x: number; y: number }; rotation: { x: number; y: number; z: number } },
  face: string
): ConnectionPoint {
  const cubeSize = 100;
  const centerX = cube.position.x + cubeSize / 2;
  const centerY = cube.position.y + cubeSize / 2;

  // Adjust based on face (approximate positions)
  switch (face) {
    case 'front':
      return { x: centerX, y: centerY + cubeSize / 3 };
    case 'back':
      return { x: centerX, y: centerY - cubeSize / 3 };
    case 'left':
      return { x: centerX - cubeSize / 3, y: centerY };
    case 'right':
      return { x: centerX + cubeSize / 3, y: centerY };
    case 'top':
      return { x: centerX, y: centerY - cubeSize / 3 };
    case 'bottom':
      return { x: centerX, y: centerY + cubeSize / 3 };
    default:
      return { x: centerX, y: centerY };
  }
}
