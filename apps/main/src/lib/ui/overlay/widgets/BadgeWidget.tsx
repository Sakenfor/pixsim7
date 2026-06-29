/* eslint-disable react-refresh/only-export-components */
/**
 * Badge Widget
 *
 * Pre-built widget for displaying badges (icons, text, status indicators)
 * Uses shared UI components for consistency where applicable
 *
 * This module mixes widget-factory exports with small local presentational
 * components (the expandable-badge chip), so Fast Refresh's
 * "only export components" rule is disabled file-wide — matching sibling
 * widget modules (mediaCardWidgets, mediaCardBadges, mediaCardGeneration).
 */

import { Badge, useHoverExpand, PortalFloat } from '@pixsim7/shared.ui';
import type { AnchorPlacement, AnchorAlign } from '@pixsim7/shared.ui';
import React, { useRef } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';


import type { DataBinding } from '@lib/editing-core';
import { resolveDataBinding } from '@lib/editing-core';
import { Icon } from '@lib/icons';
import { registerStore } from '@lib/stores';
import { CubeFaces } from '@lib/ui/cube';

import { useAppearanceStore } from '@features/appearance';

import { SPACING_VALUES } from '../types';
import type { OverlayWidget, WidgetPosition, VisibilityConfig, WidgetContext } from '../types';

// ---------------------------------------------------------------------------
// Per-surface expansion state for click-expandable badge clusters
// ---------------------------------------------------------------------------

/**
 * Click-expand state for {@link createExpandableBadge} clusters, scoped per
 * surface (gallery, viewer, …) rather than per card — toggling one cluster
 * expands every card's cluster on that surface and is remembered there. Mirrors
 * the active-target set badges' {@link useSetBadgeExpansionStore} so the two
 * cluster affordances behave the same way.
 */
const CLUSTER_EXPANSION_STORAGE_KEY = 'pixsim7-badge-cluster-expansion';

interface BadgeClusterExpansionState {
  expandedBySurface: Record<string, boolean>;
  toggle: (surface: string) => void;
}

const useBadgeClusterExpansionStore = create<BadgeClusterExpansionState>()(
  persist(
    (set) => ({
      expandedBySurface: {},
      toggle: (surface) =>
        set((s) => ({
          expandedBySurface: {
            ...s.expandedBySurface,
            [surface]: !(s.expandedBySurface[surface] ?? false),
          },
        })),
    }),
    { name: CLUSTER_EXPANSION_STORAGE_KEY, version: 1 },
  ),
);

registerStore({ id: 'overlay:badge-cluster-expansion', key: CLUSTER_EXPANSION_STORAGE_KEY });

// ---------------------------------------------------------------------------
// Badge position + stackGroup presets
// ---------------------------------------------------------------------------

export const BADGE_SLOT = {
  topLeft:     { position: { anchor: 'top-left',     offset: { x: 4, y: 4 } } as WidgetPosition,   stackGroup: 'badges-tl' },
  topRight:    { position: { anchor: 'top-right',    offset: { x: -4, y: 4 } } as WidgetPosition,  stackGroup: 'badges-tr' },
  bottomLeft:  { position: { anchor: 'bottom-left',  offset: { x: 4, y: -4 } } as WidgetPosition },
  bottomRight: { position: { anchor: 'bottom-right', offset: { x: -4, y: -4 } } as WidgetPosition },
} as const;

// ---------------------------------------------------------------------------
// Semantic priority constants
// ---------------------------------------------------------------------------

export const BADGE_PRIORITY = {
  background:   5,   // use-count, passive info
  info:        10,   // media-type icon, provider status
  status:      15,   // locked-frame, upload status
  interactive: 20,   // set-badge, set-link, action buttons
  slotIndex:   22,   // slot numbering
  important:   25,   // pin toggle, warnings
  action:      30,   // remove button, primary actions
  generation:  35,   // generate button (topmost)
} as const;

// ---------------------------------------------------------------------------
// Default visibility (trigger: 'always', no transition)
// ---------------------------------------------------------------------------

const DEFAULT_VISIBILITY: VisibilityConfig = { trigger: 'always', transition: 'none' };

