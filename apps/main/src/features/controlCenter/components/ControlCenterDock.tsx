import { useRef, useMemo, useEffect, useState, useCallback } from 'react';
import clsx from 'clsx';
import { Rnd } from 'react-rnd';
import type { DockviewApi } from 'dockview-core';
import { useControlCenterStore } from '@features/controlCenter/stores/controlCenterStore';
import { useNavigate } from 'react-router-dom';
import { useDockBehavior } from './hooks/useDockBehavior';
import { DockToolbar } from './DockToolbar';
import { FLOATING_DEFAULTS, Z_INDEX } from './constants';
import { useAssetViewerStore, selectIsViewerOpen } from '@features/assets';
import { SmartDockview } from '@lib/dockview/SmartDockview';
import { createLocalPanelRegistry } from '@lib/dockview/LocalPanelRegistry';
import { panelRegistry, getPanelsByTag, type PanelDefinition } from '@features/panels';

// Empty registry - we use global panels via globalPanelIds
const emptyRegistry = createLocalPanelRegistry();

// Helper to get CC panels from global registry
function getCCPanels(): PanelDefinition[] {
  return getPanelsByTag('control-center').sort((a, b) => (a.order ?? 100) - (b.order ?? 100));
}

// Helper to get enabled CC panels based on user preferences
function getEnabledCCPanels(enabledPrefs?: Record<string, boolean>): PanelDefinition[] {
  const all = getCCPanels();

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
  // Use separate selectors to avoid creating new objects on every render
  const open = useControlCenterStore(s => s.open);
  const pinned = useControlCenterStore(s => s.pinned);
  const height = useControlCenterStore(s => s.height);
  const activeModule = useControlCenterStore(s => s.activeModule);
  const enabledModules = useControlCenterStore(s => s.enabledModules);
  const dockPosition = useControlCenterStore(s => s.dockPosition);
  const conformToOtherPanels = useControlCenterStore(s => s.conformToOtherPanels);
  const floatingPosition = useControlCenterStore(s => s.floatingPosition);
  const floatingSize = useControlCenterStore(s => s.floatingSize);
  const setOpen = useControlCenterStore(s => s.setOpen);
  const setPinned = useControlCenterStore(s => s.setPinned);
  const setHeight = useControlCenterStore(s => s.setHeight);
  const setActiveModule = useControlCenterStore(s => s.setActiveModule);
  const setDockPosition = useControlCenterStore(s => s.setDockPosition);
  const setFloatingPosition = useControlCenterStore(s => s.setFloatingPosition);
  const setFloatingSize = useControlCenterStore(s => s.setFloatingSize);
  const toggleMode = useControlCenterStore(s => s.toggleMode);

  // Asset viewer state for conformToOtherPanels behavior
  const isViewerOpen = useAssetViewerStore(selectIsViewerOpen);
  const viewerMode = useAssetViewerStore((s) => s.mode);
  const viewerSettings = useAssetViewerStore((s) => s.settings);

  const navigate = useNavigate();
  const dockRef = useRef<HTMLDivElement>(null);
  const dockviewApiRef = useRef<DockviewApi | null>(null);
  const [registryVersion, setRegistryVersion] = useState(0);

  // Subscribe to global registry changes
  useEffect(() => {
    const checkRegistry = () => {
      const panels = getCCPanels();
      if (panels.length > 0) {
        setRegistryVersion((v) => v + 1);
      }
    };
    const interval = setInterval(checkRegistry, 100);
    checkRegistry();

    // Also subscribe to panelRegistry changes
    const unsubscribe = panelRegistry.subscribe(() => {
      setRegistryVersion((v) => v + 1);
    });

    return () => {
      clearInterval(interval);
      unsubscribe();
    };
  }, []);

  // Get enabled panels for toolbar
  const panels = useMemo(() => {
    return getEnabledCCPanels(enabledModules);
  }, [enabledModules, registryVersion]);

  // Get panel IDs for SmartDockview
  const globalPanelIds = useMemo(() => {
    return panels.map(p => p.id);
  }, [panels]);

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

  // Handle dockview ready - sync with active module
  const handleDockviewReady = useCallback((api: DockviewApi) => {
    dockviewApiRef.current = api;

    // When dockview is ready, activate the current module's panel
    if (activeModule) {
      // Try both old and new ID formats
      const panel = api.getPanel(activeModule) || api.getPanel(`cc-${activeModule}`);
      if (panel) {
        panel.api.setActive();
      }
    }
  }, [activeModule]);

  // Sync activeModule with dockview when it changes
  useEffect(() => {
    const api = dockviewApiRef.current;
    if (!api || !activeModule) return;

    // Try both old and new ID formats
    const panel = api.getPanel(activeModule) || api.getPanel(`cc-${activeModule}`);
    if (panel && !panel.api.isActive) {
      panel.api.setActive();
    }
  }, [activeModule]);

  // Default layout - shows all panels in a single group
  const createDefaultLayout = useCallback((api: DockviewApi) => {
    const allPanels = panels;
    if (allPanels.length === 0) return;

    // Add the first panel
    const firstPanel = allPanels[0];
    api.addPanel({
      id: firstPanel.id,
      component: firstPanel.id,
      title: firstPanel.title,
    });

    // Add remaining panels to the same group (creates tabs)
    for (let i = 1; i < allPanels.length; i++) {
      const panel = allPanels[i];
      api.addPanel({
        id: panel.id,
        component: panel.id,
        title: panel.title,
        position: {
          referencePanel: firstPanel.id,
        },
      });
    }

    // Activate the active module's panel
    if (activeModule) {
      const targetPanel = api.getPanel(activeModule) || api.getPanel(`cc-${activeModule}`);
      if (targetPanel) {
        targetPanel.api.setActive();
      }
    }
  }, [activeModule, panels]);

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

  // Handle toolbar module select - activate the panel in dockview
  const handleModuleSelect = useCallback((moduleId: string) => {
    setActiveModule(moduleId);
    const api = dockviewApiRef.current;
    if (api) {
      const panel = api.getPanel(moduleId);
      if (panel) {
        panel.api.setActive();
      }
    }
  }, [setActiveModule]);

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

        {/* Compact Toolbar - extracted component */}
        <DockToolbar
          modules={panels.map(p => ({
            id: p.id,
            label: p.title,
            icon: p.icon ?? '📦',
            component: p.component,
            category: p.category,
            order: p.order,
            tags: p.tags,
            description: p.description,
          }))}
          activeModule={activeModule}
          onModuleSelect={handleModuleSelect}
          dockPosition={dockPosition}
          onDockPositionChange={setDockPosition}
          pinned={pinned}
          onPinnedToggle={() => setPinned(!pinned)}
          onModeToggle={toggleMode}
          navigate={navigate}
        />

      {/* Panel content via SmartDockview - uses global panels */}
      <div
        className={clsx(
          'flex-1 overflow-hidden',
          isVertical || isFloating ? 'text-sm' : ''
        )}
        role="tabpanel"
        id={`module-${activeModule}`}
        aria-labelledby={`tab-${activeModule}`}
      >
        {globalPanelIds.length > 0 ? (
          <SmartDockview
            registry={emptyRegistry}
            defaultLayout={createDefaultLayout}
            storageKey="control-center-dockview-layout:v2"
            panelManagerId="controlCenter"
            minPanelsForTabs={99} // Hide tabs - we have our own toolbar
            onReady={handleDockviewReady}
            className="h-full"
            enableContextMenu
            includeGlobalPanels
            globalPanelIds={globalPanelIds}
          />
        ) : (
          <div className="h-full flex items-center justify-center text-neutral-500 text-sm">
            Loading panels...
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
