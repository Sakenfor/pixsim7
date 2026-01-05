import type { MediaType } from '@pixsim7/shared.types';

type MediaTypeLike = {
  type?: string;
  media_type?: string;
  mediaType?: string;
};

export function resolveMediaType(
  asset: MediaTypeLike | null | undefined,
): MediaType | null {
  const rawType = asset?.type ?? asset?.media_type ?? asset?.mediaType;
  if (
    rawType === "image" ||
    rawType === "video" ||
    rawType === "audio" ||
    rawType === "3d_model"
  ) {
    return rawType;
  }
  return null;
}

export function resolveMediaTypes(
  assets: MediaTypeLike[],
): MediaType[] {
  const types = new Set<MediaType>();
  assets.forEach((asset) => {
    const resolved = resolveMediaType(asset);
    if (resolved) {
      types.add(resolved);
    }
  });
  return Array.from(types);
}
