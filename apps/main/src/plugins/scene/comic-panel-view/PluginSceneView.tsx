/**
 * Comic Panel Scene View Plugin
 *
 * Renders scene content as sequential comic frames with captions.
 * This plugin handles asset resolution, dynamic generation fallback,
 * and layout presentation for comic-style story beats.
 *
 * SDK Dependencies:
 * - @features/scene: Types and helpers for comic panel data
 * - @lib/assetProvider: Asset resolution and dynamic generation
 * - @pixsim7/shared.types: Canonical reference types
 */

import React, { useEffect, useMemo, useState } from 'react';
import type { SceneViewRenderProps } from '@lib/plugins/sceneViewPlugin';
import type {
  SceneMetaComicPanel,
  ComicPanelRequestContext,
  ComicPanelLayout,
} from '@features/scene';
import { ensureAssetRef, extractNumericAssetId } from '@features/scene';
import { useAssetProvider } from '@lib/assetProvider';
import type { AssetRequest } from '@pixsim7/shared.types';

/**
 * Layout CSS classes for different panel arrangements.
 */
const layoutClasses: Record<ComicPanelLayout, string> = {
  single: 'flex flex-col items-center justify-center',
  strip: 'flex flex-row gap-4 overflow-x-auto',
  grid2: 'grid grid-cols-2 gap-4',
};

/**
 * Comic Panel Scene View Component
 *
 * Presentational component that renders comic panels with:
 * - Automatic asset URL resolution via AssetProvider
 * - Dynamic generation fallback for missing assets
 * - Multiple layout modes (single, strip, grid)
 * - Optional captions
 * - Click interaction support
 */
