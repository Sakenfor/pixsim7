/**
 * Body Map Gizmo - Interactive body zones for romance/sensual interactions
 *
 * Now with dynamic stats system - tools contribute to different stats
 * (pleasure, tickle, arousal, etc.) based on tool type and zone properties.
 *
 * Visual improvements TODO [OPUS]:
 * 1. Create elegant body silhouette (SVG or 3D model)
 * 2. Implement animated zone highlights
 * 3. Add particle effects for each zone
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
import type { NpcBodyZone, ZoneInteractionContext } from '@pixsim7/shared.types';
import { useInteractionStatsStore } from '@/stores/interactionStatsStore';
import { useStatsDecay } from '@/hooks/useStatsDecay';
import {
  calculateStatChanges,
  DEFAULT_STAT_CONFIGS,
  getActiveStats,
  getDominantStat,
} from '@/lib/gizmos/interactionStats';
import './BodyMapGizmo.css';

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

/** Default zones if none provided in config */
const DEFAULT_ZONES: NpcBodyZone[] = [
  {
    id: 'head',
    label: 'Head',
    shape: 'circle',
    coords: { type: 'circle', cx: 50, cy: 12, radius: 10 },
    sensitivity: 0.6,
    ticklishness: 0.3,
    highlightColor: '#FF69B4',
  },
  {
    id: 'neck',
    label: 'Neck',
    shape: 'rect',
    coords: { type: 'rect', x: 42, y: 20, width: 16, height: 8 },
    sensitivity: 0.8,
    ticklishness: 0.6,
    pleasure: 0.7,
    highlightColor: '#FF6B9D',
  },
  {
    id: 'shoulders',
    label: 'Shoulders',
    shape: 'rect',
    coords: { type: 'rect', x: 25, y: 26, width: 50, height: 10 },
    sensitivity: 0.5,
    highlightColor: '#4DABF7',
  },
  {
    id: 'chest',
    label: 'Chest',
    shape: 'rect',
    coords: { type: 'rect', x: 35, y: 36, width: 30, height: 18 },
    sensitivity: 0.7,
    pleasure: 0.6,
    highlightColor: '#FF8787',
  },
  {
    id: 'stomach',
    label: 'Stomach',
    shape: 'rect',
    coords: { type: 'rect', x: 38, y: 54, width: 24, height: 14 },
    sensitivity: 0.6,
    ticklishness: 0.8,
    highlightColor: '#FFD43B',
  },
  {
    id: 'hips',
    label: 'Hips',
    shape: 'rect',
    coords: { type: 'rect', x: 32, y: 68, width: 36, height: 10 },
    sensitivity: 0.8,
    pleasure: 0.7,
    highlightColor: '#FF6B6B',
  },
  {
    id: 'left_arm',
    label: 'Left Arm',
    shape: 'rect',
    coords: { type: 'rect', x: 15, y: 30, width: 12, height: 35 },
    sensitivity: 0.4,
    ticklishness: 0.5,
    highlightColor: '#69DB7C',
  },
  {
    id: 'right_arm',
    label: 'Right Arm',
    shape: 'rect',
    coords: { type: 'rect', x: 73, y: 30, width: 12, height: 35 },
    sensitivity: 0.4,
    ticklishness: 0.5,
    highlightColor: '#69DB7C',
  },
  {
    id: 'left_leg',
    label: 'Left Leg',
    shape: 'rect',
    coords: { type: 'rect', x: 35, y: 78, width: 12, height: 20 },
    sensitivity: 0.5,
    ticklishness: 0.4,
    highlightColor: '#748FFC',
  },
  {
    id: 'right_leg',
    label: 'Right Leg',
    shape: 'rect',
    coords: { type: 'rect', x: 53, y: 78, width: 12, height: 20 },
    sensitivity: 0.5,
    ticklishness: 0.4,
    highlightColor: '#748FFC',
  },
];

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
  const lastUpdateRef = useRef<number>(Date.now());

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

  // Get zones from config or use defaults
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
    return DEFAULT_ZONES;
  }, [config.zones]);

  // Handle mouse/touch movement
  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!canvasRef.current) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;

    setCursorPosition({ x, y });

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
          speed: 0.5, // TODO: track actual movement speed
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
  }, [effectiveIntensity, activeZone, activeToolId, touchIntensity, stats, updateStats, getToolStats, onNpcFeedback]);

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

      {/* Body silhouette */}
      <div className="body-silhouette">
        <svg viewBox="0 0 100 100" className="body-outline" preserveAspectRatio="xMidYMid meet">
          <ellipse cx="50" cy="12" rx="8" ry="10" className="body-part head" />
          <rect x="46" y="20" width="8" height="6" rx="2" className="body-part neck" />
          <ellipse cx="50" cy="42" rx="18" ry="20" className="body-part torso" />
          <rect x="25" y="28" width="8" height="30" rx="3" className="body-part arm left" />
          <rect x="67" y="28" width="8" height="30" rx="3" className="body-part arm right" />
          <rect x="38" y="62" width="10" height="35" rx="4" className="body-part leg left" />
          <rect x="52" y="62" width="10" height="35" rx="4" className="body-part leg right" />
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
              {activeZone.ticklishness && activeZone.ticklishness > 0.5 && (
                <div className="zone-ticklish">Ticklish!</div>
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
