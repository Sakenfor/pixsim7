/**
 * Interactive Tool - Universal diegetic interaction tool renderer
 * Handles all tool types: touch, temperature, energy, liquid, objects
 * Beautiful and responsive - data-driven visuals
 * Now with NPC preference support!
 */

import { useEffect, useRef, useState } from 'react';
import {
  InteractiveTool as ToolType,
  Vector3D,
  TouchPattern,
  NpcPreferences,
  calculateFeedback,
} from '@pixsim7/scene-gizmos';
import './InteractiveTool.css';

interface InteractiveToolProps {
  tool: ToolType;
  position: Vector3D;
  onPositionChange: (pos: Vector3D) => void;
  onPressureChange: (pressure: number) => void;
  onPatternDetected: (pattern: TouchPattern) => void;
  isActive: boolean;
  targetElement?: HTMLElement;
  /** Optional NPC preferences for feedback calculation */
  npcPreferences?: NpcPreferences;
  /** Callback for NPC feedback events */
  onNpcFeedback?: (feedback: {
    intensity: number;
    reaction: 'negative' | 'neutral' | 'positive' | 'ecstatic';
    message?: string;
  }) => void;
  /** Whether this tool is locked (requires unlock) */
  isLocked?: boolean;
  /** Level required to unlock this tool */
  unlockLevel?: number;
}

interface Particle {
  id: number;
  position: Vector3D;
  velocity: Vector3D;
  lifetime: number;
  type: string;
}

