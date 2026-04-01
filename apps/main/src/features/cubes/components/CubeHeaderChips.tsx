/**
 * CubeHeaderChips
 *
 * Mini chip buttons rendered in the floating panel header — one per cube instance.
 * Hover highlights the corresponding on-screen cube widget; click sends the panel to it.
 * Includes a "+" button to create new cube instances.
 */

import { useMemo, useRef, useState } from 'react';

import { Icon } from '@lib/icons';

import { useCubeHighlightStore } from '../stores/cubeHighlightStore';
import { useCubeInstanceStore, selectOrderedInstances, type CubeInstanceMeta } from '../stores/cubeInstanceStore';

import { CreateCubePopup } from './CreateCubePopup';

// ── Accent color classes (static map to avoid Tailwind purge issues) ──

const ACCENT_CLASSES: Record<string, { hover: string; text: string }> = {
  cyan:    { hover: 'hover:bg-cyan-100 dark:hover:bg-cyan-900/30',       text: 'hover:text-cyan-600 dark:hover:text-cyan-400' },
  amber:   { hover: 'hover:bg-amber-100 dark:hover:bg-amber-900/30',     text: 'hover:text-amber-600 dark:hover:text-amber-400' },
  emerald: { hover: 'hover:bg-emerald-100 dark:hover:bg-emerald-900/30', text: 'hover:text-emerald-600 dark:hover:text-emerald-400' },
  violet:  { hover: 'hover:bg-violet-100 dark:hover:bg-violet-900/30',   text: 'hover:text-violet-600 dark:hover:text-violet-400' },
  rose:    { hover: 'hover:bg-rose-100 dark:hover:bg-rose-900/30',       text: 'hover:text-rose-600 dark:hover:text-rose-400' },
};

function getAccentClasses(color: string) {
  return ACCENT_CLASSES[color] ?? ACCENT_CLASSES.cyan;
}

// ── Component ──

export interface CubeHeaderChipsProps {
  /** Called when user clicks a chip to send the panel to that cube instance. */
  onSendToCube: (instanceId: string) => void;
}

export function CubeHeaderChips({ onSendToCube }: CubeHeaderChipsProps) {
  const instancesMap = useCubeInstanceStore((s) => s.instances);
  const instances = useMemo(() => selectOrderedInstances(instancesMap), [instancesMap]);
  const setHighlighted = useCubeHighlightStore((s) => s.setHighlighted);
  const clearHighlighted = useCubeHighlightStore((s) => s.clearHighlighted);
  const [createOpen, setCreateOpen] = useState(false);
  const plusRef = useRef<HTMLButtonElement>(null);

  const showLabels = instances.length > 1;

  return (
    <div className="flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
      {instances.map((inst) => (
        <CubeChip
          key={inst.id}
          instance={inst}
          showLabel={showLabels}
          onSendToCube={onSendToCube}
          onMouseEnter={() => setHighlighted(inst.id)}
          onMouseLeave={clearHighlighted}
        />
      ))}
      <button
        ref={plusRef}
        type="button"
        onClick={() => setCreateOpen(true)}
        className="w-5 h-5 flex items-center justify-center rounded text-neutral-400 hover:text-neutral-200 hover:bg-neutral-700 transition-colors"
        title="Create new cube"
      >
        <Icon name="plus" size={10} />
      </button>
      {createOpen && (
        <CreateCubePopup
          anchor={plusRef.current}
          open={createOpen}
          onClose={() => setCreateOpen(false)}
        />
      )}
    </div>
  );
}

// ── Individual chip ──

function CubeChip({
  instance,
  showLabel,
  onSendToCube,
  onMouseEnter,
  onMouseLeave,
}: {
  instance: CubeInstanceMeta;
  showLabel: boolean;
  onSendToCube: (instanceId: string) => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}) {
  const accent = getAccentClasses(instance.accentColor);

  return (
    <button
      type="button"
      onClick={() => onSendToCube(instance.id)}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors duration-150 text-neutral-500 dark:text-neutral-400 ${accent.hover} ${accent.text}`}
      title={`Send to ${instance.label}`}
    >
      <Icon name={instance.icon} size={10} />
      {showLabel && (
        <span className="truncate max-w-[60px]">{instance.label}</span>
      )}
    </button>
  );
}
