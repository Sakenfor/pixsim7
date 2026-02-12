/**
 * Generic Surface Gizmo - Profile-driven interactive surface
 *
 * A flexible gizmo component that loads its configuration from a SurfaceProfile.
 * Supports any domain (romance, massage, botanical, etc.) through the profile system.
 *
 * Features:
 * - Profile-driven regions, instruments, and dimensions
 * - Dynamic dimension system with decay
 * - Movement speed tracking
 * - Completion criteria checking
 * - NPC/entity feedback callbacks
 */

import type { GizmoComponentProps } from '@pixsim7/scene.gizmos';
import { getProfileOrThrow } from '@pixsim7/scene.gizmos';
import type {
  SurfaceProfile,
  SurfaceRegion,
  SurfaceInstrument,
  GizmoSessionResult,
} from '@pixsim7/shared.types';
import { useEffect, useRef, useState, useMemo, useCallback } from 'react';

import { Icon } from '@lib/icons';

import { useSurfaceDimensionStore } from '@features/gizmos/stores/surfaceDimensionStore';

import './GenericSurfaceGizmo.css';

// =============================================================================
// Types
// =============================================================================

/** Props for GenericSurfaceGizmo */
export interface GenericSurfaceGizmoProps extends Partial<GizmoComponentProps> {
  /** Profile ID to load, or a profile object directly */
  profile: string | SurfaceProfile;

  /** Currently active instrument ID (defaults to first instrument) */
  activeInstrumentId?: string;

  /** Callback when region interaction occurs */
  onRegionInteraction?: (context: {
    regionId: string;
    instrumentId: string;
    pressure: number;
    speed: number;
    effectiveness: number;
  }) => void;

  /** Callback for entity feedback events */
  onEntityFeedback?: (feedback: {
    regionId: string;
    intensity: number;
    effectiveness: number;
    dimensions: Record<string, number>;
    dominantDimension: string | null;
    reaction: 'negative' | 'neutral' | 'positive' | 'ecstatic';
  }) => void;

  /** Callback when completion criteria are met */
  onComplete?: (result: GizmoSessionResult) => void;

  /** Maximum number of dimension bars to display */
  maxDisplayedDimensions?: number;

  /** Override time limit (seconds) */
  timeLimit?: number;

  /** Show region labels on hover */
  showRegionLabels?: boolean;

  /** Custom CSS class */
  className?: string;
}

// =============================================================================
// Helpers
// =============================================================================

function isPointInRegion(x: number, y: number, region: SurfaceRegion): boolean {
  const coords = region.coords;

  switch (coords.type) {
    case 'rect':
      return (
        x >= coords.x &&
        x <= coords.x + coords.width &&
        y >= coords.y &&
        y <= coords.y + coords.height
      );

    case 'circle': {
      const dx = x - coords.cx;
      const dy = y - coords.cy;
      return Math.sqrt(dx * dx + dy * dy) <= coords.radius;
    }

    case 'polygon': {
      // Ray casting algorithm
      const points = coords.points;
      let inside = false;
      for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
        const xi = points[i].x, yi = points[i].y;
        const xj = points[j].x, yj = points[j].y;

        if (((yi > y) !== (yj > y)) &&
            (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) {
          inside = !inside;
        }
      }
      return inside;
    }

    default:
      return false;
  }
}

function findRegionAtPoint(x: number, y: number, regions: SurfaceRegion[]): SurfaceRegion | null {
  // Check in reverse order so higher z-index (later) regions are found first
  for (let i = regions.length - 1; i >= 0; i--) {
    if (isPointInRegion(x, y, regions[i])) {
      return regions[i];
    }
  }
  return null;
}

function getRegionShapeStyle(region: SurfaceRegion, isHovered: boolean, isActive: boolean): React.CSSProperties {
  const opacity = isActive ? 0.5 : isHovered ? 0.3 : 0.15;
  const coords = region.coords;

  switch (coords.type) {
    case 'rect': {
      return {
        position: 'absolute',
        left: `${coords.x}%`,
        top: `${coords.y}%`,
        width: `${coords.width}%`,
        height: `${coords.height}%`,
        backgroundColor: region.highlightColor || '#888',
        opacity,
        borderRadius: '4px',
        pointerEvents: 'none',
      };
    }

    case 'circle': {
      return {
        position: 'absolute',
        left: `${coords.cx - coords.radius}%`,
        top: `${coords.cy - coords.radius}%`,
        width: `${coords.radius * 2}%`,
        height: `${coords.radius * 2}%`,
        backgroundColor: region.highlightColor || '#888',
        opacity,
        borderRadius: '50%',
        pointerEvents: 'none',
      };
    }

    default:
      return {};
  }
}

