/**
 * MobileQuickGenLauncher
 *
 * Persistent floating action button (mobile only) that opens Quick Generate in
 * a full-screen sheet — the one standalone entry point to QuickGen on phones.
 *
 * Why this exists: the `quickGenerate` panel is scoped to the asset-viewer dock
 * and gated on a current asset (`availableIn: ['asset-viewer']` +
 * `showWhen: currentAsset || currentScene`), and the Control Center — the only
 * asset-independent QuickGen home — is desktop-only (see ControlCenterDock).
 * So before this, the sole mobile path into QuickGen was: open an asset →
 * switch to the Quick Generate tab. This FAB adds a "just generate" entry
 * reachable from any page.
 *
 * The QuickGen surface is lazily mounted on first open and then kept mounted
 * (hidden via CSS) so prompt/input state survives closing the sheet to glance
 * at the gallery and reopening. The mobile QuickGen host is a plain stacked
 * scroll container (not dockview), so hide/show needs no remeasure.
 *
 * The FAB hides while the asset viewer is open — QuickGen is already reachable
 * there as a tab, and the viewer has its own bottom nav the button would
 * overlap.
 */

import { Z } from '@pixsim7/shared.ui';
import { useState } from 'react';
import { createPortal } from 'react-dom';

import { Icon } from '@lib/icons';

import { selectIsViewerOpen, useAssetViewerStore } from '@features/assets';
import { useIsMobileViewport } from '@features/panels/components/host/useIsMobileViewport';

import { useGenerationWebSocket } from '../hooks/useGenerationWebSocket';

import { QuickGenWidget } from './QuickGenWidget';

// Asset + Prompt + Settings — the full standalone set (mirrors the Control
// Center's mobile-independent QuickGen). The asset panel lets the user add
// inputs via its picker, so image/video ops work without an asset pre-selected.
const MOBILE_QUICKGEN_PANEL_IDS = [
  'quickgen-asset',
  'quickgen-prompt',
  'quickgen-settings',
] as const;

function MobileQuickGenSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  // WS lives inside the sheet (not the launcher) so it only spins up after the
  // user first opens QuickGen, not for every mobile session.
  useGenerationWebSocket();

  return (
    <div
      className={open ? 'fixed inset-0 flex flex-col bg-neutral-950' : 'hidden'}
      // Sit at the float-panel layer, NOT globalModal. The QuickGen surface hosts
      // popovers (generation pill expand-menus, dropdowns, context menus) that
      // portal to <body> at Z.floatOverlay (10200). At globalModal (10301) this
      // opaque full-screen sheet paints OVER those popovers, so on mobile they
      // open but stay invisible. floatPanel keeps the sheet above all page chrome
      // while the floatOverlay layer (designed to float above panels) surfaces the
      // popovers. Real confirmation dialogs (globalModal) + toasts still overlay.
      style={{ zIndex: Z.floatPanel }}
      role="dialog"
      aria-modal="true"
      aria-label="Quick Generate"
    >
      <header className="flex-none h-12 px-3 flex items-center justify-between border-b border-neutral-800">
        <div className="flex items-center gap-2 text-sm font-medium text-neutral-100">
          <Icon name="sparkles" size={16} />
          Quick Generate
        </div>
        <button
          type="button"
          onClick={onClose}
          className="w-9 h-9 flex items-center justify-center rounded-lg text-neutral-400 hover:text-neutral-100 hover:bg-neutral-800 transition-colors"
          aria-label="Close Quick Generate"
        >
          <Icon name="x" size={18} />
        </button>
      </header>
      <div className="flex-1 min-h-0">
        <QuickGenWidget
          widgetId="mobileQuickGen"
          label="Quick Generate"
          panelManagerId="mobileQuickGen"
          panelIds={MOBILE_QUICKGEN_PANEL_IDS}
          priority={40}
          isOpen={open}
          setOpen={(next) => {
            if (!next) onClose();
          }}
          contextExposure="active"
          storageKeyPrefix="mobile-quickgen"
          className="h-full flex flex-col"
          panelHostClassName="flex-1 min-h-0"
          minPanelsForTabs={2}
        />
      </div>
    </div>
  );
}

export function MobileQuickGenLauncher() {
  const isMobile = useIsMobileViewport();
  const isViewerOpen = useAssetViewerStore(selectIsViewerOpen);
  const [open, setOpen] = useState(false);
  // Once opened, keep the sheet mounted (hidden) so prompt/input state persists
  // across close/reopen. Stays unmounted until the first tap to avoid the WS +
  // generation controller running for users who never reach for it.
  const [mounted, setMounted] = useState(false);

  if (!isMobile) return null;

  const openSheet = () => {
    setMounted(true);
    setOpen(true);
  };

  return createPortal(
    <>
      {!isViewerOpen && !open && (
        <button
          type="button"
          onClick={openSheet}
          className="fixed bottom-5 right-5 w-14 h-14 flex items-center justify-center rounded-full bg-accent text-accent-text shadow-lg active:scale-95 transition-transform"
          style={{ zIndex: Z.fixed }}
          aria-label="Open Quick Generate"
        >
          <Icon name="sparkles" size={22} />
        </button>
      )}
      {mounted && <MobileQuickGenSheet open={open} onClose={() => setOpen(false)} />}
    </>,
    document.body,
  );
}
