import { Button, Panel } from '@pixsim7/shared.ui';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';


import { VideoScrubWidgetRenderer } from '@lib/ui/overlay';

import {
  fromAssetResponse,
  getAsset,
  getAssetDisplayUrls,
  type AssetModel,
  type ViewerAsset,
  useAssetViewerStore,
} from '@features/assets';

import { MediaCard } from '@/components/media/MediaCard';
import { MediaDisplay } from '@/components/media/viewer/panels/MediaDisplay';
import { MediaThumbnail } from '@/components/media-preview/MediaThumbnail';


const DEFAULT_SETTINGS = { autoPlayVideos: true, loopVideos: true };

function buildViewerAsset(asset: AssetModel): ViewerAsset {
  const { mainUrl, previewUrl, thumbnailUrl } = getAssetDisplayUrls(asset);
  const viewerType = asset.mediaType === 'video' ? 'video' : 'image';
  return {
    id: asset.id,
    name: asset.description || `Asset ${asset.id}`,
    type: viewerType,
    url: thumbnailUrl || previewUrl || mainUrl || '',
    fullUrl: mainUrl,
    source: 'gallery',
    sourceGenerationId: asset.sourceGenerationId ?? undefined,
    metadata: {
      createdAt: asset.createdAt,
      providerId: asset.providerId,
    },
  };
}

