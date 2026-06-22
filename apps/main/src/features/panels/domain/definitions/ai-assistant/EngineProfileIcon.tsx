/* eslint-disable react-refresh/only-export-components */
/**
 * Engine/profile icon atom — used by message bubbles, session items, pickers, etc.
 */

import { getEngineBrand } from '@lib/agent/engineBrands';
import { Icon, type IconName } from '@lib/icons';
import { CubeFaces } from '@lib/ui/cube';

import { useAppearanceStore } from '@features/appearance';

import type { AgentEngine } from './assistantChatStore';
import type { UnifiedProfile } from './assistantTypes';

// =============================================================================
// Styles & helpers
// =============================================================================

export const ENGINE_ICON_STYLES: Record<'blue' | 'purple' | 'orange' | 'gray', { icon: string; circle: string }> = {
  blue: {
    icon: 'text-blue-600 dark:text-blue-300',
    circle: 'bg-blue-100 dark:bg-blue-500/20 border-blue-200 dark:border-blue-400/35',
  },
  purple: {
    icon: 'text-violet-600 dark:text-violet-300',
    circle: 'bg-violet-100 dark:bg-violet-500/20 border-violet-200 dark:border-violet-400/35',
  },
  orange: {
    icon: 'text-orange-600 dark:text-orange-300',
    circle: 'bg-orange-100 dark:bg-orange-500/20 border-orange-200 dark:border-orange-400/35',
  },
  gray: {
    icon: 'text-neutral-600 dark:text-neutral-300',
    circle: 'bg-neutral-100 dark:bg-neutral-700/40 border-neutral-200 dark:border-neutral-600/50',
  },
};

export function iconForEngine(engine: string | null | undefined): IconName {
  if (engine === 'codex') return 'cpu';
  if (engine === 'api') return 'zap';
  return 'messageSquare';
}

export function resolveProfileIcon(engine: string | null | undefined, icon: string | null | undefined): IconName {
  if (icon && icon.trim()) return icon as IconName;
  return iconForEngine(engine);
}

/** Derive engine from profile's agent_type + method */
export function engineFromProfile(profile: UnifiedProfile | null): AgentEngine {
  if (!profile) return 'claude';
  if (profile.method === 'api') return 'api';
  if (profile.agent_type === 'codex') return 'codex';
  return 'claude';
}

// =============================================================================
// Component
// =============================================================================

/**
 * Engine dispatch health, drawn as a thin colored ring outside the brand
 * circle. The brand color keeps encoding engine identity (orange=claude,
 * blue=codex); the ring overlays a status signal without competing with it.
 *
 *   'healthy'   — engine confirmed dispatchable (in connected bridge pool)
 *   'unhealthy' — engine missing or probe-failed at bridge start
 *   'unknown'   — pre-first-poll or non-bridge engine (api); no ring drawn
 */
export type EngineHealth = 'healthy' | 'unhealthy' | 'unknown';

