import { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { useControlCenterStore, type ControlModule } from '../../stores/controlCenterStore';
import { QuickGenerateModule } from './modules/QuickGenerateModule';
import { ShortcutsModule } from './modules/ShortcutsModule';
import { PresetsModule } from './modules/PresetsModule';

const MODULES: { id: ControlModule; label: string }[] = [
  { id: 'quickGenerate', label: 'Generate' },
  { id: 'shortcuts', label: 'Shortcuts' },
  { id: 'presets', label: 'Presets' },
];

export function ControlCenterDock() {
  const {
    open,
    pinned,
    height,
    activeModule,
    setOpen,
    setPinned,
    setHeight,
    setActiveModule,
  } = useControlCenterStore(s => ({
    open: s.open,
    pinned: s.pinned,
    height: s.height,
    activeModule: s.activeModule,
    setOpen: s.setOpen,
    setPinned: s.setPinned,
    setHeight: s.setHeight,
    setActiveModule: s.setActiveModule,
  }));

  const dockRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);

  // Auto-hide when mouse leaves if not pinned
  useEffect(() => {
    function onMouseLeave(e: MouseEvent) {
      if (pinned) return;
      // If leaving to the reveal strip (bottom 8px), keep open
      const winH = window.innerHeight;
      if (e.clientY >= winH - 10) return;
      setOpen(false);
    }
    const n = dockRef.current;
    if (!n) return;
    n.addEventListener('mouseleave', onMouseLeave);
    return () => n.removeEventListener('mouseleave', onMouseLeave);
  }, [pinned, setOpen]);

  // Reveal strip hover to open
  useEffect(() => {
    function onMove(e: MouseEvent) {
      const winH = window.innerHeight;
      if (!open && e.clientY >= winH - 6) {
        setOpen(true);
      }
    }
    window.addEventListener('mousemove', onMove);
    return () => window.removeEventListener('mousemove', onMove);
  }, [open, setOpen]);

  function startResize(e: React.MouseEvent) {
    e.preventDefault();
    setDragging(true);
    const startY = e.clientY;
    const startH = height;
    function onMove(ev: MouseEvent) {
      const dy = startY - ev.clientY;
      setHeight(startH + dy);
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
      if (!open) return;
      if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        e.preventDefault();
        const delta = e.key === 'ArrowUp' ? 20 : -20;
        setHeight(height + delta);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, height, setHeight]);

  function renderModule() {
    switch (activeModule) {
      case 'quickGenerate':
        return <QuickGenerateModule />;
      case 'shortcuts':
        return <ShortcutsModule />;
      case 'presets':
        return <PresetsModule />;
      default:
        return null;
    }
  }
  return (
    <div
      ref={dockRef}
      className={clsx(
        'fixed left-0 right-0 bottom-0 z-40 select-none',
        'transition-transform duration-200 ease-out',
        open ? 'translate-y-0' : 'translate-y-[calc(100%-8px)]'
      )}
      style={{ height }}
    >
      {/* Panel chrome */}
      <div className="h-full border-t bg-white/95 dark:bg-neutral-900/95 backdrop-blur shadow-2xl flex flex-col">
        {/* Resize handle */}
        <div
          onMouseDown={startResize}
          className={clsx(
            'h-2 w-full cursor-ns-resize hover:bg-neutral-200/40 dark:hover:bg-neutral-700/40 transition-colors',
            dragging && 'bg-neutral-400/60'
          )}
          title="Drag to resize (or use Alt+Arrow keys)"
          role="separator"
          aria-orientation="horizontal"
          aria-label="Resize control center"
        />

        {/* Toolbar */}
        <div className="px-3 py-2 flex items-center gap-2 border-b bg-neutral-50/80 dark:bg-neutral-800/60">
          <span className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
            Control Center
          </span>
          <div className="flex-1" />

          {/* Module tabs */}
          <div className="flex gap-1" role="tablist" aria-label="Control center modules">
            {MODULES.map(mod => (
              <button
                key={mod.id}
                role="tab"
                aria-selected={activeModule === mod.id}
                aria-controls={`module-${mod.id}`}
                onClick={() => setActiveModule(mod.id)}
                className={clsx(
                  'text-xs px-2 py-1 rounded transition-colors',
                  'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1',
                  activeModule === mod.id
                    ? 'bg-blue-600 text-white'
                    : 'bg-neutral-200/50 dark:bg-neutral-700/50 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-700'
                )}
              >
                {mod.label}
              </button>
            ))}
          </div>

          <div className="w-px h-4 bg-neutral-300 dark:bg-neutral-600" />

          <button
            onClick={() => setOpen(!open)}
            className="text-xs px-2 py-1 border rounded hover:bg-neutral-100 dark:hover:bg-neutral-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
            aria-label={open ? 'Hide control center' : 'Show control center'}
          >
            {open ? 'Hide' : 'Show'}
          </button>
          <button
            onClick={() => setPinned(!pinned)}
            className={clsx(
              'text-xs px-2 py-1 border rounded transition-colors',
              'focus:outline-none focus:ring-2 focus:ring-blue-500',
              pinned
                ? 'bg-amber-200/50 dark:bg-amber-800/30'
                : 'hover:bg-neutral-100 dark:hover:bg-neutral-700'
            )}
            title="Pin to keep open"
            aria-label={pinned ? 'Unpin control center' : 'Pin control center'}
            aria-pressed={pinned}
          >
            {pinned ? 'Pinned' : 'Pin'}
          </button>
        </div>

        {/* Module content */}
        <div
          className="flex-1 overflow-y-auto p-3"
          role="tabpanel"
          id={`module-${activeModule}`}
          aria-labelledby={`tab-${activeModule}`}
        >
          {renderModule()}
        </div>
      </div>
    </div>
  );
}
