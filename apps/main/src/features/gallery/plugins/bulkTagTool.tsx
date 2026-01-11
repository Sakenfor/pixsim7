/**
 * Bulk Tag Gallery Tool
 *
 * Demonstrates a gallery tool with surface support.
 * Available on default and curator surfaces, but not review.
 */

import { useEffect, useMemo, useState } from 'react';
import { Button } from '@pixsim7/shared.ui';
import { toSnakeCaseDeep } from '@lib/utils';
import type { GalleryToolPlugin, GalleryToolContext } from '../lib/core/types';

type TagSuggestion = {
  id: number;
  slug: string;
  name: string;
  namespace: string;
  displayName?: string | null;
};

type TagApiRecord = {
  id: number;
  slug: string;
  name: string;
  namespace: string;
  display_name?: string | null;
  displayName?: string | null;
};

type TagCount = {
  slug: string;
  label: string;
  count: number;
};

type StatusState = {
  kind: 'success' | 'error' | 'info';
  message: string;
};

function parseTags(value: string): string[] {
  return value
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function formatTagLabel(tag: { slug: string; label?: string; displayName?: string | null; name?: string }): string {
  if (tag.label) return tag.label;
  if (tag.displayName) return tag.displayName;
  if (tag.name) return tag.name;
  return tag.slug;
}

function BulkTagToolUI({ context }: { context: GalleryToolContext }) {
  const [mode, setMode] = useState<'add' | 'remove' | 'replace'>('add');
  const [tagInput, setTagInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [status, setStatus] = useState<StatusState | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [suggestedTags, setSuggestedTags] = useState<TagSuggestion[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const selectedCount = context.selectedAssets.length;

  const { allTags, commonTags } = useMemo(() => {
    const counts = new Map<string, TagCount>();
    const selectionSize = context.selectedAssets.length;

    context.selectedAssets.forEach((asset) => {
      const seen = new Set<string>();
      (asset.tags || []).forEach((tag) => {
        if (!tag.slug || seen.has(tag.slug)) return;
        seen.add(tag.slug);
        const label = tag.displayName || tag.name || tag.slug;
        const existing = counts.get(tag.slug);
        if (existing) {
          existing.count += 1;
        } else {
          counts.set(tag.slug, { slug: tag.slug, label, count: 1 });
        }
      });
    });

    const all = Array.from(counts.values()).sort(
      (a, b) => b.count - a.count || a.slug.localeCompare(b.slug)
    );
    const common = selectionSize > 0 ? all.filter((tag) => tag.count === selectionSize) : [];
    return { allTags: all, commonTags: common };
  }, [context.selectedAssets]);

  const addTagToInput = (slug: string) => {
    setTagInput((prev) => {
      const tags = parseTags(prev);
      if (tags.includes(slug)) return prev;
      return tags.length ? `${tags.join(', ')}, ${slug}` : slug;
    });
  };

  const handleApplyTags = async () => {
    if (selectedCount === 0) return;

    const tags = Array.from(new Set(parseTags(tagInput)));
    if (tags.length === 0) {
      setStatus({ kind: 'error', message: 'Enter at least one tag.' });
      return;
    }

    if (mode === 'replace') {
      const confirmed = confirm('Replace all tags on selected assets?');
      if (!confirmed) return;
    }

    setIsProcessing(true);
    setStatus(null);

    try {
      const assetIds = context.selectedAssets.map((asset) => asset.id);
      const response = await fetch('/api/v1/assets/bulk/tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          toSnakeCaseDeep({
            assetIds,
            tags,
            mode,
          })
        ),
      });

      if (!response.ok) {
        const errorPayload = await response.json().catch(() => null);
        const detail = errorPayload?.detail || 'Failed to update tags.';
        throw new Error(detail);
      }

      const data = await response.json().catch(() => null);
      const updatedCount = data?.updated_count ?? assetIds.length;

      setStatus({
        kind: 'success',
        message: `Updated ${updatedCount} asset${updatedCount === 1 ? '' : 's'}.`,
      });
      setTagInput('');
      context.refresh();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to update tags.';
      setStatus({ kind: 'error', message });
    } finally {
      setIsProcessing(false);
    }
  };

  useEffect(() => {
    const query = searchQuery.trim();
    if (query.length < 2) {
      setSuggestedTags([]);
      setIsSearching(false);
      return;
    }

    const controller = new AbortController();
    const timeout = setTimeout(async () => {
      setIsSearching(true);
      try {
        const response = await fetch(
          `/api/v1/tags?q=${encodeURIComponent(query)}&limit=20`,
          { signal: controller.signal }
        );
        if (!response.ok) {
          throw new Error('Tag search failed');
        }
        const data = await response.json();
        const tags = Array.isArray(data?.tags) ? (data.tags as TagApiRecord[]) : [];
        const next = tags.map((tag) => ({
          id: tag.id,
          slug: tag.slug,
          name: tag.name,
          namespace: tag.namespace,
          displayName: tag.display_name ?? tag.displayName ?? null,
        }));
        setSuggestedTags(next);
      } catch (error) {
        if ((error as Error).name !== 'AbortError') {
          setSuggestedTags([]);
        }
      } finally {
        setIsSearching(false);
      }
    }, 200);

    return () => {
      controller.abort();
      clearTimeout(timeout);
    };
  }, [searchQuery]);

  const statusStyle = status
    ? status.kind === 'success'
      ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300'
      : status.kind === 'error'
        ? 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300'
        : 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
    : '';

  const tagButtonClass =
    'px-2 py-1 text-xs bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 rounded border border-neutral-300 dark:border-neutral-600 hover:bg-neutral-200 dark:hover:bg-neutral-700';

  const tagLabel =
    mode === 'remove'
      ? 'Remove tags from'
      : mode === 'replace'
        ? 'Replace tags on'
        : 'Add tags to';

  const commonTagsPreview = commonTags.slice(0, 12);
  const allTagsPreview = allTags.slice(0, 16);

  return (
    <div className="space-y-3">
      <div className="text-sm text-neutral-600 dark:text-neutral-400">
        {tagLabel} {selectedCount} selected asset{selectedCount !== 1 ? 's' : ''}
      </div>

      <div className="flex flex-wrap gap-2">
        {(['add', 'remove', 'replace'] as const).map((value) => (
          <button
            key={value}
            onClick={() => setMode(value)}
            className={`px-2.5 py-1 text-xs rounded border ${
              mode === value
                ? 'bg-blue-500 text-white border-blue-500'
                : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 border-neutral-300 dark:border-neutral-600'
            }`}
          >
            {value === 'add' ? 'Add' : value === 'remove' ? 'Remove' : 'Replace'}
          </button>
        ))}
      </div>

      {mode === 'replace' && (
        <div className="text-xs text-amber-600 dark:text-amber-400">
          Replace will overwrite all existing tags on the selected assets.
        </div>
      )}

      {status && (
        <div className={`text-xs p-2 rounded ${statusStyle}`}>
          {status.message}
        </div>
      )}

      <div className="space-y-2">
        <input
          type="text"
          className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-600 rounded text-sm"
          placeholder="Enter tags (comma-separated, use namespace:tag)"
          value={tagInput}
          onChange={(e) => setTagInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              handleApplyTags();
            }
          }}
        />

        <div className="flex gap-2">
          <Button
            variant="primary"
            onClick={handleApplyTags}
            disabled={!tagInput.trim() || isProcessing}
            className="flex-1 text-sm"
          >
            {isProcessing ? 'Working...' : 'Apply Tags'}
          </Button>
          <Button
            variant="secondary"
            onClick={() => setTagInput('')}
            disabled={!tagInput.trim() || isProcessing}
            className="text-sm"
          >
            Clear
          </Button>
        </div>
      </div>

      {(commonTagsPreview.length > 0 || allTagsPreview.length > 0) && (
        <div className="space-y-2">
          {commonTagsPreview.length > 0 && (
            <div className="space-y-1">
              <div className="text-xs text-neutral-500 dark:text-neutral-400">
                Tags on all selected
              </div>
              <div className="flex flex-wrap gap-1">
                {commonTagsPreview.map((tag) => (
                  <button
                    key={`common-${tag.slug}`}
                    onClick={() => addTagToInput(tag.slug)}
                    className={tagButtonClass}
                    title={`${tag.slug} (${tag.count}/${selectedCount})`}
                  >
                    {formatTagLabel(tag)}
                  </button>
                ))}
                {commonTags.length > commonTagsPreview.length && (
                  <span className="text-xs text-neutral-500 dark:text-neutral-400">
                    +{commonTags.length - commonTagsPreview.length} more
                  </span>
                )}
              </div>
            </div>
          )}

          {allTagsPreview.length > 0 && (
            <div className="space-y-1">
              <div className="text-xs text-neutral-500 dark:text-neutral-400">
                Tags in selection
              </div>
              <div className="flex flex-wrap gap-1">
                {allTagsPreview.map((tag) => (
                  <button
                    key={`all-${tag.slug}`}
                    onClick={() => addTagToInput(tag.slug)}
                    className={tagButtonClass}
                    title={`${tag.slug} (${tag.count}/${selectedCount})`}
                  >
                    {formatTagLabel(tag)}
                  </button>
                ))}
                {allTags.length > allTagsPreview.length && (
                  <span className="text-xs text-neutral-500 dark:text-neutral-400">
                    +{allTags.length - allTagsPreview.length} more
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="space-y-2">
        <div className="text-xs text-neutral-500 dark:text-neutral-400">
          Search existing tags
        </div>
        <input
          type="text"
          className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-600 rounded text-sm"
          placeholder="Type to search tags"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        {isSearching && (
          <div className="text-xs text-neutral-500 dark:text-neutral-400">
            Searching...
          </div>
        )}
        {!isSearching && searchQuery.trim().length >= 2 && suggestedTags.length === 0 && (
          <div className="text-xs text-neutral-500 dark:text-neutral-400">
            No matching tags found
          </div>
        )}
        {suggestedTags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {suggestedTags.map((tag) => (
              <button
                key={`suggest-${tag.slug}`}
                onClick={() => addTagToInput(tag.slug)}
                className={tagButtonClass}
                title={tag.slug}
              >
                {tag.displayName || tag.slug}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="text-xs text-neutral-500 dark:text-neutral-400 mt-2">
        Tip: Select multiple assets with Ctrl+Click.
      </div>
    </div>
  );
}

/**
 * Bulk Tag Tool Definition
 */
export const bulkTagTool: GalleryToolPlugin = {
  id: 'bulk-tag',
  name: 'Bulk Tag',
  description: 'Add, remove, or replace tags on multiple assets',
  icon: 'dY?ú‹,?',
  category: 'automation',

  // This tool supports default and curator surfaces, but NOT review
  supportedSurfaces: ['assets-default', 'assets-curator'],

  // Only show when assets are selected
  whenVisible: (context) => context.selectedAssets.length > 0,

  render: (context) => <BulkTagToolUI context={context} />,
};
