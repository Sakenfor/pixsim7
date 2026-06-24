/**
 * RecentStripPanel
 *
 * Horizontal filmstrip of the active scope's assets, shown below the media
 * preview in the asset viewer. Click a thumbnail to jump to it; newly arrived
 * assets that were suppressed by the follow-latest gate (e.g. active
 * playback, zoom, or overlay editing) pulse until the user navigates to
 * them.
 *
 * Thumbnails participate in the 'strip' gesture surface — users configure
 * swipe actions in Settings → Recent Strip.
 */

import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import { useContextMenuItem } from '@lib/dockview';
import { useCardGestures, useLongPressRadial } from '@lib/gestures';
import { Icon } from '@lib/icons';

import { useAssetEngagement, useAssetViewerStore, type ViewerAsset } from '@features/assets';
import { archiveAssetAndBroadcast } from '@features/assets/lib/archive';
import { toggleFavoriteById } from '@features/assets/lib/favoriteTag';
import { getAssetDisplayUrls } from '@features/assets/models/asset';

import { useMediaPreviewSource } from '@/hooks/useMediaPreviewSource';

interface StripThumbProps {
  asset: ViewerAsset;
  isActive: boolean;
  isPending: boolean;
  onClick: (assetId: ViewerAsset['id']) => void;
}