export const InteractiveTool: React.FC<InteractiveToolProps> = ({
  tool,
  position,
  onPositionChange,
  onPressureChange,
  onPatternDetected,
  isActive,
  targetElement,
  npcPreferences,
  onNpcFeedback,
  isLocked = false,
  unlockLevel,
}) => {
  const toolRef = useRef<HTMLDivElement>(null);
  const trailCanvasRef = useRef<HTMLCanvasElement>(null);
  const [pressure, setPressure] = useState(0);
  const [temperature, setTemperature] = useState(0.5);
  const [isDragging, setIsDragging] = useState(false);
  const [trail, setTrail] = useState<Vector3D[]>([]);
  const [particles, setParticles] = useState<Particle[]>([]);
  const [currentPattern, setCurrentPattern] = useState<TouchPattern | undefined>();
  const [feedbackGlow, setFeedbackGlow] = useState(0); // 0-1, visual feedback intensity

  // Handle pressure from mouse/touch
  const handleMouseDown = (e: React.MouseEvent | React.TouchEvent) => {
    if (isLocked) return; // Prevent interaction when locked
    setIsDragging(true);
    const newPressure = 'shiftKey' in e && e.shiftKey ? 1.0 : 0.5;
    setPressure(newPressure);
    onPressureChange(newPressure);
  };

  const handleMouseUp = () => {
    if (isLocked) return;
    setIsDragging(false);
    setPressure(0);
    onPressureChange(0);
    analyzePattern();
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || isLocked) return;

    const newPosition = {
      x: e.clientX,
      y: e.clientY,
      z: position.z,
    };

    onPositionChange(newPosition);
    setTrail(prev => [...prev.slice(-30), newPosition]);

    if (tool.visual.particles) {
      generateParticles(newPosition);
    }

    // Adjust pressure based on speed
    const speed = Math.sqrt(Math.pow(e.movementX, 2) + Math.pow(e.movementY, 2));
    const speedPressure = Math.min(1, speed / 20);
    const newPressure = 0.3 + speedPressure * 0.7;
    setPressure(newPressure);
    onPressureChange(newPressure);
  };

  // Generate particles based on tool type
  const generateParticles = (pos: Vector3D) => {
    const newParticles: Particle[] = [];
    const particleCount = Math.floor(pressure * 5);

    for (let i = 0; i < particleCount; i++) {
      newParticles.push({
        id: Date.now() + i,
        position: { ...pos },
        velocity: {
          x: (Math.random() - 0.5) * 10,
          y: (Math.random() - 0.5) * 10,
          z: 0,
        },
        lifetime: 1000 + Math.random() * 1000,
        type: tool.visual.particles?.type || 'sparks',
      });
    }

    setParticles(prev => [...prev, ...newParticles].slice(-50));
  };

  // Analyze trail for pattern detection
  const analyzePattern = () => {
    if (trail.length < 5) return;

    const lastPoints = trail.slice(-10);
    const deltaX = lastPoints[lastPoints.length - 1].x - lastPoints[0].x;
    const deltaY = lastPoints[lastPoints.length - 1].y - lastPoints[0].y;

    let pattern: TouchPattern = 'linear';

    if (Math.abs(deltaX) < 20 && Math.abs(deltaY) < 20) {
      pattern = 'tap';
    } else if (isCircular(lastPoints)) {
      pattern = 'circular';
    } else if (isZigzag(lastPoints)) {
      pattern = 'zigzag';
    }

    setCurrentPattern(pattern);
    onPatternDetected(pattern);

    // Calculate NPC feedback if preferences provided
    if (npcPreferences) {
      calculateNpcFeedback(pattern);
    }
  };

  // Calculate NPC feedback based on current tool usage
  const calculateNpcFeedback = (pattern?: TouchPattern) => {
    if (!npcPreferences) return;

    const speed = tool.physics.speed;
    const feedback = calculateFeedback(
      npcPreferences,
      tool.id,
      pressure,
      speed,
      pattern
    );

    // Update visual feedback
    setFeedbackGlow(feedback.intensity);

    // Emit feedback event
    if (onNpcFeedback) {
      onNpcFeedback(feedback);
    }

    // Auto-fade feedback glow
    setTimeout(() => {
      setFeedbackGlow(prev => prev * 0.5);
    }, 1000);
  };

  const isCircular = (points: Vector3D[]): boolean => {
    if (points.length < 8) return false;
    const center = points[Math.floor(points.length / 2)];
    const radius = Math.sqrt(
      Math.pow(points[0].x - center.x, 2) + Math.pow(points[0].y - center.y, 2)
    );

    return points.every(p => {
      const dist = Math.sqrt(Math.pow(p.x - center.x, 2) + Math.pow(p.y - center.y, 2));
      return Math.abs(dist - radius) < radius * 0.3;
    });
  };

  const isZigzag = (points: Vector3D[]): boolean => {
    let directionChanges = 0;
    for (let i = 2; i < points.length; i++) {
      const prev = points[i - 1].x - points[i - 2].x;
      const curr = points[i].x - points[i - 1].x;
      if (prev * curr < 0) directionChanges++;
    }
    return directionChanges > 3;
  };

  // Draw trail on canvas
  useEffect(() => {
    const canvas = trailCanvasRef.current;
    if (!canvas || trail.length < 2) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = tool.visual.activeColor;
    ctx.lineWidth = 2 + pressure * 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.globalAlpha = 0.8;

    ctx.beginPath();
    trail.forEach((point, index) => {
      if (index === 0) {
        ctx.moveTo(point.x, point.y);
      } else {
        ctx.lineTo(point.x, point.y);
      }
    });
    ctx.stroke();

    ctx.shadowBlur = 20;
    ctx.shadowColor = tool.visual.activeColor;
    ctx.stroke();
  }, [trail, pressure, tool]);

  // Update particles
  useEffect(() => {
    const interval = setInterval(() => {
      setParticles(prev =>
        prev
          .map(p => ({
            ...p,
            position: {
              x: p.position.x + p.velocity.x,
              y: p.position.y + p.velocity.y,
              z: p.position.z,
            },
            velocity: {
              x: p.velocity.x * 0.95,
              y: p.velocity.y * 0.95 + 0.5,
              z: 0,
            },
            lifetime: p.lifetime - 50,
          }))
          .filter(p => p.lifetime > 0)
      );
    }, 50);

    return () => clearInterval(interval);
  }, []);

  function renderToolVisual() {
    switch (tool.visual.model) {
      case 'hand':
        return <HandVisual pressure={pressure} />;
      case 'feather':
        return <FeatherVisual />;
      case 'water':
        return <WaterVisual pressure={pressure} />;
      case 'banana':
        return <BananaVisual pressure={pressure} />;
      case 'ice':
        return <IceVisual temperature={temperature} />;
      case 'flame':
        return <FlameVisual temperature={temperature} />;
      case 'electric':
        return <ElectricVisual intensity={pressure} />;
      default:
        return <EnergyVisual />;
    }
  }

  return (
    <>
      <canvas
        ref={trailCanvasRef}
        className="tool-trail-canvas"
        width={window.innerWidth}
        height={window.innerHeight}
      />

      <div
        ref={toolRef}
        className={`interactive-tool tool-${tool.type} tool-model-${tool.visual.model} ${
          isActive ? 'active' : ''
        } ${isDragging ? 'dragging' : ''} ${feedbackGlow > 0.5 ? 'feedback-positive' : ''} ${
          isLocked ? 'tool-locked' : ''
        }`}
        style={
          {
            transform: `translate(${position.x}px, ${position.y}px)`,
            '--pressure': pressure,
            '--temperature': temperature,
            '--tool-color': tool.visual.baseColor,
            '--tool-active-color': tool.visual.activeColor,
            '--feedback-glow': feedbackGlow,
          } as any
        }
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseUp}
      >
        <div className="tool-visual">{renderToolVisual()}</div>

        {/* Locked overlay */}
        {isLocked && (
          <div className="tool-locked-overlay">
            <div className="lock-icon">🔒</div>
            {unlockLevel && (
              <div className="unlock-level">Lv. {unlockLevel}</div>
            )}
          </div>
        )}

        <div className="pressure-indicator">
          <div className="pressure-ring" style={{ scale: `${0.5 + pressure * 0.5}` }} />
          <div className="pressure-pulse" />
        </div>

        {tool.type === 'temperature' && (
          <div className="temperature-effect">
            {temperature < 0.3 && <div className="frost-effect" />}
            {temperature > 0.7 && <div className="heat-shimmer" />}
          </div>
        )}
      </div>

      <div className="tool-particles">
        {particles.map(particle => (
          <div
            key={particle.id}
            className={`particle particle-${particle.type}`}
            style={{
              transform: `translate(${particle.position.x}px, ${particle.position.y}px)`,
              opacity: particle.lifetime / 2000,
            }}
          />
        ))}
      </div>
    </>
  );
};

