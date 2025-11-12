import { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { useControlCenterStore } from '../../stores/controlCenterStore';
import { PromptInput } from '../primitives/PromptInput';
import { resolvePromptLimit } from '../../utils/prompt/limits';
import { useProviders } from '../../hooks/useProviders';

const PRESET_OPTIONS = [
  { id: 'default', name: 'Default' },
  { id: 'fast', name: 'Fast' },
  { id: 'quality', name: 'High Quality' },
];

export function ControlCenterDock() {
  const {
    open, pinned, height, setOpen, setPinned, setHeight,
    providerId, presetId, setProvider, setPreset,
    generating, setGenerating, pushPrompt
  } = useControlCenterStore(s => ({
    open: s.open,
    pinned: s.pinned,
    height: s.height,
    setOpen: s.setOpen,
    setPinned: s.setPinned,
    setHeight: s.setHeight,
    providerId: s.providerId,
    presetId: s.presetId,
    setProvider: s.setProvider,
    setPreset: s.setPreset,
    generating: s.generating,
    setGenerating: s.setGenerating,
    pushPrompt: s.pushPrompt,
  }));

  const { providers } = useProviders();
  const [prompt, setPrompt] = useState('');
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

  async function onGenerate() {
    const p = prompt.trim();
    if (!p) return;
    pushPrompt(p);
    setGenerating(true);
    try {
      // TODO: Replace with real API integration; for now fake delay
      await new Promise(res => setTimeout(res, 600));
      // eslint-disable-next-line no-console
      console.log('Quick generate', { providerId, presetId, prompt: p });
      setPrompt('');
    } finally {
      setGenerating(false);
    }
  }

  const maxChars = resolvePromptLimit(providerId);
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
      <div className="h-full border-t bg-white/95 dark:bg-neutral-900/95 backdrop-blur shadow-2xl">
        {/* Resize handle */}
        <div
          onMouseDown={startResize}
          className={clsx('h-2 w-full cursor-ns-resize', dragging ? 'bg-neutral-400/60' : 'bg-transparent')}
          title="Drag to resize"
        />
        {/* Toolbar */}
        <div className="px-3 py-2 flex items-center gap-2 border-b bg-neutral-50/80 dark:bg-neutral-800/60">
          <span className="text-xs font-semibold">Control Center</span>
          <div className="flex-1" />
          <button
            onClick={() => setOpen(!open)}
            className="text-xs px-2 py-1 border rounded hover:bg-neutral-100 dark:hover:bg-neutral-700"
          >{open ? 'Hide' : 'Show'}</button>
          <button
            onClick={() => setPinned(!pinned)}
            className={clsx('text-xs px-2 py-1 border rounded', pinned ? 'bg-amber-200/50 dark:bg-amber-800/30' : 'hover:bg-neutral-100 dark:hover:bg-neutral-700')}
            title="Pin to keep open"
          >{pinned ? 'Pinned' : 'Pin'}</button>
        </div>

        {/* Content: Quick Generate (reuses canonical PromptInput) */}
        <div className="p-3 flex gap-3 items-start">
          <PromptInput value={prompt} onChange={setPrompt} maxChars={maxChars} />
          <div className="w-64 flex flex-col gap-2">
            <label className="text-xs text-neutral-500">Provider</label>
            <select
              value={providerId ?? ''}
              onChange={(e) => setProvider(e.target.value || undefined)}
              className="p-2 border rounded bg-white dark:bg-neutral-900"
            >
              <option value="">Auto</option>
              {providers.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>

            <label className="text-xs text-neutral-500">Preset</label>
            <select
              value={presetId ?? 'default'}
              onChange={(e) => setPreset(e.target.value || undefined)}
              className="p-2 border rounded bg-white dark:bg-neutral-900"
            >
              {PRESET_OPTIONS.map(opt => (
                <option key={opt.id} value={opt.id}>{opt.name}</option>
              ))}
            </select>

            <button
              onClick={onGenerate}
              disabled={generating || !prompt.trim()}
              className={clsx('mt-2 py-2 rounded text-white', generating ? 'bg-neutral-400' : 'bg-blue-600 hover:bg-blue-700')}
            >{generating ? 'Generating…' : 'Quick Generate'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
