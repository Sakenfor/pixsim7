/**
 * Generation Activity Bar Widget
 *
 * Sparkles icon with active-generation count badge in the activity bar bottom
 * tray. Click toggles a floating activity panel for quick group-level
 * pause/cancel/retry; hover shows a small status tooltip. Interaction mirrors
 * NotificationActivityBarWidget for consistency.
 */
import { useHoverExpand } from '@pixsim7/shared.ui';
import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { createPortal } from 'react-dom';

import { useWorkspaceStore } from '@features/workspace/stores/workspaceStore';

import { NavIcon } from '@/components/navigation/ActivityBar';

import { useGenerationWebSocket } from '../hooks/useGenerationWebSocket';
import { syncGenerationsFromApi } from '../hooks/useRecentGenerations';
import type { GenerationGroupBy } from '../lib/generationGrouping';
import { isActiveStatus, resolveGranularStatus } from '../models';
import { useGenerationActivityFlyoutStore } from '../stores/generationActivityFlyoutStore';
import { useGenerationsStore } from '../stores/generationsStore';

import { GenerationActivityFlyout } from './GenerationActivityFlyout';

/** Recency window reconciled from the API each time the flyout opens. */
const FLYOUT_RECONCILE_LIMIT = 100;

type BadgeMode = 'active' | 'total' | 'polling' | 'rendering';

interface GenerationWidgetStats {
  activeCount: number;
  totalCount: number;
  pollingCount: number;
  renderingCount: number;
  refilteringCount: number;
}

function formatBadgeCount(value: number): string {
  return value > 99 ? '99+' : String(value);
}

function nextBadgeMode(current: BadgeMode): BadgeMode {
  if (current === 'active') return 'total';
  if (current === 'total') return 'polling';
  if (current === 'polling') return 'rendering';
  return 'active';
}

