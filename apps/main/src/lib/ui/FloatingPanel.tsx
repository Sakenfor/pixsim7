import { Z } from '@pixsim7/shared.ui';
import clsx from 'clsx';
import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Rnd } from 'react-rnd';

import { Icon, type IconName } from '@lib/icons';

import { useIsMobileViewport } from '@features/panels/components/host/useIsMobileViewport';

import { useIsCoarsePointer } from './coarsePointer';


/**
 * FloatingPanel — canonical draggable/resizable floating panel.
 *
 * Wraps react-rnd on desktop (fine pointer) and falls back to a clamped,
 * tap-dismiss sheet on touch / narrow viewports — where react-rnd's drag
 * handle would otherwise swallow taps on the close button and the panel could
 * render its controls off-screen. Also closes on Escape.
 *
 * Reuse this instead of hand-rolling Rnd. See FloatingToolPanel for the
 * simplest consumer.
 */
export interface FloatingPanelProps {
  open: boolean;
  onClose: () => void;
  /** Header title. */
  title: ReactNode;
  children: ReactNode;
  /** Optional leading icon in the header. */
  headerIcon?: IconName;
  /** Extra controls rendered left of the close button (e.g. minimize). */
  headerActions?: ReactNode;
  /** Anchor used to place the panel near a trigger on first open (desktop). */
  anchor?: HTMLElement | DOMRect | null;
  defaultWidth?: number;
  defaultHeight?: number;
  minWidth?: number;
  minHeight?: number;
  /** Override the stacking z-index (defaults to Z.floatOverlay). */
  zIndex?: number;
}

const DRAG_HANDLE_CLASS = 'floating-panel-drag-handle';

export function FloatingPanel({
  open,
  onClose,
  title,
  children,
  headerIcon,
  headerActions,
  anchor,
  defaultWidth = 440,
  defaultHeight = 500,
  minWidth = 320,
  minHeight = 200,
  zIndex = Z.floatOverlay,
}: FloatingPanelProps) {
  // Either signal forces the non-Rnd sheet: a narrow viewport, OR any touch
  // device (react-rnd's drag handle swallows taps on its child close button,
  // so the ✕ never fires onClick on a touchscreen regardless of width).
  // Both hooks must run unconditionally — don't short-circuit with `||`.
  const narrowViewport = useIsMobileViewport();
  const coarsePointer = useIsCoarsePointer();
  const isMobile = narrowViewport || coarsePointer;
  const [pos, setPos] = useState({ x: 200, y: 120 });
  const [size, setSize] = useState({ width: defaultWidth, height: defaultHeight });
  const initialised = useRef(false);

  // Escape-to-close, matching the canonical Popover dismissal contract.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCloseRef.current();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open]);

  useEffect(() => {
    if (!open || isMobile || initialised.current) return;

    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

    let nextX = Math.max(40, (vw - defaultWidth) / 2);
    let nextY = Math.max(40, (vh - defaultHeight) / 3);

    if (anchor) {
      const rect = anchor instanceof HTMLElement ? anchor.getBoundingClientRect() : anchor;
      const spaceBelow = vh - rect.bottom;
      const spaceAbove = rect.top;
      const shouldPlaceAbove = spaceBelow < defaultHeight + 16 && spaceAbove > spaceBelow;

      nextX = clamp(rect.left + (rect.width / 2) - (defaultWidth / 2), 12, vw - defaultWidth - 12);
      nextY = shouldPlaceAbove
        ? clamp(rect.top - defaultHeight - 8, 12, vh - defaultHeight - 12)
        : clamp(rect.bottom + 8, 12, vh - defaultHeight - 12);
    }

    setPos({ x: nextX, y: nextY });
    setSize({ width: defaultWidth, height: defaultHeight });
    initialised.current = true;
  }, [open, isMobile, anchor, defaultWidth, defaultHeight]);

  const handleDragStop = useCallback((_e: unknown, d: { x: number; y: number }) => {
    setPos({ x: d.x, y: d.y });
  }, []);

  const handleResizeStop = useCallback(
    (_e: unknown, _dir: unknown, ref: HTMLElement, _delta: unknown, position: { x: number; y: number }) => {
      setSize({ width: parseInt(ref.style.width, 10), height: parseInt(ref.style.height, 10) });
      setPos(position);
    },
    [],
  );

  if (!open) return null;

  // Header is the drag handle on desktop; on mobile it's a static title bar.
  const panelChrome = (
    <div className="flex flex-col h-full rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 shadow-2xl overflow-hidden">
      <div
        className={clsx(
          !isMobile && DRAG_HANDLE_CLASS,
          'flex items-center gap-1.5 px-3 py-1.5 bg-neutral-50 dark:bg-neutral-800 border-b border-neutral-200 dark:border-neutral-700 select-none shrink-0',
          !isMobile && 'cursor-grab active:cursor-grabbing',
        )}
      >
        {headerIcon && (
          <Icon name={headerIcon} size={12} className="text-neutral-500 dark:text-neutral-400" />
        )}
        <span className="text-xs font-medium text-neutral-600 dark:text-neutral-300 flex-1">{title}</span>
        {/* Stop Rnd drag detection from swallowing taps on the header controls:
            on a desktop touchscreen react-rnd consumes the pointerdown, so a tap
            on the close button never fires onClick without this. */}
        <div
          className="flex items-center gap-1 shrink-0"
          onMouseDown={(e) => e.stopPropagation()}
        >
          {headerActions}
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className={clsx(
              'rounded hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 transition-colors',
              isMobile ? 'p-1.5' : 'p-0.5',
            )}
          >
            <Icon name="x" size={isMobile ? 16 : 12} />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">{children}</div>
    </div>
  );

  // Mobile: a tap-dismiss backdrop + a clamped, on-screen sheet. No drag/resize —
  // the desktop Rnd panel can render its close button off-screen on narrow widths.
  if (isMobile) {
    return createPortal(
      <div
        className="fixed inset-0 flex items-center justify-center p-3"
        style={{ zIndex }}
      >
        <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden />
        <div className="relative w-full max-w-[440px] max-h-[85vh] flex flex-col">
          {panelChrome}
        </div>
      </div>,
      document.body,
    );
  }

  return createPortal(
    <Rnd
      position={pos}
      size={size}
      onDragStop={handleDragStop}
      onResizeStop={handleResizeStop}
      minWidth={minWidth}
      minHeight={minHeight}
      bounds="window"
      dragHandleClassName={DRAG_HANDLE_CLASS}
      style={{ zIndex }}
    >
      {panelChrome}
    </Rnd>,
    document.body,
  );
}