export function ComicPanelSceneView({
  panels = [],
  layout = 'single',
  showCaption = true,
  className = '',
  onPanelClick,
  requestContext,
}: SceneViewRenderProps) {
  const assetProvider = useAssetProvider();

  // Pre-compute panel metadata for rendering
  const panelTargets = useMemo(
    () =>
      panels.map((panel, index) => {
        const numericId = extractNumericAssetId(panel.assetId);
        const assetRef = ensureAssetRef(panel.assetId);
        const fallbackUrl = buildFallbackAssetUrl(panel, numericId);

        return {
          panel,
          panelKey: panel.id || `panel-${index}`,
          numericId,
          assetRef,
          fallbackUrl,
          allowDynamicGeneration: panel.allowDynamicGeneration !== false,
        };
      }),
    [panels]
  );

  // Initialize asset URLs with fallbacks
  const fallbackSources = useMemo(() => {
    const entries = panelTargets.map(({ panelKey, fallbackUrl }) => [panelKey, fallbackUrl]);
    return Object.fromEntries(entries) as Record<string, string | undefined>;
  }, [panelTargets]);

  const [assetUrls, setAssetUrls] = useState<Record<string, string | undefined>>(fallbackSources);

  // Reset URLs when fallbacks change
  useEffect(() => {
    setAssetUrls(fallbackSources);
  }, [fallbackSources]);

  // Load assets asynchronously
  useEffect(() => {
    let cancelled = false;

    async function loadAssets() {
      if (!panelTargets.length) {
        return;
      }

      const entries = await Promise.all(
        panelTargets.map(async (target) => {
          const { panelKey, numericId, fallbackUrl, panel, allowDynamicGeneration } = target;
          let resolvedUrl = fallbackUrl;

          // Try to load existing asset
          if (numericId) {
            try {
              const asset = await assetProvider.getAsset(numericId);
              resolvedUrl = asset.url;
            } catch (error) {
              console.warn('[ComicPanelSceneView] Failed to load asset', numericId, error);
            }
          }

          // Fall back to dynamic generation if enabled
          if ((!resolvedUrl || resolvedUrl === fallbackUrl) && allowDynamicGeneration) {
            const assetRequest = buildDynamicAssetRequest(panel, requestContext);

            if (assetRequest) {
              try {
                const asset = await assetProvider.requestAsset(assetRequest);
                resolvedUrl = asset.url;
              } catch (error) {
                console.warn(
                  '[ComicPanelSceneView] Failed to request dynamic panel asset',
                  assetRequest,
                  error
                );
              }
            }
          }

          return [panelKey, resolvedUrl ?? fallbackUrl] as const;
        })
      );

      if (cancelled) {
        return;
      }

      setAssetUrls((prev) => {
        const next = { ...prev };
        for (const [panelKey, url] of entries) {
          if (url) {
            next[panelKey] = url;
          }
        }
        return next;
      });
    }

    loadAssets();

    return () => {
      cancelled = true;
    };
  }, [assetProvider, panelTargets, requestContext]);

  // Empty state
  if (!panels || panels.length === 0) {
    return (
      <div className={`comic-panel-widget comic-panel-empty ${className}`}>
        <div className="text-white/50 text-sm text-center p-4">No comic panels to display</div>
      </div>
    );
  }

  const layoutClass = layoutClasses[layout];

  return (
    <div
      className={`comic-panel-widget ${layoutClass} ${className}`}
      style={{ maxWidth: layout === 'single' ? '600px' : '100%' }}
    >
      {panelTargets.map(({ panel, panelKey }, index) => (
        <div
          key={panelKey}
          className="comic-panel-frame flex flex-col transition-opacity duration-500 ease-out"
          onClick={() => onPanelClick?.(panel)}
          style={{ cursor: onPanelClick ? 'pointer' : 'default' }}
        >
          <div className="comic-panel-image relative bg-black/20 rounded-lg overflow-hidden">
            <img
              src={assetUrls[panelKey] || '/placeholder.png'}
              alt={panel.caption || `Comic panel ${index + 1}`}
              className="w-full h-auto object-contain"
              style={{ maxHeight: layout === 'single' ? '70vh' : '40vh' }}
            />
          </div>

          {showCaption && panel.caption && (
            <div className="comic-panel-caption mt-2 text-sm text-white/80 text-center px-2">
              {panel.caption}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/**
 * Build a fallback asset URL for direct HTTP URLs or legacy numeric IDs.
 */
function buildFallbackAssetUrl(
  panel: SceneMetaComicPanel,
  numericId: string | null
): string | undefined {
  // Direct HTTP URLs pass through
  if (typeof panel.assetId === 'string' && panel.assetId.startsWith('http')) {
    return panel.assetId;
  }

  // Legacy API path for numeric IDs
  if (numericId) {
    return `/api/assets/${numericId}`;
  }

  return undefined;
}

/**
 * Build an asset request for dynamic generation based on panel metadata.
 */
function buildDynamicAssetRequest(
  panel: SceneMetaComicPanel,
  requestContext?: ComicPanelRequestContext
): AssetRequest | null {
  if (panel.allowDynamicGeneration === false) {
    return null;
  }

  const locationId = panel.location ?? requestContext?.locationId;
  const characterId = panel.characters?.[0] ?? requestContext?.characters?.[0];
  const tags = panel.tags ?? requestContext?.tags;

  const promptParts = [
    panel.caption,
    panel.mood ? `Mood: ${panel.mood}` : null,
    tags && tags.length > 0 ? `Tags: ${tags.join(', ')}` : null,
  ].filter(Boolean);

  const prompt =
    getMetadataString(panel.metadata, 'prompt') ??
    (promptParts.length ? promptParts.join('\n') : undefined);

  // Need at least some context for generation
  if (
    !locationId &&
    !characterId &&
    !prompt &&
    !requestContext?.sceneId &&
    !requestContext?.choiceId
  ) {
    return null;
  }

  return {
    sceneId: requestContext?.sceneId,
    choiceId: requestContext?.choiceId,
    locationId: typeof locationId === 'string' ? locationId : locationId ?? undefined,
    characterId: characterId,
    prompt,
    allowGeneration: true,
    preferCached: true,
    providerParams: tags ? { tags } : undefined,
  };
}

/**
 * Safely extract a string value from panel metadata.
 */
function getMetadataString(
  metadata: Record<string, unknown> | undefined,
  key: string
): string | undefined {
  if (!metadata) {
    return undefined;
  }

  const value = metadata[key];
  return typeof value === 'string' ? value : undefined;
}
