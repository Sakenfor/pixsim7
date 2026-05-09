import type { AssetModel } from '@features/assets';
import { mediaCardPropsFromAsset } from '@features/assets/components/shared/mediaCardPropsFromAsset';
import { toggleFavoriteTag } from '@features/assets/lib/favoriteTag';

import type {
  MediaCardBadgeConfig,
  MediaCardResolvedProps,
  MediaCardRuntimeProps,
} from './MediaCard';

/**
 * Canonical defaults for MediaCard badge visibility. Surfaces that build a
 * MediaCard from an AssetModel inherit these unless they pass overrides.
 *
 * Why centralised: when the viewer hand-rolled its own badgeConfig it
 * forgot showStatusIcon, so the top-left media-type icon lost its provider
 * status ring while gallery cards kept it. Routing every asset-first
 * surface through this default keeps the visual contract consistent.
 */
export const MEDIA_CARD_BADGE_DEFAULTS: MediaCardBadgeConfig = {
  showStatusIcon: true,
  showTagsInOverlay: true,
  showFooterProvider: false,
  showGenerationBadge: true,
};

/**
 * Build MediaCardResolvedProps from an AssetModel, applying canonical
 * defaults. Used by every surface that renders a MediaCard overlay from
 * an asset (gallery, viewer, future surfaces) so default behaviour
 * doesn't drift across surfaces.
 *
 * Caller-supplied runtime fields win over defaults; badgeConfig is merged
 * field-by-field so partial overrides keep the rest of the defaults.
 */
export function resolveMediaCardOverlayProps(
  asset: AssetModel,
  runtime?: MediaCardRuntimeProps,
): MediaCardResolvedProps {
  const baseProps = mediaCardPropsFromAsset(asset);
  const { badgeConfig: runtimeBadgeConfig, onToggleFavorite, ...rest } = runtime ?? {};

  return {
    ...baseProps,
    contextMenuAsset: asset,
    onToggleFavorite: onToggleFavorite ?? (() => {
      void toggleFavoriteTag(asset);
    }),
    ...rest,
    badgeConfig: { ...MEDIA_CARD_BADGE_DEFAULTS, ...runtimeBadgeConfig },
  };
}
