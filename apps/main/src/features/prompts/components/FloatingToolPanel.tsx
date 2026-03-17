import { Z } from '@pixsim7/shared.ui';
import clsx from 'clsx';
import { type ReactNode, useCallback, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Rnd } from 'react-rnd';

import { Icon } from '@lib/icons';

interface FloatingToolPanelProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  defaultWidth?: number;
  defaultHeight?: number;
  minWidth?: number;
  minHeight?: number;
}

const DRAG_HANDLE_CLASS = 'floating-tool-drag-handle';

export function FloatingToolPanel({
  open,
  onClose,
  title,
  children,
  defaultWidth = 440,
  defaultHeight = 500,
  minWidth = 320,
  minHeight = 200,
}: FloatingToolPanelProps) {
  const [pos, setPos] = useState({ x: 200, y: 120 });
  const [size, setSize] = useState({ width: defaultWidth, height: defaultHeight });
  const initialised = useRef(false);

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

  // Position near center on first open
  if (!initialised.current) {
    initialised.current = true;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    setPos({ x: Math.max(40, (vw - defaultWidth) / 2), y: Math.max(40, (vh - defaultHeight) / 3) });
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
      style={{ zIndex: Z.floatOverlay }}
    >
      <div className="flex flex-col h-full rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 shadow-2xl overflow-hidden">
        {/* Header — drag handle */}
        <div
          className={clsx(
            DRAG_HANDLE_CLASS,
            'flex items-center gap-1.5 px-3 py-1.5 bg-neutral-50 dark:bg-neutral-800 border-b border-neutral-200 dark:border-neutral-700 cursor-grab active:cursor-grabbing select-none shrink-0',
          )}
        >
          <Icon name="wand" size={12} className="text-neutral-500 dark:text-neutral-400" />
          <span className="text-xs font-medium text-neutral-600 dark:text-neutral-300 flex-1">{title}</span>
          <button
            type="button"
            onClick={onClose}
            className="p-0.5 rounded hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 transition-colors"
          >
            <Icon name="x" size={12} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {children}
        </div>
      </div>
    </Rnd>,
    document.body,
  );
}
