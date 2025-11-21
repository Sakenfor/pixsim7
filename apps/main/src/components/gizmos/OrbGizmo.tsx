/**
 * Orb Gizmo - Crystalline sphere controller for scene navigation
 * Beautiful, ethereal control interface
 */

import { useEffect, useRef, useState, useMemo } from 'react';
import { GizmoComponentProps, Vector3D, GizmoZone } from '@pixsim7/scene.gizmos';
import './OrbGizmo.css';

export const OrbGizmo: React.FC<GizmoComponentProps> = ({
  config,
  state,
  onStateChange,
  onAction,
  isActive,
}) => {
  interface FacetState {
    id: string;
    position: Vector3D;
    active: boolean;
    intensity: number;
    color: string;
  }

  const orbRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [activeZone, setActiveZone] = useState<GizmoZone | null>(null);
  const [glowIntensity, setGlowIntensity] = useState(0.5);
  const [rotation, setRotation] = useState({ x: 0, y: 0, z: 0 });

  // Memoize base facet data (only recalculate when zones change)
  const baseFacets = useMemo(() => {
    return config.zones.map((zone, index) => {
      const angle = (index / config.zones.length) * Math.PI * 2;
      const phi = Math.acos(2 * (index / config.zones.length) - 1);

      return {
        id: zone.id,
        position: {
          x: Math.sin(phi) * Math.cos(angle) * 50,
          y: Math.sin(phi) * Math.sin(angle) * 50,
          z: Math.cos(phi) * 50,
        },
        intensity: zone.intensity || 0.5,
        color: zone.color || '#00D9FF',
        zone, // Keep reference to original zone
      };
    });
  }, [config.zones]);

  // Compute facets with active state (lightweight calculation)
  const facets = useMemo(() => {
    return baseFacets.map(baseFacet => ({
      ...baseFacet,
      active: baseFacet.id === activeZone?.id,
    }));
  }, [baseFacets, activeZone]);

  // Handle rotation interaction
  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;

    const deltaX = e.movementX;
    const deltaY = e.movementY;

    const newRotation = {
      x: rotation.x + deltaY * 0.5,
      y: rotation.y + deltaX * 0.5,
      z: rotation.z,
    };

    setRotation(newRotation);
    onStateChange({ rotation: newRotation });

    // Check which facet is facing forward
    updateActiveFacet(newRotation);
  };

  const updateActiveFacet = (currentRotation: Vector3D) => {
    // Calculate which zone is most facing the viewer
    let closestZone: GizmoZone | null = null;
    let maxDot = -1;

    config.zones.forEach((zone, index) => {
      const facet = facets[index];
      if (!facet) return;

      // Transform facet position by rotation
      const transformed = rotateVector(facet.position, currentRotation);
      const dot = transformed.z; // How much it faces the camera

      if (dot > maxDot) {
        maxDot = dot;
        closestZone = zone;
      }
    });

    if (closestZone && closestZone.id !== activeZone?.id) {
      setActiveZone(closestZone);
      setGlowIntensity(closestZone.intensity || 0.5);

      if (closestZone.segmentId) {
        onAction({
          type: 'segment',
          value: closestZone.segmentId,
          transition: 'smooth',
        });
      }
    }
  };

  const rotateVector = (v: Vector3D, rot: Vector3D): Vector3D => {
    // Simplified rotation (you'd use a proper matrix in production)
    const rad = Math.PI / 180;
    const cosX = Math.cos(rot.x * rad);
    const sinX = Math.sin(rot.x * rad);
    const cosY = Math.cos(rot.y * rad);
    const sinY = Math.sin(rot.y * rad);

    // Rotate around X
    let y = v.y * cosX - v.z * sinX;
    let z = v.y * sinX + v.z * cosX;

    // Rotate around Y
    const x = v.x * cosY + z * sinY;
    z = -v.x * sinY + z * cosY;

    return { x, y, z };
  };

  // Handle scroll for push/pull (intensity control)
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    const newIntensity = Math.max(0, Math.min(1, glowIntensity + delta));
    setGlowIntensity(newIntensity);

    onAction({
      type: 'intensity',
      value: newIntensity,
      transition: 'smooth',
    });
  };

  return (
    <div
      className={`orb-gizmo ${isActive ? 'active' : ''} ${isDragging ? 'dragging' : ''}`}
      ref={orbRef}
      onMouseDown={() => setIsDragging(true)}
      onMouseUp={() => setIsDragging(false)}
      onMouseLeave={() => setIsDragging(false)}
      onMouseMove={handleMouseMove}
      onWheel={handleWheel}
    >
      {/* Core orb */}
      <div
        className="orb-core"
        style={{
          transform: `rotateX(${rotation.x}deg) rotateY(${rotation.y}deg) rotateZ(${rotation.z}deg)`,
          '--glow-intensity': glowIntensity,
        } as any}
      >
        {/* Inner energy core */}
        <div className="orb-nucleus">
          <div className="energy-pulse" />
          <div className="energy-swirl" />
        </div>

        {/* Crystal facets */}
        <div className="orb-facets">
          {facets.map((facet, index) => (
            <div
              key={facet.id}
              className={`orb-facet ${facet.active ? 'active' : ''}`}
              style={{
                transform: `translate3d(${facet.position.x}px, ${facet.position.y}px, ${facet.position.z}px)`,
                '--facet-color': facet.color,
                '--facet-intensity': facet.intensity,
                animationDelay: `${index * 0.1}s`,
              } as any}
            >
              <div className="facet-surface">
                <div className="facet-glow" />
                <div className="facet-reflection" />
                {config.zones[index]?.label && (
                  <div className="facet-label">{config.zones[index].label}</div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Orbital rings */}
        <div className="orb-rings">
          <div className="ring ring-x" />
          <div className="ring ring-y" />
          <div className="ring ring-z" />
        </div>
      </div>

      {/* Particle effects */}
      <div className="orb-particles">
        {[...Array(20)].map((_, i) => (
          <div
            key={i}
            className="particle"
            style={{
              '--particle-delay': `${Math.random() * 3}s`,
              '--particle-duration': `${3 + Math.random() * 2}s`,
              '--particle-x': `${Math.random() * 200 - 100}px`,
              '--particle-y': `${Math.random() * 200 - 100}px`,
            } as any}
          />
        ))}
      </div>

      {/* Zone indicator */}
      {activeZone && (
        <div className="zone-indicator">
          <div className="zone-name">{activeZone.label || activeZone.id}</div>
          <div className="zone-intensity">
            <div
              className="intensity-bar"
              style={{ width: `${(activeZone.intensity || 0.5) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Control hints */}
      <div className="control-hints">
        <div className="hint rotate">↻ Rotate to select</div>
        <div className="hint scroll">⇅ Scroll for intensity</div>
      </div>
    </div>
  );
};