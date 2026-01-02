/**
 * Body Map Gizmo - Interactive body zones for romance/sensual interactions
 *
 * Features:
 * - ~20 anatomical zones including intimate areas
 * - Dynamic stats system (pleasure, tickle, arousal, etc.)
 * - Movement speed tracking for speed-based effects
 * - Soft anatomical SVG silhouette
 */

import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import {
  GizmoComponentProps,
  findZoneAtPoint,
  getZoneShapeCSS,
  calculateEffectiveIntensity,
  buildZoneContext,
  getZoneColorByEffectiveness,
  getZoneEffectivenessDescription,
} from '@pixsim7/scene.gizmos';
import type { NpcBodyZone, ZoneInteractionContext } from '@lib/registries';
import { useInteractionStatsStore } from '@features/gizmos/stores/interactionStatsStore';
import { useStatsDecay } from '@/hooks/useStatsDecay';
import {
  calculateStatChanges,
  DEFAULT_STAT_CONFIGS,
  getActiveStats,
  getDominantStat,
} from '@/gizmos/interactionStats';
import { getFullAnatomicalZones } from '../../bodyMap/zones';
import './BodyMapGizmo.css';

/** Cached anatomical zones (computed once) */
const ANATOMICAL_ZONES = getFullAnatomicalZones();

/** Extended props for BodyMapGizmo with tool and feedback support */
interface BodyMapGizmoProps extends GizmoComponentProps {
  /** Currently active tool ID */
  activeToolId?: string;
  /** Callback when zone interaction occurs */
  onZoneInteraction?: (context: ZoneInteractionContext, intensity: number) => void;
  /** Callback for NPC feedback events */
  onNpcFeedback?: (feedback: {
    zoneId: string;
    intensity: number;
    effectiveness: number;
    stats: Record<string, number>;
    dominantStat: string | null;
    reaction: 'negative' | 'neutral' | 'positive' | 'ecstatic';
  }) => void;
  /** Maximum number of stat bars to display */
  maxDisplayedStats?: number;
}