// ============================================================================
// Tool Visual Components
// ============================================================================

const HandVisual: React.FC<{ pressure: number }> = ({ pressure }) => (
  <div className="hand-visual">
    <div className="palm">
      <div className="finger finger-1" />
      <div className="finger finger-2" />
      <div className="finger finger-3" />
      <div className="finger finger-4" />
      <div className="thumb" />
    </div>
    <div className="energy-aura" style={{ opacity: pressure }} />
  </div>
);

const FeatherVisual: React.FC = () => {
  const [movement, setMovement] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      setMovement({
        x: e.movementX * 0.3,
        y: e.movementY * 0.3,
      });
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  return (
    <div
      className="feather-visual"
      style={
        {
          '--flutter-x': `${movement.x}deg`,
          '--flutter-y': `${movement.y}deg`,
        } as any
      }
    >
      <div className="feather-shaft">
        <div className="shaft-highlight" />
      </div>

      <div className="feather-vane feather-vane-left">
        {Array.from({ length: 12 }, (_, i) => (
          <div
            key={`left-${i}`}
            className="feather-barb"
            style={
              {
                '--barb-index': i,
                '--barb-delay': `${i * 0.02}s`,
              } as any
            }
          />
        ))}
      </div>

      <div className="feather-vane feather-vane-right">
        {Array.from({ length: 12 }, (_, i) => (
          <div
            key={`right-${i}`}
            className="feather-barb"
            style={
              {
                '--barb-index': i,
                '--barb-delay': `${i * 0.02}s`,
              } as any
            }
          />
        ))}
      </div>

      <div className="feather-tip" />

      <div className="feather-particles">
        <div className="petal petal-1" />
        <div className="petal petal-2" />
        <div className="petal petal-3" />
      </div>
    </div>
  );
};

