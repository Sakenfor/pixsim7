/**
 * Engine/profile icon atom — used by message bubbles, session items, pickers, etc.
 */

import { getEngineBrand } from '@lib/agent/engineBrands';
import { Icon, type IconName } from '@lib/icons';

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

export function EngineProfileIcon({
  engine,
  icon,
  size = 12,
  className = '',
}: {
  engine: string | null | undefined;
  icon: IconName;
  size?: number;
  className?: string;
}) {
  const brand = getEngineBrand(engine);
  const style = ENGINE_ICON_STYLES[brand.badgeColor] ?? ENGINE_ICON_STYLES.gray;
  const circleSize = size + 8;
  return (
    <span
      className={`relative inline-flex shrink-0 items-center justify-center ${className}`}
      style={{ width: `${circleSize}px`, height: `${circleSize}px` }}
    >
      <span className={`absolute inset-0 rounded-full border ${style.circle}`} aria-hidden="true" />
      <Icon name={icon} size={size} className={`relative z-10 ${style.icon}`} />
    </span>
  );
}
