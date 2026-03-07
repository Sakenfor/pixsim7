import { useMemo } from 'react';

import type { InputMaskLayer } from '@features/generation';

import { useAuthenticatedMedia } from '@/hooks/useAuthenticatedMedia';

interface MaskPreviewOverlayProps {
  maskLayers?: InputMaskLayer[];
  /** Legacy fallback */
  maskUrl?: string;
}

function parseMaskAssetId(url: string | undefined): number | null {
  if (!url) return null;
  const match = url.match(/^asset:(\d+)$/);
  return match ? Number(match[1]) : null;
}

function SingleMaskLayer({ assetUrl, opacity }: { assetUrl: string; opacity: number }) {
  const assetId = parseMaskAssetId(assetUrl);
  const imageUrl = useMemo(
    () => (assetId ? `/api/v1/assets/${assetId}/file` : undefined),
    [assetId],
  );
  const { src } = useAuthenticatedMedia(imageUrl);

  if (!src) return null;

  return (
    <img
      src={src}
      alt="Mask"
      className="absolute inset-0 w-full h-full object-cover pointer-events-none"
      style={{ mixBlendMode: 'screen', opacity: opacity * 0.5 }}
    />
  );
}

export function MaskPreviewOverlay({ maskLayers, maskUrl }: MaskPreviewOverlayProps) {
  const visibleLayers = maskLayers?.filter((l) => l.visible);

  // Multi-layer mode
  if (visibleLayers && visibleLayers.length > 0) {
    return (
      <>
        {visibleLayers.map((layer) => (
          <SingleMaskLayer
            key={layer.id}
            assetUrl={layer.assetUrl}
            opacity={layer.opacity ?? 1}
          />
        ))}
      </>
    );
  }

  // Legacy single mask fallback
  if (maskUrl) {
    return <SingleMaskLayer assetUrl={maskUrl} opacity={1} />;
  }

  return null;
}
