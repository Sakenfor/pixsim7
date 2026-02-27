import clsx from 'clsx';
import { useState, useMemo, useCallback, useEffect } from 'react';

import { Icon } from '@lib/icons';
import { createBadgeWidget, type OverlayWidget } from '@lib/ui/overlay';

import { useAssets, type AssetFilters, type AssetModel } from '@features/assets';
import { CompactAssetCard } from '@features/assets/components/shared/CompactAssetCard';
import { resolveAssetSet } from '@features/assets/lib/assetSetResolver';
import {
  useAssetSetStore,
  type AssetSet,
} from '@features/assets/stores/assetSetStore';
import { MiniGallery } from '@features/gallery';

import { ruleInputClasses } from './filterRules';
import { SmartFilterEditor } from './SmartFilterEditor';

// ── Inline search for adding assets to manual sets ─────────────────────

const USE_OVERLAY_HOVER_ACTIONS = () => null;

function AssetSearchAdder({ onAdd }: { onAdd: (asset: AssetModel) => void }) {
  const [query, setQuery] = useState('');
  const { items, loading } = useAssets({
    limit: 12,
    filters: useMemo<AssetFilters>(() => (query ? { q: query } : {}), [query]),
  });

  return (
    <div className="flex flex-col gap-1">
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search assets to add…"
        className={ruleInputClasses}
      />
      {items.length > 0 && (
        <div className="grid grid-cols-4 gap-1 max-h-[200px] overflow-y-auto thin-scrollbar">
          {items.map((asset) => (
            <button
              key={asset.id}
              type="button"
              onClick={() => onAdd(asset)}
              className="rounded-lg overflow-hidden hover:ring-2 ring-accent transition-shadow"
              title={`Add asset #${asset.id}`}
            >
              <CompactAssetCard asset={asset} hideFooter aspectSquare />
            </button>
          ))}
        </div>
      )}
      {loading && (
        <div className="text-[10px] text-neutral-400 text-center py-2">Loading…</div>
      )}
    </div>
  );
}

// ── Remove badge widget builder ─────────────────────────────────────────

function makeRemoveWidget(onRemove: () => void): OverlayWidget[] {
  return [createBadgeWidget({
    id: 'remove-from-set',
    position: { anchor: 'top-right', offset: { x: -4, y: 4 } },
    stackGroup: 'badges-tr',
    visibility: { trigger: 'always', transition: 'none' },
    variant: 'icon',
    icon: 'close',
    color: 'red',
    shape: 'circle',
    tooltip: 'Remove from set',
    onClick: onRemove,
    className: '!bg-red-600 hover:!bg-red-700 !text-white opacity-70 hover:opacity-100',
    priority: 30,
  })];
}

// ── Edit view for a single set ─────────────────────────────────────────

