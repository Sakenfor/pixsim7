/* eslint-disable react-refresh/only-export-components */
/**
 * MediaCard Widget Factory
 *
 * Factory functions to create default widgets for MediaCard.
 * These can be used directly, extended, or completely replaced via overlay config.
 */

import { useHoverExpand, PortalFloat } from '@pixsim7/shared.ui';
import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';

import { createBindingFromValue } from '@lib/editing-core';
import type { ModelFamilyInfo } from '@lib/generation-ui';
import { Icon } from '@lib/icons';
import type { OverlayWidget } from '@lib/ui/overlay';
import {
  createBadgeWidget,
  createExpandableBadge,
  BADGE_SLOT,
  BADGE_PRIORITY,
  createVideoScrubWidget,
} from '@lib/ui/overlay';
import {
  getOverlayWidgetSettings,
  type VideoScrubWidgetSettings,
} from '@lib/widgets';

import { assetEvents } from '@features/assets/lib/assetEvents';
import type { AssetWarning } from '@features/assets/lib/assetWarnings';
import { assertBackendAssetId } from '@features/assets/lib/backendAssetId';
import { FAVORITE_TAG_SLUG, setFavoriteTag } from '@features/assets/lib/favoriteTag';
import { applyQuickTag, normalizeTagInput } from '@features/assets/lib/quickTag';
import { useQuickTagStore } from '@features/assets/lib/quickTagStore';
import { getTagSourceMeta } from '@features/assets/lib/tagSource';
import { useTagAutocomplete, TAG_NAMESPACES } from '@features/assets/lib/useTagAutocomplete';
import { PROVIDER_BRANDS } from '@features/generation/components/generationSettingsPanel/constants';
import { providerCapabilityRegistry, useModelBadgeStore } from '@features/providers';

import { MEDIA_TYPE_ICON, MEDIA_STATUS_ICON } from './mediaBadgeConfig';
import type { MediaCardResolvedProps } from './MediaCard';
import {
  createQueueStatusWidget,
  createSelectionStatusWidget,
} from './mediaCardBadges';
import {
  createGenerationButtonGroup,
  createGenerationActionModeBadge,
} from './mediaCardGeneration';
import { buildMediaCardRuntimeWidgets } from './mediaCardRuntimeWidgetBuilder';
import { createSimilarityBadge } from './similarityBadge';
import { useVideoMarksStore } from './videoMarksStore';


// Re-export from split files for backwards compatibility
export {
  createQueueStatusWidget,
  createSelectionStatusWidget,
} from './mediaCardBadges';

export {
  createGenerationButtonGroup,
  createGenerationStatusWidget,
  GenerationButtonGroupContent,
} from './mediaCardGeneration';
export {
  getSmartActionLabel,
  resolveMaxSlotsFromSpecs,
  resolveMaxSlotsForModel,
  SlotPickerContent,
  SlotPickerGrid,
  type SlotPickerContentProps,
} from './SlotPicker';

export interface MediaCardOverlayData {
  id: number;
  mediaType: MediaCardResolvedProps['mediaType'];
  providerId: string;
  status?: MediaCardResolvedProps['providerStatus'];
  tags: string[];
  /** Tags with provenance, for the info popover. Parallel to `tags` (which
      stays a bare slug list for badges/quick-tag). */
  tagSummaries?: { slug: string; displayName?: string | null; source?: string | null }[];
  description?: string;
  createdAt: string;
  uploadState: MediaCardResolvedProps['uploadState'] | 'idle';
  uploadProgress: number;
  remoteUrl: string;
  /** Processed video source URL (same as main video element, handles auth) */
  videoSrc?: string;
  durationSec?: number;
  actions?: MediaCardResolvedProps['actions'];
  // Generation status
  generationStatus?: MediaCardResolvedProps['generationStatus'];
  generationId?: number;
  generationError?: string;
  /** ID of the generation that created this asset (for regenerate) */
  sourceGenerationId?: number;
  /** True when asset has generation context (from record or metadata) */
  hasGenerationContext?: boolean;
  // Favorite state
  isFavorite?: boolean;
  onToggleFavorite?: () => void;
  /** True when the asset is archived — drives the top-left archive badge so
   *  archived cards are tellable at a glance when "show archived" is on. */
  isArchived?: boolean;
  // Info popover fields
  prompt?: string | null;
  operationType?: string | null;
  /** Present when asset was produced via the "artificial extend" flow
   *  (extract a frame → image-to-video). Carries back-links and the
   *  frame selector used (last / first / timestamp). */
  artificialExtend?: {
    source_video_id?: number;
    source_frame_asset_id?: number;
    method?: string;
    frame?: {
      mode?: 'last' | 'first' | 'timestamp';
      timestamp_sec?: number;
    };
  } | null;
  model?: string | null;
  width?: number;
  height?: number;
  // Upload to specific provider (right-click menu)
  onUploadToProvider?: (providerId: string) => void | Promise<void>;
  /** Map of provider_id -> uploaded asset ID for cross-provider presence badges */
  providerUploads?: Record<string, string> | null;
  /** Per-provider upload status for error indicators */
  lastUploadStatusByProvider?: Record<string, 'success' | 'error'> | null;
  // Versioning
  /** Version number within a version family (null = standalone) */
  versionNumber?: number | null;
  // NOTE: cohort/sibling counts are no longer carried on the overlay data — the
  // similarity badge reads them from the transient `siblingCountsStore` (lazy
  // hover fetch). See plan media-card-sibling-badges.
  onFilterByTagShortcut?: (tagSlug: string) => void;
  // Picker (CompactAssetCard merger) — read by createVideoScrubber per render.
  lockedTimestamp?: number;
  onLockTimestamp?: (timestamp: number | undefined) => void;
  /** Fallback for hold-on-dot when actions.onExtractFrame is absent. */
  onHoldUploadFrame?: (timestamp: number) => void | Promise<void>;
  /** Per-asset warnings rendered as a clustered pill at bottom-left. */
  warnings?: AssetWarning[];
}

interface PrimaryIconWidgetProps {
  /** Tooltip string; small native title shown on hover. */
  tooltip: string;
  /** Tailwind ring/background classes. */
  badgeClassName: string;
  /** Whether clicking the icon should open the InfoPopoverContent. */
  popoverEnabled: boolean;
}

/**
 * Click-to-open primary icon. Hovers show the small native title;
 * clicks toggle the rich Info/Tags popover. Folds the legacy bottom-left
 * "i" widget into the same trigger so the top-left media icon is the
 * single info entry point on every surface.
 */
function PrimaryIconContent({
  data,
  widgetProps,
}: {
  data: MediaCardOverlayData;
  widgetProps: PrimaryIconWidgetProps;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const { tooltip, badgeClassName, popoverEnabled } = widgetProps;

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (
        popoverRef.current && !popoverRef.current.contains(e.target as Node) &&
        triggerRef.current && !triggerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setIsOpen(false); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen]);

  const iconName = MEDIA_TYPE_ICON[data.mediaType];

  // When popover is disabled (e.g. minimal preset's skipTagsTooltip), render
  // a non-interactive div so the icon stays decoration-only and click events
  // pass through to the underlying card.
  if (!popoverEnabled) {
    return (
      <div
        className={`cq-btn-md inline-flex items-center justify-center rounded-full shadow-sm ${badgeClassName}`}
        title={tooltip}
      >
        <Icon name={iconName} size={12} className="text-neutral-700 dark:text-neutral-300" />
      </div>
    );
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen((v) => !v);
        }}
        className={`cq-btn-md inline-flex items-center justify-center rounded-full shadow-sm cursor-pointer hover:animate-hover-pop ${badgeClassName}`}
        title={tooltip}
      >
        <Icon name={iconName} size={12} className="text-neutral-700 dark:text-neutral-300" />
      </button>
      {isOpen && (
        <PortalFloat
          anchor={triggerRef.current}
          placement="bottom"
          align="start"
          offset={4}
          className="z-popover"
        >
          <div
            ref={popoverRef}
            className="min-w-[220px] max-w-[300px] bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg shadow-lg p-3"
            onClick={(e) => e.stopPropagation()}
          >
            <InfoPopoverContent data={data} />
          </div>
        </PortalFloat>
      )}
    </>
  );
}

