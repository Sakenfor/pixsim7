/**
 * BrainShape Component - 3D brain visualization with interactive faces
 * Represents NPC brain state through spatial/semantic UI
 */

import { useEffect, useState } from 'react';
import type { NpcBrainState } from '@pixsim7/game.engine';
import { BrainFace, brainShape } from '@pixsim7/scene.shapes';
import './BrainShape.css';

export interface BrainShapeProps {
  npcId: number;
  brainState: NpcBrainState;
  onFaceClick: (face: BrainFace) => void;
  onFaceHover?: (face: BrainFace | null) => void;
  activeFace?: BrainFace;
  showConnections?: boolean;
  style?: 'holographic' | 'organic' | 'circuit';
  size?: number; // Size in pixels
}

export const BrainShape: React.FC<BrainShapeProps> = ({
  npcId,
  brainState,
  onFaceClick,
  onFaceHover,
  activeFace,
  showConnections = true,
  style = 'holographic',
  size = 384,
}) => {
  const [pulseRate, setPulseRate] = useState(60);
  const [glowIntensity, setGlowIntensity] = useState(0.5);
  const [neuralActivity, setNeuralActivity] = useState(0.5);

  // Update visual behaviors based on state
  useEffect(() => {
    setPulseRate(brainShape.behaviors.pulseRate(brainState));
    setGlowIntensity(brainShape.behaviors.glowIntensity(brainState));
    setNeuralActivity(brainShape.behaviors.neuralActivity(brainState));
  }, [brainState]);

  const pulseDuration = 60 / pulseRate; // seconds per beat

  return (
    <div
      className="brain-container"
      style={{
        width: size,
        height: size,
        position: 'relative',
        perspective: '1000px',
      }}
    >
      {/* Central core - the brain stem */}
      <div className="brain-core">
        <div
          className={`brain-core-glow brain-style-${style}`}
          style={{
            animationDuration: `${pulseDuration}s`,
            filter: `brightness(${0.5 + glowIntensity})`,
            opacity: 0.3 + neuralActivity * 0.4,
          }}
        />
      </div>

      {/* Brain lobes as interactive regions */}
      <div className="brain-lobes">
        {/* Cortex - Top */}
        <BrainLobe
          face="cortex"
          data={brainState.traits}
          position={{ x: 0, y: -30, z: 0 }}
          rotation={{ x: -30, y: 0, z: 0 }}
          active={activeFace === 'cortex'}
          onClick={() => onFaceClick('cortex')}
          onMouseEnter={() => onFaceHover?.('cortex')}
          onMouseLeave={() => onFaceHover?.(null)}
          style={style}
        />

        {/* Memory - Back */}
        <BrainLobe
          face="memory"
          data={brainState.memories}
          position={{ x: 0, y: 0, z: -30 }}
          rotation={{ x: 0, y: 180, z: 0 }}
          active={activeFace === 'memory'}
          onClick={() => onFaceClick('memory')}
          onMouseEnter={() => onFaceHover?.('memory')}
          onMouseLeave={() => onFaceHover?.(null)}
          style={style}
        />

        {/* Emotion - Right */}
        <BrainLobe
          face="emotion"
          data={brainState.mood}
          position={{ x: 30, y: 0, z: 0 }}
          rotation={{ x: 0, y: 90, z: 0 }}
          active={activeFace === 'emotion'}
          onClick={() => onFaceClick('emotion')}
          onMouseEnter={() => onFaceHover?.('emotion')}
          onMouseLeave={() => onFaceHover?.(null)}
          style={style}
        />

        {/* Logic - Left */}
        <BrainLobe
          face="logic"
          data={brainState.logic}
          position={{ x: -30, y: 0, z: 0 }}
          rotation={{ x: 0, y: -90, z: 0 }}
          active={activeFace === 'logic'}
          onClick={() => onFaceClick('logic')}
          onMouseEnter={() => onFaceHover?.('logic')}
          onMouseLeave={() => onFaceHover?.(null)}
          style={style}
        />

        {/* Instinct - Bottom */}
        <BrainLobe
          face="instinct"
          data={brainState.instincts}
          position={{ x: 0, y: 30, z: 0 }}
          rotation={{ x: 30, y: 0, z: 0 }}
          active={activeFace === 'instinct'}
          onClick={() => onFaceClick('instinct')}
          onMouseEnter={() => onFaceHover?.('instinct')}
          onMouseLeave={() => onFaceHover?.(null)}
          style={style}
        />

        {/* Social - Front */}
        <BrainLobe
          face="social"
          data={brainState.social}
          position={{ x: 0, y: 0, z: 30 }}
          rotation={{ x: 0, y: 0, z: 0 }}
          active={activeFace === 'social'}
          onClick={() => onFaceClick('social')}
          onMouseEnter={() => onFaceHover?.('social')}
          onMouseLeave={() => onFaceHover?.(null)}
          style={style}
        />
      </div>

      {/* Neural connections between lobes */}
      {showConnections && (
        <NeuralConnections
          connections={brainShape.connections}
          brainState={brainState}
          style={style}
          size={size}
        />
      )}
    </div>
  );
};

