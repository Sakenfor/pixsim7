import React, { useEffect, useMemo, useState } from 'react';
import type { SceneMetaComicPanel, ComicPanelRequestContext } from './types';
import { extractNumericAssetId, ensureAssetRef } from './helpers';
import { useAssetProvider } from '@lib/assetProvider';
import type { AssetRequest } from '@pixsim7/shared.types';

export type ComicPanelLayout = 'single' | 'strip' | 'grid2';

export interface ComicPanelViewProps {
  panels: SceneMetaComicPanel[];
  layout?: ComicPanelLayout;
  showCaption?: boolean;
  className?: string;
  onPanelClick?: (panel: SceneMetaComicPanel) => void;
  requestContext?: ComicPanelRequestContext;
  animate?: boolean;
}

const layoutClasses: Record<ComicPanelLayout, string> = {
  single: 'flex flex-col items-center justify-center',
  strip: 'flex flex-row gap-4 overflow-x-auto',
  grid2: 'grid grid-cols-2 gap-4',
};

/**
 * Presentational component for rendering one or more comic panels.
 * The asset URL resolution logic will be enhanced in Phase 2 to use the
 * AssetProvider abstraction. For now it mirrors the widget's previous behavior.
 */
export function ComicPanelView({
  panels,
  layout = 'single',
  showCaption = true,
  className = '',
  onPanelClick,
  requestContext,
  animate = true,
}: ComicPanelViewProps) {
  const assetProvider = useAssetProvider();

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

  const fallbackSources = useMemo(() => {
    const entries = panelTargets.map(({ panelKey, fallbackUrl }) => [panelKey, fallbackUrl]);
    return Object.fromEntries(entries) as Record<string, string | undefined>;
  }, [panelTargets]);

  const [assetUrls, setAssetUrls] = useState<Record<string, string | undefined>>(fallbackSources);

  useEffect(() => {
    setAssetUrls(fallbackSources);
  }, [fallbackSources]);

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

          if (numericId) {
            try {
              const asset = await assetProvider.getAsset(numericId);
              resolvedUrl = asset.url;
            } catch (error) {
              console.warn('[ComicPanelView] Failed to load asset', numericId, error);
            }
          }

          if ((!resolvedUrl || resolvedUrl === fallbackUrl) && allowDynamicGeneration) {
            const assetRequest = buildDynamicAssetRequest(panel, requestContext);

            if (assetRequest) {
              try {
                const asset = await assetProvider.requestAsset(assetRequest);
                resolvedUrl = asset.url;
              } catch (error) {
                console.warn(
                  '[ComicPanelView] Failed to request dynamic panel asset',
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
          className={`comic-panel-frame flex flex-col ${
            animate ? 'transition-opacity duration-500 ease-out' : ''
          }`}
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

function buildFallbackAssetUrl(
  panel: SceneMetaComicPanel,
  numericId: string | null
): string | undefined {
  if (typeof panel.assetId === 'string' && panel.assetId.startsWith('http')) {
    return panel.assetId;
  }

  if (numericId) {
    return `/api/assets/${numericId}`;
  }

  return undefined;
}

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