export interface BadgeWidgetConfig {
  /** Widget ID */
  id: string;

  /** Position */
  position: WidgetPosition;

  /** Visibility configuration (defaults to { trigger: 'always', transition: 'none' }) */
  visibility?: VisibilityConfig;

  /** Badge variant */
  variant: 'icon' | 'text' | 'icon-text';

  /** Icon name (if variant includes icon) */
  icon?: string;

  /**
   * Text label binding (if variant includes text).
   * Use createBindingFromValue() for static values or functions.
   */
  labelBinding?: DataBinding<string>;

  /** Badge color/variant */
  color?: 'blue' | 'green' | 'red' | 'gray' | 'purple' | 'pink' | 'orange' | 'yellow' | 'accent';

  /** Badge shape (for icon-only badges) */
  shape?: 'circle' | 'square' | 'rounded';

  /** Enable pulse animation */
  pulse?: boolean;

  /**
   * Opt into the on-hover "bubble" wiggle (`hover:animate-hover-pop`) even when
   * the badge is non-interactive. Interactive badges (those with `onClick`) get
   * it automatically. Passive info badges (version, duration, …) leave it off.
   */
  hoverPop?: boolean;

  /**
   * Render-time visibility predicate. When provided and it returns `false`,
   * the badge renders nothing for that asset. This is the canonical way to do
   * "hide unless …" badges (e.g. a count badge that hides below 2) without
   * hand-rolling a custom `render` — keep new badges on `createBadgeWidget`.
   */
  visibleWhen?: (data: any) => boolean;

  /** Tooltip text */
  tooltip?: string;

  /** Click handler — receives overlay data and the DOM event */
  onClick?: (data: any, event?: React.MouseEvent) => void;

  /** Custom className */
  className?: string;

  /** Priority for layering */
  priority?: number;

  /** Stack group for auto-stacking with other widgets */
  stackGroup?: string;
}

type BadgeColor = NonNullable<BadgeWidgetConfig['color']>;

const SHAPE_CLASSES: Record<NonNullable<BadgeWidgetConfig['shape']>, string> = {
  circle: 'rounded-full',
  square: 'rounded-none',
  rounded: 'rounded',
};

// Icon-badge colours (darker, more prominent) for the flat skin.
const ICON_COLOR_CLASSES: Record<BadgeColor, string> = {
  blue: 'bg-blue-600 text-white',
  green: 'bg-green-600 text-white',
  red: 'bg-red-600 text-white',
  gray: 'bg-gray-700 text-white',
  purple: 'bg-purple-600 text-white',
  pink: 'bg-pink-600 text-white',
  orange: 'bg-orange-600 text-white',
  yellow: 'bg-yellow-600 text-white',
  accent: 'bg-accent text-accent-text',
};

// Same palette as hex for the cube skin's lit face.
const BADGE_COLOR_HEX: Record<BadgeColor, string> = {
  blue: '#2563eb',
  green: '#16a34a',
  red: '#dc2626',
  gray: '#374151',
  purple: '#9333ea',
  pink: '#db2777',
  orange: '#ea580c',
  yellow: '#ca8a04',
  accent: '#6366f1',
};

interface BadgeBodyProps {
  variant: BadgeWidgetConfig['variant'];
  icon?: string;
  label: string | undefined;
  color: BadgeColor;
  shape: NonNullable<BadgeWidgetConfig['shape']>;
  pulse: boolean;
  /** Pre-computed hover/cursor class string from the factory. */
  hoverPop: string;
  tooltip?: string;
  className: string;
}

/**
 * Badge content — the part that the global `badgeSkin` appearance setting swaps.
 * `flat` reproduces the canonical 2D pill; `cube` renders the same icon/colour
 * as a 3D {@link CubeFaces} bead with the label beside it. A real component (not
 * an inline render) so the store read is a legal hook.
 */
