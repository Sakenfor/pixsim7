import { useEffect, useRef, useState, useMemo } from 'react';
import clsx from 'clsx';
import { Rnd } from 'react-rnd';
import { ExpandableButtonGroup } from '@pixsim7/shared.ui';
import { useControlCenterStore, type ControlModule } from '../../stores/controlCenterStore';
import { controlCenterModuleRegistry } from '../../lib/control/controlCenterModuleRegistry';

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

  const dockRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);

  // Get enabled modules from registry
  const modules = useMemo(() => {
    return controlCenterModuleRegistry.getEnabled(enabledModules);
  }, [enabledModules]);

  // Use refs to avoid re-creating event listeners on every state change
  const openRef = useRef(open);
  const heightRef = useRef(height);

  useEffect(() => {
    openRef.current = open;
    heightRef.current = height;
  }, [open, height]);

  // Auto-hide when mouse leaves if not pinned (disabled for floating mode)
  useEffect(() => {
    if (dockPosition === 'floating') return; // Floating mode doesn't auto-hide

    function onMouseLeave(e: MouseEvent) {
      if (pinned) return;
      // If leaving to the reveal strip, keep open
      const winH = window.innerHeight;
      const winW = window.innerWidth;

      if (dockPosition === 'bottom' && e.clientY >= winH - 10) return;
      if (dockPosition === 'top' && e.clientY <= 10) return;
      if (dockPosition === 'left' && e.clientX <= 10) return;
      if (dockPosition === 'right' && e.clientX >= winW - 10) return;

      setOpen(false);
    }
    const n = dockRef.current;
    if (!n) return;
    n.addEventListener('mouseleave', onMouseLeave);
    return () => n.removeEventListener('mouseleave', onMouseLeave);
  }, [pinned, setOpen, dockPosition]);

  // Reveal strip hover to open (disabled for floating mode)
  useEffect(() => {
    if (dockPosition === 'floating') return; // Floating mode doesn't use reveal strip

    function onMove(e: MouseEvent) {
      // Check ref to avoid re-creating listener
      if (openRef.current) return;

      const winH = window.innerHeight;
      const winW = window.innerWidth;

      // Check appropriate edge based on dock position
      let shouldOpen = false;
      if (dockPosition === 'bottom' && e.clientY >= winH - 6) shouldOpen = true;
      if (dockPosition === 'top' && e.clientY <= 6) shouldOpen = true;
      if (dockPosition === 'left' && e.clientX <= 6) shouldOpen = true;
      if (dockPosition === 'right' && e.clientX >= winW - 6) shouldOpen = true;

      if (shouldOpen) setOpen(true);
    }
    window.addEventListener('mousemove', onMove);
    return () => window.removeEventListener('mousemove', onMove);
  }, [setOpen, dockPosition]);

  function startResize(e: React.MouseEvent) {
    e.preventDefault();
    setDragging(true);
    const startY = e.clientY;
    const startX = e.clientX;
    const startH = height;
    const pos = dockPosition;

    function onMove(ev: MouseEvent) {
      if (pos === 'left') {
        const dx = ev.clientX - startX;
        setHeight(startH + dx);
      } else if (pos === 'right') {
        const dx = startX - ev.clientX;
        setHeight(startH + dx);
      } else if (pos === 'top') {
        const dy = ev.clientY - startY;
        setHeight(startH + dy);
      } else {
        // bottom
        const dy = startY - ev.clientY;
        setHeight(startH + dy);
      }
    }
    function onUp() {
      setDragging(false);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  // Keyboard resize support
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      // Check ref to avoid re-creating listener
      if (!openRef.current) return;
      if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        e.preventDefault();
        const delta = e.key === 'ArrowUp' ? 20 : -20;
        // Use ref to get current height
        setHeight(heightRef.current + delta);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [setHeight]);

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

        {/* Compact Toolbar with animations */}
        <div className="control-center-header px-3 py-1.5 flex items-center gap-2 border-b border-white/10 bg-gradient-to-r from-neutral-50/90 via-white/40 to-neutral-50/90 dark:from-neutral-800/90 dark:via-neutral-900/40 dark:to-neutral-800/90 cursor-move">
          <span className="text-xs font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
            Control Center
          </span>
          <div className="flex-1" />

          {/* Module tabs with icons */}
          <div className="flex gap-1 overflow-x-auto max-w-md" role="tablist" aria-label="Control center modules">
            {modules.map(mod => (
              <button
                key={mod.id}
                role="tab"
                aria-selected={activeModule === mod.id}
                aria-controls={`module-${mod.id}`}
                onClick={() => setActiveModule(mod.id as ControlModule)}
                className={clsx(
                  'text-xs px-2 py-1 rounded-lg transition-all duration-200 whitespace-nowrap',
                  'focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-1',
                  'transform hover:scale-105 active:scale-95',
                  activeModule === mod.id
                    ? 'bg-gradient-to-r from-blue-600 to-purple-600 text-white shadow-lg shadow-purple-500/30'
                    : 'bg-neutral-200/50 dark:bg-neutral-700/50 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-700 hover:shadow-md'
                )}
                title={mod.description}
              >
                <span className="mr-1">{mod.icon}</span>
                {mod.label}
              </button>
            ))}
          </div>

          <div className="w-px h-4 bg-gradient-to-b from-transparent via-neutral-300 to-transparent dark:via-neutral-600" />

          {/* Dock Position Selector - Expandable Icon Grid */}
          <ExpandableButtonGroup
            trigger={
              <button className="text-xs px-2 py-1 border border-neutral-300/50 dark:border-neutral-600/50 rounded-lg bg-white dark:bg-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-700 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all hover:scale-105 active:scale-95">
                {dockPosition === 'bottom' && '⬇'}
                {dockPosition === 'top' && '⬆'}
                {dockPosition === 'left' && '⬅'}
                {dockPosition === 'right' && '➡'}
                {dockPosition === 'floating' && '⊡'}
              </button>
            }
            direction="up"
            hoverDelay={200}
            offset={6}
          >
            <div className="flex items-center gap-2 p-2 rounded-lg bg-neutral-900/95 backdrop-blur-sm shadow-2xl border border-neutral-700">
              <button
                onClick={() => setDockPosition('top')}
                className={clsx(
                  'w-8 h-8 rounded transition-all flex items-center justify-center text-sm',
                  dockPosition === 'top' ? 'bg-blue-600 text-white' : 'hover:bg-blue-600/80 text-white'
                )}
                title="Dock Top"
              >
                ⬆
              </button>
              <button
                onClick={() => setDockPosition('left')}
                className={clsx(
                  'w-8 h-8 rounded transition-all flex items-center justify-center text-sm',
                  dockPosition === 'left' ? 'bg-blue-600 text-white' : 'hover:bg-blue-600/80 text-white'
                )}
                title="Dock Left"
              >
                ⬅
              </button>
              <button
                onClick={() => setDockPosition('floating')}
                className={clsx(
                  'w-8 h-8 rounded transition-all flex items-center justify-center text-sm',
                  dockPosition === 'floating' ? 'bg-purple-600 text-white' : 'hover:bg-purple-600/80 text-white'
                )}
                title="Float"
              >
                ⊡
              </button>
              <button
                onClick={() => setDockPosition('right')}
                className={clsx(
                  'w-8 h-8 rounded transition-all flex items-center justify-center text-sm',
                  dockPosition === 'right' ? 'bg-blue-600 text-white' : 'hover:bg-blue-600/80 text-white'
                )}
                title="Dock Right"
              >
                ➡
              </button>
              <button
                onClick={() => setDockPosition('bottom')}
                className={clsx(
                  'w-8 h-8 rounded transition-all flex items-center justify-center text-sm',
                  dockPosition === 'bottom' ? 'bg-blue-600 text-white' : 'hover:bg-blue-600/80 text-white'
                )}
                title="Dock Bottom"
              >
                ⬇
              </button>
            </div>
          </ExpandableButtonGroup>

          {/* Action Button Group - Expandable */}
          <ExpandableButtonGroup
            trigger={
              <button className="text-xs px-2 py-1 border border-neutral-300/50 dark:border-neutral-600/50 rounded-lg bg-white dark:bg-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-700 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all hover:scale-105 active:scale-95">
                ⚙️
              </button>
            }
            direction="up"
            hoverDelay={200}
            offset={6}
          >
            <div className="flex items-center gap-2 p-2 rounded-lg bg-neutral-900/95 backdrop-blur-sm shadow-2xl border border-neutral-700">
              {/* Mode Switch */}
              <button
                onClick={toggleMode}
                className="flex flex-col items-center gap-1 px-3 py-2 rounded-md bg-neutral-800 hover:bg-purple-600 transition-all"
                title="Switch Mode"
              >
                <span className="text-sm">🎲</span>
                <span className="text-[9px] text-neutral-400 group-hover:text-white">Mode</span>
              </button>

              {/* Show/Hide */}
              <button
                onClick={() => setOpen(!open)}
                className="flex flex-col items-center gap-1 px-3 py-2 rounded-md bg-neutral-800 hover:bg-blue-600 transition-all"
                title="Toggle Visibility"
                aria-label={open ? 'Hide control center' : 'Show control center'}
              >
                <span className="text-sm">{open ? '▼' : '▲'}</span>
                <span className="text-[9px] text-neutral-400 group-hover:text-white">Show</span>
              </button>

              {/* Pin */}
              <button
                onClick={() => setPinned(!pinned)}
                className={clsx(
                  'flex flex-col items-center gap-1 px-3 py-2 rounded-md transition-all',
                  pinned ? 'bg-amber-600 hover:bg-amber-700' : 'bg-neutral-800 hover:bg-blue-600'
                )}
                title={pinned ? 'Unpin' : 'Pin'}
                aria-label={pinned ? 'Unpin control center' : 'Pin control center'}
                aria-pressed={pinned}
              >
                <span className="text-sm">{pinned ? '📌' : '📍'}</span>
                <span className="text-[9px] text-neutral-400 group-hover:text-white">Pin</span>
              </button>
            </div>
          </ExpandableButtonGroup>
        </div>

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
        minWidth={400}
        minHeight={300}
        bounds="window"
        dragHandleClassName="control-center-header"
        style={{ zIndex: 50 }}
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
