import { OrientationProvider } from '@pixsim7/shared.ui';
import clsx from 'clsx';
import type { DockviewApi } from 'dockview-core';
import { useRef, useMemo, useCallback, useEffect } from 'react';
import { Rnd } from 'react-rnd';
import { useNavigate } from 'react-router-dom';


import { useEdgeInset, useInsetOn } from '@lib/layout/edgeInsets';
import type { Edge } from '@lib/layout/edgeInsets';
import { panelSelectors } from '@lib/plugins/catalogSelectors';

import { useAssetViewerStore, selectIsViewerOpen } from '@features/assets';
import { useControlCenterStore } from '@features/controlCenter/stores/controlCenterStore';
import { filterPanelsByPrefs } from '@features/docks';
import { useDockPanelPrefs, useDockState, useDockUiStore } from '@features/docks/stores';
import type { DockPosition } from '@features/docks/stores';
import { usePanelCatalogBootstrap } from '@features/panels';
import { PanelHostDockview } from '@features/panels/components/host/PanelHostDockview';
import type { PanelHostDockviewRef } from '@features/panels/components/host/PanelHostDockview';
import { DOCK_IDS, PANEL_IDS } from '@features/panels/lib/panelIds';

import { FLOATING_DEFAULTS, TOOLBAR_HEIGHT, Z_INDEX } from './constants';
import { DockToolbar } from './DockToolbar';
import { useDockBehavior } from './hooks/useDockBehavior';