// =============================================================================
// Component
// =============================================================================

export const GenericSurfaceGizmo: React.FC<GenericSurfaceGizmoProps> = ({
  profile: profileProp,
  activeInstrumentId: activeInstrumentIdProp,
  onRegionInteraction,
  onEntityFeedback,
  onComplete,
  maxDisplayedDimensions = 5,
  timeLimit: timeLimitProp,
  showRegionLabels = true,
  className,
  onStateChange,
  onAction,
  isActive = true,
}) => {
  // Resolve profile
  const profile = useMemo<SurfaceProfile>(() => {
    if (typeof profileProp === 'string') {
      return getProfileOrThrow(profileProp);
    }
    return profileProp;
  }, [profileProp]);

  // Active instrument
  const activeInstrument = useMemo<SurfaceInstrument | undefined>(() => {
    const instrumentId = activeInstrumentIdProp || profile.instruments[0]?.id;
    return profile.instruments.find(i => i.id === instrumentId);
  }, [profile, activeInstrumentIdProp]);

  // Refs
  const containerRef = useRef<HTMLDivElement>(null);
  const lastUpdateRef = useRef<number>(Date.now());
  const lastPointerRef = useRef({ x: 0, y: 0, time: 0 });

  // Local state
  const [activeRegion, setActiveRegion] = useState<SurfaceRegion | null>(null);
  const [hoveredRegion, setHoveredRegion] = useState<SurfaceRegion | null>(null);
  const [cursorPosition, setCursorPosition] = useState({ x: 0, y: 0 });
  const [touchPressure, setTouchPressure] = useState(0);
  const [effectivePressure, setEffectivePressure] = useState(0);
  const [movementSpeed, setMovementSpeed] = useState(0);
  const [isCompleted, setIsCompleted] = useState(false);

  // Dimension store - methods are stable, no need in deps
   
  const dimensionStore = useSurfaceDimensionStore();
  const dimensions = useSurfaceDimensionStore((s) => s.dimensions);
  const dimensionConfigs = useSurfaceDimensionStore((s) => s.dimensionConfigs);

  // ViewBox dimensions
  const viewBox = profile.visualConfig.viewBox || [100, 100];
  const viewBoxWidth = viewBox[0];
  const viewBoxHeight = viewBox[1];

  // Initialize dimensions from profile
  useEffect(() => {
    dimensionStore.initFromProfile(profile);

    return () => {
      // Clean up on unmount
      dimensionStore.reset();
    };
  }, [profile]);

  // Subscribe to decay timer
  useEffect(() => {
    const unsubscribe = dimensionStore.subscribeDecay(100);
    return unsubscribe;
  }, []);

  // Get displayed dimensions
  const displayedDimensions = useMemo(() => {
    return dimensionStore.getSortedDimensions().slice(0, maxDisplayedDimensions);
  }, [dimensions, maxDisplayedDimensions]);

  // Get dominant dimension
  const dominantDimension = useMemo(() => {
    return dimensionStore.getDominant();
  }, [dimensions]);

  // Check completion periodically
  useEffect(() => {
    if (isCompleted) return;

    const checkInterval = setInterval(() => {
      const result = dimensionStore.checkCompletion(profile);
      if (result.isComplete && result.completionType) {
        setIsCompleted(true);
        if (onComplete) {
          onComplete(dimensionStore.getSessionResult(result.completionType));
        }
      }
    }, 500);

    return () => clearInterval(checkInterval);
  }, [profile, isCompleted, onComplete]);

  // Check time limit
  useEffect(() => {
    const limit = timeLimitProp ?? profile.completionCriteria?.timeLimit;
    if (!limit || isCompleted) return;

    const timeout = setTimeout(() => {
      setIsCompleted(true);
      if (onComplete) {
        onComplete(dimensionStore.getSessionResult('timeout'));
      }
    }, limit * 1000);

    return () => clearTimeout(timeout);
  }, [timeLimitProp, profile, isCompleted, onComplete]);

  // Handle pointer movement
  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!containerRef.current) return;

    const now = Date.now();
    const rect = containerRef.current.getBoundingClientRect();

    // Scale to viewBox coordinates
    const x = ((e.clientX - rect.left) / rect.width) * viewBoxWidth;
    const y = ((e.clientY - rect.top) / rect.height) * viewBoxHeight;

    // Calculate movement speed
    const dx = x - lastPointerRef.current.x;
    const dy = y - lastPointerRef.current.y;
    const dt = (now - lastPointerRef.current.time) / 1000;

    if (dt > 0 && lastPointerRef.current.time > 0) {
      const distance = Math.sqrt(dx * dx + dy * dy);
      const speed = Math.min(1, distance / dt / 100);
      setMovementSpeed(prev => prev * 0.7 + speed * 0.3);
    }

    lastPointerRef.current = { x, y, time: now };
    setCursorPosition({ x: (x / viewBoxWidth) * 100, y: (y / viewBoxHeight) * 100 });

    const foundRegion = findRegionAtPoint(x, y, profile.regions);
    setHoveredRegion(foundRegion);

    if (foundRegion && foundRegion.id !== activeRegion?.id && touchPressure > 0) {
      setActiveRegion(foundRegion);
      onStateChange?.({ activeRegion: foundRegion.id });
    }
  }, [profile.regions, activeRegion, touchPressure, viewBoxWidth, viewBoxHeight, onStateChange]);

  // Handle pointer down
  const handlePointerDown = useCallback(() => {
    setTouchPressure(0.5);
    dimensionStore.setActive(true);
    if (hoveredRegion) {
      setActiveRegion(hoveredRegion);
    }
  }, [hoveredRegion]);

  // Handle pointer up
  const handlePointerUp = useCallback(() => {
    setTouchPressure(0);
    setActiveRegion(null);
    setEffectivePressure(0);
    dimensionStore.setActive(false);
  }, []);

  // Handle scroll for pressure adjustment
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.05 : 0.05;

    setTouchPressure(prev => {
      const newPressure = Math.max(0, Math.min(1, prev + delta));

      onAction?.({
        type: 'pressure',
        value: newPressure,
        transition: 'smooth',
      });

      return newPressure;
    });
  }, [onAction]);

  // Apply dimension contributions on interaction tick
  useEffect(() => {
    if (touchPressure > 0 && activeRegion && activeInstrument && !isCompleted) {
      const interval = setInterval(() => {
        const now = Date.now();
        const deltaTime = (now - lastUpdateRef.current) / 1000;
        lastUpdateRef.current = now;

        // Calculate effective pressure with instrument modifiers
        const instrumentMod = activeRegion.instrumentModifiers?.[activeInstrument.id] ?? 1;
        const effective = touchPressure * instrumentMod;
        setEffectivePressure(effective);

        // Apply instrument contributions
        const changes = dimensionStore.applyInstrumentContribution(
          activeInstrument.id,
          activeRegion,
          touchPressure,
          movementSpeed,
          deltaTime
        );

        // Emit callbacks
        if (onRegionInteraction) {
          onRegionInteraction({
            regionId: activeRegion.id,
            instrumentId: activeInstrument.id,
            pressure: touchPressure,
            speed: movementSpeed,
            effectiveness: effective,
          });
        }

        if (onEntityFeedback && Object.keys(changes).length > 0) {
          const dom = dimensionStore.getDominant();
          const maxDim = Math.max(...Object.values(dimensions));

          const reaction =
            maxDim > 0.8 ? 'ecstatic' :
            maxDim > 0.5 ? 'positive' :
            maxDim > 0.2 ? 'neutral' : 'negative';

          onEntityFeedback({
            regionId: activeRegion.id,
            intensity: effective,
            effectiveness: instrumentMod,
            dimensions: { ...dimensions },
            dominantDimension: dom?.id || null,
            reaction,
          });
        }
      }, 100);

      return () => clearInterval(interval);
    }
  }, [touchPressure, activeRegion, activeInstrument, movementSpeed, dimensions, isCompleted, onRegionInteraction, onEntityFeedback]);

  // Render region overlay
  const renderRegionOverlay = (region: SurfaceRegion) => {
    const isHovered = hoveredRegion?.id === region.id;
    const isRegionActive = activeRegion?.id === region.id;

    // Handle polygon separately
    if (region.coords.type === 'polygon') {
      const points = region.coords.points
        .map(p => `${(p.x / viewBoxWidth) * 100}%,${(p.y / viewBoxHeight) * 100}%`)
        .join(' ');

      return (
        <svg
          key={region.id}
          className="region-polygon-svg"
          style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
        >
          <polygon
            points={points}
            fill={region.highlightColor || '#888'}
            opacity={isRegionActive ? 0.5 : isHovered ? 0.3 : 0.15}
            stroke={isHovered || isRegionActive ? region.highlightColor : 'none'}
            strokeWidth={isRegionActive ? 3 : 2}
          />
        </svg>
      );
    }

    const style = getRegionShapeStyle(region, isHovered, isRegionActive);

    return (
      <div
        key={region.id}
        className={`region-overlay ${isHovered ? 'hovered' : ''} ${isRegionActive ? 'active' : ''}`}
        style={{
          ...style,
          boxShadow: isRegionActive ? `0 0 20px ${region.highlightColor}` : undefined,
        }}
      />
    );
  };

  // Get particle color
  const particleColor = dominantDimension
    ? dimensionConfigs[dominantDimension.id]?.color || '#888'
    : activeRegion?.highlightColor || '#888';

  // Background style
  const backgroundStyle: React.CSSProperties = {
    backgroundColor: profile.visualConfig.backgroundColor || 'transparent',
  };
  if (profile.visualConfig.surfaceImage) {
    backgroundStyle.backgroundImage = `url(${profile.visualConfig.surfaceImage})`;
    backgroundStyle.backgroundSize = 'cover';
    backgroundStyle.backgroundPosition = 'center';
  }

  return (
    <div
      className={`generic-surface-gizmo ${isActive ? 'active' : ''} ${isCompleted ? 'completed' : ''} ${className || ''}`}
      ref={containerRef}
      style={backgroundStyle}
      onPointerMove={handlePointerMove}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
      onWheel={handleWheel}
    >
      {/* Region overlays */}
      <div className="regions-container">
        {profile.regions.map(renderRegionOverlay)}
      </div>

      {/* Touch cursor */}
      <div
        className="touch-cursor"
        style={{
          left: `${cursorPosition.x}%`,
          top: `${cursorPosition.y}%`,
          transform: `translate(-50%, -50%) scale(${0.8 + touchPressure * 0.4})`,
          opacity: touchPressure > 0 ? 1 : 0.5,
        }}
      >
        <div className="cursor-ring" style={{ borderColor: particleColor }} />
        {touchPressure > 0 && <div className="cursor-pulse" style={{ borderColor: particleColor }} />}
      </div>

      {/* Particles */}
      {touchPressure > 0 && activeRegion && (
        <div className="particle-container">
          {[...Array(Math.floor(effectivePressure * 8))].map((_, i) => (
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

      {/* Region info */}
      {showRegionLabels && (hoveredRegion || activeRegion) && (
        <div className="region-info">
          <div className="region-name">
            {(hoveredRegion || activeRegion)!.label}
          </div>
          {activeRegion && (
            <>
              <div className="region-pressure">
                Pressure: {Math.round(touchPressure * 100)}%
              </div>
              <div className="region-effective">
                Effective: {Math.round(effectivePressure * 100)}%
              </div>
              <div className="region-speed">
                Speed: {Math.round(movementSpeed * 100)}%
              </div>
            </>
          )}
        </div>
      )}

      {/* Dimension bars */}
      {profile.visualConfig.showDimensionBars !== false && (
        <div className="dimensions-container">
          <div className="dimensions-header">{profile.name}</div>
          {displayedDimensions.length === 0 ? (
            <div className="dimensions-empty">No active dimensions</div>
          ) : (
            displayedDimensions.map(({ id, value, config }) => {
              const isDominant = dominantDimension?.id === id;

              return (
                <div key={id} className={`dimension-bar ${isDominant ? 'dominant' : ''}`}>
                  <div className="dimension-label">
                    <span className="dimension-icon"><Icon name={config?.icon || '\u25CF'} size={14} /></span>
                    <span className="dimension-name">{config?.name || id}</span>
                  </div>
                  <div className="dimension-meter">
                    <div
                      className="dimension-fill"
                      style={{
                        width: `${value * 100}%`,
                        backgroundColor: config?.color || '#888',
                      }}
                    />
                    {value > 0.7 && (
                      <div className="dimension-glow" style={{ backgroundColor: config?.color }} />
                    )}
                  </div>
                  <div className="dimension-value" style={{ color: config?.color }}>
                    {Math.round(value * 100)}%
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Instrument info */}
      {activeInstrument && (
        <div className="instrument-info">
          <span className="instrument-icon"><Icon name={activeInstrument.visual.icon || '\u{1F91A}'} size={16} /></span>
          <span className="instrument-name">{activeInstrument.label || activeInstrument.id}</span>
        </div>
      )}

      {/* Completion overlay */}
      {isCompleted && (
        <div className="completion-overlay">
          <div className="completion-message">Complete!</div>
        </div>
      )}

      {/* Control hints */}
      <div className="control-hints">
        <div className="hint">Move cursor to explore</div>
        <div className="hint">Click and hold to interact</div>
        <div className="hint">Scroll to adjust pressure</div>
      </div>
    </div>
  );
};

export default GenericSurfaceGizmo;
