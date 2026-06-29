/**
 * Display Settings Preview
 *
 * Live preview panel that shows what gallery cards look like at small/medium/large
 * sizes for each derivative tier (thumbnail / preview / original).  Each card
 * carries a stat line — CSS px, device px, served px (ground truth from
 * <img>.naturalWidth), and the served:device headroom ratio — so the user can
 * see directly which tier is undersized for which card preset on their display.
 *
 * Wired into Library → Display as a top-of-tab custom field, just above the
 * Image Quality dropdown.  The local-only tier toggle lets the user explore
 * without committing to a global setting; "Apply as default" mirrors the
 * choice into qualityMode.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { AssetModel, ServerMediaSettings } from '@features/assets';
import { useAssets, useAssetViewerStore, useMediaSettingsStore } from '@features/assets';

import { CARD_SIZE_PRESETS } from '@/components/media/cardSizePresets';
import { useAuthenticatedMedia } from '@/hooks/useAuthenticatedMedia';
import { useMediaThumbnailFull } from '@/hooks/useMediaThumbnail';
import { pixsimClient } from '@/lib/api';


type Tier = 'thumb' | 'preview' | 'original';

const TIER_LABELS: Record<Tier, string> = {
  thumb: 'Thumb',
  preview: 'Preview',
  original: 'Original',
};

const SIZES: Array<{ key: 'small' | 'medium' | 'large'; label: string }> = [
  { key: 'small', label: 'small' },
  { key: 'medium', label: 'medium' },
  { key: 'large', label: 'large' },
];

// ── Helpers ─────────────────────────────────────────────────────────────

function useDevicePixelRatio(): number {
  const [dpr, setDpr] = useState<number>(() =>
    typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1,
  );
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handler = () => setDpr(window.devicePixelRatio || 1);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);
  return dpr;
}

function fileNameFor(asset: AssetModel): string {
  // Cheap label — the asset id is always defined; description and prompt
  // are heuristic.  Truncated to keep the chip narrow.
  const candidate =
    (asset.description && asset.description.trim()) ||
    (asset.prompt && asset.prompt.trim()) ||
    `Asset #${asset.id}`;
  return candidate.length > 32 ? `${candidate.slice(0, 30)}…` : candidate;
}

function classifyHeadroom(ratio: number): { color: string; icon: string; label: string } {
  if (ratio < 1.0) return { color: 'text-rose-600 dark:text-rose-400', icon: '⚠', label: 'undersized' };
  if (ratio < 1.3) return { color: 'text-amber-600 dark:text-amber-400', icon: '⚠', label: 'tight' };
  return { color: 'text-emerald-600 dark:text-emerald-400', icon: '✓', label: 'comfortable' };
}

// ── PreviewMediaCard ────────────────────────────────────────────────────
// One card cell.  Renders the requested derivative for the sample asset and
// reports back the actual served pixel width for the stat line.

interface PreviewMediaCardProps {
  asset: AssetModel;
  cardSize: number;
  cardLabel: string;
  tier: Tier;
  dpr: number;
  configuredThumbSize: number;
  configuredPreviewSize: number;
  generatePreviews: boolean;
}

function PreviewMediaCard(props: PreviewMediaCardProps) {
  const {
    asset,
    cardSize,
    cardLabel,
    tier,
    dpr,
    configuredThumbSize,
    configuredPreviewSize,
    generatePreviews,
  } = props;

  // Tier-specific URL feeds.  Using thumb-only / preview-only forces the hook
  // to honour our explicit choice instead of falling back through the chain
  // — that's the whole point of a side-by-side preview.
  const thumbResult = useMediaThumbnailFull(
    tier === 'thumb' ? asset.thumbnailUrl ?? undefined : undefined,
    undefined,
    undefined,
    { preferPreview: false },
  );
  const previewResult = useMediaThumbnailFull(
    undefined,
    tier === 'preview' ? asset.previewUrl ?? undefined : undefined,
    undefined,
    { preferPreview: true },
  );

  // Originals load lazily — only when the user actually picks the tier — so
  // opening the settings tab doesn't pull 18 MP JPEGs by default.
  const originalUrl = asset.fileUrl ?? asset.remoteUrl ?? undefined;
  const originalResult = useAuthenticatedMedia(
    tier === 'original' ? originalUrl : undefined,
    { active: tier === 'original' },
  );

  const src =
    tier === 'thumb'
      ? thumbResult.src
      : tier === 'preview'
        ? previewResult.src
        : originalResult.src;

  // Ground-truth served-px from the loaded <img>.  naturalWidth is the
  // intrinsic pixel width of the bitmap — the only honest number to compare
  // against device px.  Falls back to configured values until the image loads.
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [servedPx, setServedPx] = useState<number | null>(null);
  const onImgLoad = useCallback(() => {
    if (imgRef.current && imgRef.current.naturalWidth > 0) {
      setServedPx(imgRef.current.naturalWidth);
    }
  }, []);

  // Reset served-px when tier changes — otherwise stale value would flash on
  // the new image until it loads.
  useEffect(() => setServedPx(null), [tier, asset.id]);

  const devicePx = Math.round(cardSize * dpr);
  const expectedServedPx =
    tier === 'thumb'
      ? configuredThumbSize
      : tier === 'preview'
        ? (asset.previewUrl ? configuredPreviewSize : configuredThumbSize) // preview falls back to thumb when not generated
        : (asset.width ?? null);
  const effectiveServedPx = servedPx ?? expectedServedPx;
  const headroom =
    effectiveServedPx && devicePx > 0 ? effectiveServedPx / devicePx : null;
  const classification = headroom != null ? classifyHeadroom(headroom) : null;

  // Diagnostic: preview tier was requested but the asset has no preview key —
  // means it fell back to thumb.  Important to flag because otherwise the
  // "preview" column would lie about what's served.
  const previewFellBack = tier === 'preview' && !asset.previewUrl;

  const isLoading =
    (tier === 'thumb' && thumbResult.loading) ||
    (tier === 'preview' && previewResult.loading) ||
    (tier === 'original' && originalResult.loading);

  return (
    <div className="flex flex-col items-start gap-1.5">
      <div
        style={{ width: cardSize, height: cardSize }}
        className="relative rounded-md border border-neutral-300 dark:border-neutral-700 bg-neutral-100 dark:bg-neutral-800 overflow-hidden shadow-sm"
      >
        {src ? (
          <img
            ref={imgRef}
            src={src}
            alt=""
            onLoad={onImgLoad}
            className="w-full h-full object-cover"
          />
        ) : isLoading ? (
          <div className="w-full h-full flex items-center justify-center text-[10px] text-neutral-500">
            loading…
          </div>
        ) : (
          <div className="w-full h-full flex items-center justify-center text-[10px] text-neutral-500">
            —
          </div>
        )}
      </div>
      <div className="text-[10px] leading-tight text-neutral-700 dark:text-neutral-300">
        <div className="font-semibold">{cardLabel}</div>
        <div className="text-neutral-500 dark:text-neutral-400">
          {cardSize} css · ×{dpr} = {devicePx}px device
        </div>
        <div>
          {tier === 'thumb' && `thumb ${configuredThumbSize}px`}
          {tier === 'preview' &&
            (previewFellBack
              ? `no preview · falls back to thumb ${configuredThumbSize}px`
              : `preview ${configuredPreviewSize}px`)}
          {tier === 'original' &&
            (asset.width ? `original ${asset.width}px` : 'original')}
          {servedPx != null && servedPx !== expectedServedPx && (
            <span className="text-neutral-500 dark:text-neutral-400">
              {' '}
              (loaded {servedPx}px)
            </span>
          )}
        </div>
        {classification && headroom != null ? (
          <div className={classification.color}>
            {classification.icon} {headroom.toFixed(2)}× {classification.label}
          </div>
        ) : tier === 'preview' && previewFellBack && !generatePreviews ? (
          <div className="text-amber-600 dark:text-amber-400">
            ⚠ preview generation off
          </div>
        ) : null}
      </div>
    </div>
  );
}

// ── Sample picker ───────────────────────────────────────────────────────

interface SamplePickerProps {
  current: AssetModel | null;
  recent: AssetModel[];
  onPick: (asset: AssetModel) => void;
}

function SamplePicker({ current, recent, onPick }: SamplePickerProps) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative inline-block">
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setOpen((o) => !o)}
        className="px-2 py-1 text-[11px] rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 hover:bg-neutral-50 dark:hover:bg-neutral-800"
      >
        Sample: {current ? fileNameFor(current) : '—'} ▾
      </button>
      {open && (
        <div className="absolute left-0 mt-1 z-10 p-2 rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 shadow-lg">
          <div className="grid grid-cols-3 gap-2 max-w-[300px]">
            {recent.length === 0 && (
              <div className="text-[11px] text-neutral-500 col-span-3">
                No other recent images.
              </div>
            )}
            {recent.map((a) => (
              <button
                key={a.id}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onPick(a);
                  setOpen(false);
                }}
                className={`block w-[88px] h-[88px] rounded overflow-hidden border ${
                  a.id === current?.id
                    ? 'border-accent ring-1 ring-accent'
                    : 'border-neutral-300 dark:border-neutral-700'
                } bg-neutral-100 dark:bg-neutral-800`}
                title={fileNameFor(a)}
              >
                {a.thumbnailUrl ? (
                  // Plain <img> here — the picker is small and ephemeral, no
                  // need to push it through the auth/blob pipeline.  Token
                  // headers won't be sent for backend URLs but most thumbnails
                  // come from external CDNs anyway.
                  <img
                    src={a.thumbnailUrl}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                ) : null}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Top-level component ─────────────────────────────────────────────────

export function DisplaySettingsPreview() {
  const dpr = useDevicePixelRatio();

  // Self-fetch /media/settings when the store is empty — the panel renders
  // through SettingFieldRenderer and can paint before the parent settings
  // adapter's effect runs, which is where the canonical fetch lives.
  // Without this, the panel would silently render with stale defaults that
  // don't match the real server config.
  const serverSettings = useMediaSettingsStore((s) => s.serverSettings);
  const serverSettingsLoading = useMediaSettingsStore((s) => s.serverSettingsLoading);
  const setServerSettings = useMediaSettingsStore((s) => s.setServerSettings);
  const setServerSettingsLoading = useMediaSettingsStore((s) => s.setServerSettingsLoading);
  useEffect(() => {
    if (serverSettings || serverSettingsLoading) return;
    setServerSettingsLoading(true);
    pixsimClient
      .get<ServerMediaSettings>('/media/settings')
      .then((s) => setServerSettings(s))
      .catch((err) => {
        console.warn('[DisplaySettingsPreview] /media/settings fetch failed', err);
      })
      .finally(() => setServerSettingsLoading(false));
  }, [serverSettings, serverSettingsLoading, setServerSettings, setServerSettingsLoading]);

  const setQualityMode = useAssetViewerStore((s) => s.updateSettings);
  const currentQualityMode = useAssetViewerStore((s) => s.settings.qualityMode);

  // Pull a small batch of recent images.  Filter to width >= 1200 so the
  // sample exercises the preview path (sub-1200 sources skip preview gen,
  // see derivatives.py:209-217).  Falls back to any image if none qualify.
  const hiResQuery = useAssets({
    limit: 12,
    filters: { media_type: 'image', min_width: 1200, sort: 'new' },
    livePrepend: false,
  });
  const anyImageQuery = useAssets({
    limit: 12,
    filters: { media_type: 'image', sort: 'new' },
    livePrepend: false,
  });

  const samplePool = useMemo<AssetModel[]>(() => {
    if (hiResQuery.items.length > 0) return hiResQuery.items;
    return anyImageQuery.items;
  }, [hiResQuery.items, anyImageQuery.items]);

  const [override, setOverride] = useState<AssetModel | null>(null);
  const sample = override ?? samplePool[0] ?? null;
  const recent = useMemo(
    () => samplePool.filter((a) => a.id !== sample?.id).slice(0, 6),
    [samplePool, sample],
  );

  const [tier, setTier] = useState<Tier>('preview');

  // Server settings drive the served-px stat lines and the recommendation
  // banner — wait for them rather than rendering with stale defaults.
  if (!serverSettings) {
    return (
      <div className="rounded-md border border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-900/50 p-3 text-[11px] text-neutral-600 dark:text-neutral-400">
        {serverSettingsLoading
          ? 'Loading server settings…'
          : 'Server settings unavailable. Refresh, or check that the backend is reachable.'}
      </div>
    );
  }

  if (!sample) {
    const stillLoading = hiResQuery.loading || anyImageQuery.loading;
    return (
      <div className="rounded-md border border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-900/50 p-3 text-[11px] text-neutral-600 dark:text-neutral-400">
        {stillLoading
          ? 'Loading sample image…'
          : 'Add an image to your library to see a size/quality preview.'}
      </div>
    );
  }

  // Past both guards: serverSettings + sample are non-null.  Pull the
  // configured derivative sizes straight from the server response so we
  // never display stale numbers.
  const configuredThumbSize = serverSettings.thumbnail_size?.[0] ?? 320;
  const configuredPreviewSize = serverSettings.preview_size?.[0] ?? 1600;
  const generatePreviews = serverSettings.generate_previews ?? true;

  const screen = typeof window !== 'undefined' ? window.screen : null;
  const screenLabel = screen ? `${screen.width}×${screen.height}` : '';

  // Auto-recommendation: if the largest card is undersized at the preview
  // tier, surface a concrete "bump preview_size" hint.  Static math, no AI.
  const largeDevicePx = Math.round(CARD_SIZE_PRESETS.large * dpr);
  const previewLargeRatio =
    configuredPreviewSize > 0 ? configuredPreviewSize / largeDevicePx : 0;
  const recommendBump = previewLargeRatio > 0 && previewLargeRatio < 1.3;
  const recommendedPreviewSize = Math.ceil((largeDevicePx * 1.5) / 100) * 100; // round up to nearest 100

  return (
    <div className="rounded-md border border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-900/50 p-3 space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold text-neutral-700 dark:text-neutral-300">
            Preview
          </span>
          <SamplePicker current={sample} recent={recent} onPick={setOverride} />
        </div>
        <div className="text-[10px] text-neutral-500 dark:text-neutral-400">
          Display: ×{dpr} {screenLabel && `· ${screenLabel}`}
        </div>
      </div>

      {!generatePreviews && (
        <div className="text-[10px] text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-900/40 rounded px-2 py-1">
          ℹ Server-side preview generation is OFF (`generate_previews=false`).
          The preview tier falls back to thumbnails for every asset.  Toggle
          "Generate Previews" in the Derivatives group below to use this tier.
        </div>
      )}

      <div className="flex gap-4 flex-wrap items-start">
        {SIZES.map(({ key, label }) => (
          <PreviewMediaCard
            key={key}
            asset={sample}
            cardSize={CARD_SIZE_PRESETS[key]}
            cardLabel={label}
            tier={tier}
            dpr={dpr}
            configuredThumbSize={configuredThumbSize}
            configuredPreviewSize={configuredPreviewSize}
            generatePreviews={generatePreviews}
          />
        ))}
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1 text-[11px]">
          <span className="text-neutral-600 dark:text-neutral-400">Tier:</span>
          {(Object.keys(TIER_LABELS) as Tier[]).map((t) => (
            <button
              key={t}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setTier(t)}
              className={`px-2 py-0.5 rounded border ${
                tier === t
                  ? 'bg-accent text-white border-accent'
                  : 'bg-white dark:bg-neutral-900 border-neutral-300 dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-800'
              }`}
            >
              {TIER_LABELS[t]}
            </button>
          ))}
        </div>
        {tier !== 'original' && (
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setQualityMode({ qualityMode: tier === 'thumb' ? 'thumbnail' : 'preview' })}
            disabled={
              (tier === 'thumb' && currentQualityMode === 'thumbnail') ||
              (tier === 'preview' && currentQualityMode === 'preview')
            }
            className="text-[10px] underline text-accent disabled:text-neutral-400 disabled:no-underline"
          >
            Apply as default
          </button>
        )}
      </div>

      {recommendBump && (
        <div className="text-[10px] italic text-neutral-600 dark:text-neutral-400">
          💡 Large cards on this display need ~{largeDevicePx}px. Bumping
          `preview_size` from {configuredPreviewSize} → {recommendedPreviewSize}
          {' '}would give {(recommendedPreviewSize / largeDevicePx).toFixed(2)}×
          {' '}headroom. Existing previews stay at the old size until
          regenerated — use the <strong>Preview Derivatives</strong> card in
          {' '}Library → Maintenance to refresh the library.
        </div>
      )}
    </div>
  );
}
