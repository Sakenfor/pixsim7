/**
 * SetGridOverlay
 *
 * In-slot grid view of an asset-set's members. Renders in place of the
 * MediaCard when the user flips the `<ViewModePill>` to "Grid" on a
 * set-linked input slot — the slot wrapper (dnd / click / size) is unchanged.
 *
 * Clicking a member pins via `pinAssetSetMember` (mode='locked' +
 * lockedAssetId + display swap atomic) and switches the view back to
 * 'single'. The pill is rendered inside the overlay so toggling back is
 * always reachable from grid mode.
 *
 * Plan: `set-slot-walk-and-grid`.
 */

import { useCallback } from 'react';

import { Icon } from '@lib/icons';

import { getAssetDisplayUrls, useResolvedAssetSet, type AssetModel } from '@features/assets';
import { useGenerationScopeStores } from '@features/generation';
import type { InputItem } from '@features/generation';
import { useSetSlotViewStore } from '@features/generation/stores/setSlotViewStore';

import { useMediaPreviewSource } from '@/hooks/useMediaPreviewSource';
import type { OperationType } from '@/types/operations';

import { ViewModePill } from './inputSlotViewModePill';

export interface SetGridOverlayProps {
  inputItem: InputItem;
  operationType: OperationType;
}

/**
 * Single thumbnail in the set grid. Owns its own `useMediaPreviewSource`
 * call so each cell pulls auth'd bytes via the client and yields a blob URL
 * — a raw `<img src=>` against `/api/v1/media/...` is 401'd because img
 * loads don't carry the session header.
 */
function GridThumb({
  member,
  isCurrent,
  onPin,
}: {
  member: AssetModel;
  isCurrent: boolean;
  onPin: (e: React.MouseEvent) => void;
}) {
  const urls = getAssetDisplayUrls(member);
  const { thumbSrc, thumbFailed } = useMediaPreviewSource({
    mediaType: member.mediaType === 'video' ? 'video' : 'image',
    thumbUrl: urls.thumbnailUrl,
    previewUrl: urls.previewUrl,
    remoteUrl: urls.mainUrl,
    mediaActive: false,
  });
  const src = thumbFailed ? undefined : thumbSrc;
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onPin}
      className={`
        relative aspect-square overflow-hidden rounded-sm bg-neutral-800
        transition-shadow
        ${isCurrent
          ? 'ring-2 ring-purple-400 z-10'
          : 'ring-1 ring-transparent hover:ring-white/40'}
      `}
      title={`Pin: ${member.description || `Asset ${member.id}`}`}
    >
      {src ? (
        <img
          src={src}
          alt=""
          className="w-full h-full object-cover"
          loading="lazy"
          draggable={false}
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-neutral-500">
          <Icon name="image" size={14} />
        </div>
      )}
      {isCurrent && (
        <div className="absolute bottom-0.5 right-0.5 bg-purple-500/90 rounded-full p-0.5">
          <Icon name="lock" size={8} />
        </div>
      )}
    </button>
  );
}

export function SetGridOverlay({ inputItem, operationType }: SetGridOverlayProps) {
  const setId = inputItem.assetSetRef?.setId;
  const { members, isLoading } = useResolvedAssetSet(setId);

  const { useInputStore } = useGenerationScopeStores();
  const pinAssetSetMember = useInputStore((s) => s.pinAssetSetMember);
  const setView = useSetSlotViewStore((s) => s.setView);

  const currentId =
    inputItem.assetSetRef?.lockedAssetId ?? inputItem.asset.id;

  const pinAndReturn = useCallback(
    (member: AssetModel) => (e: React.MouseEvent) => {
      e.stopPropagation();
      pinAssetSetMember(operationType, inputItem.id, member);
      setView(inputItem.id, 'single');
    },
    [pinAssetSetMember, operationType, inputItem.id, setView],
  );

  return (
    <div className="relative w-full h-full bg-neutral-900 rounded-lg overflow-hidden">
      {/* Toggle pill rendered inside the overlay so it's reachable from grid
          mode (MediaCard's overlay widget version isn't, since we replaced
          MediaCard entirely). */}
      <div className="absolute top-1 left-1/2 -translate-x-1/2 z-10 pointer-events-auto">
        <ViewModePill inputId={inputItem.id} />
      </div>

      {isLoading && members.length === 0 ? (
        <div className="absolute inset-0 flex items-center justify-center text-[10px] text-neutral-400">
          Loading set…
        </div>
      ) : members.length === 0 ? (
        <div className="absolute inset-0 flex items-center justify-center text-[10px] text-neutral-400">
          Set is empty
        </div>
      ) : (
        <div
          className="absolute inset-0 overflow-y-auto p-0.5 pt-7 grid gap-0.5 auto-rows-max"
          // Auto-fill instead of a fixed 3-col track: thumbnails keep a minimum
          // size and the grid sheds columns (3 → 2 → 1) as the slot narrows,
          // rather than cramming three tiny cells on a mobile-width slot. The
          // `min(100%, …)` floor avoids horizontal overflow when the slot is
          // narrower than one minimum cell.
          style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 72px), 1fr))' }}
          // Stop wrapper click-to-select / dnd from firing on inner scroll /
          // thumbnail interactions; pin handlers stopPropagation too, but
          // background scroll-drag shouldn't bubble either.
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          {members.map((m) => (
            <GridThumb
              key={m.id}
              member={m}
              isCurrent={m.id === currentId}
              onPin={pinAndReturn(m)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
