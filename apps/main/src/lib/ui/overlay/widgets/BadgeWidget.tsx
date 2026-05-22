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

import type { DataBinding } from '@lib/editing-core';
import { resolveDataBinding } from '@lib/editing-core';
import { Icon } from '@lib/icons';

import type { OverlayWidget, WidgetPosition, VisibilityConfig } from '../types';

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

      // Icon-only badges use custom circular styling
      if (variant === 'icon' && !resolvedLabel) {
        const shapeClasses = {
          circle: 'rounded-full',
          square: 'rounded-none',
          rounded: 'rounded',
        };

        // Color map for icon badges (darker, more prominent)
        const iconColorClasses = {
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

        return (
          <div
            className={`
              inline-flex items-center justify-center
              cq-btn-md
              ${iconColorClasses[color]}
              ${shapeClasses[shape]}
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

      // Text and icon-text badges use shared Badge component
      return (
        <Badge
          color={color}
          className={`
            cq-badge inline-flex items-center gap-1
            ${pulse ? 'animate-pulse-badge' : ''}
            ${hoverPop}
            shadow-sm
            ${className}
          `.trim()}
        >
          {(variant === 'icon' || variant === 'icon-text') && icon && (
            <Icon name={icon} />
          )}
          {resolvedLabel && (
            <span className="whitespace-nowrap">{resolvedLabel}</span>
          )}
        </Badge>
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
}

function BadgeGlyph({
  item,
  size = 4,
  title,
}: {
  item: ExpandableBadgeItem;
  size?: 4 | 5;
  title?: string;
}) {
  const dim = size === 5 ? 'w-5 h-5' : 'w-4 h-4';
  const iconSize = size === 5 ? 11 : 9;
  const tip = title ?? item.label;
  return (
    <span
      className={`inline-flex items-center justify-center ${dim} rounded-full bg-neutral-900/80 ring-2 ${item.ringClass ?? 'ring-white/40'}`}
      title={tip}
      aria-label={tip}
    >
      <Icon name={item.icon} size={iconSize} className="text-white" color="#fff" />
    </span>
  );
}

/**
 * Collapsed aggregate chip (lead glyph + count when >1) that wiggles on hover
 * like other canonical badges, and hover-expands a portal listing every item.
 * "Always combined" — there is no inline ≤N special case.
 */
function ExpandableBadge({
  items,
  expand,
  className,
}: {
  items: ExpandableBadgeItem[];
  expand?: ExpandableBadgeConfig['expand'];
  className?: string;
}) {
  const { isExpanded, handlers } = useHoverExpand({ expandDelay: 120, collapseDelay: 200 });
  const triggerRef = useRef<HTMLDivElement>(null);

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
    render: (data: TData) => (
      <ExpandableBadge items={items(data)} expand={expand} className={className} />
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
