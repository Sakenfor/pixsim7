import { Dropdown, DropdownDivider, DropdownItem, DropdownSectionHeader } from '@pixsim7/shared.ui';
import { useRef, useState } from 'react';

import { Icon, IconBadge } from '@lib/icons';

import { useGalleryViewPrefsStore } from '@features/assets/stores/galleryViewPrefsStore';
import { useGenerationWebSocket } from '@features/generation';
import { useWorkspaceStore } from '@features/workspace';

import { GalleryLayoutControls } from './GalleryLayoutControls';

interface GalleryViewMenuProps {
  /** Layout + card-size state (shown as a View section when `showLayout`). */
  layout?: 'masonry' | 'grid';
  setLayout?: (layout: 'masonry' | 'grid') => void;
  cardSize?: number;
  setCardSize?: (size: number) => void;
  /** Render the layout/card-size controls (gallery-grid surfaces only). */
  showLayout?: boolean;
  /**
   * Render the "Show broken" toggle — default gallery surface only. Triage/Review
   * always show broken clips, so they pass this false (the toggle is meaningless
   * there). State lives in galleryViewPrefsStore, read by RemoteGallerySource.
   */
  showBrokenToggle?: boolean;
}

/**
 * GalleryViewMenu — the gallery chrome's single "View" overflow menu.
 *
 * Consolidates the controls that used to sit loose in the toolbar row — layout +
 * card size, the Show-broken toggle, the Panels launchers (Settings / Generations
 * / Providers / Dev Tools), and the Live generation-feed status — into one
 * dropdown so the chrome row stays uncluttered. The surface switcher and
 * card-preset picker stay loose alongside it: each is its own portal'd dropdown
 * and can't nest inside this one without breaking outside-click handling.
 */
export function GalleryViewMenu({
  layout,
  setLayout,
  cardSize,
  setCardSize,
  showLayout = false,
  showBrokenToggle = false,
}: GalleryViewMenuProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const hideBroken = useGalleryViewPrefsStore((s) => s.hideBroken);
  const setHideBroken = useGalleryViewPrefsStore((s) => s.setHideBroken);
  const brokenScoreCutoff = useGalleryViewPrefsStore((s) => s.brokenScoreCutoff);
  const setBrokenScoreCutoff = useGalleryViewPrefsStore((s) => s.setBrokenScoreCutoff);
  const { isConnected: live } = useGenerationWebSocket();

  const openPanel = (id: string) => {
    useWorkspaceStore.getState().openFloatingPanel(id);
    setOpen(false);
  };

  const canShowLayout =
    showLayout && !!layout && !!setLayout && cardSize !== undefined && !!setCardSize;

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="h-7 px-1.5 text-xs inline-flex items-center gap-1.5 rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900/60 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
        title="View options & panels"
        aria-label="View options & panels"
      >
        <Icon name="eye" size={13} />
        <span className="hidden sm:inline">View</span>
        <Icon name="chevronDown" size={10} className={`hidden sm:inline transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      <Dropdown
        isOpen={open}
        onClose={() => setOpen(false)}
        position="bottom-right"
        minWidth="200px"
        triggerRef={triggerRef}
      >
        {canShowLayout && (
          <>
            <DropdownSectionHeader first>View</DropdownSectionHeader>
            <div className="flex items-center gap-1.5 px-1 py-0.5">
              <GalleryLayoutControls
                layout={layout!}
                setLayout={setLayout!}
                cardSize={cardSize!}
                setCardSize={setCardSize!}
              />
            </div>
          </>
        )}
        {showBrokenToggle && (
          <>
            <DropdownItem
              icon={<Icon name="alertTriangle" size={13} />}
              onClick={() => setHideBroken(!hideBroken)}
              rightSlot={<span>{hideBroken ? 'Off' : 'On'}</span>}
            >
              Show broken
            </DropdownItem>
            {/* Opt-in heuristic-score cutoff layered on the manual-flag baseline.
                0 = off (manual flags only); N = also hide clips scoring >= N
                (your Keeps are never re-hidden). Only meaningful while broken
                clips are hidden. */}
            {hideBroken && (
              <div className="flex items-center gap-1.5 px-2 py-1">
                {/* Left = lower cutoff = hides MORE (amber eye-off). Right = higher
                    cutoff = hides FEWER, only the surest-broken (emerald eye). The
                    icons carry the direction so you don't have to remember that a
                    higher score means "more broken". */}
                <span title="Left: hides more — lower score catches even mildly-suspicious clips">
                  <Icon name="eyeOff" size={12} className="text-amber-500 shrink-0" />
                </span>
                <input
                  type="range"
                  min="0"
                  max="11"
                  step="1"
                  value={brokenScoreCutoff ?? 0}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    setBrokenScoreCutoff(v === 0 ? null : v);
                  }}
                  className="flex-1 h-1 bg-neutral-300 dark:bg-neutral-600 rounded-lg appearance-none cursor-pointer accent-accent"
                  title={
                    brokenScoreCutoff == null
                      ? 'Score cutoff off — hide manually-flagged clips only'
                      : `Also hide clips scoring ≥ ${brokenScoreCutoff}`
                  }
                />
                <span title="Right: hides fewer — higher score keeps all but the surest-broken">
                  <Icon name="eye" size={12} className="text-emerald-500 shrink-0" />
                </span>
                <span className="text-[10px] text-neutral-500 dark:text-neutral-400 tabular-nums whitespace-nowrap w-16 text-right">
                  {brokenScoreCutoff == null ? 'Manual only' : `Score ≥ ${brokenScoreCutoff}`}
                </span>
              </div>
            )}
          </>
        )}

        <DropdownSectionHeader first={!canShowLayout && !showBrokenToggle}>Panels</DropdownSectionHeader>
        <DropdownItem onClick={() => openPanel('settings')} icon={<IconBadge name="settings" size={12} variant="muted" />}>
          Settings
        </DropdownItem>
        <DropdownItem onClick={() => openPanel('generations')} icon={<IconBadge name="sparkles" size={12} variant="success" />}>
          Generations
        </DropdownItem>
        <DropdownItem onClick={() => openPanel('providers')} icon={<IconBadge name="plug" size={12} variant="info" />}>
          Providers
        </DropdownItem>
        <DropdownItem onClick={() => openPanel('dev-tools')} icon={<IconBadge name="wrench" size={12} variant="warning" />}>
          Dev Tools
        </DropdownItem>

        <DropdownDivider />
        <DropdownItem
          onClick={() => { if (live) openPanel('generations'); }}
          disabled={!live}
          icon={<span className={`w-1.5 h-1.5 rounded-full ${live ? 'bg-green-500 animate-pulse-subtle' : 'bg-amber-500'}`} />}
          rightSlot={<span>{live ? 'Live' : 'Offline'}</span>}
        >
          Generation feed
        </DropdownItem>
      </Dropdown>
    </div>
  );
}