/**
 * Create primary media type icon widget (top-left).
 *
 * Click opens the Info/Tags popover (formerly the bottom-left "i" button).
 * The status ring + media-type icon visual is unchanged; we just upgrade
 * the trigger from a static badge to a click-to-open custom widget so the
 * gallery and viewer can share one info entry point.
 */
export function createPrimaryIconWidget(props: MediaCardResolvedProps): OverlayWidget<MediaCardOverlayData> {
  const { mediaType, providerStatus, hashStatus, badgeConfig, uploadState, contextMenuAsset, presetCapabilities } = props;

  // Map providerStatus ("ok", "local_only", etc.) to the internal
  // MediaStatusBadge keys used by MEDIA_STATUS_ICON.
  const statusKey = providerStatus === 'ok' ? 'provider_ok' : providerStatus;
  const statusMeta = statusKey ? MEDIA_STATUS_ICON[statusKey as keyof typeof MEDIA_STATUS_ICON] : null;

  // Determine effective status: uploadState='success' means "in library"
  // even when providerStatus hasn't been hydrated yet (local folder cards).
  const effectiveHasStatus = !!(providerStatus && statusMeta) || uploadState === 'success';
  const effectiveRingColor = providerStatus && statusMeta
    ? (statusMeta.color === 'green' ? 'ring-accent' :
       statusMeta.color === 'yellow' ? 'ring-amber-500' :
       statusMeta.color === 'red' ? 'ring-red-500' :
       'ring-neutral-400')
    : uploadState === 'success'
      ? 'ring-accent'  // green ring for "in library"
      : 'ring-neutral-400';

  // Media-origin indicator: top-left ring is reserved for media-level signals
  // (mirrors top-right ring = provider signal). Artificial extend (i2v from
  // extracted frame) takes precedence so the marker persists regardless of
  // provider upload state.
  const artificialExtend = contextMenuAsset?.artificialExtend ?? null;

  // Ring priority: artificial-extend media marker > provider/upload status > hash duplicate
  let ringColor: string;
  let hasRing = false;
  let tooltip = `${mediaType} media`;

  if (artificialExtend) {
    hasRing = true;
    ringColor = 'ring-fuchsia-500';  // distinct from provider (accent/amber/red) so the two concepts read separately
    const frameMode = artificialExtend.frame?.mode;
    const frameLabel =
      frameMode === 'first'
        ? 'first frame'
        : frameMode === 'timestamp' && typeof artificialExtend.frame?.timestamp_sec === 'number'
          ? `frame @ ${artificialExtend.frame.timestamp_sec.toFixed(2)}s`
          : 'last frame';
    const srcId = artificialExtend.source_video_id;
    tooltip = srcId
      ? `${mediaType} — artificial extend (i2v from ${frameLabel} of #${srcId})`
      : `${mediaType} — artificial extend (i2v from ${frameLabel})`;
  } else if (
    badgeConfig?.showStatusIcon &&
    effectiveHasStatus &&
    providerStatus !== 'flagged' &&
    providerStatus !== 'local_only'
  ) {
    // 'flagged' AND 'local_only' are intentionally dropped from the ring — the
    // bottom-left warnings cluster (getAssetWarnings) is now the single carrier
    // for status/error signals, so we don't stack a second marker on the same
    // card and the top corners stay free for higher-signal markers. Mirrors the
    // carve-out on the top-right status badge (ProviderStatusContent). The
    // remaining provider_ok / in-library ring still draws.
    hasRing = true;
    ringColor = effectiveRingColor;
  } else if (hashStatus === 'duplicate') {
    hasRing = true;
    ringColor = 'ring-amber-500';
    tooltip = `${mediaType} - duplicate`;
  } else {
    ringColor = 'ring-neutral-400';
  }

  const badgeClassName = hasRing
    ? `!bg-white dark:!bg-neutral-800 ring-2 ${ringColor} ring-offset-1`
    : '!bg-white/95 dark:!bg-neutral-800/95 backdrop-blur-sm';

  // Popover is suppressed when:
  //  - the preset opts out (skipTagsTooltip — minimalist surfaces)
  //  - the surface explicitly hides tags overlay (showTagsInOverlay=false)
  // In both cases the icon stays decoration-only.
  const popoverEnabled =
    !presetCapabilities?.skipTagsTooltip &&
    badgeConfig?.showTagsInOverlay !== false;

  const widgetProps: PrimaryIconWidgetProps = {
    tooltip,
    badgeClassName,
    popoverEnabled,
  };

  return {
    id: 'primary-icon',
    type: 'custom' as const,
    position: { anchor: 'top-left', offset: { x: 8, y: 8 } },
    stackGroup: 'badges-tl',
    visibility: { trigger: 'always' },
    priority: BADGE_PRIORITY.info,
    interactive: popoverEnabled,
    handlesOwnInteraction: popoverEnabled,
    render: (data: MediaCardOverlayData) => (
      <PrimaryIconContent data={data} widgetProps={widgetProps} />
    ),
  };
}

/** Abbreviate a provider ID to 2 chars for badge display */
function abbreviateProvider(id: string): string {
  const clean = id.replace(/[^a-zA-Z]/g, '');
  if (clean.length === 0) return '??';
  return clean.charAt(0).toUpperCase() + (clean.charAt(1) || '').toLowerCase();
}

/** Resolve provider brand with fallback */
function getProviderBrand(providerId: string): { color: string; short: string } {
  return PROVIDER_BRANDS[providerId] ?? { color: '#6B7280', short: abbreviateProvider(providerId) };
}

/** Compact operation abbreviation for badge display */
const OPERATION_SHORT: Record<string, string> = {
  text_to_image: 't2i',
  text_to_video: 't2v',
  image_to_video: 'i2v',
  image_to_image: 'i2i',
  video_extend: 'ext',
  video_transition: 'trn',
  video_modify: 'mod',
  fusion: 'fus',
};

interface ProviderStatusWidgetProps {
  id: number;
  providerId: string;
  mediaType: MediaCardResolvedProps['mediaType'];
  actions?: MediaCardResolvedProps['actions'];
}

