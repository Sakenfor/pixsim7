/**
 * Interactive Tool - Diegetic interaction tools for scenes
 * Touch, temperature, energy - beautiful and responsive
 */

import { useEffect, useRef, useState } from 'react';
import { InteractiveTool as ToolType, Vector3D, TouchPattern } from '@pixsim7/scene-gizmos';
import './InteractiveTool.css';

interface InteractiveToolProps {
  tool: ToolType;
  position: Vector3D;
  onPositionChange: (pos: Vector3D) => void;
  onPressureChange: (pressure: number) => void;
  onPatternDetected: (pattern: TouchPattern) => void;
  isActive: boolean;
  targetElement?: HTMLElement;
}

export const InteractiveTool: React.FC<InteractiveToolProps> = ({
  tool,
  position,
  onPositionChange,
  onPressureChange,
  onPatternDetected,
  isActive,
  targetElement,
}) => {
  const toolRef = useRef<HTMLDivElement>(null);
  const trailCanvasRef = useRef<HTMLCanvasElement>(null);
  const [pressure, setPressure] = useState(0);
  const [temperature, setTemperature] = useState(0.5);
  const [isDragging, setIsDragging] = useState(false);
  const [trail, setTrail] = useState<Vector3D[]>([]);
  const [particles, setParticles] = useState<Particle[]>([]);

  interface Particle {
    id: number;
    position: Vector3D;
    velocity: Vector3D;
    lifetime: number;
    type: string;
  }

  // Handle pressure from mouse/touch
  const handleMouseDown = (e: React.MouseEvent | React.TouchEvent) => {
    setIsDragging(true);
    const newPressure = e.shiftKey ? 1.0 : 0.5; // Shift for max pressure
    setPressure(newPressure);
    onPressureChange(newPressure);
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    setPressure(0);
    onPressureChange(0);
    analyzePattern();
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;

    const newPosition = {
      x: e.clientX,
      y: e.clientY,
      z: position.z,
    };

    onPositionChange(newPosition);

    // Add to trail
    setTrail(prev => [...prev.slice(-30), newPosition]);

    // Generate particles based on tool type
    if (tool.visual.particles) {
      generateParticles(newPosition);
    }

    // Adjust pressure based on speed
    const speed = Math.sqrt(
      Math.pow(e.movementX, 2) + Math.pow(e.movementY, 2)
    );
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

    // Simplified pattern detection
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

    onPatternDetected(pattern);
  };

  const isCircular = (points: Vector3D[]): boolean => {
    // Simplified circular detection
    if (points.length < 8) return false;
    const center = points[Math.floor(points.length / 2)];
    const radius = Math.sqrt(
      Math.pow(points[0].x - center.x, 2) +
      Math.pow(points[0].y - center.y, 2)
    );

    return points.every(p => {
      const dist = Math.sqrt(
        Math.pow(p.x - center.x, 2) +
        Math.pow(p.y - center.y, 2)
      );
      return Math.abs(dist - radius) < radius * 0.3;
    });
  };

  const isZigzag = (points: Vector3D[]): boolean => {
    // Check for direction changes
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

    // Clear with fade effect
    ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw trail
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

    // Add glow effect
    ctx.shadowBlur = 20;
    ctx.shadowColor = tool.visual.activeColor;
    ctx.stroke();
  }, [trail, pressure, tool]);

  // Update particles
  useEffect(() => {
    const interval = setInterval(() => {
      setParticles(prev => prev
        .map(p => ({
          ...p,
          position: {
            x: p.position.x + p.velocity.x,
            y: p.position.y + p.velocity.y,
            z: p.position.z,
          },
          velocity: {
            x: p.velocity.x * 0.95,
            y: p.velocity.y * 0.95 + 0.5, // Gravity for some types
            z: 0,
          },
          lifetime: p.lifetime - 50,
        }))
        .filter(p => p.lifetime > 0)
      );
    }, 50);

    return () => clearInterval(interval);
  }, []);

  return (
    <>
      {/* Trail canvas */}
      <canvas
        ref={trailCanvasRef}
        className="tool-trail-canvas"
        width={window.innerWidth}
        height={window.innerHeight}
      />

      {/* Tool cursor */}
      <div
        ref={toolRef}
        className={`interactive-tool tool-${tool.type} tool-model-${tool.visual.model} ${isActive ? 'active' : ''} ${isDragging ? 'dragging' : ''}`}
        style={{
          transform: `translate(${position.x}px, ${position.y}px)`,
          '--pressure': pressure,
          '--temperature': temperature,
          '--tool-color': tool.visual.baseColor,
          '--tool-active-color': tool.visual.activeColor,
        } as any}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseUp}
      >
        {/* Tool visual representation */}
        <div className="tool-visual">
          {renderToolVisual()}
        </div>

        {/* Pressure indicator */}
        <div className="pressure-indicator">
          <div className="pressure-ring" style={{ scale: `${0.5 + pressure * 0.5}` }} />
          <div className="pressure-pulse" />
        </div>

        {/* Temperature effect (for temperature tools) */}
        {tool.type === 'temperature' && (
          <div className="temperature-effect">
            {temperature < 0.3 && <div className="frost-effect" />}
            {temperature > 0.7 && <div className="heat-shimmer" />}
          </div>
        )}
      </div>

      {/* Particles */}
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

  function renderToolVisual() {
    switch (tool.visual.model) {
      case 'hand':
        return <HandVisual pressure={pressure} />;
      case 'feather':
        return <FeatherVisual />;
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
};

// Tool Visual Components

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

const FeatherVisual: React.FC = () => (
  <div className="feather-visual">
    <div className="feather-shaft" />
    <div className="feather-vane feather-vane-left" />
    <div className="feather-vane feather-vane-right" />
  </div>
);

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