// Memoized so an asset arriving/updating elsewhere in the strip (which rebuilds
// the scope's snapshot array on every event) doesn't re-render every visible
// thumb. The scope snapshot preserves element references for unchanged assets,
// so the default shallow prop compare lets untouched thumbs bail out — only the
// asset whose model actually changed (new ref) re-renders. Matters during a
// rapid generation burst that fires dozens of create/update events.
const StripThumb = memo(function StripThumb({ asset, isActive, isPending, onClick }: StripThumbProps) {
  const model = asset._assetModel;
  const urls = model
    ? getAssetDisplayUrls(model)
    : { thumbnailUrl: asset.url, previewUrl: undefined, mainUrl: asset.fullUrl };
  const { thumbSrc, thumbFailed } = useMediaPreviewSource({
    mediaType: model?.mediaType ?? (asset.type === 'video' ? 'video' : 'image'),
    thumbUrl: urls.thumbnailUrl,
    previewUrl: urls.previewUrl,
    remoteUrl: urls.mainUrl,
    mediaActive: false,
  });

  const numericId = typeof asset.id === 'number' ? asset.id : Number(asset.id) || 0;
  const onToggleFavorite = useCallback(() => {
    if (numericId > 0) void toggleFavoriteById(numericId);
  }, [numericId]);
  const gestureActions = useMemo(
    () => ({
      // archiveAssetAndBroadcast pairs the soft-hide PATCH with the 'archived'
      // removal event — without that broadcast the asset gets archived in the
      // DB but lingers in the strip (the recents scope only drops on removal).
      onArchive: model
        ? () => void archiveAssetAndBroadcast(model.id).catch((err) =>
            console.error('Failed to archive asset:', err))
        : undefined,
    }),
    [model],
  );

  const {
    gestureHandlers,
    isCommitted,
    direction,
    actionLabel,
    isReturning,
    returningActionLabel,
    radialEnabled,
    radialArms,
    commitRadial,
  } = useCardGestures({
    id: numericId,
    surfaceId: 'strip',
    onToggleFavorite,
    actions: gestureActions,
  });

  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const radial = useLongPressRadial({
    id: numericId,
    enabled: radialEnabled,
    arms: radialArms,
    commit: commitRadial,
    anchor: buttonRef,
  });

  const committedBadge = isReturning
    ? returningActionLabel
    : isCommitted
    ? actionLabel
    : null;

  const contextMenuAttrs = useContextMenuItem(
    'asset-card',
    asset.id,
    {
      id: asset.id,
      name: asset.name,
      asset: model ?? asset,
      'viewer-asset': asset,
    },
    [asset.id, asset.name, asset, model],
  );

  // Probe assets (asset_kind='probe') get an amber outline so throwaway runs
  // stay visually distinct in the recents strip. Skipped when the thumb is
  // already the blue active selection — the active-state outline takes
  // priority. Falls through to a ring (not the border, which is owned by
  // active/hover state) so the probe cue layers on top without flicker.
  const isProbe = asset._assetModel?.assetKind === 'probe';

  // "Already reviewed" cue — a small corner dot reflecting how far the user
  // got with this asset. Emerald = fully reviewed (image opened, or video
  // watched to the end), amber = video started but not finished, sky = video
  // seen but never played. Images have no partial state — opening one *is*
  // reviewing it — so a seen image goes straight to emerald. Hidden on the
  // active selection (it's obvious you're looking at it). Keeps throwaway probe
  // runs distinguishable from ones still awaiting review. See
  // `assetEngagementStore`.
  const engagement = useAssetEngagement(asset.id);
  const isVideo = asset.type === 'video';
  const hasViews = (engagement?.views ?? 0) > 0;
  const completed = (engagement?.completions ?? 0) > 0 || (!isVideo && hasViews);
  const started = isVideo && !completed && (engagement?.plays ?? 0) > 0;
  const seen = completed || started || hasViews;
  const dotClass = completed ? 'bg-emerald-400' : started ? 'bg-amber-400' : 'bg-sky-400';
  const dotTitle = completed
    ? isVideo
      ? 'Watched'
      : 'Viewed'
    : started
    ? 'Started, not finished'
    : 'Seen';
  return (
    <button
      ref={buttonRef}
      type="button"
      {...contextMenuAttrs}
      onClick={() => onClick(asset.id)}
      onPointerDown={(e) => {
        gestureHandlers.onPointerDown(e);
        radial.onPointerDown(e);
      }}
      className={[
        'relative flex-shrink-0 h-full aspect-square rounded overflow-hidden',
        'border-2 transition-colors bg-neutral-200 dark:bg-neutral-800',
        isActive
          ? 'border-blue-500'
          : 'border-transparent hover:border-neutral-400 dark:hover:border-neutral-500',
        isPending && !isActive ? 'ring-2 ring-blue-400 animate-pulse' : '',
        isCommitted ? 'ring-2 ring-emerald-400' : '',
        isProbe && !isActive && !isPending && !isCommitted ? 'ring-2 ring-amber-400' : '',
      ].join(' ')}
      title={asset.name}
    >
      {thumbSrc && !thumbFailed ? (
        <img
          src={thumbSrc}
          alt={asset.name}
          loading="lazy"
          className="w-full h-full object-cover"
          draggable={false}
        />
      ) : (
        <span className="flex items-center justify-center w-full h-full text-neutral-500">
          <Icon name={asset.type === 'video' ? 'video' : 'image'} size={14} />
        </span>
      )}
      {asset.type === 'video' && thumbSrc && !thumbFailed && (
        <span className="absolute bottom-0.5 right-0.5 rounded bg-black/60 px-1 py-0.5 text-white flex items-center">
          <Icon name="video" size={8} color="#fff" />
        </span>
      )}
      {seen && !isActive && (
        <span
          className={`absolute top-0.5 left-0.5 h-2 w-2 rounded-full ring-1 ring-black/40 ${dotClass}`}
          title={dotTitle}
        />
      )}
      {committedBadge && (
        <span
          className={[
            'absolute inset-x-0 bottom-0 px-1 py-0.5 text-[9px] font-medium text-white text-center truncate',
            isReturning ? 'bg-neutral-600/80' : 'bg-emerald-600/90',
          ].join(' ')}
        >
          {isReturning ? `↩ ${committedBadge}` : `${direction} · ${committedBadge}`}
        </span>
      )}
      {radial.node}
    </button>
  );
});

// Geometry of the strip row, mirrored from the Tailwind classes below:
// `p-1.5` (6px padding on every side) and `gap-1.5` (6px between thumbs).
// Thumbnails are square and fill the track height, so item width === the
// track's inner height. Kept as constants so the windowing math and the
// rendered layout can't drift apart.
const STRIP_PAD = 6;
const STRIP_GAP = 6;
// Render this many px of thumbnails beyond each viewport edge so a fast
// scroll/navigate doesn't expose un-mounted blanks before they fill in.
const STRIP_OVERSCAN = 300;

