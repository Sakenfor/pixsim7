import { useCallback, useEffect, useMemo, useState } from 'react';
import { useControlCubeStore } from '../../stores/controlCubeStore';
import type { CubeConnection, CubeMessage, CubeFace } from '../../stores/controlCubeStore';
import { BASE_CUBE_SIZE } from '../../config/cubeConstants';

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
  const sendMessage = useControlCubeStore((s) => s.sendMessage);
  const cancelLinking = useControlCubeStore((s) => s.cancelLinking);

  // Animation tick to drive message movement
  const [animationTick, setAnimationTick] = useState(0);
  const [selectedConnection, setSelectedConnection] = useState<{
    connection: CubeConnection;
    x: number;
    y: number;
  } | null>(null);
  const [linkCursor, setLinkCursor] = useState<{ x: number; y: number } | null>(null);

  const brokenConnectionsCount = useMemo(
    () =>
      Object.values(connections).filter(
        (conn) => !cubes[conn.fromCubeId] || !cubes[conn.toCubeId]
      ).length,
    [connections, cubes]
  );

  const getConnectionStatus = useCallback(
    (conn: CubeConnection): 'active' | 'idle' | 'broken' => {
      const fromCube = cubes[conn.fromCubeId];
      const toCube = cubes[conn.toCubeId];
      if (!fromCube || !toCube) return 'broken';

      const relevant = messages.filter(
        (m) => m.fromCubeId === conn.fromCubeId && m.toCubeId === conn.toCubeId
      );
      if (relevant.length === 0) return 'idle';

      const latest = relevant.reduce((a, b) =>
        a.timestamp > b.timestamp ? a : b
      );
      const age = Date.now() - latest.timestamp;
      if (age < 3000) return 'active';
      return 'idle';
    },
    [cubes, messages]
  );

  useEffect(() => {
    if (messages.length === 0) {
      return;
    }

    let frameId: number;

    const loop = () => {
      // Use a simple tick value; actual positions use message timestamps
      setAnimationTick((t) => t + 1);
      frameId = window.requestAnimationFrame(loop);
    };

    frameId = window.requestAnimationFrame(loop);

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [messages.length]);

  // Track cursor for linking preview and allow Esc to cancel
  useEffect(() => {
    if (!linkingMode || !linkingFromCube) {
      setLinkCursor(null);
      return;
    }

    const handleMove = (e: MouseEvent) => {
      setLinkCursor({ x: e.clientX, y: e.clientY });
    };

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        cancelLinking();
        setLinkCursor(null);
      }
    };

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('keydown', handleKey);

    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('keydown', handleKey);
    };
  }, [linkingMode, linkingFromCube, cancelLinking]);

  // Calculate connection endpoints
  const connectionLines = useMemo(() => {
    return Object.values(connections).map((conn) => {
      const fromCube = cubes[conn.fromCubeId];
      const toCube = cubes[conn.toCubeId];

      if (!fromCube || !toCube || !fromCube.visible || !toCube.visible) {
        return null;
      }

      // Calculate face position (center of cube face)
      // Double-check cubes still exist before calculating positions
      if (!fromCube || !toCube) {
        return null;
      }

      const fromPoint = getCubeFaceCenter(fromCube, conn.fromFace);
      const toPoint = getCubeFaceCenter(toCube, conn.toFace);

      const status = getConnectionStatus(conn);
      if (status === 'broken') {
        return null;
      }

      // Use curved path control point for both drawing and popover anchoring
      const midX = (fromPoint.x + toPoint.x) / 2;
      const midY = (fromPoint.y + toPoint.y) / 2;
      const dx = toPoint.x - fromPoint.x;
      const dy = toPoint.y - fromPoint.y;
      const offset = 30;
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      const controlX = midX - (dy * offset) / len;
      const controlY = midY + (dx * offset) / len;

      return {
        connection: conn,
        from: fromPoint,
        to: toPoint,
        status,
        controlX,
        controlY,
      };
    }).filter(Boolean);
  }, [cubes, connections, getConnectionStatus]);

  // Calculate message positions on connections
  const messagePositions = useMemo(() => {
    if (messages.length === 0) return [];

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
  }, [messages, connections, cubes, animationTick]);

  const lastMessageForSelected = useMemo(() => {
    if (!selectedConnection) return null;

    const relevant = messages
      .filter(
        (m) =>
          m.fromCubeId === selectedConnection.connection.fromCubeId &&
          m.toCubeId === selectedConnection.connection.toCubeId
      )
      .sort((a, b) => b.timestamp - a.timestamp);

    return relevant[0] ?? null;
  }, [messages, selectedConnection]);

  const statusForSelected = useMemo(
    () =>
      selectedConnection ? getConnectionStatus(selectedConnection.connection) : null,
    [selectedConnection, getConnectionStatus]
  );

  const handleReplayLast = () => {
    if (!selectedConnection) return;
    const last = lastMessageForSelected;
    if (!last) return;

    sendMessage(
      selectedConnection.connection.fromCubeId,
      selectedConnection.connection.toCubeId,
      last.data,
      last.type
    );
  };

  return (
    <>
      <svg
        className="fixed inset-0 z-[9998]"
        style={{ width: '100%', height: '100%', pointerEvents: 'none' }}
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

          const { connection, from, to, controlX, controlY, status } = line;
          const color = connection.color || '#8b5cf6';
        const markerId =
          color === '#3b82f6' ? 'arrowhead-blue' :
          color === '#10b981' ? 'arrowhead-green' :
          'arrowhead-purple';

          return (
            <g key={connection.id}>
              {/* Connection line */}
              <path
                d={`M ${from.x} ${from.y} Q ${controlX} ${controlY} ${to.x} ${to.y}`}
                stroke={color}
                strokeWidth={status === 'active' ? 3 : 2}
                fill="none"
                markerEnd={`url(#${markerId})`}
                opacity={status === 'active' ? 0.9 : 0.45}
                filter="url(#glow)"
                strokeDasharray={status === 'idle' ? '6 4' : undefined}
              pointerEvents="stroke"
              onClick={(e) => {
                e.stopPropagation();
                setSelectedConnection({ connection, x: controlX, y: controlY });
              }}
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
        {linkingMode && linkingFromCube && cubes[linkingFromCube.cubeId] && (
          <line
            x1={getCubeFaceCenter(cubes[linkingFromCube.cubeId], linkingFromCube.face).x}
            y1={getCubeFaceCenter(cubes[linkingFromCube.cubeId], linkingFromCube.face).y}
            x2={linkCursor?.x ?? getCubeFaceCenter(cubes[linkingFromCube.cubeId], linkingFromCube.face).x}
            y2={linkCursor?.y ?? getCubeFaceCenter(cubes[linkingFromCube.cubeId], linkingFromCube.face).y}
            stroke="#ffffff"
            strokeWidth="2"
            strokeDasharray="5,5"
            opacity="0.6"
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

      {selectedConnection && (
        <div
          className="fixed z-[9999] bg-black/85 text-white text-xs rounded-lg shadow-lg border border-white/20 px-3 py-2 max-w-xs"
          style={{
            left: selectedConnection.x + 8,
            top: selectedConnection.y + 8,
          }}
        >
          <div className="font-semibold mb-1 text-[11px] flex items-center justify-between gap-4">
            <span>Connection</span>
            <button
              type="button"
              className="text-[10px] text-white/60 hover:text-white"
              onClick={() => setSelectedConnection(null)}
            >
              Close
            </button>
          </div>
          <div className="space-y-1">
            <div>
              <span className="text-white/50 mr-1">From:</span>
              <span className="font-mono text-[11px]">
                {selectedConnection.connection.fromCubeId}.
                {selectedConnection.connection.fromFace}
              </span>
            </div>
            <div>
              <span className="text-white/50 mr-1">To:</span>
              <span className="font-mono text-[11px]">
                {selectedConnection.connection.toCubeId}.
                {selectedConnection.connection.toFace}
              </span>
            </div>
            {selectedConnection.connection.type && (
              <div>
                <span className="text-white/50 mr-1">Type:</span>
                <span className="text-[11px]">
                  {selectedConnection.connection.type}
                </span>
              </div>
            )}
            {statusForSelected && (
              <div>
                <span className="text-white/50 mr-1">Status:</span>
                <span className="text-[11px] capitalize">
                  {statusForSelected}
                </span>
              </div>
            )}
            {lastMessageForSelected && (
              <div>
                <span className="text-white/50 mr-1">Last message:</span>
                <span className="text-[11px]">
                  {new Date(lastMessageForSelected.timestamp).toLocaleTimeString()}
                </span>
              </div>
            )}
          </div>

          {lastMessageForSelected && (
            <button
              type="button"
              onClick={handleReplayLast}
              className="mt-2 w-full px-2 py-1 rounded bg-purple-600 hover:bg-purple-500 text-[11px] font-medium"
            >
              Replay last message
            </button>
          )}
        </div>
      )}

      {linkingMode && linkingFromCube && (
        <div className="fixed bottom-16 left-1/2 -translate-x-1/2 z-[9999] px-3 py-1.5 rounded-full bg-black/80 text-white text-[11px] border border-white/20 shadow-lg pointer-events-none">
          Linking from{' '}
          <span className="font-mono">
            {linkingFromCube.cubeId}.{linkingFromCube.face}
          </span>{' '}
          – click another cube face to connect, or press Esc to cancel.
        </div>
      )}
    </>
  );
}

// Helper to get center point of a cube face
function getCubeFaceCenter(
  cube: {
    position: { x: number; y: number };
    rotation: { x: number; y: number; z: number };
    scale?: number;
  },
  face: CubeFace
): ConnectionPoint {
  const baseSize = BASE_CUBE_SIZE;
  const scale = typeof cube.scale === 'number' ? cube.scale : 1;
  const cubeSize = baseSize * scale;
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