export function ControlCenterDock() {
  // Store selectors
  const open = useDockState(DOCK_IDS.controlCenter, (dock) => dock.open);
  const pinned = useDockState(DOCK_IDS.controlCenter, (dock) => dock.pinned);
  const height = useDockState(DOCK_IDS.controlCenter, (dock) => dock.size);
  const enabledModules = useDockPanelPrefs(DOCK_IDS.controlCenter, (prefs) => prefs);
  const dockPosition = useDockState(DOCK_IDS.controlCenter, (dock) => dock.dockPosition);
  const retractedMode = useDockState(DOCK_IDS.controlCenter, (dock) => dock.retractedMode);
  const layoutBehavior = useDockState(
    DOCK_IDS.controlCenter,
    (dock) => dock.layoutBehavior,
  );
  const panelLayoutResetTrigger = useDockState(
    DOCK_IDS.controlCenter,
    (dock) => dock.panelLayoutResetTrigger,
  );
  const conformToOtherPanels = useControlCenterStore(s => s.conformToOtherPanels);
  const floatingPosition = useDockState(
    DOCK_IDS.controlCenter,
    (dock) => dock.floatingPosition,
  );
  const floatingSize = useDockState(
    DOCK_IDS.controlCenter,
    (dock) => dock.floatingSize,
  );

  const setDockOpen = useDockUiStore((s) => s.setDockOpen);
  const toggleDockPinned = useDockUiStore((s) => s.setDockPinned);
  const setDockSize = useDockUiStore((s) => s.setDockSize);
  const setDockPositionRaw = useDockUiStore((s) => s.setDockPosition);
  const setDockFloatingPosition = useDockUiStore((s) => s.setDockFloatingPosition);
  const setDockFloatingSize = useDockUiStore((s) => s.setDockFloatingSize);

  const setOpen = useCallback(
    (value: boolean) => setDockOpen(DOCK_IDS.controlCenter, value),
    [setDockOpen],
  );
  const setPinned = useCallback(
    (value: boolean) => toggleDockPinned(DOCK_IDS.controlCenter, value),
    [toggleDockPinned],
  );
  const setHeight = useCallback(
    (value: number) => setDockSize(DOCK_IDS.controlCenter, value),
    [setDockSize],
  );
  const setDockPosition = useCallback(
    (position: DockPosition) => setDockPositionRaw(DOCK_IDS.controlCenter, position),
    [setDockPositionRaw],
  );
  const setFloatingPosition = useCallback(
    (x: number, y: number) => setDockFloatingPosition(DOCK_IDS.controlCenter, x, y),
    [setDockFloatingPosition],
  );
  const setFloatingSize = useCallback(
    (width: number, heightPx: number) =>
      setDockFloatingSize(DOCK_IDS.controlCenter, width, heightPx),
    [setDockFloatingSize],
  );

  // Asset viewer state for conformToOtherPanels behavior
  const isViewerOpen = useAssetViewerStore(selectIsViewerOpen);
  const viewerMode = useAssetViewerStore((s) => s.mode);
  const viewerSettings = useAssetViewerStore((s) => s.settings);

  const navigate = useNavigate();
  const dockRef = useRef<HTMLDivElement>(null);
  const dockviewApiRef = useRef<DockviewApi | null>(null);
  const panelHostRef = useRef<PanelHostDockviewRef>(null);
  const { catalogVersion: panelCatalogVersion, initializationComplete } = usePanelCatalogBootstrap({
    contexts: [DOCK_IDS.controlCenter],
    enabled: open,
    onInitializeError: (error) => {
      console.error('[ControlCenterDock] Failed to initialize control-center panels:', error);
    },
  });

  // Get enabled panels based on user preferences
  const panels = useMemo(() => {
    return filterPanelsByPrefs(
      panelSelectors.getPanelsForScope(DOCK_IDS.controlCenter),
      enabledModules,
    );
  }, [enabledModules, panelCatalogVersion, open]);

  // Get panel IDs for dockview allowlist
  const allowedPanelIds = useMemo(() => panels.map(p => p.id), [panels]);
  const showPanelLoadingPlaceholder = open && !initializationComplete;

  // Use extracted hook for dock behavior (reveal/hide, resize, keyboard)
  const { dragging, startResize } = useDockBehavior({
    dockPosition,
    retractedMode,
    open,
    pinned,
    height,
    setOpen,
    setHeight,
    dockRef,
  });

  // Simple ready handler - just store the API ref
  const handleReady = useCallback((api: DockviewApi) => {
    dockviewApiRef.current = api;
  }, []);

  // Reset panel layout when dropdown menu triggers it (skip initial value of 0)
  useEffect(() => {
    if (panelLayoutResetTrigger > 0 && panelHostRef.current) {
      panelHostRef.current.resetLayout();
    }
  }, [panelLayoutResetTrigger]);

  const isVertical = dockPosition === 'left' || dockPosition === 'right';
  const isFloating = dockPosition === 'floating';

  // Register in edge insets so other widgets + content area can respond
  // When retracted in peek mode, always push (toolbar is visible and would overlap content)
  const peekRetracted = !open && retractedMode === 'peek';
  useEdgeInset(
    PANEL_IDS.controlCenter,
    isFloating ? 'bottom' : (dockPosition as Edge),
    peekRetracted ? TOOLBAR_HEIGHT : height,
    !isFloating && (open || peekRetracted),
    10, // after activity bar (0)
    layoutBehavior === 'push' || peekRetracted,
  );

  // Read insets from other widgets to offset our positioning
  const leftInset = useInsetOn('left', PANEL_IDS.controlCenter);
  const rightInset = useInsetOn('right', PANEL_IDS.controlCenter);

  // Calculate layout adjustments when conforming to other panels
  const layoutAdjustment = useMemo(() => {
    if (!conformToOtherPanels || isFloating || !isViewerOpen || viewerMode !== 'side') {
      return { offsetRight: 0, widthReduction: 0 };
    }

    const viewerWidthPercent = viewerSettings.panelWidth;
    const viewerWidthPx = (window.innerWidth * viewerWidthPercent) / 100;

    if (dockPosition === 'bottom' || dockPosition === 'top') {
      return { offsetRight: 0, widthReduction: viewerWidthPx };
    }

    if (dockPosition === 'right') {
      return { offsetRight: viewerWidthPx, widthReduction: 0 };
    }

    return { offsetRight: 0, widthReduction: 0 };
  }, [conformToOtherPanels, isFloating, isViewerOpen, viewerMode, viewerSettings.panelWidth, dockPosition]);

  // Position classes (for docked modes) — left/right set via inline style from edge insets
  const positionClasses = clsx(
    'fixed z-40 select-none overflow-hidden transition-all duration-300 ease-out',
    {
      'bottom-0': dockPosition === 'bottom',
      'top-0 bottom-0': dockPosition === 'left' || dockPosition === 'right',
      'top-0': dockPosition === 'top',
    }
  );

  // Retracted transform/size — peek collapses to toolbar height, hidden slides off-screen
  const retractedStyle: React.CSSProperties = {};
  if (!open) {
    if (retractedMode === 'peek') {
      // Collapse to toolbar height — header stays visible regardless of dock edge
      if (isVertical) {
        retractedStyle.width = `${TOOLBAR_HEIGHT}px`;
      } else {
        retractedStyle.height = `${TOOLBAR_HEIGHT}px`;
      }
    } else {
      // Translate off-screen leaving a 6px reveal strip
      if (dockPosition === 'bottom') retractedStyle.transform = 'translateY(calc(100% - 6px))';
      else if (dockPosition === 'top') retractedStyle.transform = 'translateY(calc(-100% + 6px))';
      else if (dockPosition === 'left') retractedStyle.transform = 'translateX(calc(-100% + 6px))';
      else if (dockPosition === 'right') retractedStyle.transform = 'translateX(calc(100% - 6px))';
    }
  }

  const transformClasses = clsx({
    'opacity-100': open,
    'opacity-90': !open,
  });

  const containerStyle: React.CSSProperties = useMemo(() => {
    const baseStyle = isVertical
      ? { width: `${height}px` }
      : { height: `${height}px` };

    if (dockPosition === 'bottom' || dockPosition === 'top') {
      const totalWidthReduction = layoutAdjustment.widthReduction + leftInset + rightInset;
      return { ...baseStyle, left: `${leftInset}px`, width: `calc(100% - ${totalWidthReduction}px)` };
    } else if (dockPosition === 'left') {
      return { ...baseStyle, left: `${leftInset}px` };
    } else if (dockPosition === 'right') {
      return { ...baseStyle, right: `${layoutAdjustment.offsetRight + rightInset}px` };
    }

    return baseStyle;
  }, [isVertical, height, dockPosition, layoutAdjustment, leftInset, rightInset]);

  // Render content (shared between floating and docked)
  const renderContent = () => (
    <OrientationProvider orientation={isVertical ? 'vertical' : 'horizontal'}>
    <div className={clsx(
        'h-full bg-gradient-to-t from-white/98 via-white/95 to-white/90 dark:from-neutral-900/98 dark:via-neutral-900/95 dark:to-neutral-900/90 backdrop-blur-xl shadow-2xl flex',
        {
          'border-t border-white/20 flex-col': dockPosition === 'bottom',
          'border-b border-white/20 flex-col': dockPosition === 'top',
          'border-r border-white/20 flex-row': dockPosition === 'left',
          'border-l border-white/20 flex-row': dockPosition === 'right',
          'border border-white/20 rounded-lg flex-col': isFloating,
        }
      )}>
        {/* Resize handle with glow effect */}
        {!isFloating && (
          <div
            onMouseDown={startResize}
            className={clsx(
              'transition-all duration-200',
              {
                'h-1.5 w-full cursor-ns-resize': !isVertical,
                'w-1.5 h-full cursor-ew-resize': isVertical,
              },
              'hover:bg-gradient-to-r hover:from-blue-500/30 hover:via-purple-500/30 hover:to-pink-500/30',
              dragging && 'bg-gradient-to-r from-blue-500/50 via-purple-500/50 to-pink-500/50 shadow-lg shadow-purple-500/50'
            )}
            title="Drag to resize (or use Alt+Arrow keys)"
            role="separator"
            aria-orientation={isVertical ? 'vertical' : 'horizontal'}
            aria-label="Resize control center"
          />
        )}

        {/* Compact Toolbar - just for settings, not module selection */}
        <DockToolbar
          dockPosition={dockPosition}
          onDockPositionChange={setDockPosition}
          pinned={pinned}
          onPinnedToggle={() => setPinned(!pinned)}
          navigate={navigate}
        />

      {/* Panel content via dockview - uses native tabs */}
      <div
        className={clsx(
          'flex-1 overflow-hidden',
          isVertical || isFloating ? 'text-sm' : ''
        )}
      >
        {showPanelLoadingPlaceholder ? (
          <div className="h-full w-full" />
        ) : allowedPanelIds.length > 0 ? (
          <PanelHostDockview
            ref={panelHostRef}
            dockId={DOCK_IDS.controlCenter}
            allowedPanels={allowedPanelIds}
            storageKey="dockview:control-center:v6"
            panelManagerId={PANEL_IDS.controlCenter}
            minPanelsForTabs={2}
            onReady={handleReady}
            className="h-full"
            enableContextMenu
            resolvePanelTitle={(panelId) => panelSelectors.get(panelId)?.title ?? panelId}
          />
        ) : (
          <div className="h-full flex items-center justify-center text-neutral-500 text-sm">
            No panels enabled
          </div>
        )}
      </div>
    </div>
    </OrientationProvider>
  );

  // Floating mode: use react-rnd for draggable/resizable behavior
  if (isFloating) {
    if (!open) return null;

    return (
      <Rnd
        position={floatingPosition}
        size={floatingSize}
        onDragStop={(e, d) => {
          setFloatingPosition(d.x, d.y);
        }}
        onResizeStop={(e, direction, ref, delta, position) => {
          setFloatingSize(
            parseInt(ref.style.width),
            parseInt(ref.style.height)
          );
          setFloatingPosition(position.x, position.y);
        }}
        minWidth={FLOATING_DEFAULTS.minWidth}
        minHeight={FLOATING_DEFAULTS.minHeight}
        bounds="window"
        dragHandleClassName="control-center-header"
        style={{ zIndex: Z_INDEX.floating }}
      >
        {renderContent()}
      </Rnd>
    );
  }

  // Docked mode: use fixed positioning with edge-based reveal
  return (
    <div
      ref={dockRef}
      className={clsx(positionClasses, transformClasses)}
      style={{ ...containerStyle, ...retractedStyle }}
    >
      {renderContent()}
    </div>
  );
}