function BadgeBody({
  variant,
  icon,
  label,
  color,
  shape,
  pulse,
  hoverPop,
  tooltip,
  className,
}: BadgeBodyProps) {
  const badgeSkin = useAppearanceStore((s) => s.badgeSkin);

  if (badgeSkin === 'cube') {
    return (
      <span className={`inline-flex items-center gap-1 ${className}`.trim()} title={tooltip}>
        <CubeFaces
          size={16}
          faces={{
            front: {
              color: BADGE_COLOR_HEX[color],
              content: icon ? <Icon name={icon} size={9} color="#fff" /> : undefined,
            },
          }}
        />
        {label && (
          <span className="whitespace-nowrap text-[10px] font-medium text-white drop-shadow-sm">
            {label}
          </span>
        )}
      </span>
    );
  }

  // ── Flat skin (canonical 2D pill) ──
  // Icon-only badges use custom circular styling.
  if (variant === 'icon' && !label) {
    return (
      <div
        className={`
          inline-flex items-center justify-center
          cq-btn-md
          ${ICON_COLOR_CLASSES[color]}
          ${SHAPE_CLASSES[shape]}
          ${pulse ? 'animate-pulse-badge' : ''}
          ${hoverPop}
          shadow-md
          ${className}
        `.trim()}
        title={tooltip}
      >
        {icon && <Icon name={icon} />}
      </div>
    );
  }

  // Text and icon-text badges use the shared Badge component.
  return (
    <Badge
      color={color}
      title={tooltip}
      className={`
        cq-badge inline-flex items-center gap-1
        ${pulse ? 'animate-pulse-badge' : ''}
        ${hoverPop}
        shadow-sm
        ${className}
      `.trim()}
    >
      {(variant === 'icon' || variant === 'icon-text') && icon && <Icon name={icon} />}
      {label && <span className="whitespace-nowrap">{label}</span>}
    </Badge>
  );
}

/**
 * Creates a badge widget from configuration
 */
export function createBadgeWidget(config: BadgeWidgetConfig): OverlayWidget {
  const {
    id,
    position,
    visibility = DEFAULT_VISIBILITY,
    variant,
    icon,
    labelBinding,
    color = 'gray',
    shape = 'rounded',
    pulse = false,
    hoverPop: hoverPopOpt = false,
    visibleWhen,
    tooltip,
    onClick,
    className = '',
    priority,
    stackGroup,
  } = config;

  const isInteractive = Boolean(onClick);
  // The wiggle is automatic for interactive badges; passive badges opt in.
  const hoverPop =
    isInteractive ? 'hover:animate-hover-pop cursor-pointer' : hoverPopOpt ? 'hover:animate-hover-pop' : '';

  return {
    id,
    type: 'badge',
    position,
    visibility,
    priority,
    stackGroup,
    interactive: isInteractive,
    ariaLabel: tooltip,
    onClick,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    render: (data, context) => {
      if (visibleWhen && !visibleWhen(data)) return null;
      const resolvedLabel = resolveDataBinding(labelBinding, data);
      return (
        <BadgeBody
          variant={variant}
          icon={icon}
          label={resolvedLabel}
          color={color}
          shape={shape}
          pulse={pulse}
          hoverPop={hoverPop}
          tooltip={tooltip}
          className={className}
        />
      );
    },
  };
}

// ---------------------------------------------------------------------------
// Expandable / aggregate badge — reusable hover-expand primitive
// ---------------------------------------------------------------------------

/** One entry inside an expandable badge's cluster. */
export interface ExpandableBadgeItem {
  /** Stable key. */
  id: string;
  /** Icon name (@lib/icons) for this item's glyph. */
  icon: string;
  /** One-line label shown in the hover-expand list (and as the chip tooltip when there is exactly one item). */
  label: string;
  /** Optional Tailwind ring class accenting the glyph (e.g. a severity/category color). */
  ringClass?: string;
  /**
   * Optional 0..1 gauge value. When set, the glyph draws a partial arc (a
   * progress ring) of this sweep length instead of the solid {@link ringClass}
   * ring — e.g. a broken-video score where a fuller arc = higher score.
   */
  score?: number;
  /** CSS stroke color for the {@link score} arc (defaults to amber). */
  scoreColor?: string;
}