export function GenerationActivityBarWidget() {
  const { isConnected, forceReconnect } = useGenerationWebSocket();
  const generations = useGenerationsStore((s) => s.generations);
  // Local clock so the 'polling' → 'rendering' crossing (a time threshold past
  // the fast-fail window) is reflected even between backend pushes. Ticks only
  // while something is active; see the effect below.
  const [nowMs, setNowMs] = useState(() => Date.now());
  const { activeCount, totalCount, pollingCount, renderingCount, refilteringCount } =
    useMemo<GenerationWidgetStats>(() => {
      let active = 0;
      let total = 0;
      let polling = 0;
      let rendering = 0;
      let refiltering = 0;
      for (const g of generations.values()) {
        total++;
        if (isActiveStatus(g.status)) active++;
        const granular = resolveGranularStatus(g, nowMs);
        if (granular === 'polling') polling++;
        if (granular === 'rendering') rendering++;
        if (granular === 'refiltering') refiltering++;
      }
      return {
        activeCount: active,
        totalCount: total,
        pollingCount: polling,
        renderingCount: rendering,
        refilteringCount: refiltering,
      };
    }, [generations, nowMs]);

  // Re-evaluate the time threshold ~every 1.5s while work is in flight (purely
  // local re-render; the backend status poller stays the source of truth).
  useEffect(() => {
    if (activeCount === 0) return;
    const id = setInterval(() => setNowMs(Date.now()), 1500);
    return () => clearInterval(id);
  }, [activeCount]);
  const openFloatingPanel = useWorkspaceStore((s) => s.openFloatingPanel);
  const triggerRef = useRef<HTMLDivElement>(null);

  // Open state lives in a store so other surfaces (e.g. the pause toast's
  // "View paused" action) can open this very popup, pre-switched to a mode.
  const panelOpen = useGenerationActivityFlyoutStore((s) => s.open);
  const setPanelOpen = useGenerationActivityFlyoutStore((s) => s.setOpen);
  const togglePanelOpen = useGenerationActivityFlyoutStore((s) => s.toggleOpen);
  const [groupBy, setGroupBy] = useState<GenerationGroupBy>('prompt');
  const [badgeMode, setBadgeMode] = useState<BadgeMode>('active');

  const { isExpanded: hovered, handlers } = useHoverExpand({
    expandDelay: 400,
    collapseDelay: 0,
  });

  const handleClick = useCallback(() => {
    togglePanelOpen();
  }, [togglePanelOpen]);

  // Reconcile on open. The flyout renders purely from the store, which is fed
  // by best-effort WebSocket events (no delivery/ordering guarantee). A single
  // authoritative refetch on open corrects any rows that drifted — dropped
  // events during a reconnect gap, or out-of-order refetches from the
  // content-filter retry loop — so stale "active" rows don't show dead actions.
  // (The full GenerationsPanel already does this on mount; this covers the
  // lighter flyout.) Best-effort: a failure leaves the last-known store state.
  const reconcileInFlightRef = useRef(false);
  useEffect(() => {
    if (!panelOpen || reconcileInFlightRef.current) return;
    reconcileInFlightRef.current = true;
    void syncGenerationsFromApi(FLYOUT_RECONCILE_LIMIT)
      .catch(() => { /* keep last-known store state */ })
      .finally(() => { reconcileInFlightRef.current = false; });
  }, [panelOpen]);

  const handleBadgeClick = useCallback((e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    setBadgeMode((prev) => nextBadgeMode(prev));
  }, []);

  const handleClose = useCallback(() => {
    setPanelOpen(false);
  }, []);

  const handleOpenFullPanel = useCallback(() => {
    setPanelOpen(false);
    openFloatingPanel('generations');
  }, [openFloatingPanel]);

  const isActive = activeCount > 0;
  const hasAnyGenerations = totalCount > 0;

  // Per-mode badge config. `idleWhenZero` shows "idle" instead of 0 for the
  // sub-counts; the colored tone only applies when the count is non-zero.
  // Active uses dark text on amber (white-on-amber was hard to read).
  const MODE_INFO: Record<BadgeMode, { label: string; title: string; count: number; tone: string; idleWhenZero: boolean }> = {
    active: { label: 'active', title: 'Active generations', count: activeCount, tone: 'bg-amber-500 text-neutral-900', idleWhenZero: false },
    total: { label: 'total', title: 'Tracked generations', count: totalCount, tone: 'bg-blue-500 text-white', idleWhenZero: false },
    polling: { label: 'polling', title: 'Polling generations', count: pollingCount, tone: 'bg-emerald-500 text-white', idleWhenZero: true },
    rendering: { label: 'rendering', title: 'Rendering (past fast-fail window)', count: renderingCount, tone: 'bg-teal-500 text-white', idleWhenZero: true },
  };
  const mode = MODE_INFO[badgeMode];
  const modeLabel = mode.label;
  const modeTitle = mode.title;
  const badgeValue = mode.count > 0 || !mode.idleWhenZero ? formatBadgeCount(mode.count) : 'idle';
  const badgeToneClass = mode.count > 0 ? mode.tone : 'bg-neutral-600 text-neutral-200';

  return (
    <div
      ref={triggerRef}
      className="relative flex items-center justify-center"
      {...handlers}
    >
      <button
        type="button"
        onClick={handleClick}
        className={`w-10 h-10 flex items-center justify-center rounded-lg transition-colors relative ${
          panelOpen
            ? 'text-amber-400 bg-amber-500/15'
            : isActive
              ? 'text-amber-400 bg-amber-500/10'
              : 'text-neutral-500 hover:text-neutral-200 hover:bg-neutral-700/50'
        }`}
        aria-label={`Generations: ${activeCount} active`}
      >
        <NavIcon name="sparkles" size={18} />

        {/* Connection dot — red when disconnected for visibility */}
        <div
          className={`absolute bottom-1.5 right-1.5 w-1.5 h-1.5 rounded-full transition-colors ${
            isConnected ? 'bg-green-500' : 'bg-red-500 animate-pulse'
          } ${isActive && isConnected ? 'animate-pulse-subtle' : ''}`}
        />

        {/* Fast-filter dot — top-left (free corner) when prompts are bouncing
            through render-moderation retries; the count lives in the tooltip. */}
        {refilteringCount > 0 && (
          // Decorative — the count + meaning live in the rich hover tooltip; no
          // native title here (it would double up with that tooltip).
          <div
            aria-hidden
            className="absolute top-1.5 left-1.5 w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse"
          />
        )}
      </button>
      {hasAnyGenerations && (
        <button
          type="button"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={handleBadgeClick}
          className={`absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 flex items-center justify-center rounded-full text-[10px] font-semibold leading-none transition-[transform,filter] hover:brightness-110 hover:scale-105 ${badgeToneClass}`}
          // No native title — the rich hover tooltip already explains the metric
          // + "click to cycle"; a title here showed a second overlapping tooltip.
          aria-label={`${modeTitle}: ${badgeValue}. Click to cycle metric.`}
        >
          {badgeValue}
        </button>
      )}

      {/* Tooltip (only when panel is closed) */}
      {hovered && !panelOpen && triggerRef.current && (
        <GenerationTooltip
          triggerRef={triggerRef}
          activeCount={activeCount}
          totalCount={totalCount}
          pollingCount={pollingCount}
          renderingCount={renderingCount}
          refilteringCount={refilteringCount}
          badgeMode={badgeMode}
          badgeValue={badgeValue}
          modeLabel={modeLabel}
          isConnected={isConnected}
        />
      )}

      {/* Floating panel */}
      {panelOpen && triggerRef.current && (
        <GenerationPanelPortal triggerRef={triggerRef}>
          <GenerationActivityFlyout
            groupBy={groupBy}
            onChangeGroupBy={setGroupBy}
            onOpenFullPanel={handleOpenFullPanel}
            onClose={handleClose}
            isConnected={isConnected}
            onReconnect={forceReconnect}
          />
        </GenerationPanelPortal>
      )}
    </div>
  );
}

