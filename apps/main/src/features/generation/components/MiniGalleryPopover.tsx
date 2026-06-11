/**
 * MiniGalleryPopover – Portal-based floating panel containing a MiniGallery.
 * Used by AssetPanel (add asset) and MaskPicker (select mask).
 */
import { Popover } from '@pixsim7/shared.ui';

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
  return (
    <Popover
      anchor={anchorRect}
      placement="bottom"
      align="start"
      offset={8}
      open
      onClose={onClose}
    >
      <div
        className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-lg shadow-xl overflow-hidden flex flex-col"
        style={{ width, height }}
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
      </div>
    </Popover>
  );
}
