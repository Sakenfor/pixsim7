export type AssetMediaType = "image" | "video" | "audio" | "3d_model";

type AssetMediaTypeLike = {
  type?: string;
  media_type?: string;
  mediaType?: string;
};

export function resolveAssetMediaType(
  asset: AssetMediaTypeLike | null | undefined,
): AssetMediaType | null {
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

export function resolveAssetMediaTypes(
  assets: AssetMediaTypeLike[],
): AssetMediaType[] {
  const types = new Set<AssetMediaType>();
  assets.forEach((asset) => {
    const resolved = resolveAssetMediaType(asset);
    if (resolved) {
      types.add(resolved);
    }
  });
  return Array.from(types);
}
