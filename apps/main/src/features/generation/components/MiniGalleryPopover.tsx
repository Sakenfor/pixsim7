/**
 * MiniGalleryPopover – Portal-based floating panel containing a MiniGallery.
 * Used by AssetPanel (add asset) and MaskPicker (select mask).
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { Icon } from '@lib/icons';

import { MiniGallery, type MiniGalleryProps } from '@features/gallery';

export interface MiniGalleryPopoverProps {
  /** Bounding rect of the trigger element — popover positions near this. */
  anchorRect: DOMRect;
  /** Title shown in the header bar. */
  title?: string;
  /** Called when the popover should close. */
  onClose: () => void;
  /** Props forwarded to the inner MiniGallery. */
  galleryProps: MiniGalleryProps;
  /** Popover width (default 380). */
  width?: number;
  /** Popover height (default 420). */
  height?: number;
}

export function MiniGalleryPopover({
  anchorRect,
  title = 'Pick Asset',
  onClose,
  galleryProps,
  width = 380,
  height = 420,
}: MiniGalleryPopoverProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    const { innerWidth, innerHeight } = window;
    let top = anchorRect.bottom + 8;
    let left = anchorRect.left;

    if (top + height > innerHeight - 16) {
      top = anchorRect.top - height - 8;
    }
    if (top < 16) top = 16;
    if (left + width > innerWidth - 16) {
      left = innerWidth - width - 16;
    }
    if (left < 16) left = 16;

    setPosition({ top, left });
  }, [anchorRect, width, height]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  if (!position) return null;

  return createPortal(
    <div
      ref={ref}
      className="fixed z-popover bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-lg shadow-xl overflow-hidden flex flex-col"
      style={{ top: position.top, left: position.left, width, height }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-neutral-200 dark:border-neutral-700 shrink-0">
        <span className="text-xs font-medium text-neutral-700 dark:text-neutral-200">
          {title}
        </span>
        <button
          type="button"
          onClick={onClose}
          className="p-0.5 rounded hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300"
        >
          <Icon name="x" size={12} />
        </button>
      </div>

      {/* Gallery body */}
      <div className="flex-1 overflow-hidden">
        <MiniGallery {...galleryProps} />
      </div>
    </div>,
    document.body,
  );
}