export function RecentStripPanel() {
  const scopes = useAssetViewerStore((s) => s.scopes);
  const activeScopeId = useAssetViewerStore((s) => s.activeScopeId);
  const currentAsset = useAssetViewerStore((s) => s.currentAsset);
  const pendingHeadId = useAssetViewerStore((s) => s.pendingHeadId);
  const navigateTo = useAssetViewerStore((s) => s.navigateTo);
  const navigateToAssetId = useAssetViewerStore((s) => s.navigateToAssetId);

  const liveAssets: ViewerAsset[] = useMemo(
    () => (activeScopeId ? scopes[activeScopeId]?.assets ?? [] : []),
    [scopes, activeScopeId],
  );

  // Freeze the rendered list (and thus every thumb's absolute position) while a
  // pointer is down on the strip. Each landed asset prepends at index 0, which
  // shifts every existing thumb one stride to the right; without this freeze a
  // landing between pointerdown and pointerup moves the clicked thumb out from
  // under the cursor, so the `click` never fires on that button and the asset
  // "doesn't open". The freeze snapshot equals the live list at freeze time, so
  // there's no visual jump on press — positions only catch up on release.
  // Mirrors the gallery's pointer-down prepend suppression (see useAssets).
  const [pointerActive, setPointerActive] = useState(false);
  // Ref mirror so the auto-follow effect can read the live interaction state
  // WITHOUT listing pointerActive in its deps — otherwise the effect re-runs on
  // every pointer release and snaps the strip back to the current asset, which
  // fights manual scrolling.
  const pointerActiveRef = useRef(pointerActive);
  pointerActiveRef.current = pointerActive;
  const frozenAssetsRef = useRef<ViewerAsset[]>(liveAssets);
  if (!pointerActive) frozenAssetsRef.current = liveAssets;
  const assets = pointerActive ? frozenAssetsRef.current : liveAssets;

  const currentId = currentAsset?.id;
  const wrapperRef = useRef<HTMLDivElement>(null);
  // The horizontal scroller — also the windowing viewport. Active-item
  // auto-follow drives `scrollLeft` directly here rather than via
  // `scrollIntoView`, which would also nudge ancestor scrollers (incl. body).
  const scrollRef = useRef<HTMLDivElement>(null);

  // Latest values via refs so listeners/effects can read them without
  // re-subscribing on every asset arrival.
  const assetsRef = useRef(assets);
  assetsRef.current = assets;
  const currentIdRef = useRef(currentId);
  currentIdRef.current = currentId;

  // ── Virtualization ──────────────────────────────────────────────────────
  // Only the thumbnails near the viewport are mounted. The full scope can hold
  // thousands of assets during a long generation session; mounting a StripThumb
  // (4 hooks + a decoded <img>) for each would grow DOM/JS/image-decode memory
  // unbounded. Items are equal-width, so the window is pure scroll arithmetic.
  const [itemSize, setItemSize] = useState(0);
  const [viewportWidth, setViewportWidth] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const measure = () => {
      const nextItemSize = Math.max(0, el.clientHeight - STRIP_PAD * 2);
      const nextWidth = el.clientWidth;
      setItemSize((prev) => (prev === nextItemSize ? prev : nextItemSize));
      setViewportWidth((prev) => (prev === nextWidth ? prev : nextWidth));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let raf: number | null = null;
    const onScroll = () => {
      if (raf != null) return;
      raf = requestAnimationFrame(() => {
        raf = null;
        setScrollLeft(el.scrollLeft);
      });
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      el.removeEventListener('scroll', onScroll);
      if (raf != null) cancelAnimationFrame(raf);
    };
  }, []);

  const { firstIndex, lastIndex, totalWidth } = useMemo(() => {
    const n = assets.length;
    if (n === 0 || itemSize <= 0) {
      return { firstIndex: 0, lastIndex: -1, totalWidth: 0 };
    }
    const stride = itemSize + STRIP_GAP;
    const total = STRIP_PAD * 2 + n * itemSize + (n - 1) * STRIP_GAP;
    const viewStart = scrollLeft - STRIP_OVERSCAN;
    const viewEnd = scrollLeft + viewportWidth + STRIP_OVERSCAN;
    const first = Math.max(0, Math.floor((viewStart - STRIP_PAD) / stride));
    const last = Math.min(n - 1, Math.ceil((viewEnd - STRIP_PAD) / stride));
    return { firstIndex: first, lastIndex: last, totalWidth: total };
  }, [assets.length, itemSize, viewportWidth, scrollLeft]);

  // Hold the rendered list stable while the user interacts with the strip
  // (click, scroll-drag, gesture). Freeze on pointerdown over the strip; release
  // on the next pointerup/cancel anywhere (the press may end off the element).
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const onDown = () => setPointerActive(true);
    el.addEventListener('pointerdown', onDown, true);
    return () => el.removeEventListener('pointerdown', onDown, true);
  }, []);
  useEffect(() => {
    if (!pointerActive) return;
    const release = () => setPointerActive(false);
    window.addEventListener('pointerup', release, true);
    window.addEventListener('pointercancel', release, true);
    return () => {
      window.removeEventListener('pointerup', release, true);
      window.removeEventListener('pointercancel', release, true);
    };
  }, [pointerActive]);

  // Auto-follow: center the active thumbnail when it changes. Reads the latest
  // asset list via ref so this only fires on a current-id change, matching the
  // prior scrollIntoView behaviour (not on every new asset arrival). Suppressed
  // while a pointer is down so an auto-scroll can't yank the strip out from
  // under an in-progress click/drag. pointerActive is read via a ref and kept
  // OUT of the deps on purpose: if it were a dep, ending an interaction would
  // re-run this and snap the strip back to the current asset, fighting manual
  // scrolling. A genuine current-id change (e.g. clicking a thumb) still
  // recentres normally.
  useEffect(() => {
    if (pointerActiveRef.current) return;
    const el = scrollRef.current;
    if (!el || itemSize <= 0) return;
    const idx = assetsRef.current.findIndex((a) => a.id === currentId);
    if (idx < 0) return;
    const left = STRIP_PAD + idx * (itemSize + STRIP_GAP);
    const target = left - (el.clientWidth - itemSize) / 2;
    el.scrollTo({ left: Math.max(0, target), behavior: 'smooth' });
  }, [currentId, itemSize]);

  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    let accum = 0;
    const STEP = 40;
    const onWheel = (e: WheelEvent) => {
      const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      if (delta === 0) return;
      e.preventDefault();
      accum += delta;
      const list = assetsRef.current;
      while (Math.abs(accum) >= STEP) {
        const dir = accum > 0 ? 1 : -1;
        accum -= dir * STEP;
        const idx = list.findIndex((a) => a.id === currentIdRef.current);
        const next = (idx >= 0 ? idx : 0) + dir;
        if (next < 0 || next >= list.length) {
          accum = 0;
          break;
        }
        navigateTo(next);
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [navigateTo]);

  const visibleThumbs = lastIndex >= firstIndex
    ? assets.slice(firstIndex, lastIndex + 1)
    : [];

  return (
    <div ref={wrapperRef} className="h-full flex flex-col bg-neutral-50 dark:bg-neutral-950">
      {assets.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-xs text-neutral-500">
          No recent assets yet
        </div>
      ) : (
        <div ref={scrollRef} className="flex-1 min-h-0 overflow-x-auto overflow-y-hidden">
          {/* Spacer track sized to the full (unvirtualized) width so the
              scrollbar and scroll position stay correct while only the
              near-viewport thumbnails are mounted, positioned absolutely. */}
          <div className="relative h-full" style={{ width: totalWidth || '100%' }}>
            {visibleThumbs.map((asset, i) => {
              const idx = firstIndex + i;
              const isActive = asset.id === currentId;
              const isPending = asset.id === pendingHeadId;
              return (
                <div
                  key={asset.id}
                  className="absolute"
                  style={{
                    left: STRIP_PAD + idx * (itemSize + STRIP_GAP),
                    top: STRIP_PAD,
                    width: itemSize,
                    height: itemSize,
                  }}
                >
                  <StripThumb
                    asset={asset}
                    isActive={isActive}
                    isPending={isPending}
                    onClick={navigateToAssetId}
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
