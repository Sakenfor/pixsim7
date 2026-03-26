import { useMemo } from 'react';

import { useAuthenticatedMedia } from '@/hooks/useAuthenticatedMedia';

import type { LocalAssetModel } from '../types/localFolderMeta';

type PreviewSource = Record<string, string> | string | undefined;

export function useLocalAssetPreview(
  asset: LocalAssetModel | undefined,
  previews: PreviewSource,
): string | undefined {
  const previewUrl = useMemo(() => {
    if (!asset) return undefined;
    if (!previews || typeof previews === 'string') return previews;
    return previews[asset.key];
  }, [asset, previews]);

  const { src: authenticatedPreview } = useAuthenticatedMedia(previewUrl);
  return authenticatedPreview || previewUrl;
}