// Individual brain lobe component
interface BrainLobeProps {
  face: BrainFace;
  data: any;
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number };
  active: boolean;
  onClick: () => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  style: 'holographic' | 'organic' | 'circuit';
}

const BrainLobe: React.FC<BrainLobeProps> = ({
  face,
  data,
  position,
  rotation,
  active,
  onClick,
  onMouseEnter,
  onMouseLeave,
  style,
}) => {
  const faceConfig = brainShape.faces[face];
  const dataCount =
    typeof data === 'object'
      ? Array.isArray(data)
        ? data.length
        : Object.keys(data).length
      : 0;

  return (
    <div
      className={`brain-lobe brain-lobe-${face} ${active ? 'active' : ''}`}
      style={{
        transform: `
          translate3d(${position.x}%, ${position.y}%, ${position.z}px)
          rotateX(${rotation.x}deg)
          rotateY(${rotation.y}deg)
          rotateZ(${rotation.z}deg)
        `,
      }}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div className={`brain-lobe-content brain-style-${style}`}>
        <div className="brain-lobe-label">{faceConfig.label}</div>
        <div className="brain-lobe-data">{dataCount} items</div>
      </div>
    </div>
  );
};

// Neural connections visualization
interface NeuralConnectionsProps {
  connections: typeof brainShape.connections;
  brainState: NpcBrainState;
  style: 'holographic' | 'organic' | 'circuit';
  size: number;
}

const NeuralConnections: React.FC<NeuralConnectionsProps> = ({
  connections,
  brainState,
  style,
  size,
}) => {
  // Calculate connection strengths based on brain state
  const getConnectionStrength = (from: BrainFace, to: BrainFace): number => {
    if (from === 'memory' && to === 'emotion') {
      return brainState.mood.arousal;
    }
    if (from === 'emotion' && to === 'logic') {
      return Math.abs(brainState.mood.valence);
    }
    if (from === 'social' && to === 'cortex') {
      return brainState.social.affinity / 100;
    }
    return 0.5; // Default strength
  };

  // Face positions (matching BrainLobe positions)
  const facePositions: Record<BrainFace, { x: number; y: number }> = {
    cortex: { x: size / 2, y: size / 2 - 60 },
    memory: { x: size / 2, y: size / 2 },
    emotion: { x: size / 2 + 60, y: size / 2 },
    logic: { x: size / 2 - 60, y: size / 2 },
    instinct: { x: size / 2, y: size / 2 + 60 },
    social: { x: size / 2, y: size / 2 },
  };

  return (
    <svg
      className="brain-connections"
      viewBox={`0 0 ${size} ${size}`}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: size,
        height: size,
        pointerEvents: 'none',
      }}
    >
      <defs>
        <linearGradient id="connectionGradient" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="cyan" stopOpacity="0.2" />
          <stop offset="50%" stopColor="cyan" stopOpacity="0.6" />
          <stop offset="100%" stopColor="cyan" stopOpacity="0.2" />
        </linearGradient>
      </defs>

      {connections.map((conn, index) => {
        const from = facePositions[conn.from];
        const to = facePositions[conn.to];
        const strength = getConnectionStrength(conn.from, conn.to);

        return (
          <g key={index}>
            <line
              x1={from.x}
              y1={from.y}
              x2={to.x}
              y2={to.y}
              stroke="url(#connectionGradient)"
              strokeWidth={1 + strength * 2}
              className="brain-connection-line"
              style={{
                opacity: 0.3 + strength * 0.5,
              }}
            />
            {/* Animated particles along the line */}
            <circle
              r="3"
              fill="cyan"
              className="brain-connection-particle"
              style={{
                opacity: strength,
              }}
            >
              <animateMotion
                dur={`${2 / strength}s`}
                repeatCount="indefinite"
                path={`M ${from.x} ${from.y} L ${to.x} ${to.y}`}
              />
            </circle>
          </g>
        );
      })}
    </svg>
  );
};
