/**
 * Rings Gizmo - Multi-layered orbital ring control
 * Allows controlling multiple parameters with concentric rotating rings
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import type { GizmoComponentProps, GizmoZone } from '@pixsim7/scene-gizmos';
import './RingsGizmo.css';

export const RingsGizmo: React.FC<GizmoComponentProps> = ({ config, onResult, videoElement }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [selectedRing, setSelectedRing] = useState<number>(0);
  const [rotation, setRotation] = useState<number[]>([0, 0, 0]); // Rotation for each ring
  const [isDragging, setIsDragging] = useState(false);
  const [mouseAngle, setMouseAngle] = useState(0);
  const lastAngleRef = useRef(0);

  const rings = config.zones || [];
  const centerX = 250;
  const centerY = 250;

  // Handle mouse movement for ring rotation
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDragging) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left - centerX;
    const mouseY = e.clientY - rect.top - centerY;

    const angle = Math.atan2(mouseY, mouseX);
    const deltaAngle = angle - lastAngleRef.current;

    setRotation(prev => {
      const newRotation = [...prev];
      newRotation[selectedRing] = (newRotation[selectedRing] + deltaAngle) % (Math.PI * 2);
      return newRotation;
    });

    lastAngleRef.current = angle;
    setMouseAngle(angle);
  }, [isDragging, selectedRing]);

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left - centerX;
    const mouseY = e.clientY - rect.top - centerY;
    const distance = Math.sqrt(mouseX * mouseX + mouseY * mouseY);

    // Determine which ring was clicked
    let clickedRing = -1;
    for (let i = 0; i < rings.length; i++) {
      const ring = rings[i];
      const ringRadius = ring.radius || 100;
      if (Math.abs(distance - ringRadius) < 30) {
        clickedRing = i;
        break;
      }
    }

    if (clickedRing >= 0) {
      setSelectedRing(clickedRing);
      setIsDragging(true);
      lastAngleRef.current = Math.atan2(mouseY, mouseX);

      // Emit result immediately on ring selection
      if (onResult) {
        const zone = rings[clickedRing];
        onResult({
          segmentId: zone.segmentId,
          intensity: zone.intensity || 0.5,
          transition: 'smooth',
          tags: zone.tags,
        });
      }
    }
  }, [rings, onResult]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Draw rings on canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw center point
    ctx.fillStyle = config.visual?.baseColor || '#00D9FF';
    ctx.beginPath();
    ctx.arc(centerX, centerY, 10, 0, Math.PI * 2);
    ctx.fill();

    // Draw each ring
    rings.forEach((ring, index) => {
      const radius = ring.radius || 100;
      const isSelected = index === selectedRing;
      const ringRotation = rotation[index] || 0;

      // Ring circle
      ctx.strokeStyle = isSelected
        ? config.visual?.activeColor || '#9333EA'
        : ring.color || '#00D9FF';
      ctx.lineWidth = isSelected ? 4 : 2;
      ctx.globalAlpha = isSelected ? 1.0 : 0.5;

      ctx.beginPath();
      ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
      ctx.stroke();

      // Ring marker (shows rotation)
      const markerX = centerX + Math.cos(ringRotation) * radius;
      const markerY = centerY + Math.sin(ringRotation) * radius;

      ctx.fillStyle = ring.color || '#00D9FF';
      ctx.globalAlpha = 1.0;
      ctx.beginPath();
      ctx.arc(markerX, markerY, 8, 0, Math.PI * 2);
      ctx.fill();

      // Ring label
      if (isSelected && ring.label) {
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 14px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(ring.label, centerX, centerY - radius - 20);
      }

      // Glow effect for selected ring
      if (isSelected && config.visual?.glow) {
        ctx.strokeStyle = ring.color || '#00D9FF';
        ctx.lineWidth = 8;
        ctx.globalAlpha = 0.3;
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
        ctx.stroke();
      }
    });

    ctx.globalAlpha = 1.0;
  }, [rings, selectedRing, rotation, config]);

  // Auto-rotation effect
  useEffect(() => {
    if (isDragging) return;

    const interval = setInterval(() => {
      setRotation(prev =>
        prev.map((rot, index) => {
          const ring = rings[index];
          const speed = ring.meta?.rotationSpeed || 0.01;
          return (rot + speed) % (Math.PI * 2);
        })
      );
    }, 50);

    return () => clearInterval(interval);
  }, [isDragging, rings]);

  return (
    <div className="rings-gizmo">
      <canvas
        ref={canvasRef}
        width={500}
        height={500}
        className="rings-canvas"
        onMouseMove={handleMouseMove}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      />

      {/* Ring info panel */}
      <div className="rings-info">
        <div className="info-title">Orbital Control</div>
        <div className="info-rings">
          {rings.map((ring, index) => (
            <button
              key={ring.id}
              className={`ring-button ${index === selectedRing ? 'active' : ''}`}
              style={{ borderColor: ring.color }}
              onClick={() => setSelectedRing(index)}
            >
              <div className="ring-label">{ring.label}</div>
              <div className="ring-intensity">
                {((ring.intensity || 0) * 100).toFixed(0)}%
              </div>
            </button>
          ))}
        </div>
        <div className="info-hint">
          Click and drag a ring to rotate • Switch rings with buttons or gestures
        </div>
      </div>
    </div>
  );
};