export function MediaHarnessPage() {
  const [assetIdInput, setAssetIdInput] = useState('');
  const [asset, setAsset] = useState<AssetModel | null>(null);
  const [assetError, setAssetError] = useState<string | null>(null);
  const [assetLoading, setAssetLoading] = useState(false);
  const [showResolvedUrls, setShowResolvedUrls] = useState(true);

  const [manualType, setManualType] = useState<'image' | 'video'>('image');
  const [manualMediaUrl, setManualMediaUrl] = useState('');
  const [manualThumbUrl, setManualThumbUrl] = useState('');
  const [manualPreviewUrl, setManualPreviewUrl] = useState('');
  const [hoverScrub, setHoverScrub] = useState(false);

  const fileUrlRef = useRef<string | null>(null);
  const openViewer = useAssetViewerStore((s) => s.openViewer);

  const assetUrls = useMemo(
    () => (asset ? getAssetDisplayUrls(asset) : null),
    [asset],
  );
  const assetRawUrls = useMemo(() => {
    if (!asset) return null;
    return {
      remoteUrl: asset.remoteUrl ?? undefined,
      fileUrl: asset.fileUrl ?? undefined,
      previewUrl: asset.previewUrl ?? undefined,
      thumbnailUrl: asset.thumbnailUrl ?? undefined,
      storedKey: asset.storedKey ?? undefined,
      previewKey: asset.previewKey ?? undefined,
      thumbnailKey: asset.thumbnailKey ?? undefined,
    };
  }, [asset]);

  const viewerAsset = useMemo(
    () => (asset ? buildViewerAsset(asset) : null),
    [asset],
  );

  const manualViewerAsset = useMemo<ViewerAsset>(() => ({
    id: 'manual',
    name: 'Manual Media',
    type: manualType,
    url: manualThumbUrl || manualPreviewUrl || manualMediaUrl || '',
    fullUrl: manualMediaUrl || undefined,
    source: 'local',
  }), [manualType, manualThumbUrl, manualPreviewUrl, manualMediaUrl]);

  const handleLoadAsset = useCallback(async () => {
    const id = Number(assetIdInput);
    if (!Number.isFinite(id)) {
      setAssetError('Enter a valid asset id.');
      setAsset(null);
      return;
    }
    setAssetLoading(true);
    setAssetError(null);
    try {
      const response = await getAsset(id);
      const model = fromAssetResponse(response);
      setAsset(model);
    } catch (err) {
      console.error('[MediaHarness] Failed to load asset', err);
      setAssetError('Failed to load asset.');
      setAsset(null);
    } finally {
      setAssetLoading(false);
    }
  }, [assetIdInput]);

  const handleLoadSampleVideo = useCallback(() => {
    setManualType('video');
    setManualMediaUrl('https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4');
    setManualThumbUrl('');
    setManualPreviewUrl('');
  }, []);

  const handleFileChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (fileUrlRef.current) {
      URL.revokeObjectURL(fileUrlRef.current);
      fileUrlRef.current = null;
    }
    const objectUrl = URL.createObjectURL(file);
    fileUrlRef.current = objectUrl;
    if (file.type.startsWith('video')) {
      setManualType('video');
      setManualMediaUrl(objectUrl);
      setManualThumbUrl('');
      setManualPreviewUrl('');
    } else {
      setManualType('image');
      setManualMediaUrl(objectUrl);
      setManualThumbUrl(objectUrl);
      setManualPreviewUrl(objectUrl);
    }
  }, []);

  useEffect(() => {
    return () => {
      if (fileUrlRef.current) {
        URL.revokeObjectURL(fileUrlRef.current);
      }
    };
  }, []);

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Media Resolver Harness</h1>
        <p className="text-sm text-neutral-500">
          Compare resolved URLs and playback behavior across local and remote assets.
        </p>
      </div>

      <Panel className="p-4 space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-neutral-500">Asset ID</label>
            <input
              value={assetIdInput}
              onChange={(e) => setAssetIdInput(e.target.value)}
              className="w-40 px-3 py-1.5 border rounded bg-white dark:bg-neutral-900 text-sm"
              placeholder="e.g. 3626"
            />
          </div>
          <Button onClick={handleLoadAsset} size="sm" variant="primary" disabled={assetLoading}>
            {assetLoading ? 'Loading...' : 'Load Asset'}
          </Button>
          <label className="text-xs text-neutral-500 flex items-center gap-2">
            <input
              type="checkbox"
              checked={showResolvedUrls}
              onChange={(e) => setShowResolvedUrls(e.target.checked)}
            />
            Show resolved URLs
          </label>
          {assetError && <span className="text-xs text-red-500">{assetError}</span>}
        </div>

        {asset && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-neutral-600">Resolved URLs</h3>
              <pre className="text-xs bg-neutral-100 dark:bg-neutral-800 rounded p-3 overflow-auto">
                {JSON.stringify(showResolvedUrls ? assetUrls : assetRawUrls, null, 2)}
              </pre>
              <div className="flex items-center gap-2">
                <Button
                  size="xs"
                  variant="secondary"
                  onClick={() => viewerAsset && openViewer(viewerAsset, [viewerAsset])}
                >
                  Open In Viewer
                </Button>
              </div>
              <MediaThumbnail
                assetId={asset.id}
                type={asset.mediaType === 'video' ? 'video' : 'image'}
                asset={asset}
              />
            </div>
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-neutral-600">MediaCard</h3>
              <MediaCard
                id={asset.id}
                mediaType={asset.mediaType}
                providerId={asset.providerId}
                providerAssetId={asset.providerAssetId}
                thumbUrl={assetUrls?.thumbnailUrl ?? asset.thumbnailUrl ?? ''}
                previewUrl={assetUrls?.previewUrl ?? asset.previewUrl ?? undefined}
                remoteUrl={assetUrls?.mainUrl ?? asset.remoteUrl ?? ''}
                width={asset.width ?? undefined}
                height={asset.height ?? undefined}
                durationSec={asset.durationSec ?? undefined}
                description={asset.description ?? undefined}
                createdAt={asset.createdAt}
                providerStatus={asset.providerStatus ?? undefined}
                contextMenuAsset={asset}
              />
              {viewerAsset && (
                <div className="border rounded bg-neutral-50 dark:bg-neutral-900 p-2">
                  <MediaDisplay
                    asset={viewerAsset}
                    settings={DEFAULT_SETTINGS}
                    fitMode="contain"
                    zoom={100}
                  />
                </div>
              )}
            </div>
          </div>
        )}
      </Panel>

      <Panel className="p-4 space-y-4">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-neutral-500">Type</label>
            <select
              value={manualType}
              onChange={(e) => setManualType(e.target.value as 'image' | 'video')}
              className="px-3 py-1.5 border rounded bg-white dark:bg-neutral-900 text-sm"
            >
              <option value="image">image</option>
              <option value="video">video</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-neutral-500">Media URL</label>
            <input
              value={manualMediaUrl}
              onChange={(e) => setManualMediaUrl(e.target.value)}
              className="w-[360px] px-3 py-1.5 border rounded bg-white dark:bg-neutral-900 text-sm"
              placeholder="https://..."
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-neutral-500">Preview URL</label>
            <input
              value={manualPreviewUrl}
              onChange={(e) => setManualPreviewUrl(e.target.value)}
              className="w-[360px] px-3 py-1.5 border rounded bg-white dark:bg-neutral-900 text-sm"
              placeholder="https://..."
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-neutral-500">Thumb URL</label>
            <input
              value={manualThumbUrl}
              onChange={(e) => setManualThumbUrl(e.target.value)}
              className="w-[360px] px-3 py-1.5 border rounded bg-white dark:bg-neutral-900 text-sm"
              placeholder="https://..."
            />
          </div>
          <Button size="sm" variant="secondary" onClick={handleLoadSampleVideo}>
            Load Sample Video
          </Button>
          <label className="text-xs text-neutral-500">
            <input type="file" accept="image/*,video/*" onChange={handleFileChange} className="text-xs" />
          </label>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="border rounded bg-neutral-50 dark:bg-neutral-900 p-2">
            <div className="flex items-center justify-between px-2 pt-2">
              <span className="text-xs text-neutral-500">Manual Preview</span>
              <Button
                size="xs"
                variant="secondary"
                onClick={() => openViewer(manualViewerAsset, [manualViewerAsset])}
                disabled={!manualViewerAsset.url}
              >
                Open In Viewer
              </Button>
            </div>
            <MediaDisplay
              asset={manualViewerAsset}
              settings={DEFAULT_SETTINGS}
              fitMode="contain"
              zoom={100}
            />
          </div>
          <div
            className="relative border rounded bg-neutral-50 dark:bg-neutral-900 p-2"
            onMouseEnter={() => setHoverScrub(true)}
            onMouseLeave={() => setHoverScrub(false)}
          >
            {manualType === 'video' && manualMediaUrl ? (
              <div className="relative aspect-video bg-black/80 rounded overflow-hidden">
                <VideoScrubWidgetRenderer
                  url={manualMediaUrl}
                  configDuration={undefined}
                  isHovering={hoverScrub}
                  showTimeline={true}
                  showTimestamp={false}
                  timelinePosition="bottom"
                  muted={true}
                />
              </div>
            ) : (
              <div className="text-sm text-neutral-500 p-4">
                Video scrub preview appears when media type is video and a URL is provided.
              </div>
            )}
          </div>
        </div>
      </Panel>
    </div>
  );
}