export function SetEditView({
  set,
  onBack,
}: {
  set: AssetSet;
  onBack: () => void;
}) {
  const { renameSet, deleteSet, addAssetsToSet, removeAssetsFromSet, updateSmartFilters } =
    useAssetSetStore();
  const [name, setName] = useState(set.name);
  const [showSearch, setShowSearch] = useState(false);
  const [manualAssets, setManualAssets] = useState<AssetModel[]>([]);
  const [manualAssetsLoading, setManualAssetsLoading] = useState(false);

  // For manual sets, resolve thumbnail display
  const manualAssetIds = set.kind === 'manual' ? set.assetIds : [];
  const manualAssetIdsKey = useMemo(() => manualAssetIds.join(','), [manualAssetIds]);

  useEffect(() => {
    if (set.kind !== 'manual') {
      setManualAssets([]);
      setManualAssetsLoading(false);
      return;
    }

    let cancelled = false;
    setManualAssetsLoading(true);

    resolveAssetSet(set)
      .then((assets) => {
        if (!cancelled) {
          setManualAssets(assets);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setManualAssets([]);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setManualAssetsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [set, manualAssetIdsKey]);

  const orderedAssets = useMemo(() => (set.kind === 'manual' ? manualAssets : []), [set.kind, manualAssets]);

  // Stable ref for removeAssetsFromSet to avoid re-creating renderItemWidgets
  const removeRef = useCallback(
    (asset: AssetModel) => removeAssetsFromSet(set.id, [asset.id]),
    [set.id, removeAssetsFromSet],
  );

  const renderItemWidgets = useCallback(
    (asset: AssetModel) => makeRemoveWidget(() => removeRef(asset)),
    [removeRef],
  );

  const handleRename = useCallback(() => {
    if (name.trim() && name !== set.name) {
      renameSet(set.id, name.trim());
    }
  }, [name, set.id, set.name, renameSet]);

  return (
    <div className="flex flex-col gap-2 p-2 h-full">
      {/* Header */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onBack}
          className="p-1 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800"
        >
          <Icon name="arrowLeft" size={14} />
        </button>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={handleRename}
          onKeyDown={(e) => e.key === 'Enter' && handleRename()}
          className="flex-1 px-2 py-1 text-sm font-semibold bg-transparent border-b border-transparent hover:border-neutral-300 dark:hover:border-neutral-600 focus:border-accent outline-none"
        />
        <span className={clsx(
          'text-[9px] px-1.5 py-0.5 rounded-full font-medium',
          set.kind === 'manual'
            ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
            : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
        )}>
          {set.kind}
        </span>
      </div>

      {/* Manual set: MiniGallery + add/remove */}
      {set.kind === 'manual' && (
        <div className="flex flex-col gap-2 flex-1 min-h-0">
          <div className="text-[10px] text-neutral-500 font-medium">
            {set.assetIds.length} asset{set.assetIds.length !== 1 ? 's' : ''}
          </div>

          {manualAssetsLoading && (
            <div className="text-[10px] text-neutral-400">Loading set assets…</div>
          )}

          {!manualAssetsLoading && orderedAssets.length !== set.assetIds.length && set.assetIds.length > 0 && (
            <div className="text-[10px] text-amber-600 dark:text-amber-400">
              Showing {orderedAssets.length} of {set.assetIds.length} (some assets may be missing/deleted).
            </div>
          )}

          {orderedAssets.length > 0 && (
            <div className="flex-1 min-h-0">
              <MiniGallery
                items={orderedAssets}
                paginationMode="page"
                pageSize={12}
                showFilters={false}
                emptyMessage="No assets in this set."
                renderItemActions={USE_OVERLAY_HOVER_ACTIONS}
                renderItemWidgets={renderItemWidgets}
              />
            </div>
          )}

          <button
            type="button"
            onClick={() => setShowSearch((v) => !v)}
            className="flex items-center gap-1.5 px-2 py-1.5 text-[11px] font-medium rounded-lg bg-accent/10 text-accent hover:bg-accent/20"
          >
            <Icon name={showSearch ? 'x' : 'plus'} size={12} />
            {showSearch ? 'Close search' : 'Add assets'}
          </button>

          {showSearch && (
            <AssetSearchAdder
              onAdd={(asset) => addAssetsToSet(set.id, [asset.id])}
            />
          )}
        </div>
      )}

      {/* Smart set: filter editor + MiniGallery preview */}
      {set.kind === 'smart' && (
        <div className="flex flex-col gap-2 flex-1 min-h-0">
          <SmartFilterEditor
            filters={set.filters}
            maxResults={set.maxResults}
            onChange={(filters, maxResults) => updateSmartFilters(set.id, filters, maxResults)}
          />
          <div className="text-[10px] text-neutral-500 font-medium">Preview</div>
          <div className="flex-1 min-h-0">
            <MiniGallery
              initialFilters={set.filters}
              syncInitialFilters
              maxItems={set.maxResults}
              paginationMode="page"
              pageSize={12}
              showFilters={false}
              showSearch={false}
              renderItemActions={USE_OVERLAY_HOVER_ACTIONS}
              emptyMessage="No matching assets."
            />
          </div>
        </div>
      )}

      {/* Delete */}
      <button
        type="button"
        onClick={() => {
          const confirmed = window.confirm(
            `Delete set "${set.name}"? This cannot be undone.`,
          );
          if (!confirmed) return;
          deleteSet(set.id);
          onBack();
        }}
        className="mt-2 self-start inline-flex items-center gap-1 px-1.5 py-1 text-[10px] font-medium rounded-md text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
      >
        <Icon name="trash" size={10} />
        Delete set
      </button>
    </div>
  );
}
