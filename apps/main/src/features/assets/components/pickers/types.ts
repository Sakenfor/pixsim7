/**
 * Shared asset picker types.
 *
 * `PickedAsset` is the canonical result shape returned by all picker
 * variants (gallery mode, inline search, etc.).
 */

export interface PickedAsset {
  id: number;
  mediaType: string;
  thumbnailUrl?: string;
  url?: string;
  name?: string;
}
