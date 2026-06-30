/**
 * GesturePresetPicker
 *
 * A small popover summoned by dwelling in a gesture's center/cancel zone (see
 * `useMouseGesture`'s `onCenterDwell`). Lists the surface's gesture presets as
 * chips anchored at the dwell point; tapping one makes it the active preset for
 * that surface, so the next swipe uses its direction mappings. Backdrop tap or
 * Escape dismisses without changing the selection.
 *
 * MVP is tap-mode (the summoning press has already ended): hold to reveal, lift,
 * tap a preset. Slide-to-pick on the same pointer is a future refinement.
 */

import { useEffect } from 'react';
import { createPortal } from 'react-dom';

import type { GesturePreset } from './gesturePresetDefaults';

export interface GesturePresetPickerProps {
  open: boolean;
  /** Anchor point in client/viewport coords (the gesture origin). */
  center: { x: number; y: number };
  presets: GesturePreset[];
  activeId: string;
  onPick: (presetId: string) => void;
  onDismiss: () => void;
}

const CHIP_STACK_OFFSET_PX = 8;

export function GesturePresetPicker({
  open,
  center,
  presets,
  activeId,
  onPick,
  onDismiss,
}: GesturePresetPickerProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onDismiss();
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [open, onDismiss]);

  if (!open || presets.length === 0) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[120] select-none"
      // Backdrop tap dismisses. Capture pointerdown so it beats any underlying
      // gesture surface re-arming.
      onPointerDown={(e) => {
        e.preventDefault();
        onDismiss();
      }}
    >
      <div
        className="absolute flex flex-col items-center gap-1"
        style={{
          left: center.x,
          top: center.y,
          transform: 'translate(-50%, -50%)',
        }}
        // Keep taps inside the menu from hitting the backdrop dismiss.
        onPointerDown={(e) => e.stopPropagation()}
      >
        <span className="mb-1 rounded bg-black/70 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-white/70 shadow">
          Swipe preset
        </span>
        {presets.map((preset) => {
          const isActive = preset.id === activeId;
          return (
            <button
              key={preset.id}
              type="button"
              // Preserve focus / avoid the portaled-popover scroll jump.
              onMouseDown={(e) => e.preventDefault()}
              onPointerDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onPick(preset.id);
              }}
              style={{ marginTop: CHIP_STACK_OFFSET_PX }}
              className={[
                'min-w-[7rem] rounded-full px-3 py-1.5 text-sm font-medium shadow-lg transition-colors',
                isActive
                  ? 'bg-blue-500 text-white ring-2 ring-blue-300'
                  : 'bg-neutral-800/95 text-white/90 hover:bg-neutral-700',
              ].join(' ')}
            >
              {preset.label}
            </button>
          );
        })}
      </div>
    </div>,
    document.body,
  );
}