export function EngineProfileIcon({
  engine,
  icon,
  size = 12,
  className = '',
  health = 'unknown',
  statusOutline,
  statusMotion,
}: {
  engine: string | null | undefined;
  icon: IconName;
  size?: number;
  className?: string;
  health?: EngineHealth;
  /**
   * Cube-skin only: an explicit status colour traced onto the cube edges (3D
   * glow), e.g. a tab's working/waiting/unread activity. Overrides the
   * health-derived outline. Ignored in flat skin.
   */
  statusOutline?: string;
  /**
   * Cube-skin only: animate the cube to signal activity. 3D motions —
   * `sway` rocks it (icon stays visible), `toss` snaps a periodic full turn then
   * rests on the icon face, `spin` is a continuous turn. Wrapper envelopes —
   * `pulse` fades it, `nudge` bumps it periodically. `duration` is the CSS
   * animation-duration (drive it off the same activity signal as the flat ring).
   */
  statusMotion?: { type: 'spin' | 'sway' | 'toss' | 'pulse' | 'nudge'; duration?: string } | null;
}) {
  const iconSkin = useAppearanceStore((s) => s.iconSkin);
  const brand = getEngineBrand(engine);
  const style = ENGINE_ICON_STYLES[brand.badgeColor] ?? ENGINE_ICON_STYLES.gray;
  const circleSize = size + 8;
  // Ring sits 1px outside the brand circle so the brand color stays intact
  // and the health overlay reads as a halo rather than a recolor. Red is
  // assertive (broken state — user must act); emerald is subtle (just a
  // confirmation signal).
  const healthRingClass =
    health === 'unhealthy'
      ? 'absolute -inset-px rounded-full ring-2 ring-signal-error'
      : health === 'healthy'
        ? 'absolute -inset-px rounded-full ring-1 ring-signal-success/70'
        : null;
  // Cube skin: a theme-coloured cube replaces the flat brand-circle + glyph.
  // Faces use the `--color-accent` token (and its contrast-paired
  // `--color-accent-text` for the glyph), so the cube follows the active theme
  // and any panel skin that overrides accent in its subtree — rather than the
  // fixed engine-brand hue. A gentle tilt keeps the front face near head-on so
  // the glyph stays legible; the health ring still haloes the bounding box.
  // Gated by the global `iconSkin` setting. First surface for the 3D-icon trial.
  if (iconSkin === 'cube') {
    const cubeSize = size + 4;
    // Status reads on the cube's own edges (3D glow) instead of a flat ring.
    // An explicit activity outline (working/waiting/unread) wins; otherwise fall
    // back to engine-dispatch health (healthy = soft success, unhealthy = error).
    const healthOutline =
      health === 'unhealthy'
        ? 'rgb(var(--error))'
        : health === 'healthy'
          ? 'rgb(var(--success) / 0.75)'
          : undefined;
    const outline = statusOutline ?? healthOutline;
    // 3D motions live inside the cube; envelope effects (pulse/nudge) wrap it so
    // the cube's pose is preserved.
    const motionType = statusMotion?.type;
    const motionDur = statusMotion?.duration;
    const cube = (
      <CubeFaces
        size={cubeSize}
        neutral="rgb(var(--color-accent))"
        tilt={{ x: -16, y: 20 }}
        hoverTilt={{ x: -24, y: 34 }}
        outline={outline}
        spin={motionType === 'spin' ? (motionDur ?? true) : undefined}
        sway={motionType === 'sway' ? (motionDur ?? true) : undefined}
        toss={motionType === 'toss' ? (motionDur ?? true) : undefined}
        faces={{
          front: {
            color: 'rgb(var(--color-accent))',
            content: (
              <Icon name={icon} size={Math.round(size * 0.9)} color="rgb(var(--color-accent-text))" />
            ),
          },
        }}
      />
    );
    const envelopeClass =
      motionType === 'pulse' ? 'animate-pulse' : motionType === 'nudge' ? 'animate-cube-nudge-loop' : null;
    return (
      <span
        className={`relative inline-flex shrink-0 items-center justify-center ${className}`}
        style={{ width: `${circleSize}px`, height: `${circleSize}px` }}
      >
        {envelopeClass ? (
          <span
            className={`inline-flex ${envelopeClass}`}
            style={motionDur ? { animationDuration: motionDur } : undefined}
          >
            {cube}
          </span>
        ) : (
          cube
        )}
      </span>
    );
  }

  return (
    <span
      className={`relative inline-flex shrink-0 items-center justify-center ${className}`}
      style={{ width: `${circleSize}px`, height: `${circleSize}px` }}
    >
      {healthRingClass && <span className={healthRingClass} aria-hidden="true" />}
      <span className={`absolute inset-0 rounded-full border ${style.circle}`} aria-hidden="true" />
      <Icon name={icon} size={size} className={`relative z-10 ${style.icon}`} />
    </span>
  );
}
