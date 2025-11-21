/**
 * Body Map Gizmo - Interactive body zones for romance/sensual interactions
 *
 * TODO [OPUS]: Implement visual representation of the body map
 * This is a stub implementation with core logic but placeholder visuals.
 *
 * Visual tasks for Opus AI:
 * 1. Create elegant body silhouette (SVG or 3D model)
 * 2. Implement animated zone highlights
 * 3. Add particle effects for each zone
 * 4. Create smooth transitions between zones
 * 5. Add visual feedback for touch intensity
 * 6. Implement pleasure meter UI
 * 7. Style with romantic/sensual theme
 */

import { useEffect, useRef, useState, useMemo } from 'react';
import { GizmoComponentProps, Vector3D, GizmoZone } from '@pixsim7/scene.gizmos';
import './BodyMapGizmo.css';

export const BodyMapGizmo: React.FC<GizmoComponentProps> = ({
  config,
  state,
  onStateChange,
  onAction,
  isActive,
}) => {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [activeZone, setActiveZone] = useState<GizmoZone | null>(null);
  const [cursorPosition, setCursorPosition] = useState({ x: 0, y: 0 });
  const [touchIntensity, setTouchIntensity] = useState(0);
  const [pleasureMeter, setPleasureMeter] = useState(0);

  // TODO [OPUS]: Replace with actual body model rendering
  // For now, we'll use simple zones
  const bodyZones = useMemo(() => {
    const zones = Array.isArray(config.zones) && config.zones.length > 0
      ? config.zones
      : [
          {
            id: 'center',
            position: { x: 0, y: 0, z: 0 },
            radius: 40,
            label: 'Center',
            color: '#FF69B4',
          } as GizmoZone,
        ];

    return zones.map((zone, index) => ({
      ...zone,
      // These positions are placeholders - should map to actual body parts
      renderPosition: {
        x: 50 + (index % 3) * 30,
        y: 20 + Math.floor(index / 3) * 25,
      },
    }));
  }, [config.zones]);

  // Handle mouse/touch movement
  const handlePointerMove = (e: React.PointerEvent) => {
    if (!canvasRef.current) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;

    setCursorPosition({ x, y });

    // Check which zone the cursor is over
    const hoveredZone = bodyZones.find(zone => {
      const dx = x - zone.renderPosition.x;
      const dy = y - zone.renderPosition.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      return distance < (zone.radius / 10); // Scale radius
    });

    if (hoveredZone && hoveredZone.id !== activeZone?.id) {
      setActiveZone(hoveredZone);
      onStateChange({ activeZone: hoveredZone.id });

      if (hoveredZone.segmentId) {
        onAction({
          type: 'segment',
          value: hoveredZone.segmentId,
          transition: 'smooth',
        });
      }
    }
  };

  // Handle touch pressure/intensity
  const handlePointerDown = () => {
    setTouchIntensity(1);
  };

  const handlePointerUp = () => {
    setTouchIntensity(0);
  };

  // Handle scroll for intensity
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.05 : 0.05;
    const newIntensity = Math.max(0, Math.min(1, touchIntensity + delta));
    setTouchIntensity(newIntensity);

    onAction({
      type: 'intensity',
      value: newIntensity,
      transition: 'smooth',
    });
  };

  // Simulate pleasure meter building
  useEffect(() => {
    if (touchIntensity > 0 && activeZone) {
      const interval = setInterval(() => {
        setPleasureMeter(prev => Math.min(1, prev + 0.01));
      }, 100);
      return () => clearInterval(interval);
    }
  }, [touchIntensity, activeZone]);

  return (
    <div
      className={`body-map-gizmo ${isActive ? 'active' : ''}`}
      ref={canvasRef}
      onPointerMove={handlePointerMove}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
      onWheel={handleWheel}
    >
      {/* TODO [OPUS]: Replace this section with actual body visualization */}
      {/* Task: Create elegant SVG or 3D model of a body silhouette */}
      {/* Requirements:
          - Artistic, tasteful representation
          - Smooth curves and aesthetic appeal
          - Responsive to window size
          - Supports highlighting zones
          - Can show touch points with effects
      */}
      <div className="body-silhouette-placeholder">
        <svg viewBox="0 0 200 400" className="body-outline">
          {/* PLACEHOLDER: Replace with actual body SVG */}
          <ellipse cx="100" cy="80" rx="40" ry="50" className="body-part head" />
          <rect x="75" y="120" width="50" height="80" rx="10" className="body-part torso" />
          <rect x="65" y="200" width="70" height="100" rx="15" className="body-part lower" />

          {/* Zone indicators - TODO [OPUS]: Make these more elegant */}
          {bodyZones.map(zone => (
            <circle
              key={zone.id}
              cx={zone.renderPosition.x * 2}
              cy={zone.renderPosition.y * 2}
              r={zone.radius / 5}
              className={`zone-indicator ${zone.id === activeZone?.id ? 'active' : ''}`}
              style={{
                fill: zone.color || '#FF69B4',
                opacity: zone.id === activeZone?.id ? 0.8 : 0.3,
              }}
            />
          ))}
        </svg>
      </div>

      {/* TODO [OPUS]: Implement animated cursor/hand following mouse */}
      {/* Task: Create smooth animated hand/cursor that follows mouse
          - Should show current tool (hand, feather, etc.)
          - Animate touch pressure (hand closing/opening)
          - Add particle trails
          - Show glow effects on active zones
      */}
      <div
        className="touch-cursor-placeholder"
        style={{
          left: `${cursorPosition.x}%`,
          top: `${cursorPosition.y}%`,
          transform: `scale(${0.8 + touchIntensity * 0.4})`,
        }}
      >
        {/* PLACEHOLDER: Replace with actual tool visual */}
        <div className="cursor-icon">✋</div>
      </div>

      {/* TODO [OPUS]: Enhance particle effects */}
      {/* Task: Create beautiful particle system
          - Hearts, sparkles, or custom particles
          - Follow touch path
          - Intensity-based emission
          - Color based on zone/pleasure level
          - Smooth animation and fade-out
      */}
      {touchIntensity > 0 && activeZone && (
        <div className="particle-system-placeholder">
          {[...Array(Math.floor(touchIntensity * 10))].map((_, i) => (
            <div
              key={i}
              className="particle"
              style={{
                left: `${cursorPosition.x}%`,
                top: `${cursorPosition.y}%`,
                '--delay': `${i * 0.1}s`,
                '--angle': `${(i / 10) * 360}deg`,
              } as any}
            >
              💕
            </div>
          ))}
        </div>
      )}

      {/* Zone information display */}
      {activeZone && (
        <div className="zone-info">
          <div className="zone-name">{activeZone.label || activeZone.id}</div>
          <div className="zone-intensity">
            Intensity: {Math.round(touchIntensity * 100)}%
          </div>
        </div>
      )}

      {/* TODO [OPUS]: Create beautiful pleasure meter UI */}
      {/* Task: Design elegant pleasure/arousal meter
          - Gradient fill (cool to hot colors)
          - Pulse animation when high
          - Smooth transitions
          - Particle effects at high levels
          - Maybe heart-shaped or other romantic icon
      */}
      <div className="pleasure-meter-container">
        <div className="meter-label">Pleasure</div>
        <div className="meter-bar">
          <div
            className="meter-fill"
            style={{
              width: `${pleasureMeter * 100}%`,
              background: `linear-gradient(90deg,
                rgba(255, 150, 200, 0.5) 0%,
                rgba(255, 100, 150, 0.8) 50%,
                rgba(255, 50, 100, 1.0) 100%)`,
            }}
          />
        </div>
        <div className="meter-value">{Math.round(pleasureMeter * 100)}%</div>
      </div>

      {/* Control hints */}
      <div className="control-hints">
        <div className="hint">Move cursor to explore zones</div>
        <div className="hint">Click and hold for intensity</div>
        <div className="hint">Scroll to adjust pressure</div>
      </div>

      {/* TODO [OPUS]: Add ambient effects */}
      {/* Task: Create atmospheric background effects
          - Subtle gradient background
          - Pulsing glow around active zones
          - Ambient particles floating
          - Screen-space distortions (heat waves, etc.)
          - Responsive to pleasure meter level
      */}
      <div className="ambient-effects-placeholder">
        {/* Placeholder for ambient effects */}
      </div>
    </div>
  );
};
