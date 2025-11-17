/**
 * Constellation Gizmo - Star field navigation controller
 * Move through a field of stars to select segments
 */

import { useEffect, useRef, useState, useMemo } from 'react';
import { GizmoComponentProps, Vector3D, GizmoZone } from '@pixsim7/scene-gizmos';
import './ConstellationGizmo.css';

interface Star {
  id: string;
  position: Vector3D;
  zone: GizmoZone;
  brightness: number;
  connections: string[]; // IDs of connected stars
  active: boolean;
  distance: number;
  pulsePhase: number;
}

export const ConstellationGizmo: React.FC<GizmoComponentProps> = ({
  config,
  state,
  onStateChange,
  onAction,
  isActive,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [stars, setStars] = useState<Star[]>([]);
  const [cursor, setCursor] = useState<Vector3D>({ x: 0, y: 0, z: 0 });
  const [activeStar, setActiveStar] = useState<Star | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [viewRotation, setViewRotation] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);

  // Generate star field from zones
  const generateStars = useMemo(() => {
    return config.zones.map((zone, index) => {
      // Create a beautiful 3D distribution
      const phi = Math.acos(2 * (index / config.zones.length) - 1);
      const theta = Math.sqrt(config.zones.length * Math.PI) * phi;

      const radius = 150 + Math.random() * 50;
      const position = {
        x: radius * Math.sin(phi) * Math.cos(theta),
        y: radius * Math.sin(phi) * Math.sin(theta),
        z: radius * Math.cos(phi),
      };

      // Determine connections (create constellations)
      const connections: string[] = [];
      if (index > 0 && Math.random() > 0.3) {
        connections.push(config.zones[index - 1].id);
      }
      if (index < config.zones.length - 1 && Math.random() > 0.3) {
        connections.push(config.zones[index + 1].id);
      }

      return {
        id: zone.id,
        position,
        zone,
        brightness: 0.5 + Math.random() * 0.5,
        connections,
        active: false,
        distance: 0,
        pulsePhase: Math.random() * Math.PI * 2,
      };
    });
  }, [config.zones]);

  useEffect(() => {
    setStars(generateStars);
  }, [generateStars]);

  // Calculate star distances and activation
  useEffect(() => {
    const updatedStars = stars.map(star => {
      const distance = Math.sqrt(
        Math.pow(star.position.x - cursor.x, 2) +
        Math.pow(star.position.y - cursor.y, 2) +
        Math.pow(star.position.z - cursor.z, 2)
      );

      const isActive = distance < 50;
      const brightness = isActive
        ? 1.0
        : Math.max(0.3, 1.0 - distance / 300);

      return {
        ...star,
        distance,
        active: isActive,
        brightness,
      };
    });

    setStars(updatedStars);

    // Find closest active star
    const closest = updatedStars
      .filter(s => s.active)
      .sort((a, b) => a.distance - b.distance)[0];

    if (closest && closest.id !== activeStar?.id) {
      setActiveStar(closest);
      if (closest.zone.segmentId) {
        onAction({
          type: 'segment',
          value: closest.zone.segmentId,
          transition: 'smooth',
        });
      }
    } else if (!closest) {
      setActiveStar(null);
    }
  }, [cursor, stars.length]); // Only depend on cursor and star count

  // Handle mouse movement for navigation
  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;

    const deltaX = e.movementX;
    const deltaY = e.movementY;

    if (e.shiftKey) {
      // Shift + drag = rotate view
      setViewRotation({
        x: viewRotation.x + deltaY * 0.5,
        y: viewRotation.y + deltaX * 0.5,
      });
    } else {
      // Regular drag = move cursor through field
      setCursor({
        x: cursor.x + deltaX * 0.5,
        y: cursor.y + deltaY * 0.5,
        z: cursor.z,
      });
    }
  };

  // Handle scroll for depth navigation
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();

    if (e.ctrlKey) {
      // Ctrl + scroll = zoom
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      setZoom(Math.max(0.5, Math.min(2, zoom * delta)));
    } else {
      // Regular scroll = move forward/backward
      const delta = e.deltaY > 0 ? -10 : 10;
      setCursor({
        ...cursor,
        z: cursor.z + delta,
      });
    }
  };

  // Calculate 2D projection for rendering
  const project3D = (pos: Vector3D): { x: number; y: number; scale: number } => {
    // Apply view rotation
    const rad = Math.PI / 180;
    const cosX = Math.cos(viewRotation.x * rad);
    const sinX = Math.sin(viewRotation.x * rad);
    const cosY = Math.cos(viewRotation.y * rad);
    const sinY = Math.sin(viewRotation.y * rad);

    // Rotate around X
    let y = (pos.y - cursor.y) * cosX - (pos.z - cursor.z) * sinX;
    let z = (pos.y - cursor.y) * sinX + (pos.z - cursor.z) * cosX;

    // Rotate around Y
    const x = (pos.x - cursor.x) * cosY + z * sinY;
    z = -(pos.x - cursor.x) * sinY + z * cosY;

    // Perspective projection
    const perspective = 500;
    const scale = perspective / (perspective + z);

    return {
      x: x * scale * zoom,
      y: y * scale * zoom,
      scale: scale * zoom,
    };
  };

  return (
    <div
      className={`constellation-gizmo ${isActive ? 'active' : ''} ${isDragging ? 'dragging' : ''}`}
      ref={containerRef}
      onMouseDown={() => setIsDragging(true)}
      onMouseUp={() => setIsDragging(false)}
      onMouseLeave={() => setIsDragging(false)}
      onMouseMove={handleMouseMove}
      onWheel={handleWheel}
    >
      {/* Star field background */}
      <div className="starfield-bg">
        <div className="nebula nebula-1" />
        <div className="nebula nebula-2" />
        <div className="nebula nebula-3" />
      </div>

      {/* Star connections (constellation lines) */}
      <svg className="constellation-lines" viewBox="-250 -250 500 500">
        <defs>
          <linearGradient id="connectionGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#00D9FF" stopOpacity="0" />
            <stop offset="50%" stopColor="#00D9FF" stopOpacity="0.6" />
            <stop offset="100%" stopColor="#00D9FF" stopOpacity="0" />
          </linearGradient>
        </defs>

        {stars.map(star => {
          const starProj = project3D(star.position);

          return star.connections.map(targetId => {
            const target = stars.find(s => s.id === targetId);
            if (!target) return null;

            const targetProj = project3D(target.position);
            const opacity = Math.min(starProj.scale, targetProj.scale) * 0.3;

            return (
              <line
                key={`${star.id}-${targetId}`}
                x1={starProj.x}
                y1={starProj.y}
                x2={targetProj.x}
                y2={targetProj.y}
                stroke="url(#connectionGradient)"
                strokeWidth={1}
                opacity={opacity}
                className="connection-line"
              />
            );
          });
        })}
      </svg>

      {/* Stars */}
      <div className="stars-container">
        {stars.map(star => {
          const proj = project3D(star.position);
          const size = Math.max(2, 10 * proj.scale * star.brightness);

          return (
            <div
              key={star.id}
              className={`star ${star.active ? 'active' : ''}`}
              style={{
                transform: `translate(${proj.x}px, ${proj.y}px)`,
                '--star-size': `${size}px`,
                '--star-brightness': star.brightness,
                '--star-color': star.zone.color || '#FFFFFF',
                '--pulse-phase': star.pulsePhase,
                zIndex: Math.floor(proj.scale * 1000),
              } as any}
            >
              <div className="star-core">
                <div className="star-glow" />
                <div className="star-rays" />
                {star.active && (
                  <div className="star-label">{star.zone.label || star.id}</div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Cursor indicator */}
      <div className="cursor-indicator">
        <div className="cursor-crosshair" />
        <div className="cursor-ring" />
      </div>

      {/* Navigation compass */}
      <div className="navigation-compass">
        <div
          className="compass-rose"
          style={{
            transform: `rotateX(${-viewRotation.x}deg) rotateY(${-viewRotation.y}deg)`,
          }}
        >
          <div className="compass-direction n">N</div>
          <div className="compass-direction s">S</div>
          <div className="compass-direction e">E</div>
          <div className="compass-direction w">W</div>
        </div>
      </div>

      {/* Active star info */}
      {activeStar && (
        <div className="active-star-info">
          <div className="star-name">{activeStar.zone.label || activeStar.id}</div>
          <div className="star-distance">Distance: {Math.round(activeStar.distance)}</div>
          {activeStar.zone.tags && (
            <div className="star-tags">
              {activeStar.zone.tags.map(tag => (
                <span key={tag} className="star-tag">{tag}</span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Control hints */}
      <div className="control-hints">
        <div className="hint">Drag to navigate</div>
        <div className="hint">Scroll for depth</div>
        <div className="hint">Shift+Drag to rotate</div>
        <div className="hint">Ctrl+Scroll to zoom</div>
      </div>
    </div>
  );
};