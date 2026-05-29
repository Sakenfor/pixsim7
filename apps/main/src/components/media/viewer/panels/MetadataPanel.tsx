/**
 * MetadataPanel
 *
 * Asset metadata display panel for the asset viewer.
 * Shows description, tags, size, dates, path, duration.
 */

import { Icon } from '@lib/icons';

import { getTagSourceMeta } from '@features/assets/lib/tagSource';

import type { ViewerPanelContext } from '../types';

import { useViewerContext } from './hooks';

interface MetadataPanelProps {
  context: ViewerPanelContext;
  panelId: string;
}

export function MetadataPanel({ context }: MetadataPanelProps) {
  const { resolvedContext } = useViewerContext({ context });
  const { asset } = resolvedContext;

  if (!asset) {
    return (
      <div className="h-full flex items-center justify-center text-neutral-500 text-sm">
        No asset selected
      </div>
    );
  }

  const { metadata } = asset;

  if (!metadata) {
    return (
      <div className="h-full flex items-center justify-center text-neutral-500 text-sm">
        No metadata available
      </div>
    );
  }

  // Prefer the full model's tags (with provenance source); fall back to bare
  // metadata tag names for sources that don't carry the model (e.g. local).
  const modelTags = asset._assetModel?.tags;
  const tagEntries =
    modelTags && modelTags.length > 0
      ? modelTags.map((t) => ({ key: String(t.id), label: t.displayName || t.slug, source: t.source }))
      : (metadata.tags ?? []).map((name, i) => ({ key: `${i}-${name}`, label: name, source: null as string | null }));

  return (
    <div className="h-full overflow-y-auto p-3 space-y-3 text-sm">
      {/* Description */}
      {metadata.description && (
        <div>
          <span className="text-[10px] uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
            Description
          </span>
          <p className="mt-1 text-neutral-700 dark:text-neutral-300">
            {metadata.description}
          </p>
        </div>
      )}

      {/* Tags — prefer the full model's tags (which carry provenance); fall
          back to bare metadata tag names (e.g. local assets). Chip tone is
          accent for tags you added, neutral for generated; the leading glyph
          + tooltip name the exact source. */}
      {tagEntries.length > 0 && (
        <div>
          <span className="text-[10px] uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
            Tags
          </span>
          <div className="flex flex-wrap gap-1 mt-1">
            {tagEntries.map((tag) => {
              const meta = getTagSourceMeta(tag.source);
              return (
                <span
                  key={tag.key}
                  title={meta.label}
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs ${
                    meta.isManual
                      ? 'bg-accent/15 text-accent'
                      : 'bg-neutral-200 dark:bg-neutral-700 text-neutral-600 dark:text-neutral-300'
                  }`}
                >
                  <Icon name={meta.icon} size={11} className={meta.iconClass} />
                  {tag.label}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* Provider */}
      {metadata.providerId && (
        <div className="flex justify-between">
          <span className="text-neutral-500 dark:text-neutral-400">Provider</span>
          <span className="text-neutral-700 dark:text-neutral-300">{metadata.providerId}</span>
        </div>
      )}

      {/* Size */}
      {metadata.size && (
        <div className="flex justify-between">
          <span className="text-neutral-500 dark:text-neutral-400">Size</span>
          <span className="text-neutral-700 dark:text-neutral-300">
            {(metadata.size / 1024 / 1024).toFixed(2)} MB
          </span>
        </div>
      )}

      {/* Duration */}
      {metadata.duration && (
        <div className="flex justify-between">
          <span className="text-neutral-500 dark:text-neutral-400">Duration</span>
          <span className="text-neutral-700 dark:text-neutral-300">
            {metadata.duration.toFixed(1)}s
          </span>
        </div>
      )}

      {/* Created */}
      {metadata.createdAt && (
        <div className="flex justify-between">
          <span className="text-neutral-500 dark:text-neutral-400">Created</span>
          <span className="text-neutral-700 dark:text-neutral-300">
            {new Date(metadata.createdAt).toLocaleDateString()}
          </span>
        </div>
      )}

      {/* Path */}
      {metadata.path && (
        <div>
          <span className="text-[10px] uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
            Path
          </span>
          <p className="mt-1 text-xs font-mono text-neutral-600 dark:text-neutral-400 break-all">
            {metadata.path}
          </p>
        </div>
      )}
    </div>
  );
}
