import { Popover } from '@pixsim7/shared.ui';
import clsx from 'clsx';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { Icon } from '@lib/icons';

interface DurationRotaryPickerProps {
  options: number[];
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
}

const FULL_TURN = Math.PI * 2;
const START_ANGLE = -Math.PI / 2;
const DIAL_SIZE = 132;
const HANDLE_RADIUS = 47;

function normalizeAngle(angle: number): number {
  let normalized = angle;
  while (normalized < 0) normalized += FULL_TURN;
  while (normalized >= FULL_TURN) normalized -= FULL_TURN;
  return normalized;
}

export function DurationRotaryPicker({
  options,
  value,
  onChange,
  disabled = false,
}: DurationRotaryPickerProps) {
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const dialRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [dragging, setDragging] = useState(false);

  const selectedIndex = useMemo(() => {
    if (options.length === 0) return -1;
    const exact = options.indexOf(value);
    if (exact >= 0) return exact;
    let nearest = 0;
    let nearestDiff = Math.abs(options[0] - value);
    for (let i = 1; i < options.length; i += 1) {
      const diff = Math.abs(options[i] - value);
      if (diff < nearestDiff) {
        nearest = i;
        nearestDiff = diff;
      }
    }
    return nearest;
  }, [options, value]);

  const selectedValue = selectedIndex >= 0 ? options[selectedIndex] : value;

  const pointForIndex = useCallback(
    (index: number) => {
      if (options.length <= 1) {
        return { x: DIAL_SIZE / 2, y: DIAL_SIZE / 2 };
      }
      const angle = START_ANGLE + (index / options.length) * FULL_TURN;
      return {
        x: DIAL_SIZE / 2 + Math.cos(angle) * HANDLE_RADIUS,
        y: DIAL_SIZE / 2 + Math.sin(angle) * HANDLE_RADIUS,
      };
    },
    [options.length],
  );

  const updateFromPointer = useCallback(
    (clientX: number, clientY: number) => {
      if (!dialRef.current || options.length === 0) return;
      const rect = dialRef.current.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const pointerAngle = Math.atan2(clientY - cy, clientX - cx);
      const normalized = normalizeAngle(pointerAngle - START_ANGLE);
      const rawIndex = Math.round((normalized / FULL_TURN) * options.length);
      const idx = ((rawIndex % options.length) + options.length) % options.length;
      onChange(options[idx]);
    },
    [onChange, options],
  );

  const step = useCallback(
    (delta: 1 | -1) => {
      if (options.length === 0) return;
      const baseIndex = selectedIndex >= 0 ? selectedIndex : 0;
      const nextIndex = Math.min(Math.max(baseIndex + delta, 0), options.length - 1);
      if (nextIndex !== baseIndex) {
        onChange(options[nextIndex]);
      }
    },
    [onChange, options, selectedIndex],
  );

  const handleDialPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (disabled) return;
      event.preventDefault();
      setDragging(true);
      updateFromPointer(event.clientX, event.clientY);
    },
    [disabled, updateFromPointer],
  );

  useEffect(() => {
    if (!dragging) return;

    const handleMove = (event: PointerEvent) => {
      updateFromPointer(event.clientX, event.clientY);
    };
    const handleStop = () => setDragging(false);

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleStop);
    window.addEventListener('pointercancel', handleStop);
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleStop);
      window.removeEventListener('pointercancel', handleStop);
    };
  }, [dragging, updateFromPointer]);

  useEffect(() => {
    if (!disabled) return;
    setOpen(false);
  }, [disabled]);

  const handlePosition = selectedIndex >= 0
    ? pointForIndex(selectedIndex)
    : { x: DIAL_SIZE / 2, y: DIAL_SIZE / 2 };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => setOpen((prev) => !prev)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowUp' || event.key === 'ArrowRight') {
            event.preventDefault();
            step(1);
          } else if (event.key === 'ArrowDown' || event.key === 'ArrowLeft') {
            event.preventDefault();
            step(-1);
          }
        }}
        className={clsx(
          'flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] tabular-nums transition-colors',
          open
            ? 'bg-accent/15 text-accent'
            : 'text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-700/60',
          disabled && 'opacity-50 cursor-not-allowed',
        )}
        title="Duration - click for compact dial"
      >
        <span className="font-semibold">{selectedValue}s</span>
        <Icon name={open ? 'chevronUp' : 'chevronDown'} size={10} className="opacity-70" />
      </button>

      <Popover
        anchor={triggerRef.current}
        triggerRef={triggerRef}
        open={open && !disabled}
        onClose={() => setOpen(false)}
        placement="bottom"
        align="start"
        offset={6}
        clamp
        viewportMargin={12}
      >
        <div className="w-[150px] rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white/95 dark:bg-neutral-900/95 p-2 shadow-xl">
          <div
            ref={dialRef}
            className="relative mx-auto h-[132px] w-[132px] touch-none"
            onPointerDown={handleDialPointerDown}
          >
            <div className="absolute inset-[18px] rounded-full border border-neutral-300 dark:border-neutral-600" />

            <svg className="pointer-events-none absolute inset-0">
              <line
                x1={DIAL_SIZE / 2}
                y1={DIAL_SIZE / 2}
                x2={handlePosition.x}
                y2={handlePosition.y}
                stroke="currentColor"
                strokeWidth="1.5"
                className="text-accent/80"
              />
            </svg>

            <div className="absolute left-1/2 top-1/2 h-[56px] w-[56px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 shadow-inner flex items-center justify-center pointer-events-none">
              <span className="text-lg font-semibold tabular-nums text-neutral-800 dark:text-neutral-100 leading-tight">
                {selectedValue}
              </span>
            </div>

            <div
              className="pointer-events-none absolute h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/80 bg-accent shadow"
              style={{ left: handlePosition.x, top: handlePosition.y }}
            />
          </div>
        </div>
      </Popover>
    </>
  );
}
