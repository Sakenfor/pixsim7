/**
 * AssetPeekPopover
 *
 * Floating thumbnail of an asset anchored to a trigger element. Used as the
 * hover-preview for input-slot time-axis navigation (`‹` / `›` chevrons) —
 * shows what you'd swap to before you commit.
 *
 * Pure presentation: caller is responsible for resolving `thumbSrc`
 * (authenticated blob URL via `useMediaPreviewSource` or similar). This
 * keeps the URL's lifecycle tied to the *caller's* mount window rather
 * than the popover's rapid open/close cycles — without that hoist, a
 * popover unmount mid-render can revoke a blob URL that a still-mounted
 * `<img>` is trying to load (`ERR_FILE_NOT_FOUND` on `blob:...`).
 *
 * Plan: `media-card-input-time-nav`. First consumer: `inputTimeNavWidget`.
 * Render API is provisional until a second surface adopts.
 */

import { Popover, Z, type AnchorPlacement } from '@pixsim7/shared.ui';

import { Icon } from '@lib/icons';

import { type AssetModel } from '@features/assets';

export interface AssetPeekPopoverProps {
  /** Asset to preview. When `null`, popover renders nothing (still legal while `open`). */
  asset: AssetModel | null;
  /**
   * Resolved (authenticated, blob-URL) thumbnail source. Caller owns the
   * fetch + revocation lifecycle. Pass `undefined` to render the fallback
   * icon while loading or on failure.
   */
  thumbSrc?: string;
  /** Trigger ref the popover is anchored to. */
  anchorRef: React.RefObject<HTMLElement | null>;
  /** Whether the popover is visible. */
  open: boolean;
  /** Side of the anchor to render on (e.g. 'left' for prev chevron). */
  placement: AnchorPlacement;
  /** Called when the user clicks the preview thumbnail. */
  onCommit: () => void;
  /** Called when the popover requests to close (Escape, click-outside). */
  onClose: () => void;
  /** Pointer-bridge handlers — wire to the trigger's hover state. */
  onMouseEnter?: React.MouseEventHandler;
  onMouseLeave?: React.MouseEventHandler;
  /** Optional caption shown under the thumbnail (e.g. 'Previous' / 'Next'). */
  caption?: string;
}

export function AssetPeekPopover({
  asset,
  thumbSrc,
  anchorRef,
  open,
  placement,
  onCommit,
  onClose,
  onMouseEnter,
  onMouseLeave,
  caption,
}: AssetPeekPopoverProps) {
  const isVideo = asset?.mediaType === 'video';
  const thumb = thumbSrc;

  return (
    <Popover
      anchor={anchorRef.current}
      open={open && !!asset}
      placement={placement}
      align="center"
      offset={8}
      onClose={onClose}
      closeOnClickOutside={false}
      closeOnEscape
      triggerRef={anchorRef}
      style={{ zIndex: Z.popover }}
      className="pointer-events-auto"
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={(e) => {
          e.stopPropagation();
          onCommit();
        }}
        className="
          group block relative h-24 w-24 overflow-hidden
          rounded-lg bg-black/70 ring-1 ring-white/15 shadow-2xl
          hover:ring-white/40 transition-shadow
          cursor-pointer
        "
        title={caption ? `${caption} — click to switch` : 'Click to switch'}
      >
        {thumb ? (
          <img
            src={thumb}
            alt=""
            className="h-full w-full object-cover transition-transform group-hover:scale-[1.03]"
            draggable={false}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-white/40">
            <Icon name={isVideo ? 'video' : 'image'} size={24} />
          </div>
        )}
        {isVideo && thumb && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <Icon name="play" size={20} />
          </div>
        )}
        {caption && (
          <div className="
            absolute inset-x-0 bottom-0
            bg-gradient-to-t from-black/85 to-transparent
            px-1.5 pt-2 pb-1
            text-[10px] font-medium uppercase tracking-wider text-white/90
          ">
            {caption}
          </div>
        )}
      </button>
    </Popover>
  );
}