export interface ExpandableBadgeConfig<TData = any> {
  /** Widget ID */
  id: string;
  /** Position */
  position: WidgetPosition;
  /** Visibility configuration (defaults to { trigger: 'always', transition: 'none' }) */
  visibility?: VisibilityConfig;
  /** Priority for layering */
  priority?: number;
  /** Stack group for auto-stacking with other widgets */
  stackGroup?: string;
  /** Extra classes on the collapsed chip. */
  className?: string;
  /**
   * Resolve the cluster items from overlay data. Items must already be in
   * priority order — `items[0]` is the lead glyph shown on the collapsed chip.
   * Return `[]` to render nothing.
   */
  items: (data: TData) => ExpandableBadgeItem[];
  /** Hover-expand panel placement (defaults: top / start / 6px gap). */
  expand?: { placement?: AnchorPlacement; align?: AnchorAlign; offset?: number };
  /**
   * Switch from hover-portal to CLICK-to-expand: the chip toggles a per-surface
   * expanded state and reveals each item's glyph inline (no portal). Mirrors the
   * active-target set badges. Resolve the surface id from the widget context
   * (e.g. `(ctx) => ctx.customState?.surfaceKey`); falls back to `'default'`.
   */
  clickExpand?: boolean;
  /** With {@link clickExpand}, stack the revealed glyphs upward (for bottom-anchored
   *  clusters so they grow away from the card edge). */
  growUp?: boolean;
  /** Resolve the per-surface key for {@link clickExpand} from the render context. */
  surfaceKey?: (context: WidgetContext) => string;
}

function BadgeGlyph({
  item,
  size = 4,
  title,
}: {
  item: ExpandableBadgeItem;
  size?: 4 | 5 | 6;
  title?: string;
}) {
  const dim = size === 6 ? 'w-6 h-6' : size === 5 ? 'w-5 h-5' : 'w-4 h-4';
  const px = size === 6 ? 24 : size === 5 ? 20 : 16;
  const iconSize = size === 6 ? 13 : size === 5 ? 11 : 9;
  const tip = title ?? item.label;
  // Score gauge: a partial arc whose sweep length encodes a 0..1 value, drawn
  // in place of the solid ring. Used for graded signals (e.g. broken-video
  // score) so the level reads at a glance rather than just present/absent.
  const hasScore = typeof item.score === 'number';
  const fraction = hasScore ? Math.max(0, Math.min(1, item.score as number)) : 0;
  const stroke = 2;
  const r = (px - stroke) / 2;
  const circ = 2 * Math.PI * r;

  return (
    <span
      className={`relative inline-flex items-center justify-center ${dim} rounded-full bg-neutral-900/80 ${
        hasScore ? '' : `ring-2 ${item.ringClass ?? 'ring-white/40'}`
      }`}
      title={tip}
      aria-label={tip}
    >
      {hasScore && (
        <svg
          className="absolute inset-0 -rotate-90"
          width={px}
          height={px}
          viewBox={`0 0 ${px} ${px}`}
          fill="none"
        >
          {/* track */}
          <circle cx={px / 2} cy={px / 2} r={r} stroke="rgba(255,255,255,0.18)" strokeWidth={stroke} />
          {/* gauge arc */}
          <circle
            cx={px / 2}
            cy={px / 2}
            r={r}
            stroke={item.scoreColor ?? '#fb923c'}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circ}
            strokeDashoffset={circ * (1 - fraction)}
          />
        </svg>
      )}
      <Icon name={item.icon} size={iconSize} className="text-white" color="#fff" />
    </span>
  );
}

/**
 * Collapsed aggregate chip (lead glyph + count when >1) that wiggles on hover
 * like other canonical badges, and hover-expands a portal listing every item.
 * "Always combined" — there is no inline ≤N special case.
 */
/** Glyph size for the click-expand cluster — a touch larger than the hover-chip
 *  default so the score-arc gauge and icons stay legible. */
const GLYPH_SIZE = 6 as const;

/** Click-to-expand cluster: chip toggles a per-surface state, revealing each
 *  glyph inline (optionally growing upward). Used by bottom-anchored clusters
 *  that want the same expand/retract affordance as the active-target set row. */