// ── Portal components (mirror NotificationActivityBarWidget) ──────────

function GenerationTooltip({
  triggerRef,
  activeCount,
  totalCount,
  pollingCount,
  renderingCount,
  refilteringCount,
  badgeMode,
  badgeValue,
  modeLabel,
  isConnected,
}: {
  triggerRef: React.RefObject<HTMLDivElement | null>;
  activeCount: number;
  totalCount: number;
  pollingCount: number;
  renderingCount: number;
  refilteringCount: number;
  badgeMode: BadgeMode;
  badgeValue: string;
  modeLabel: string;
  isConnected: boolean;
}) {
  const rect = triggerRef.current?.getBoundingClientRect();
  if (!rect) return null;

  return createPortal(
    <div
      className="fixed z-tooltip py-1.5 px-3 bg-neutral-900/95 border border-neutral-700/60 rounded-lg shadow-xl backdrop-blur-sm text-xs text-neutral-200 whitespace-nowrap pointer-events-none flex flex-col gap-0.5"
      style={{
        top: rect.top + rect.height / 2,
        left: rect.right + 4,
        transform: 'translateY(-50%)',
      }}
    >
      <span>
        {activeCount > 0 ? `${activeCount} generating` : 'No active generations'}
      </span>
      <span className="text-neutral-400">
        Badge: {modeLabel} ({badgeValue}) - click to cycle
      </span>
      {badgeMode !== 'total' && (
        <span className="text-neutral-500">
          Tracked: {formatBadgeCount(totalCount)} | Polling: {pollingCount > 0 ? formatBadgeCount(pollingCount) : 'idle'}
        </span>
      )}
      {renderingCount > 0 && (
        <span className="text-emerald-400">
          ✓ {formatBadgeCount(renderingCount)} rendering (past the fast-fail window)
        </span>
      )}
      {refilteringCount > 0 && (
        <span className="text-orange-400">
          ⟳ {formatBadgeCount(refilteringCount)} re-filtering (moderation retries)
        </span>
      )}
      {!isConnected && <span className="text-red-400">Disconnected</span>}
    </div>,
    document.body,
  );
}

function GenerationPanelPortal({
  triggerRef,
  children,
}: {
  triggerRef: React.RefObject<HTMLDivElement | null>;
  children: React.ReactNode;
}) {
  const rect = triggerRef.current?.getBoundingClientRect();
  if (!rect) return null;

  return createPortal(
    <div
      className="fixed z-popover"
      style={{
        bottom: window.innerHeight - rect.top - rect.height,
        left: rect.right + 8,
      }}
    >
      {children}
    </div>,
    document.body,
  );
}