const WaterVisual: React.FC<{ pressure: number }> = ({ pressure }) => {
  const [ripples, setRipples] = useState<number[]>([]);

  useEffect(() => {
    if (pressure > 0.3) {
      const newRipple = Date.now();
      setRipples(prev => [...prev.slice(-3), newRipple]);
    }
  }, [pressure]);

  return (
    <div className="water-visual">
      <div className="water-droplet" style={{ scale: `${1 + pressure * 0.3}` }}>
        <div className="droplet-highlight" />
        <div className="droplet-refraction" />
      </div>

      <div className="water-stream" style={{ opacity: pressure }}>
        <div className="stream-flow stream-1" />
        <div className="stream-flow stream-2" />
        <div className="stream-flow stream-3" />
      </div>

      <div className="water-ripples">
        {ripples.map(rippleId => (
          <div key={rippleId} className="ripple" />
        ))}
      </div>

      <div className="water-splash">
        {Array.from({ length: 5 }, (_, i) => (
          <div
            key={i}
            className="splash-drop"
            style={
              {
                '--splash-index': i,
                '--splash-delay': `${i * 0.1}s`,
              } as any
            }
          />
        ))}
      </div>
    </div>
  );
};

const BananaVisual: React.FC<{ pressure: number }> = ({ pressure }) => {
  const bendAngle = pressure * 30;
  const squishScale = 1 - pressure * 0.2;

  return (
    <div
      className="banana-visual"
      style={
        {
          '--bend-angle': `${bendAngle}deg`,
          '--squish-scale': squishScale,
          '--pressure': pressure,
        } as any
      }
    >
      <div className="banana-body">
        <div className="banana-segment segment-top">
          <div className="banana-ridge ridge-1" />
          <div className="banana-ridge ridge-2" />
          <div className="banana-ridge ridge-3" />
        </div>

        <div className="banana-segment segment-middle">
          <div className="banana-ridge ridge-1" />
          <div className="banana-ridge ridge-2" />
          <div className="banana-ridge ridge-3" />
        </div>

        <div className="banana-segment segment-bottom">
          <div className="banana-ridge ridge-1" />
          <div className="banana-ridge ridge-2" />
          <div className="banana-ridge ridge-3" />
          <div className="banana-tip" />
        </div>
      </div>

      <div className="banana-stem" />

      <div
        className="banana-shadow"
        style={{
          scale: `${1 + pressure * 0.5} 1`,
          opacity: 0.3 + pressure * 0.4,
        }}
      />

      {pressure > 0.7 && (
        <div className="impact-waves">
          <div className="impact-wave wave-1" />
          <div className="impact-wave wave-2" />
        </div>
      )}
    </div>
  );
};

const IceVisual: React.FC<{ temperature: number }> = ({ temperature }) => (
  <div className="ice-visual">
    <div className="ice-crystal">
      <div className="crystal-facet facet-1" />
      <div className="crystal-facet facet-2" />
      <div className="crystal-facet facet-3" />
    </div>
    <div className="frost-particles" />
  </div>
);

const FlameVisual: React.FC<{ temperature: number }> = ({ temperature }) => (
  <div className="flame-visual">
    <div className="flame-core" />
    <div className="flame-outer" style={{ scale: `${0.8 + temperature * 0.4}` }} />
    <div className="flame-tips" />
  </div>
);

const ElectricVisual: React.FC<{ intensity: number }> = ({ intensity }) => (
  <div className="electric-visual">
    <div className="electric-core" />
    <div className="lightning-arc arc-1" style={{ opacity: intensity }} />
    <div className="lightning-arc arc-2" style={{ opacity: intensity * 0.7 }} />
    <div className="lightning-arc arc-3" style={{ opacity: intensity * 0.5 }} />
  </div>
);

const EnergyVisual: React.FC = () => (
  <div className="energy-visual">
    <div className="energy-sphere" />
    <div className="energy-rings">
      <div className="ring ring-1" />
      <div className="ring ring-2" />
    </div>
  </div>
);