function ClickExpandBadge({
  items,
  className,
  surfaceKey,
  growUp,
}: {
  items: ExpandableBadgeItem[];
  className?: string;
  surfaceKey: string;
  growUp?: boolean;
}) {
  const expanded = useBadgeClusterExpansionStore(
    (s) => s.expandedBySurface[surfaceKey] ?? false,
  );

  if (items.length === 0) return null;
  const lead = items[0];

  // A single indicator can't be expanded any further — show its glyph directly.
  if (items.length === 1) {
    return <BadgeGlyph item={lead} size={GLYPH_SIZE} title={lead.label} />;
  }

  // Collapsed (and the toggle when expanded) is a count-in-circle — just the
  // number inside a round badge, sized to match the glyphs — rather than the
  // lead glyph + a number beside it (which read as an icon + loose digit).
  const countCircle = (
    <button
      type="button"
      // Keep focus on the body — focusing a portaled overlay button scrolls the
      // page (see overlay-button-focus-scroll canon).
      onMouseDown={(e) => e.preventDefault()}
      onClick={(e) => {
        e.stopPropagation();
        useBadgeClusterExpansionStore.getState().toggle(surfaceKey);
      }}
      className={`inline-flex items-center justify-center w-6 h-6 rounded-full bg-black/70 backdrop-blur-sm shadow-sm cursor-pointer hover:animate-hover-pop ring-2 ${
        expanded ? 'ring-white/70' : 'ring-white/30'
      } ${className ?? ''}`.trim()}
      title={expanded ? 'Click to collapse' : `${items.length} indicators — click to expand`}
      aria-label={`${items.length} indicators`}
      aria-expanded={expanded}
    >
      <span className="text-[11px] font-bold text-white leading-none">{items.length}</span>
    </button>
  );

  return (
    <div
      className={`inline-flex ${growUp ? 'flex-col-reverse' : 'flex-col'} items-start`}
      // Match the canonical stack spacing (the same `compact` norm the active-target
      // set glyphs get from SPACING_VALUES) instead of a hand-picked gap, so the
      // two cluster affordances stay visually consistent. When expanded, sit the
      // group in a grey backing pill — the same grouping cue the stack pillGroup
      // draws — so the revealed glyphs read as one connected cluster.
      style={{
        gap: SPACING_VALUES.compact,
        ...(expanded
          ? {
              padding: 3,
              borderRadius: 13,
              background: 'rgba(23,23,23,0.5)',
              backdropFilter: 'blur(2px)',
              // Double hairline (light inset + dark outer) so the pill edge reads
              // on any background — matches the stack pillGroup backing.
              boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.22), 0 0 0 1px rgba(0,0,0,0.28)',
              // Cancel the padding on the anchored (left) edge so the count
              // circle keeps its position when the pill appears on expand.
              marginLeft: -3,
            }
          : null),
      }}
    >
      {countCircle}
      {expanded && items.map((it) => <BadgeGlyph key={it.id} item={it} size={GLYPH_SIZE} title={it.label} />)}
    </div>
  );
}

function ExpandableBadge({
  items,
  expand,
  className,
  clickExpand = false,
  growUp = false,
  surfaceKey,
}: {
  items: ExpandableBadgeItem[];
  expand?: ExpandableBadgeConfig['expand'];
  className?: string;
  clickExpand?: boolean;
  growUp?: boolean;
  surfaceKey?: string;
}) {
  const { isExpanded, handlers } = useHoverExpand({ expandDelay: 120, collapseDelay: 200 });
  const triggerRef = useRef<HTMLDivElement>(null);

  if (clickExpand) {
    return (
      <ClickExpandBadge
        items={items}
        className={className}
        surfaceKey={surfaceKey ?? 'default'}
        growUp={growUp}
      />
    );
  }

  if (items.length === 0) return null;
  const lead = items[0];
  const tip =
    items.length === 1 ? lead.label : `${items.length} indicators — hover for details`;

  return (
    <>
      <div
        ref={triggerRef}
        {...handlers}
        className={`cq-badge inline-flex items-center gap-0.5 rounded-full bg-black/60 backdrop-blur-sm shadow-sm pl-1 pr-1.5 py-0.5 cursor-default hover:animate-hover-pop ${className ?? ''}`.trim()}
      >
        <BadgeGlyph item={lead} size={4} title={tip} />
        {items.length > 1 && (
          <span className="text-[10px] font-semibold text-white leading-none">{items.length}</span>
        )}
      </div>
      {isExpanded && (
        <PortalFloat
          anchor={triggerRef.current}
          placement={expand?.placement ?? 'top'}
          align={expand?.align ?? 'start'}
          offset={expand?.offset ?? 6}
          onMouseEnter={handlers.onMouseEnter}
          onMouseLeave={handlers.onMouseLeave}
        >
          <div className="min-w-[180px] max-w-[260px] rounded-lg bg-neutral-900/95 backdrop-blur-sm shadow-xl py-1 ring-1 ring-white/10">
            {items.map((it) => (
              <div key={it.id} className="flex items-start gap-2 px-2 py-1">
                <BadgeGlyph item={it} size={5} />
                <span className="text-[11px] leading-snug text-white/90">{it.label}</span>
              </div>
            ))}
          </div>
        </PortalFloat>
      )}
    </>
  );
}