export const BodyMapGizmo: React.FC<BodyMapGizmoProps> = ({
  config,
  state,
  onStateChange,
  onAction,
  isActive,
  activeToolId = 'touch',
  onZoneInteraction,
  onNpcFeedback,
  maxDisplayedStats = 4,
}) => {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [activeZone, setActiveZone] = useState<NpcBodyZone | null>(null);
  const [hoveredZone, setHoveredZone] = useState<NpcBodyZone | null>(null);
  const [cursorPosition, setCursorPosition] = useState({ x: 0, y: 0 });
  const [touchIntensity, setTouchIntensity] = useState(0);
  const [effectiveIntensity, setEffectiveIntensity] = useState(0);
  const [movementSpeed, setMovementSpeed] = useState(0);
  const lastUpdateRef = useRef<number>(Date.now());
  const lastPointerRef = useRef({ x: 0, y: 0, time: 0 });

  // Dynamic stats from store
  const stats = useInteractionStatsStore((s) => s.stats);
  const updateStats = useInteractionStatsStore((s) => s.updateStats);
  const setStatsActive = useInteractionStatsStore((s) => s.setActive);
  const getToolStats = useInteractionStatsStore((s) => s.getToolStats);

  // Subscribe to centralized decay timer (reference counted)
  useStatsDecay(100);

  // Get active stats for display (sorted by value, limited)
  const displayedStats = useMemo(() => {
    const active = getActiveStats(stats, 0.05);
    return active.slice(0, maxDisplayedStats);
  }, [stats, maxDisplayedStats]);

  // Get dominant stat for particle color
  const dominantStat = useMemo(() => getDominantStat(stats), [stats]);

  // Get zones from config or use anatomical defaults
  const zones = useMemo<NpcBodyZone[]>(() => {
    if (config.zones && Array.isArray(config.zones) && config.zones.length > 0) {
      return config.zones.map((zone: any) => {
        if (zone.coords) return zone as NpcBodyZone;
        return {
          id: zone.id,
          label: zone.label || zone.id,
          shape: 'circle' as const,
          coords: {
            type: 'circle' as const,
            cx: zone.position?.x ?? 50,
            cy: zone.position?.y ?? 50,
            radius: zone.radius ?? 10,
          },
          sensitivity: zone.sensitivity ?? 0.5,
          ticklishness: zone.ticklishness,
          pleasure: zone.pleasure,
          highlightColor: zone.color,
          toolModifiers: zone.toolModifiers,
        };
      });
    }
    return ANATOMICAL_ZONES;
  }, [config.zones]);

  // Handle mouse/touch movement with speed tracking
  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!canvasRef.current) return;

    const now = Date.now();
    const rect = canvasRef.current.getBoundingClientRect();
    // Scale to 0-100 for x, 0-120 for y (matching viewBox aspect ratio)
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 120;

    // Calculate movement speed (normalized 0-1)
    const dx = x - lastPointerRef.current.x;
    const dy = y - lastPointerRef.current.y;
    const dt = (now - lastPointerRef.current.time) / 1000;

    if (dt > 0 && lastPointerRef.current.time > 0) {
      const distance = Math.sqrt(dx * dx + dy * dy);
      // Normalize: ~50 units/sec = 0.5 speed, ~100+ = 1.0
      const speed = Math.min(1, distance / dt / 100);
      // Smooth the speed value to avoid jitter
      setMovementSpeed(prev => prev * 0.7 + speed * 0.3);
    }

    lastPointerRef.current = { x, y, time: now };
    setCursorPosition({ x, y: y / 1.2 }); // Convert back to 0-100 for display

    const foundZone = findZoneAtPoint(x, y, zones);
    setHoveredZone(foundZone);

    if (foundZone && foundZone.id !== activeZone?.id && touchIntensity > 0) {
      setActiveZone(foundZone);
      onStateChange({ activeZone: foundZone.id });

      const context = buildZoneContext(foundZone, activeToolId);
      const effective = calculateEffectiveIntensity(touchIntensity, foundZone, activeToolId);
      setEffectiveIntensity(effective);

      if (onZoneInteraction) {
        onZoneInteraction(context, effective);
      }

      if ((foundZone as any).segmentId) {
        onAction({
          type: 'segment',
          value: (foundZone as any).segmentId,
          transition: 'smooth',
        });
      }
    }
  }, [zones, activeZone, touchIntensity, activeToolId, onStateChange, onAction, onZoneInteraction]);

  // Handle touch pressure/intensity
  const handlePointerDown = useCallback(() => {
    setTouchIntensity(0.5);
    setStatsActive(true);
    if (hoveredZone) {
      setActiveZone(hoveredZone);
    }
  }, [hoveredZone, setStatsActive]);

  const handlePointerUp = useCallback(() => {
    setTouchIntensity(0);
    setActiveZone(null);
    setEffectiveIntensity(0);
    setStatsActive(false);
  }, [setStatsActive]);

  // Handle scroll for intensity adjustment
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.05 : 0.05;

    setTouchIntensity(prev => {
      const newIntensity = Math.max(0, Math.min(1, prev + delta));

      if (activeZone) {
        const effective = calculateEffectiveIntensity(newIntensity, activeZone, activeToolId);
        setEffectiveIntensity(effective);

        if (onZoneInteraction) {
          const context = buildZoneContext(activeZone, activeToolId);
          onZoneInteraction(context, effective);
        }
      }

      onAction({
        type: 'intensity',
        value: newIntensity,
        transition: 'smooth',
      });

      return newIntensity;
    });
  }, [activeZone, activeToolId, onAction, onZoneInteraction]);

  // Calculate and apply stat changes on interaction tick
  useEffect(() => {
    if (effectiveIntensity > 0 && activeZone) {
      const interval = setInterval(() => {
        const now = Date.now();
        const deltaTime = (now - lastUpdateRef.current) / 1000;
        lastUpdateRef.current = now;

        // Calculate stat changes using tool's stat contributions
        const toolStats = getToolStats(activeToolId);
        const result = calculateStatChanges({
          toolId: activeToolId,
          zone: activeZone,
          pressure: touchIntensity,
          speed: movementSpeed,
          deltaTime,
          customToolStats: toolStats.length > 0 ? toolStats : undefined,
        });

        // Apply the changes
        if (Object.keys(result.changes).length > 0) {
          updateStats(result.changes);
        }

        // Emit NPC feedback periodically
        if (onNpcFeedback) {
          const dominant = getDominantStat(stats);
          const maxStat = Object.values(stats).reduce((max, v) => Math.max(max, v), 0);

          const reaction =
            maxStat > 0.8 ? 'ecstatic' :
            maxStat > 0.5 ? 'positive' :
            maxStat > 0.2 ? 'neutral' : 'negative';

          onNpcFeedback({
            zoneId: activeZone.id,
            intensity: effectiveIntensity,
            effectiveness: activeZone.toolModifiers?.[activeToolId] || 1,
            stats: { ...stats },
            dominantStat: dominant?.stat || null,
            reaction,
          });
        }
      }, 100);

      return () => clearInterval(interval);
    }
  }, [effectiveIntensity, activeZone, activeToolId, touchIntensity, movementSpeed, stats, updateStats, getToolStats, onNpcFeedback]);

  // Render zone overlay
  const renderZoneOverlay = (zone: NpcBodyZone) => {
    const isHovered = hoveredZone?.id === zone.id;
    const isZoneActive = activeZone?.id === zone.id;
    const color = getZoneColorByEffectiveness(zone, activeToolId);
    const style = getZoneShapeCSS(zone, isHovered || isZoneActive, isZoneActive ? 0.4 : 0.15);

    if (zone.coords.type === 'polygon') {
      const points = zone.coords.points.map(p => `${p.x}%,${p.y}%`).join(' ');
      return (
        <svg
          key={zone.id}
          className="zone-polygon-svg"
          style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
        >
          <polygon
            points={points}
            fill={color}
            opacity={isZoneActive ? 0.5 : isHovered ? 0.3 : 0.15}
            stroke={isHovered || isZoneActive ? color : 'none'}
            strokeWidth={isZoneActive ? 3 : 2}
          />
        </svg>
      );
    }

    return (
      <div
        key={zone.id}
        className={`zone-overlay ${isHovered ? 'hovered' : ''} ${isZoneActive ? 'active' : ''}`}
        style={{
          ...style,
          backgroundColor: color,
          boxShadow: isZoneActive ? `0 0 20px ${color}` : undefined,
        }}
      />
    );
  };

  // Get particle color based on dominant stat
  const particleColor = dominantStat
    ? DEFAULT_STAT_CONFIGS[dominantStat.stat]?.color || '#FF69B4'
    : activeZone?.highlightColor || '#FF69B4';

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
      {/* Zone overlays */}
      <div className="zones-container">
        {zones.map(renderZoneOverlay)}
      </div>

      {/* Body silhouette - soft anatomical style */}
      <div className="body-silhouette">
        <svg viewBox="0 0 100 120" className="body-outline" preserveAspectRatio="xMidYMid meet">
          <defs>
            <linearGradient id="bodyGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="rgba(255,180,210,0.25)" />
              <stop offset="100%" stopColor="rgba(180,140,200,0.15)" />
            </linearGradient>
            <filter id="softGlow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="1.5" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          <g className="body-group" filter="url(#softGlow)">
            {/* Head */}
            <ellipse cx="50" cy="8" rx="7" ry="8" className="body-part head" />

            {/* Neck */}
            <path
              d="M46,15 Q50,17 54,15 L53,22 L47,22 Z"
              className="body-part neck"
            />

            {/* Torso - curved feminine/neutral form */}
            <path
              d="M38,22
                 C32,26 30,35 31,48
                 Q33,58 38,65
                 L40,68 L60,68 L62,65
                 Q67,58 69,48
                 C70,35 68,26 62,22
                 Z"
              className="body-part torso"
            />

            {/* Left arm */}
            <path
              d="M32,24
                 C26,28 22,38 20,52
                 Q18,60 20,65
                 Q22,68 24,66
                 Q26,62 25,52
                 C27,40 29,30 34,26"
              className="body-part arm"
            />

            {/* Right arm */}
            <path
              d="M68,24
                 C74,28 78,38 80,52
                 Q82,60 80,65
                 Q78,68 76,66
                 Q74,62 75,52
                 C73,40 71,30 66,26"
              className="body-part arm"
            />

            {/* Hips & pelvis */}
            <path
              d="M40,68
                 Q35,70 33,75
                 Q32,78 35,80
                 L45,80 L50,82 L55,80 L65,80
                 Q68,78 67,75
                 Q65,70 60,68"
              className="body-part hips"
            />

            {/* Left leg */}
            <path
              d="M35,80
                 L34,95
                 Q33,105 35,110
                 Q36,114 40,114
                 L44,114
                 Q46,112 45,108
                 L44,95
                 L45,80"
              className="body-part leg"
            />

            {/* Right leg */}
            <path
              d="M65,80
                 L66,95
                 Q67,105 65,110
                 Q64,114 60,114
                 L56,114
                 Q54,112 55,108
                 L56,95
                 L55,80"
              className="body-part leg"
            />
          </g>
        </svg>
      </div>

      {/* Touch cursor */}
      <div
        className="touch-cursor"
        style={{
          left: `${cursorPosition.x}%`,
          top: `${cursorPosition.y}%`,
          transform: `translate(-50%, -50%) scale(${0.8 + touchIntensity * 0.4})`,
          opacity: touchIntensity > 0 ? 1 : 0.5,
        }}
      >
        <div className="cursor-ring" style={{ borderColor: particleColor }} />
        {touchIntensity > 0 && <div className="cursor-pulse" style={{ borderColor: particleColor }} />}
      </div>

      {/* Particles - color based on dominant stat */}
      {touchIntensity > 0 && activeZone && (
        <div className="particle-container">
          {[...Array(Math.floor(effectiveIntensity * 8))].map((_, i) => (
            <div
              key={i}
              className="particle"
              style={{
                left: `${cursorPosition.x}%`,
                top: `${cursorPosition.y}%`,
                '--delay': `${i * 0.1}s`,
                '--angle': `${(i / 8) * 360}deg`,
                '--color': particleColor,
              } as React.CSSProperties}
            />
          ))}
        </div>
      )}

      {/* Zone info */}
      {(hoveredZone || activeZone) && (
        <div className="zone-info">
          <div className="zone-name">
            {getZoneEffectivenessDescription(hoveredZone || activeZone!, activeToolId)}
          </div>
          {activeZone && (
            <>
              <div className="zone-intensity">
                Intensity: {Math.round(touchIntensity * 100)}%
              </div>
              <div className="zone-effective">
                Effective: {Math.round(effectiveIntensity * 100)}%
              </div>
              <div className="zone-speed">
                Speed: {Math.round(movementSpeed * 100)}%
              </div>
              {activeZone.ticklishness && activeZone.ticklishness > 0.5 && (
                <div className="zone-ticklish">Ticklish!</div>
              )}
              {activeZone.pleasure && activeZone.pleasure > 0.7 && (
                <div className="zone-sensitive">Sensitive</div>
              )}
            </>
          )}
        </div>
      )}

      {/* Dynamic stats display */}
      <div className="stats-container">
        <div className="stats-header">Stats</div>
        {displayedStats.length === 0 ? (
          <div className="stats-empty">No active stats</div>
        ) : (
          displayedStats.map((statId) => {
            const config = DEFAULT_STAT_CONFIGS[statId];
            const value = stats[statId] || 0;
            const isDominant = dominantStat?.stat === statId;

            return (
              <div key={statId} className={`stat-bar ${isDominant ? 'dominant' : ''}`}>
                <div className="stat-label">
                  <span className="stat-icon">{config?.icon || '●'}</span>
                  <span className="stat-name">{config?.name || statId}</span>
                </div>
                <div className="stat-meter">
                  <div
                    className="stat-fill"
                    style={{
                      width: `${value * 100}%`,
                      backgroundColor: config?.color || '#888',
                    }}
                  />
                  {value > 0.7 && <div className="stat-glow" style={{ backgroundColor: config?.color }} />}
                </div>
                <div className="stat-value" style={{ color: config?.color }}>
                  {Math.round(value * 100)}%
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Control hints */}
      <div className="control-hints">
        <div className="hint">Move cursor to explore zones</div>
        <div className="hint">Click and hold to interact</div>
        <div className="hint">Scroll to adjust pressure</div>
        {activeToolId && <div className="hint tool-hint">Tool: {activeToolId}</div>}
      </div>
    </div>
  );
};
