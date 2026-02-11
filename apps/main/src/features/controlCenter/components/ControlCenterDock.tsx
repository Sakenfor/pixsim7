import clsx from 'clsx';
import type { DockviewApi } from 'dockview-core';
import { useRef, useMemo, useCallback, useEffect } from 'react';
import { Rnd } from 'react-rnd';
import { useNavigate } from 'react-router-dom';

import { panelSelectors } from '@lib/plugins/catalogSelectors';

import { useAssetViewerStore, selectIsViewerOpen } from '@features/assets';
import { useControlCenterStore } from '@features/controlCenter/stores/controlCenterStore';
import { PanelHostDockview } from '@features/panels';
import type { PanelDefinition, PanelHostDockviewRef } from '@features/panels';

import { FLOATING_DEFAULTS, Z_INDEX } from './constants';
import { DockToolbar } from './DockToolbar';
import { useDockBehavior } from './hooks/useDockBehavior';

/**
 * Get enabled control center panels based on user preferences.
 * Filters panels that have availableIn: ['control-center'].
 */
function getEnabledCCPanels(enabledPrefs?: Record<string, boolean>): PanelDefinition[] {
  const all = panelSelectors.getPanelsForScope('control-center');

  if (!enabledPrefs || Object.keys(enabledPrefs).length === 0) {
    return all.filter((p) => p.enabledByDefault !== false);
  }

  return all.filter((p) => {
    if (p.id in enabledPrefs) {
      return enabledPrefs[p.id];
    }
    return p.enabledByDefault !== false;
  });
}

export function ControlCenterDock() {
  // Store selectors
  const open = useControlCenterStore(s => s.open);
  const pinned = useControlCenterStore(s => s.pinned);
  const height = useControlCenterStore(s => s.height);
  const enabledModules = useControlCenterStore(s => s.enabledModules);
  const dockPosition = useControlCenterStore(s => s.dockPosition);
  const conformToOtherPanels = useControlCenterStore(s => s.conformToOtherPanels);
  const floatingPosition = useControlCenterStore(s => s.floatingPosition);
  const floatingSize = useControlCenterStore(s => s.floatingSize);
  const setOpen = useControlCenterStore(s => s.setOpen);
  const setPinned = useControlCenterStore(s => s.setPinned);
  const setHeight = useControlCenterStore(s => s.setHeight);
  const setDockPosition = useControlCenterStore(s => s.setDockPosition);
  const setFloatingPosition = useControlCenterStore(s => s.setFloatingPosition);
  const setFloatingSize = useControlCenterStore(s => s.setFloatingSize);

  // Asset viewer state for conformToOtherPanels behavior
  const isViewerOpen = useAssetViewerStore(selectIsViewerOpen);
  const viewerMode = useAssetViewerStore((s) => s.mode);
  const viewerSettings = useAssetViewerStore((s) => s.settings);

  // Panel layout reset trigger from dropdown menu
  const panelLayoutResetTrigger = useControlCenterStore(s => s.panelLayoutResetTrigger);

  const navigate = useNavigate();
  const dockRef = useRef<HTMLDivElement>(null);
  const dockviewApiRef = useRef<DockviewApi | null>(null);
  const panelHostRef = useRef<PanelHostDockviewRef>(null);

  // Get enabled panels based on user preferences
  const panels = useMemo(() => {
    return getEnabledCCPanels(enabledModules);
  }, [enabledModules]);

  // Get panel IDs for dockview allowlist
  const allowedPanelIds = useMemo(() => panels.map(p => p.id), [panels]);

  // Use extracted hook for dock behavior (reveal/hide, resize, keyboard)
  const { dragging, startResize } = useDockBehavior({
    dockPosition,
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

  // Position classes (for docked modes)
  const positionClasses = clsx(
    'fixed z-40 select-none transition-all duration-300 ease-out',
    {
      'left-0 bottom-0': dockPosition === 'bottom',
      'left-0 top-0 bottom-0': dockPosition === 'left',
      'top-0 bottom-0': dockPosition === 'right',
      'left-0 top-0': dockPosition === 'top',
    }
  );

  // Transform classes based on position and open state (for docked modes)
  const transformClasses = clsx({
    'translate-y-0': open && (dockPosition === 'bottom' || dockPosition === 'top'),
    'translate-y-[calc(100%-6px)]': !open && dockPosition === 'bottom',
    '-translate-y-[calc(100%-6px)]': !open && dockPosition === 'top',
    'translate-x-0': open && (dockPosition === 'left' || dockPosition === 'right'),
    '-translate-x-[calc(100%-6px)]': !open && dockPosition === 'left',
    'translate-x-[calc(100%-6px)]': !open && dockPosition === 'right',
    'opacity-100': open,
    'opacity-90': !open,
  });

  const containerStyle: React.CSSProperties = useMemo(() => {
    const baseStyle = isVertical
      ? { width: `${height}px` }
      : { height: `${height}px` };

    if (dockPosition === 'bottom' || dockPosition === 'top') {
      const adjustedWidth = `calc(100% - ${layoutAdjustment.widthReduction}px)`;
      return { ...baseStyle, width: adjustedWidth, right: `${layoutAdjustment.offsetRight}px` };
    } else if (dockPosition === 'right') {
      return { ...baseStyle, right: `${layoutAdjustment.offsetRight}px` };
    }

    return baseStyle;
  }, [isVertical, height, dockPosition, layoutAdjustment]);

  // Render content (shared between floating and docked)
  const renderContent = () => (
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
        {allowedPanelIds.length > 0 ? (
          <PanelHostDockview
            ref={panelHostRef}
            dockId="control-center"
            allowedPanels={allowedPanelIds}
            storageKey="dockview:control-center:v6"
            panelManagerId="controlCenter"
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
      style={containerStyle}
    >
      {renderContent()}
    </div>
  );
}