/**
 * Creates a canonical expandable/aggregate badge widget. Renders a single
 * collapsed chip (lead glyph + count) and hover-expands a list of its items.
 * Reusable by any surface that needs to cluster per-target signals into one
 * badge (e.g. the media-card indicator cluster: warnings + recovered).
 */
export function createExpandableBadge<TData = any>(
  config: ExpandableBadgeConfig<TData>,
): OverlayWidget<TData> {
  const {
    id,
    position,
    visibility = DEFAULT_VISIBILITY,
    priority,
    stackGroup,
    className,
    items,
    expand,
    clickExpand,
    growUp,
    surfaceKey,
  } = config;

  return {
    id,
    type: 'badge',
    position,
    visibility,
    priority,
    stackGroup,
    interactive: true,
    // The chip manages its own hover-expand + portal; the overlay wrapper must
    // not also apply button role / keyboard handlers.
    handlesOwnInteraction: true,
    render: (data: TData, context: WidgetContext) => (
      <ExpandableBadge
        items={items(data)}
        expand={expand}
        className={className}
        clickExpand={clickExpand}
        growUp={growUp}
        surfaceKey={clickExpand ? (surfaceKey ? surfaceKey(context) : 'default') : undefined}
      />
    ),
  };
}

/**
 * Common badge presets
 */
export const BadgePresets = {
  /**
   * Media type badge (video, image, audio, etc.)
   */
  mediaType: (
    id: string,
    mediaTypeIcon: string,
    position: WidgetPosition = { anchor: 'top-left', offset: { x: 8, y: 8 } },
  ): OverlayWidget =>
    createBadgeWidget({
      id,
      position,
      variant: 'icon',
      icon: mediaTypeIcon,
      color: 'blue',
      shape: 'circle',
      tooltip: 'Media type',
    }),

  /**
   * Status badge with color
   */
  status: (
    id: string,
    status: 'ok' | 'warning' | 'error',
    position: WidgetPosition = { anchor: 'top-right', offset: { x: -8, y: 8 } },
  ): OverlayWidget => {
    const statusConfig = {
      ok: { icon: 'check', color: 'green' as const, label: 'OK' },
      warning: { icon: 'alertCircle', color: 'yellow' as const, label: 'Warning' },
      error: { icon: 'x', color: 'red' as const, label: 'Error' },
    };

    const config = statusConfig[status];

    return createBadgeWidget({
      id,
      position,
      variant: 'icon',
      icon: config.icon,
      color: config.color,
      shape: 'circle',
      tooltip: config.label,
    });
  },

  /**
   * Count badge (e.g., number of items)
   */
  count: (
    id: string,
    count: number | ((data: any) => number),
    position: WidgetPosition = { anchor: 'top-right', offset: { x: -4, y: -4 } },
  ): OverlayWidget =>
    createBadgeWidget({
      id,
      position,
      variant: 'text',
      labelBinding: {
        kind: 'fn',
        target: 'label',
        fn: (data) => {
          const value = typeof count === 'function' ? count(data) : count;
          return value > 99 ? '99+' : String(value);
        },
      },
      color: 'red',
      shape: 'rounded',
      className: 'cq-badge-xs min-w-[1.25rem]',
    }),
};
