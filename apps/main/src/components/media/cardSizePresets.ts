/**
 * Gallery card size presets.
 *
 * Lifted out of AssetGallery.tsx so non-component consumers (the
 * display-settings preview panel, future card-size selectors) can import
 * the constants without dragging the full gallery component in — and so
 * AssetGallery.tsx's Fast Refresh isn't broken by mixing component and
 * constant exports (react-refresh/only-export-components).
 */

export type GalleryCardSizePreset = 'small' | 'medium' | 'large' | 'custom';

export const CARD_SIZE_PRESETS: Record<Exclude<GalleryCardSizePreset, 'custom'>, number> = {
  small: 180,
  medium: 260,
  large: 360,
};
