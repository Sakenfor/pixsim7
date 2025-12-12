import { useRef, useMemo, useEffect, useState } from 'react';
import clsx from 'clsx';
import { Rnd } from 'react-rnd';
import { useControlCenterStore, type ControlModule } from '@features/controlCenter/stores/controlCenterStore';
import { controlCenterModuleRegistry } from '@/lib/control/controlCenterModuleRegistry';
import { useNavigate } from 'react-router-dom';
import { useDockBehavior } from './hooks/useDockBehavior';
import { DockToolbar } from './DockToolbar';
import { FLOATING_DEFAULTS, Z_INDEX } from './constants';

// Note: Control Center modules are now auto-registered when their parent modules
// register with the global module registry (see modules/index.ts)

export function ControlCenterDock() {
  // Use separate selectors to avoid creating new objects on every render
  const open = useControlCenterStore(s => s.open);
  const pinned = useControlCenterStore(s => s.pinned);
  const height = useControlCenterStore(s => s.height);
  const activeModule = useControlCenterStore(s => s.activeModule);
  const enabledModules = useControlCenterStore(s => s.enabledModules);
  const dockPosition = useControlCenterStore(s => s.dockPosition);
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

  const navigate = useNavigate();
  const dockRef = useRef<HTMLDivElement>(null);
  const [registryVersion, setRegistryVersion] = useState(0);

  useEffect(() => {
    const unsubscribe = controlCenterModuleRegistry.subscribe(() => {
      setRegistryVersion((version) => version + 1);
    });
    return unsubscribe;
  }, []);

  // Get enabled modules from registry
  const modules = useMemo(() => {
    return controlCenterModuleRegistry.getEnabled(enabledModules);
  }, [enabledModules, registryVersion]);

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

  function renderModule() {
    const module = controlCenterModuleRegistry.get(activeModule);
    if (!module) return null;

    const Component = module.component;
    return <Component isActive={true} onSwitchModule={setActiveModule} />;
  }
  const isVertical = dockPosition === 'left' || dockPosition === 'right';
  const isFloating = dockPosition === 'floating';

  // Position classes (for docked modes)
  const positionClasses = clsx(
    'fixed z-40 select-none transition-all duration-300 ease-out',
    {
      'left-0 right-0 bottom-0': dockPosition === 'bottom',
      'left-0 top-0 bottom-0': dockPosition === 'left',
      'right-0 top-0 bottom-0': dockPosition === 'right',
      'left-0 right-0 top-0': dockPosition === 'top',
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

  const containerStyle = isVertical
    ? { width: `${height}px` }
    : { height: `${height}px` };

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
          modules={modules}
          activeModule={activeModule}
          onModuleSelect={setActiveModule}
          dockPosition={dockPosition}
          onDockPositionChange={setDockPosition}
          pinned={pinned}
          onPinnedToggle={() => setPinned(!pinned)}
          onModeToggle={toggleMode}
          navigate={navigate}
        />

      {/* Module content with smooth fade-in */}
      <div
        className={clsx(
          'flex-1 overflow-y-auto scroll-smooth animate-in fade-in duration-300',
          isVertical || isFloating ? 'p-2 text-sm' : 'p-3'
        )}
        role="tabpanel"
        id={`module-${activeModule}`}
        aria-labelledby={`tab-${activeModule}`}
      >
        {renderModule()}
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