/** Simple menu item button for the status dropdown */
function StatusMenuItem({ icon, label, onClick, variant }: {
  icon: string; label: string; onClick: () => void; variant?: 'danger';
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full px-3 py-2 flex items-center gap-2 text-sm text-left cursor-pointer transition-colors ${
        variant === 'danger'
          ? 'text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20'
          : 'hover:bg-neutral-100 dark:hover:bg-neutral-700'
      }`}
    >
      <Icon name={icon} size={14} className={variant === 'danger' ? '' : 'text-neutral-500 dark:text-neutral-400'} />
      <span className="flex-1">{label}</span>
    </button>
  );
}

/** Lighten a hex color by mixing toward white */
function lightenHex(hex: string, amount: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return '#' + [r, g, b]
    .map(c => Math.min(255, Math.round(c + (255 - c) * amount)).toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Provider badge wrapper — always shows a two-tone ring (provider border
 * + inner fill) plus upload error pip.
 *
 * @param providerColor  Outer ring / border color (provider brand)
 * @param innerColor     Optional inner fill color (model family). When omitted
 *                       or same as providerColor, a lightened variant is derived
 *                       so the ring stays visible.
 */
function ProviderBadge({ providerId, providerColor, innerColor, uploadStatus, children }: {
  providerId: string;
  providerColor: string;
  innerColor?: string;
  uploadStatus?: Record<string, 'success' | 'error'> | null;
  children: (style: React.CSSProperties) => React.ReactNode;
}) {
  const failed = uploadStatus?.[providerId] === 'error';

  // When inner matches outer (or absent), lighten the fill so the ring is always visible
  const effectiveInner = (innerColor && innerColor !== providerColor)
    ? innerColor
    : lightenHex(providerColor, 0.3);

  const style: React.CSSProperties = {
    backgroundColor: effectiveInner,
    borderColor: failed ? '#ef4444' : providerColor,
    borderWidth: '3px',
    borderStyle: 'solid',
  };

  return (
    <div className={`relative cursor-pointer hover:animate-hover-pop${failed ? ' ring-2 ring-red-500/60 ring-offset-1 rounded-full' : ''}`}>
      {children(style)}
      {failed && (
        <span
          className="absolute -bottom-0.5 -right-0.5 w-[10px] h-[10px] rounded-full bg-red-500 border border-white dark:border-neutral-900 flex items-center justify-center pointer-events-none"
          title="Upload failed"
        >
          <span className="text-[6px] font-bold text-white leading-none">!</span>
        </span>
      )}
    </div>
  );
}

/**
 * Self-contained provider status badge component.
 * Shows origin provider color + model abbreviation, with additional
 * provider presence dots stacked to the left. Click opens info/action menu.
 */
function ProviderStatusContent({ data, widgetProps }: {
  data: MediaCardOverlayData;
  widgetProps: ProviderStatusWidgetProps;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const showModelOnBadge = useModelBadgeStore((s) => s.showOnMediaCards);
  const colorOverrides = useModelBadgeStore((s) => s.colors);

  // Provider brand
  const brand = getProviderBrand(data.providerId);

  // Model family abbreviation
  const modelFamily = data.model && data.providerId
    ? resolveModelFamily(data.model, data.providerId)
    : null;

  const displayText = (showModelOnBadge && modelFamily?.short) || brand.short;
  const providerColor = brand.color;
  // Inner fill: model color when available, else falls back to provider color
  const modelColor = (showModelOnBadge && data.model && modelFamily)
    ? (colorOverrides[data.model] ?? modelFamily.color)
    : undefined;
  const textColor = (showModelOnBadge && modelFamily?.textColor) || '#fff';

  // Status ring overlay is gone: both 'flagged' and 'local_only' now live solely
  // in the bottom-left warnings cluster (getAssetWarnings), so the top-right
  // badge no longer carries a status ring. Kept as '' so the badge chrome below
  // is unchanged.
  const effectiveStatus = data.status || 'unknown';
  const statusRing = '';

  // Additional providers from cross-provider uploads AND failed upload attempts
  const additionalProviders = useMemo(() => {
    const seen = new Set<string>();
    // Successful cross-provider uploads
    if (data.providerUploads) {
      for (const p of Object.keys(data.providerUploads)) {
        if (p !== data.providerId && !p.includes('_')) seen.add(p);
      }
    }
    // Failed uploads that don't yet have a providerUploads entry
    if (data.lastUploadStatusByProvider) {
      for (const p of Object.keys(data.lastUploadStatusByProvider)) {
        if (p !== data.providerId && !p.includes('_') && data.lastUploadStatusByProvider[p] === 'error') {
          seen.add(p);
        }
      }
    }
    return [...seen];
  }, [data.providerUploads, data.lastUploadStatusByProvider, data.providerId]);

  const { actions, id: assetId, providerId, mediaType } = widgetProps;
  const hasActions = !!(actions && (
    actions.onOpenDetails || actions.onDelete || actions.onArchive ||
    actions.onReupload || actions.onExtractLastFrameAndUpload || actions.onEnrichMetadata
  ));

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (hasActions) setIsOpen(v => !v);
  };

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (
        menuRef.current && !menuRef.current.contains(e.target as Node) &&
        triggerRef.current && !triggerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setIsOpen(false); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen]);

  const closeMenu = () => setIsOpen(false);

  const titleParts = [data.providerId];
  if (data.model) titleParts.push(data.model);
  if (effectiveStatus === 'local_only') titleParts.push('local only');
  else if (effectiveStatus === 'flagged') titleParts.push('flagged');

  const opShort = data.operationType ? OPERATION_SHORT[data.operationType] ?? data.operationType : null;

  return (
    <div className="flex flex-col items-end gap-0.5">
      <div className="flex items-center gap-1">
        {/* Additional provider presence dots (stack to the left) */}
        {additionalProviders.map(p => {
          const pBrand = getProviderBrand(p);
          return (
            <ProviderBadge key={p} providerId={p} providerColor={pBrand.color} uploadStatus={data.lastUploadStatusByProvider}>
              {(badgeStyle) => (
                <div
                  className="w-[18px] h-[18px] rounded-full shadow-sm flex items-center justify-center"
                  style={{ ...badgeStyle, color: '#fff' }}
                  title={p}
                >
                  <span className="text-[7px] font-bold leading-none">{pBrand.short}</span>
                </div>
              )}
            </ProviderBadge>
          );
        })}

        {/* Main origin provider badge with model abbreviation */}
        <ProviderBadge providerId={data.providerId} providerColor={providerColor} innerColor={modelColor} uploadStatus={data.lastUploadStatusByProvider}>
          {(badgeStyle) => (
            <button
              ref={triggerRef}
              onClick={handleClick}
              className={`inline-flex items-center justify-center ${displayText.length > 2 ? 'min-w-[var(--cq-btn-md)] h-[var(--cq-btn-md)] px-[0.2em]' : 'cq-btn-md'} rounded-full shadow-md font-bold ${hasActions ? 'cursor-pointer' : 'cursor-default'} ${statusRing}`}
              style={{ ...badgeStyle, color: textColor }}
              title={titleParts.join(' · ')}
            >
              <span className={`${displayText.length > 2 ? 'text-[0.45em]' : 'text-[0.55em]'} leading-none whitespace-nowrap`}>{displayText}</span>
            </button>
          )}
        </ProviderBadge>
      </div>

      {/* Operation type label — only for non-obvious operations (extend, transition, etc.) */}
      {opShort && !['i2v', 't2v', 'i2i', 't2i'].includes(opShort) && (
        <span className="text-[8px] font-semibold leading-none px-1.5 py-0.5 rounded bg-black/40 text-white backdrop-blur-sm">
          {opShort}
        </span>
      )}

      {/* Menu dropdown */}
      {isOpen && hasActions && (
        <PortalFloat
          anchor={triggerRef.current}
          placement="bottom"
          align="end"
          offset={4}
          className="z-popover"
        >
          <div
            ref={menuRef}
            className="min-w-[220px] max-w-[300px] bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg shadow-lg py-1"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Info section */}
            <div className="px-3 py-2">
              <InfoPopoverContent data={data} />
            </div>
            <div className="my-1 h-px bg-neutral-200 dark:bg-neutral-700" />

            {actions!.onOpenDetails && (
              <StatusMenuItem icon="eye" label="View Details" onClick={() => { actions!.onOpenDetails!(assetId); closeMenu(); }} />
            )}
            {actions!.onReupload && (
              <StatusMenuItem icon="upload" label="Upload to provider…" onClick={async () => {
                closeMenu();
                try {
                  await actions!.onReupload!(providerId);
                } finally {
                  actions!.onReuploadDone?.();
                }
              }} />
            )}
            {actions!.onExtractLastFrameAndUpload && mediaType === 'video' && providerId?.startsWith('pixverse') && (
              <StatusMenuItem icon="image" label="Upload last frame to Pixverse" onClick={() => { actions!.onExtractLastFrameAndUpload!(assetId); closeMenu(); }} />
            )}
            {actions!.onEnrichMetadata && (
              <StatusMenuItem icon="refresh" label="Refresh metadata" onClick={() => { actions!.onEnrichMetadata!(assetId); closeMenu(); }} />
            )}
            {actions!.onArchive && (
              <StatusMenuItem icon="archive" label="Archive" onClick={() => { actions!.onArchive!(assetId); closeMenu(); }} />
            )}
            {actions!.onDelete && (
              <StatusMenuItem icon="trash" label="Delete" variant="danger" onClick={() => { actions!.onDelete!(assetId); closeMenu(); }} />
            )}
          </div>
        </PortalFloat>
      )}
    </div>
  );
}

/**
 * Create provider status badge widget (top-right)
 * Shows origin provider color + model abbreviation, with additional
 * provider presence dots. Click opens info/action menu.
 */
export function createStatusWidget(props: MediaCardResolvedProps): OverlayWidget<MediaCardOverlayData> | null {
  const { id, providerId, actions, presetCapabilities, mediaType } = props;

  // If preset provides its own status widget, skip the runtime one
  if (presetCapabilities?.providesStatusWidget) {
    return null;
  }

  const widgetProps: ProviderStatusWidgetProps = { id, providerId, mediaType, actions };

  return {
    id: 'status-menu',
    type: 'custom' as const,
    position: { anchor: 'top-right', offset: { x: -8, y: 8 } },
    stackGroup: 'badges-tr',
    visibility: { trigger: 'always' },
    priority: BADGE_PRIORITY.interactive,
    interactive: true,
    handlesOwnInteraction: true,
    render: (data: MediaCardOverlayData) => <ProviderStatusContent data={data} widgetProps={widgetProps} />,
  };
}

/**
 * Create duration badge widget.
 *
 * Lives in the top-left stack (under the media-type icon) rather than the
 * bottom-right corner so it sits exactly where the video scrubber renders its
 * live scrub timestamp on hover — the duration reads in one consistent spot
 * instead of appearing to jump corner-to-corner when you hover.
 */
export function createDurationWidget(props: MediaCardResolvedProps): OverlayWidget<MediaCardOverlayData> | null {
  const { mediaType, durationSec } = props;

  if (mediaType !== 'video' || !durationSec) {
    return null;
  }

  const minutes = Math.floor(durationSec / 60);
  const seconds = Math.floor(durationSec % 60);
  const durationText = `${minutes}:${seconds.toString().padStart(2, '0')}`;

  return createBadgeWidget({
    id: 'duration',
    ...BADGE_SLOT.topLeft,
    variant: 'text',
    labelBinding: createBindingFromValue('label', () => durationText),
    color: 'gray',
    className: '!bg-black/60 !text-white text-[10px]',
    priority: BADGE_PRIORITY.background,
    // Show total duration at rest; hide on hover so the scrubber's live
    // timestamp (rendered in the same top-left region) is the only readout —
    // one duration indicator, one place, no double-up.
    visibility: { trigger: 'no-hover-container', transition: 'fade' },
  });
}

/**
 * Create version badge (bottom-left) — shows "v3" when asset is part of a
 * version family, hidden otherwise. Built on the canonical
 * {@link createBadgeWidget} primitive (text variant + `visibleWhen`).
 */
export function createVersionBadge(): OverlayWidget<MediaCardOverlayData> {
  return createBadgeWidget({
    id: 'version',
    ...BADGE_SLOT.bottomLeft,
    stackGroup: 'badges-bl',
    variant: 'text',
    color: 'blue',
    className: '!bg-blue-900/70 !text-blue-200 text-[10px] font-medium backdrop-blur-sm',
    priority: BADGE_PRIORITY.background,
    labelBinding: createBindingFromValue('label', (data) =>
      data.versionNumber ? `v${data.versionNumber}` : '',
    ),
    visibleWhen: (data) => Boolean(data.versionNumber),
  });
}

/**
 * Create archive badge (top-left) — a muted slate "archive" chip shown only
 * when the asset is archived. Archived assets surface in the gallery only when
 * "show archived" is enabled, so this badge is self-gating: it appears exactly
 * on the cards a user needs to distinguish at a glance. Built on the canonical
 * {@link createBadgeWidget} primitive (icon variant + `visibleWhen`); stacks in
 * the top-left column alongside the media-type icon.
 */
export function createArchivedBadge(): OverlayWidget<MediaCardOverlayData> {
  return createBadgeWidget({
    id: 'archived',
    ...BADGE_SLOT.topLeft,
    stackGroup: 'badges-tl',
    variant: 'icon',
    icon: 'archive',
    shape: 'rounded',
    color: 'gray',
    className: '!bg-slate-700/80 !text-slate-200 backdrop-blur-sm',
    priority: BADGE_PRIORITY.status,
    tooltip: 'Archived',
    hoverPop: true,
    visibleWhen: (data) => Boolean(data.isArchived),
  });
}

// The three fixed sibling-count badges (same-inputs / same-prompt / same-seed)
// were folded into one faceted badge driven by a global facet lens — see the
// `createSimilarityBadge` import + ./similarityBadge.tsx (plan
// media-card-sibling-badges).

/** Ring color per indicator severity. `info` is non-warning provenance (e.g. recovered). */
function indicatorRingClass(severity: AssetWarning['severity']): string {
  if (severity === 'error') return 'ring-red-500/90';
  if (severity === 'info') return 'ring-emerald-400/90';
  return 'ring-amber-400/90';
}

/** Rank so the lead chip shows the most urgent signal (error > warning > info). */
function indicatorRank(severity: AssetWarning['severity']): number {
  return severity === 'error' ? 2 : severity === 'warning' ? 1 : 0;
}

/**
 * Indicator cluster badge (bottom-left) — built on the canonical
 * {@link createExpandableBadge} primitive: a single aggregate chip for
 * per-asset signals (provider-flagged warning, recovered-from-provider info,
 * …) that wiggles on hover and hover-expands a list of every indicator.
 * Folds in what was the standalone "recovered" pill; recovered arrives as an
 * `info`-severity entry from {@link getAssetWarnings}.
 */
export function createWarningsBadge(): OverlayWidget<MediaCardOverlayData> {
  return createExpandableBadge<MediaCardOverlayData>({
    id: 'warnings',
    ...BADGE_SLOT.bottomLeft,
    stackGroup: 'badges-bl',
    priority: BADGE_PRIORITY.important,
    // The bottom-left cluster is now the single home for status/error signals
    // (flagged, local-only, broken, recovered …). It collapses to a count chip
    // and expands on click — same affordance as the active-target set badges —
    // growing UP from the bottom-left corner so each glyph is visible per surface.
    clickExpand: true,
    growUp: true,
    surfaceKey: (ctx) => (ctx.customState?.surfaceKey as string | undefined) ?? 'media-card',
    items: (data) => {
      const warnings = data.warnings;
      if (!warnings || warnings.length === 0) return [];
      return [...warnings]
        .sort((a, b) => indicatorRank(b.severity) - indicatorRank(a.severity))
        .map((w) => ({
          id: w.id,
          icon: w.icon,
          label: w.tooltip,
          ringClass: indicatorRingClass(w.severity),
          // Graded signals (e.g. broken-video score) draw an arc gauge instead
          // of a solid ring; orange to match the broken/warning context.
          score: w.score,
          scoreColor: w.score != null ? '#fb923c' : undefined,
        }));
    },
  });
}

/**
 * Create provider badge widget — now integrated into the status badge.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function createProviderWidget(_props: MediaCardResolvedProps): OverlayWidget<MediaCardOverlayData> | null {
  return null;
}

/**
 * Create video scrub widget (covers entire card on hover)
 * Uses DataBinding for reactive video URL resolution
 * Settings are read from overlayWidgetSettingsStore for user customization
 */
export function createVideoScrubber(props: MediaCardResolvedProps): OverlayWidget<MediaCardOverlayData> | null {
  const { mediaType, onOpen, id, actions } = props;

  if (mediaType !== 'video') {
    return null;
  }

  // Get user-customized settings (merged with defaults)
  const settings = getOverlayWidgetSettings<VideoScrubWidgetSettings>('video-scrub');

  return createVideoScrubWidget({
    id: 'video-scrubber',
    position: { anchor: 'top-left', offset: { x: 0, y: 0 } },
    // `alsoVisibleWhen: 'forcePlay'` reveals the (playing) clip on touch
    // scroll-focus autoplay without showing the scrub timeline, which stays
    // gated on real hover inside the widget. See viewportAutoplayFocus.
    visibility: { trigger: 'hover-container', alsoVisibleWhen: 'forcePlay' },
    // Use videoSrc (processed URL that works with auth) instead of remoteUrl
    videoUrlBinding: createBindingFromValue('videoUrl', (data: MediaCardOverlayData) => data.videoSrc || data.remoteUrl),
    durationBinding: createBindingFromValue('duration', (data: MediaCardOverlayData) => data.durationSec),
    // Apply user settings (with action-based override for showExtractButton)
    showTimeline: settings.showTimeline,
    showTimestamp: settings.showTimestamp,
    showExtractButton: settings.showExtractButton && !!actions?.onExtractFrame,
    timelinePosition: settings.timelinePosition,
    throttle: settings.throttle,
    frameAccurate: settings.frameAccurate,
    muted: settings.muted,
    pauseOnLeave: settings.pauseOnLeave,
    hoverSound: settings.hoverSound,
    priority: 10,
    // Pass click through to open viewer
    onClick: onOpen ? () => onOpen(id) : undefined,
    // Extract frame at hovered timestamp
    onExtractFrame: actions?.onExtractFrame
      ? (timestamp: number) => actions.onExtractFrame?.(id, timestamp)
      : undefined,
    // Extract last frame (middle-click)
    onExtractLastFrame: actions?.onExtractLastFrame
      ? () => actions.onExtractLastFrame?.(id)
      : undefined,
    // Hold-press on scrub dot → extract+upload frame at that timestamp.
    // Static fallback; the data accessor below wins when it returns a value.
    onHoldUpload: actions?.onExtractFrame
      ? (timestamp: number) => actions.onExtractFrame?.(id, timestamp)
      : undefined,
    // Per-render accessors so picker fields (lockedTimestamp, etc.) stay
    // reactive without rebuilding the widget when they change.
    dataAccessors: {
      lockedTimestamp: (data: MediaCardOverlayData) => data.lockedTimestamp,
      onDotClick: (data: MediaCardOverlayData) => {
        const lock = data.onLockTimestamp;
        if (!lock) return undefined;
        const current = data.lockedTimestamp;
        return (timestamp: number) => {
          if (current !== undefined && Math.abs(current - timestamp) < 0.05) {
            lock(undefined);
          } else {
            lock(timestamp);
          }
        };
      },
      onHoldUpload: (data: MediaCardOverlayData) => {
        if (data.actions?.onExtractFrame) {
          return (timestamp: number) => data.actions!.onExtractFrame!(data.id, timestamp);
        }
        return data.onHoldUploadFrame;
      },
      onSelectTimestamp: (data: MediaCardOverlayData) => (timestamp: number) => {
        useVideoMarksStore.getState().setSelected(data.id, timestamp);
      },
      // Live scrubber state → store. Capability actions (Home/End/U etc.)
      // read from the store, so no per-widget keyboard handlers are needed.
      onActiveChange: (data: MediaCardOverlayData) => (active: boolean) => {
        const store = useVideoMarksStore.getState();
        if (active) store.setActive(data.id);
        else if (store.activeAssetId === String(data.id)) store.setActive(null);
      },
      onCurrentTimeChange: (data: MediaCardOverlayData) => (time: number) => {
        useVideoMarksStore.getState().setCurrentTime(data.id, time);
      },
      onDurationChange: (data: MediaCardOverlayData) => (duration: number) => {
        useVideoMarksStore.getState().setDuration(data.id, duration);
      },
      onRegisterSeekFn: (data: MediaCardOverlayData) => (fn) => {
        useVideoMarksStore.getState().setSeekFn(data.id, fn);
      },
    },
  });
}

/**
 * Tabbed content component for the info popover.
 * Shows Info tab (generation details) and Tags tab (all tags as pills).
 */
function InfoPopoverContent({ data }: { data: MediaCardOverlayData }) {
  const [tab, setTab] = useState<'info' | 'tags'>('info');

  const hasGenInfo = !!(data.prompt || data.operationType);

  // Format relative time
  const relativeTime = (() => {
    if (!data.createdAt) return undefined;
    const diff = Date.now() - new Date(data.createdAt).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}d ago`;
    return `${Math.floor(days / 30)}mo ago`;
  })();

  // Dimensions string
  const dims = data.width && data.height ? `${data.width}\u00d7${data.height}` : undefined;

  // Tags with provenance (source-based). Fall back to bare slugs (treated as
  // manual) when summaries aren't available.
  const tagEntries =
    data.tagSummaries && data.tagSummaries.length > 0
      ? data.tagSummaries
      : (data.tags || []).map((slug) => ({ slug, displayName: null, source: null }));

  return (
    <div className="min-w-[220px]" onClick={(e) => e.stopPropagation()}>
      {/* Tab bar */}
      <div className="flex gap-3 border-b border-neutral-200 dark:border-neutral-700 mb-2 px-0.5">
        <button
          className={`pb-1 text-xs font-medium transition-colors ${
            tab === 'info'
              ? 'text-accent border-b-2 border-accent'
              : 'text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300'
          }`}
          onClick={() => setTab('info')}
        >
          Info
        </button>
        <button
          className={`pb-1 text-xs font-medium transition-colors ${
            tab === 'tags'
              ? 'text-accent border-b-2 border-accent'
              : 'text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300'
          }`}
          onClick={() => setTab('tags')}
        >
          Tags{data.tags?.length ? ` (${data.tags.length})` : ''}
        </button>
      </div>

      {/* Info tab */}
      {tab === 'info' && (
        <div className="space-y-1.5 text-xs">
          {hasGenInfo ? (
            <>
              {data.prompt && (
                <div>
                  <span className="text-neutral-400">Prompt</span>
                  <p
                    className="mt-0.5 font-mono text-[11px] text-neutral-600 dark:text-neutral-300 leading-snug line-clamp-3"
                    title={data.prompt}
                  >
                    {data.prompt}
                  </p>
                </div>
              )}
              {data.operationType && (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-neutral-400">Operation</span>
                  <span className="font-medium text-neutral-700 dark:text-neutral-200">{data.operationType}</span>
                </div>
              )}
            </>
          ) : (
            <p className="text-neutral-400 italic">No generation info</p>
          )}
          {data.model && (
            <div className="flex items-center justify-between gap-2">
              <span className="text-neutral-400">Model</span>
              <span className="font-medium text-neutral-700 dark:text-neutral-200">{data.model}</span>
            </div>
          )}
          {dims && (
            <div className="flex items-center justify-between gap-2">
              <span className="text-neutral-400">Dimensions</span>
              <span className="font-medium text-neutral-700 dark:text-neutral-200">{dims}</span>
            </div>
          )}
          {data.providerId && (
            <div className="flex items-center justify-between gap-2">
              <span className="text-neutral-400">Provider</span>
              <span className="font-medium text-neutral-700 dark:text-neutral-200">{data.providerId}</span>
            </div>
          )}
          {relativeTime && (
            <div className="flex items-center justify-between gap-2">
              <span className="text-neutral-400">Created</span>
              <span className="font-medium text-neutral-700 dark:text-neutral-200">{relativeTime}</span>
            </div>
          )}
        </div>
      )}

      {/* Tags tab — leading glyph + tooltip name the provenance; chip tone is
          accent for tags you added, neutral for anything generated. */}
      {tab === 'tags' && (
        <div className="space-y-2 text-xs">
          {tagEntries.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {tagEntries.map((tag) => {
                const meta = getTagSourceMeta(tag.source);
                return (
                  <span
                    key={tag.slug}
                    title={meta.label}
                    className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] ${
                      meta.isManual
                        ? 'bg-accent/15 text-accent'
                        : 'bg-neutral-100 dark:bg-neutral-700 text-neutral-600 dark:text-neutral-300'
                    }`}
                  >
                    <Icon name={meta.icon} size={10} className={meta.iconClass} />
                    {tag.displayName || tag.slug}
                  </span>
                );
              })}
            </div>
          ) : (
            <p className="text-neutral-400 italic">No tags</p>
          )}
        </div>
      )}
    </div>
  );
}

// createInfoPopover removed: the bottom-left "i" widget was folded into
// createPrimaryIconWidget so the top-left media-type icon serves as the
// single info entry point on every surface (gallery + viewer + compact).
// The Info/Tags popover content (`InfoPopoverContent` above) is now reached
// by clicking the primary icon, and continues to be embedded in the
// top-right status menu's info section.

/**
 * Self-reactive favorite heart.
 *
 * The heart owns its own filled/empty truth instead of relying on the host
 * surface to re-render the card with a freshly-tagged asset. `toggleFavoriteTag`
 * emits `assetEvents.emitAssetUpdated` after the server write, so this widget
 * subscribes to that bus and flips on the matching asset id — independent of
 * whether the surface refreshes the asset prop.
 *
 * Why this matters: the gallery refreshes its asset list on `assetEvents`, so a
 * baked-from-props heart flipped there. But the media viewer and the generation
 * input slots feed the card through their own stores / context snapshots, and a
 * single break in that refresh chain (id-type mismatch, `ctx` snapshot bypass,
 * memo dep gap, subscription race) left the heart visually stale even though the
 * tag was written. Owning the state here makes the flip surface-agnostic.
 */
function FavoriteBadgeContent({ data }: { data: MediaCardOverlayData }) {
  const assetId = typeof data.id === 'number' ? data.id : Number(data.id);
  const hasBackendId = Number.isFinite(assetId) && assetId > 0;
  const [isFav, setIsFav] = useState(!!data.isFavorite);

  // Reflect host-provided snapshots: gallery list refresh, or the card slot
  // being pointed at a different asset (viewer nav, input-slot walk).
  useEffect(() => {
    setIsFav(!!data.isFavorite);
  }, [data.id, data.isFavorite]);

  // Listen for the favorite write landing for THIS asset, from any surface.
  useEffect(() => {
    if (!hasBackendId) return;
    return assetEvents.subscribeToUpdates((response) => {
      if (response.id !== assetId) return;
      setIsFav(response.tags?.some((t) => t.slug === FAVORITE_TAG_SLUG) ?? false);
    });
  }, [assetId, hasBackendId]);

  const label = isFav ? 'Remove from favorites' : 'Add to favorites';

  const handleToggle = () => {
    const next = !isFav;
    // Drive the write off the heart's own live state — NOT a stale captured
    // asset. Optimistically flip so there's no round-trip delay; revert if the
    // write fails. The emitted assetUpdated reconciles all other surfaces.
    if (hasBackendId) {
      setIsFav(next);
      setFavoriteTag(assetId, next).catch((err) => {
        console.error('[FavoriteBadge] toggle failed', err);
        setIsFav(!next);
      });
      return;
    }
    // Local/edge assets (non-backend id) keep their bespoke handler, e.g. the
    // local-folder upload-then-tag flow.
    data.onToggleFavorite?.();
  };

  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={isFav}
      // Keep focus on the document body — focusing a portaled overlay button
      // scrolls the page (see overlay-button-focus-scroll canon).
      onMouseDown={(e) => e.preventDefault()}
      onClick={(e) => {
        e.stopPropagation();
        handleToggle();
      }}
      className={`inline-flex items-center justify-center cq-btn-md rounded-full shadow-md backdrop-blur-sm cursor-pointer hover:animate-hover-pop ${
        isFav
          ? '!bg-red-500/90 !text-white'
          : '!bg-white/80 dark:!bg-neutral-800/80 !text-neutral-400 hover:!text-red-500'
      }`}
    >
      <Icon name="heart" />
    </button>
  );
}

/**
 * Create favorite toggle widget (top-right, below status).
 * Always visible — heart icon that toggles the user:favorite tag. Renders the
 * self-reactive {@link FavoriteBadgeContent} so the filled/empty state stays
 * correct on every surface, not just ones that refresh the asset prop.
 */
export function createFavoriteWidget(): OverlayWidget<MediaCardOverlayData> {
  return {
    id: 'favorite-toggle',
    type: 'badge',
    position: { anchor: 'top-right', offset: { x: -8, y: 8 } },
    stackGroup: 'badges-tr',
    visibility: { trigger: 'always', transition: 'none' },
    priority: 18,
    interactive: true,
    // The inner <button> owns its click/keyboard handling; don't let the
    // wrapper also apply role="button" + click forwarding (would double-fire).
    handlesOwnInteraction: true,
    ariaLabel: 'Toggle favorite',
    render: (data) => <FavoriteBadgeContent data={data} />,
  };
}

/**
 * Render component for the quick tag widget.
 * Extracted as a named component so React hooks are valid.
 */
function QuickTagWidgetContent({ data }: { data: MediaCardOverlayData }) {
  const { defaultTags, recentTags, toggleDefaultTag, addRecentTag } = useQuickTagStore();
  const { isExpanded, handlers } = useHoverExpand({ expandDelay: 200, collapseDelay: 150 });
  const [inputValue, setInputValue] = useState('');
  const [inputFocused, setInputFocused] = useState(false);
  const [selectedNamespace, setSelectedNamespace] = useState('user');
  const [nsDropdownOpen, setNsDropdownOpen] = useState(false);
  const [applying, setApplying] = useState(false);
  const [flash, setFlash] = useState<'success' | 'error' | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const blurTimeoutRef = useRef<number>(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const { results, loading, parsedNamespace, parsedQuery, hasExplicitNamespace } =
    useTagAutocomplete(inputValue, { enabled: isExpanded && inputFocused, namespaceOverride: selectedNamespace });

  // Typed namespace (from colon syntax) takes priority over dropdown selection
  const activeNamespace = hasExplicitNamespace ? parsedNamespace : selectedNamespace;

  // Clear blur timeout on unmount
  useEffect(() => () => window.clearTimeout(blurTimeoutRef.current), []);

  const hasAny = defaultTags.length > 0;
  // How many of the active defaults does this asset already carry?
  const matchCount = defaultTags.filter((t) => data.tags.includes(t)).length;
  const hasAll = hasAny && matchCount === defaultTags.length;
  const hasSome = matchCount > 0 && !hasAll;

  const addTag = useCallback((slug: string) => {
    addRecentTag(slug);
    if (!defaultTags.includes(slug)) {
      toggleDefaultTag(slug);
    }
    setInputValue('');
  }, [addRecentTag, defaultTags, toggleDefaultTag]);

  const handleFilterByTagShortcut = useCallback(
    (slug: string, e: React.MouseEvent<HTMLButtonElement>) => {
      e.preventDefault();
      e.stopPropagation();
      data.onFilterByTagShortcut?.(slug);
    },
    [data],
  );

  const handleClick = async (e: React.MouseEvent) => {
    e.stopPropagation(); // prevent card open
    if (applying || defaultTags.length === 0) return;
    // Only apply tags the asset doesn't already have
    const missing = defaultTags.filter((t) => !data.tags.includes(t));
    if (missing.length === 0) return;
    setApplying(true);
    try {
      assertBackendAssetId(data.id, 'mediaCardWidgets:applyQuickTag');
      await applyQuickTag(data.id, missing);
      setFlash('success');
      setTimeout(() => setFlash(null), 600);
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      const msg = typeof detail === 'string' ? detail
        : Array.isArray(detail) ? detail.map((d: any) => d.msg ?? JSON.stringify(d)).join('; ')
        : err?.message || String(err);
      console.error('[QuickTag] Failed to apply tags:', msg);
      setLastError(msg);
      setFlash('error');
      setTimeout(() => setFlash(null), 2000);
    } finally {
      setApplying(false);
    }
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && inputValue.trim()) {
      // If user typed an explicit namespace, normalizeTagInput handles it.
      // Otherwise, prepend the selected namespace from the dropdown.
      const raw = hasExplicitNamespace ? inputValue : `${selectedNamespace}:${inputValue}`;
      const slug = normalizeTagInput(raw);
      if (!slug) return;
      addTag(slug);
    }
  };

  const handleInputFocus = () => {
    window.clearTimeout(blurTimeoutRef.current);
    setInputFocused(true);
  };

  const handleInputBlur = () => {
    // Delay blur so click-through on autocomplete results works
    blurTimeoutRef.current = window.setTimeout(() => setInputFocused(false), 200);
  };

  const handleAutocompleteClick = (slug: string) => {
    // Prevent the blur timeout from hiding results before state updates
    window.clearTimeout(blurTimeoutRef.current);
    addTag(slug);
  };

  const buttonTitle = flash === 'error' && lastError
    ? `Error: ${lastError}`
    : hasAll
      ? `Tagged: ${defaultTags.join(', ')}`
      : hasAny
        ? `Quick tag: ${defaultTags.join(', ')}`
        : 'Set quick tags';

  const showAutocomplete = inputValue.trim().length > 0 && inputFocused;
  const placeholder = hasExplicitNamespace ? 'tag_name' : 'tag_name';

  return (
    <div className="relative" {...handlers}>
      <button
        ref={triggerRef}
        onClick={handleClick}
        disabled={applying}
        className={`
          cq-btn-md inline-flex items-center justify-center rounded-full shadow-md transition-colors hover:animate-hover-pop
          ${flash === 'success'
            ? '!bg-green-500/90 !text-white backdrop-blur-sm'
            : flash === 'error'
              ? '!bg-red-500/90 !text-white backdrop-blur-sm'
              : applying
                ? '!bg-accent/60 !text-accent-text backdrop-blur-sm opacity-70'
                : hasAll
                  ? '!bg-accent/90 !text-accent-text backdrop-blur-sm'
                  : hasSome
                    ? '!bg-accent/50 !text-accent-text backdrop-blur-sm'
                    : hasAny
                      ? '!bg-white/80 dark:!bg-neutral-800/80 !text-accent hover:!text-accent-hover backdrop-blur-sm'
                      : '!bg-white/80 dark:!bg-neutral-800/80 !text-neutral-400 hover:!text-accent backdrop-blur-sm'}
        `}
        title={buttonTitle}
      >
        <Icon name={flash === 'success' ? 'check' : flash === 'error' ? 'x' : 'tag'} />
      </button>

      {isExpanded && (
        <PortalFloat
          anchor={triggerRef.current}
          placement="bottom"
          align="end"
          offset={4}
          className="min-w-[180px] max-w-[240px] bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg shadow-lg py-1"
          onMouseEnter={handlers.onMouseEnter}
          onMouseLeave={handlers.onMouseLeave}
        >
        <div
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {/* Active defaults summary */}
          {hasAny && (
            <div className="px-3 py-1.5 text-xs text-accent font-medium border-b border-neutral-100 dark:border-neutral-700 truncate">
              Active: {defaultTags.join(', ')}
            </div>
          )}

          {/* Recent tags — click toggles active state */}
          {recentTags.length > 0 && (
            <div className="py-1">
              {recentTags.map((slug) => {
                const isActive = defaultTags.includes(slug);
                const colonIdx = slug.indexOf(':');
                const nsPrefix = colonIdx > 0 ? slug.slice(0, colonIdx + 1) : '';
                const tagName = colonIdx > 0 ? slug.slice(colonIdx + 1) : slug;
                return (
                  <div key={slug} className="flex items-center px-2 gap-1">
                    <button
                      onClick={() => toggleDefaultTag(slug)}
                      className={`
                        flex-1 px-1 py-1.5 text-left text-sm flex items-center gap-2 rounded
                        hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors
                        ${isActive ? 'text-accent font-medium' : 'text-neutral-700 dark:text-neutral-300'}
                      `}
                    >
                      <span
                        className={`shrink-0 w-3.5 h-3.5 rounded border flex items-center justify-center text-[10px]
                          ${isActive
                            ? 'bg-accent border-accent text-accent-text'
                            : 'border-neutral-300 dark:border-neutral-600'}`}
                      >
                        {isActive && '✓'}
                      </span>
                      <Icon name="tag" size={12} className="shrink-0" />
                      <span className="truncate">
                        {nsPrefix && <span className="text-neutral-400 text-[10px]">{nsPrefix}</span>}
                        {tagName}
                      </span>
                    </button>
                    {isActive && data.onFilterByTagShortcut && (
                      <button
                        type="button"
                        onClick={(e) => handleFilterByTagShortcut(slug, e)}
                        className="shrink-0 inline-flex items-center justify-center w-6 h-6 rounded text-neutral-500 dark:text-neutral-400 hover:text-accent hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors"
                        title={`Filter gallery by ${slug}`}
                        aria-label={`Filter gallery by ${slug}`}
                      >
                        <Icon name="eye" size={12} className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Namespace picker + text input */}
          <div className="px-2 py-1.5 border-t border-neutral-100 dark:border-neutral-700">
            <div className="flex items-center gap-1 relative">
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => setNsDropdownOpen((v) => !v)}
                className={`shrink-0 px-1.5 py-0.5 text-[10px] font-medium rounded cursor-pointer select-none transition-colors ${
                  hasExplicitNamespace
                    ? 'bg-accent/20 text-accent'
                    : nsDropdownOpen
                      ? 'bg-accent/15 text-accent'
                      : 'bg-neutral-200 dark:bg-neutral-600 text-neutral-500 dark:text-neutral-400 hover:bg-neutral-300 dark:hover:bg-neutral-500'
                }`}
                title="Change namespace"
              >
                {activeNamespace}:
              </button>
              <input
                ref={inputRef}
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleInputKeyDown}
                onFocus={handleInputFocus}
                onBlur={handleInputBlur}
                placeholder={placeholder}
                className="flex-1 min-w-0 px-1.5 py-1 text-xs rounded bg-neutral-100 dark:bg-neutral-700 text-neutral-800 dark:text-neutral-200 placeholder:text-neutral-400 outline-none focus:ring-1 focus:ring-accent"
              />
              {/* Namespace dropdown */}
              {nsDropdownOpen && (
                <div className="absolute top-full left-0 mt-1 w-[120px] max-h-[140px] overflow-y-auto bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded shadow-lg z-10 py-0.5">
                  {TAG_NAMESPACES.map((ns) => (
                    <button
                      key={ns}
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        setSelectedNamespace(ns);
                        setNsDropdownOpen(false);
                        // Strip any typed namespace prefix so the dropdown selection takes effect
                        if (hasExplicitNamespace) {
                          const colonIdx = inputValue.indexOf(':');
                          setInputValue(colonIdx >= 0 ? inputValue.slice(colonIdx + 1) : inputValue);
                        }
                        inputRef.current?.focus();
                      }}
                      className={`w-full px-2 py-1 text-left text-[11px] transition-colors
                        ${ns === activeNamespace
                          ? 'text-accent font-medium bg-accent/10'
                          : 'text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-700'
                        }`}
                    >
                      {ns}:
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Autocomplete results */}
          {showAutocomplete && (
            <div className="border-t border-neutral-100 dark:border-neutral-700 max-h-[120px] overflow-y-auto">
              {loading && (
                <div className="px-3 py-2 text-xs text-neutral-400">Searching...</div>
              )}
              {!loading && results.length > 0 && results.map((tag) => {
                const isAlreadyActive = defaultTags.includes(tag.slug);
                return (
                  <button
                    key={tag.id}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => handleAutocompleteClick(tag.slug)}
                    className={`
                      w-full px-3 py-1.5 text-left text-xs flex items-center gap-2
                      hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors
                      ${isAlreadyActive ? 'text-accent' : 'text-neutral-700 dark:text-neutral-300'}
                    `}
                  >
                    <Icon name="tag" size={11} className="shrink-0" />
                    <span className="truncate font-mono">{tag.slug}</span>
                    {tag.display_name && (
                      <span className="ml-auto text-[10px] text-neutral-400 truncate">{tag.display_name}</span>
                    )}
                  </button>
                );
              })}
              {!loading && results.length === 0 && parsedQuery && (
                <button
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    const raw = hasExplicitNamespace ? inputValue : `${selectedNamespace}:${inputValue}`;
                    const slug = normalizeTagInput(raw);
                    if (slug) handleAutocompleteClick(slug);
                  }}
                  className="w-full px-3 py-1.5 text-left text-xs flex items-center gap-2 hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors text-neutral-700 dark:text-neutral-300"
                >
                  <Icon name="plus" size={11} className="shrink-0 text-accent" />
                  <span className="truncate">
                    Create <span className="font-mono text-accent">{activeNamespace}:{parsedQuery}</span>
                  </span>
                </button>
              )}
            </div>
          )}
        </div>
        </PortalFloat>
      )}
    </div>
  );
}

/**
 * Create quick tag widget (top-right, below favorite)
 * Click applies active default tags; hover expands a panel to toggle tags on/off.
 */
export function createQuickTagWidget(): OverlayWidget<MediaCardOverlayData> {
  return {
    id: 'quick-tag',
    type: 'custom',
    position: { anchor: 'top-right', offset: { x: -8, y: 8 } },
    stackGroup: 'badges-tr',
    visibility: { trigger: 'always' },
    priority: 17,
    interactive: true,
    handlesOwnInteraction: true,
    render: (data: MediaCardOverlayData) => <QuickTagWidgetContent data={data} />,
  };
}

/**
 * Create quick add button (+) widget
 * @deprecated Use createGenerationButtonGroup which now includes quick generate
 */
export function createQuickAddButton(): OverlayWidget<MediaCardOverlayData> | null {
  // Quick add is now integrated into the generation button group
  return null;
}

/**
 * Look up model family info from the provider capability registry.
 * Searches operation_specs for model params carrying model_families metadata.
 */
function resolveModelFamily(modelId: string, providerId: string): ModelFamilyInfo | null {
  const cap = providerCapabilityRegistry.getCapability(providerId);
  if (!cap?.operation_specs) return null;
  for (const opSpec of Object.values(cap.operation_specs)) {
    const modelParam = opSpec.parameters?.find((p) => p.name === 'model');
    const families = modelParam?.metadata?.model_families as
      | Record<string, ModelFamilyInfo>
      | undefined;
    if (families?.[modelId]) return families[modelId];
  }
  return null;
}

/**
 * Model family badge — now integrated into the provider status badge (top-right).
 */
export function createModelFamilyWidget(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _props: MediaCardResolvedProps,
): OverlayWidget<MediaCardOverlayData> | null {
  return null;
}

/**
 * Create default widget set for MediaCard
 */
export function createDefaultMediaCardWidgets(props: MediaCardResolvedProps): OverlayWidget<MediaCardOverlayData>[] {
  return buildMediaCardRuntimeWidgets(props, {
    createPrimaryIconWidget,
    createStatusWidget,
    createFavoriteWidget,
    createQueueStatusWidget,
    createSelectionStatusWidget,
    createDurationWidget,
    createProviderWidget,
    createVideoScrubber,
    createGenerationButtonGroup,
    createGenerationActionModeBadge,
    createModelFamilyWidget,
    createQuickTagWidget,
    createQuickAddButton,
    createVersionBadge,
    createArchivedBadge,
    createWarningsBadge,
    createSimilarityBadge,
  });
}
