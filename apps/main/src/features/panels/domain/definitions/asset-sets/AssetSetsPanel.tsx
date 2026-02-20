/**
 * AssetSetsPanel
 *
 * Panel for creating and managing named asset collections (manual & smart).
 * Two view modes: list view (browse all sets) and edit view (manage a single set).
 */

import clsx from 'clsx';
import { useState, useMemo, useCallback, useRef, useEffect } from 'react';

import { Icon, type IconName } from '@lib/icons';

import { useAssets, type AssetFilters, type AssetModel } from '@features/assets';
import { CompactAssetCard } from '@features/assets/components/shared/CompactAssetCard';
import { useTagAutocomplete } from '@features/assets/lib/useTagAutocomplete';
import {
  useAssetSetStore,
  type AssetSet,
  type AssetSetKind,
} from '@features/assets/stores/assetSetStore';

// ── Inline search for adding assets to manual sets ─────────────────────

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
        className="w-full px-2 py-1.5 text-[11px] rounded-lg bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700"
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

// ── Tag picker with autocomplete ──────────────────────────────────────

function TagPicker({
  selected,
  onChangeTags,
}: {
  selected: string[];
  onChangeTags: (tags: string[]) => void;
}) {
  const [input, setInput] = useState('');
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const { results, loading } = useTagAutocomplete(input, { enabled: open && input.length > 0 });

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const addTag = useCallback(
    (tag: string) => {
      const normalized = tag.trim().toLowerCase();
      if (normalized && !selected.includes(normalized)) {
        onChangeTags([...selected, normalized]);
      }
      setInput('');
    },
    [selected, onChangeTags],
  );

  const removeTag = useCallback(
    (tag: string) => onChangeTags(selected.filter((t) => t !== tag)),
    [selected, onChangeTags],
  );

  return (
    <div ref={wrapperRef} className="flex flex-col gap-1">
      <span className="text-[10px] text-neutral-500 font-medium">Tags</span>
      {/* Selected tag chips */}
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {selected.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 pl-1.5 pr-0.5 py-0.5 rounded-md bg-accent/15 text-accent text-[10px] font-medium"
            >
              {tag}
              <button
                type="button"
                onClick={() => removeTag(tag)}
                className="p-0.5 rounded hover:bg-accent/25"
              >
                <Icon name="x" size={8} />
              </button>
            </span>
          ))}
        </div>
      )}
      {/* Autocomplete input */}
      <div className="relative">
        <input
          type="text"
          value={input}
          onChange={(e) => { setInput(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && input.trim()) {
              e.preventDefault();
              addTag(input);
            }
            if (e.key === 'Backspace' && !input && selected.length > 0) {
              removeTag(selected[selected.length - 1]);
            }
          }}
          placeholder={selected.length > 0 ? 'Add more…' : 'Search tags…'}
          className="w-full px-2 py-1.5 text-[11px] rounded-lg bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700"
        />
        {open && (results.length > 0 || loading) && (
          <div className="absolute left-0 right-0 top-full mt-1 z-50 bg-white dark:bg-neutral-800 rounded-lg shadow-lg border border-neutral-200 dark:border-neutral-700 py-1 max-h-[160px] overflow-y-auto">
            {results.map((tag) => {
              const fullTag = `${tag.namespace}:${tag.name}`;
              const isSelected = selected.includes(fullTag);
              return (
                <button
                  key={fullTag}
                  type="button"
                  onClick={() => { addTag(fullTag); setOpen(false); }}
                  className={clsx(
                    'w-full flex items-center gap-2 px-2.5 py-1.5 text-[11px] text-left',
                    isSelected
                      ? 'text-accent font-medium bg-accent/5'
                      : 'text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-700',
                  )}
                >
                  <Icon name="tag" size={10} className="text-neutral-400 shrink-0" />
                  <span className="text-neutral-400">{tag.namespace}:</span>
                  <span className="truncate">{tag.display_name ?? tag.name}</span>
                  {isSelected && <Icon name="check" size={10} className="ml-auto text-accent shrink-0" />}
                </button>
              );
            })}
            {loading && (
              <div className="px-2.5 py-1.5 text-[10px] text-neutral-400">Searching…</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Smart set filter editor ────────────────────────────────────────────

const MEDIA_TYPE_OPTIONS: { value: string; label: string; icon: IconName }[] = [
  { value: '', label: 'Any', icon: 'layers' },
  { value: 'image', label: 'Image', icon: 'image' },
  { value: 'video', label: 'Video', icon: 'film' },
  { value: 'audio', label: 'Audio', icon: 'audio' },
];

function SmartFilterEditor({
  filters,
  onChange,
}: {
  filters: AssetFilters;
  onChange: (filters: AssetFilters) => void;
}) {
  const selectedTags = useMemo(() => {
    if (!filters.tag) return [];
    return Array.isArray(filters.tag) ? filters.tag : [filters.tag];
  }, [filters.tag]);

  const currentMediaType = (Array.isArray(filters.media_type) ? filters.media_type[0] : filters.media_type) ?? '';

  return (
    <div className="flex flex-col gap-2.5">
      {/* Tag picker with autocomplete */}
      <TagPicker
        selected={selectedTags}
        onChangeTags={(tags) => onChange({ ...filters, tag: tags.length > 0 ? tags : undefined })}
      />

      {/* Media type toggle pills */}
      <div className="flex flex-col gap-0.5">
        <span className="text-[10px] text-neutral-500 font-medium">Media Type</span>
        <div className="flex gap-1">
          {MEDIA_TYPE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange({ ...filters, media_type: (opt.value || undefined) as AssetFilters['media_type'] })}
              className={clsx(
                'flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium transition-colors',
                currentMediaType === opt.value
                  ? 'bg-accent text-accent-text'
                  : 'bg-white dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-700',
              )}
            >
              <Icon name={opt.icon} size={11} />
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Search query */}
      <div className="flex flex-col gap-0.5">
        <span className="text-[10px] text-neutral-500 font-medium">Search</span>
        <div className="relative">
          <Icon name="search" size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-neutral-400" />
          <input
            type="text"
            value={filters.q ?? ''}
            onChange={(e) => onChange({ ...filters, q: e.target.value || undefined })}
            placeholder="Keyword filter…"
            className="w-full pl-6 pr-2 py-1.5 text-[11px] rounded-lg bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700"
          />
        </div>
      </div>
    </div>
  );
}

// ── Smart set preview ──────────────────────────────────────────────────

function SmartSetPreview({ filters }: { filters: AssetFilters }) {
  const { items, loading } = useAssets({ limit: 8, filters });
  return (
    <div className="flex flex-col gap-1">
      <div className="text-[10px] text-neutral-500 font-medium">
        Preview {loading ? '…' : `(${items.length}+ matches)`}
      </div>
      {items.length > 0 && (
        <div className="grid grid-cols-4 gap-1">
          {items.map((a) => (
            <CompactAssetCard key={a.id} asset={a} hideFooter aspectSquare />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Edit view for a single set ─────────────────────────────────────────

function SetEditView({
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

  // For manual sets, resolve thumbnail display
  const manualAssetIds = set.kind === 'manual' ? set.assetIds : [];
  const { items: manualAssets } = useAssets({
    limit: manualAssetIds.length || 1,
    filters: useMemo<AssetFilters>(() => ({}), []),
    // We use a minimal load; real resolution happens via the set's IDs
  });

  // Filter fetched assets to only those in the set (in set order)
  const orderedAssets = useMemo(() => {
    if (set.kind !== 'manual') return [];
    const byId = new Map(manualAssets.map((a) => [a.id, a]));
    return set.assetIds.map((id) => byId.get(id)).filter(Boolean) as AssetModel[];
  }, [set, manualAssets]);

  const handleRename = useCallback(() => {
    if (name.trim() && name !== set.name) {
      renameSet(set.id, name.trim());
    }
  }, [name, set.id, set.name, renameSet]);

  return (
    <div className="flex flex-col gap-2 p-2">
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

      {/* Manual set: asset grid + add/remove */}
      {set.kind === 'manual' && (
        <>
          <div className="text-[10px] text-neutral-500 font-medium">
            {set.assetIds.length} asset{set.assetIds.length !== 1 ? 's' : ''}
          </div>

          {orderedAssets.length > 0 && (
            <div className="grid grid-cols-3 gap-1.5">
              {orderedAssets.map((asset) => (
                <CompactAssetCard
                  key={asset.id}
                  asset={asset}
                  hideFooter
                  aspectSquare
                  showRemoveButton
                  onRemove={() => removeAssetsFromSet(set.id, [asset.id])}
                />
              ))}
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
        </>
      )}

      {/* Smart set: filter editor + preview */}
      {set.kind === 'smart' && (
        <>
          <SmartFilterEditor
            filters={set.filters}
            onChange={(filters) => updateSmartFilters(set.id, filters)}
          />
          <SmartSetPreview filters={set.filters} />
        </>
      )}

      {/* Delete */}
      <button
        type="button"
        onClick={() => { deleteSet(set.id); onBack(); }}
        className="mt-2 flex items-center gap-1.5 px-2 py-1.5 text-[11px] font-medium rounded-lg text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
      >
        <Icon name="trash" size={12} />
        Delete set
      </button>
    </div>
  );
}

// ── Main panel component ───────────────────────────────────────────────

export function AssetSetsPanel() {
  const { sets, createSet } = useAssetSetStore();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showKindPicker, setShowKindPicker] = useState(false);

  const editingSet = editingId ? sets.find((s) => s.id === editingId) : null;

  if (editingSet) {
    return <SetEditView set={editingSet} onBack={() => setEditingId(null)} />;
  }

  const handleCreate = (kind: AssetSetKind) => {
    const newSet = createSet({
      name: kind === 'manual' ? 'New Set' : 'New Smart Set',
      kind,
      ...(kind === 'manual' ? { assetIds: [] } : { filters: {} }),
    } as any);
    setShowKindPicker(false);
    setEditingId(newSet.id);
  };

  return (
    <div className="flex flex-col gap-1 p-2 h-full overflow-y-auto thin-scrollbar">
      {/* Header */}
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-xs font-semibold text-neutral-700 dark:text-neutral-200">Asset Sets</h3>
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowKindPicker((v) => !v)}
            className="flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded-lg bg-accent text-accent-text hover:bg-accent-hover"
          >
            <Icon name="plus" size={12} />
            New
          </button>
          {showKindPicker && (
            <div className="absolute right-0 top-full mt-1 z-50 bg-white dark:bg-neutral-800 rounded-lg shadow-lg border border-neutral-200 dark:border-neutral-700 py-1 min-w-[140px]">
              <button
                type="button"
                onClick={() => handleCreate('manual')}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] hover:bg-neutral-100 dark:hover:bg-neutral-700"
              >
                <Icon name="layers" size={12} className="text-blue-500" />
                Manual Set
              </button>
              <button
                type="button"
                onClick={() => handleCreate('smart')}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] hover:bg-neutral-100 dark:hover:bg-neutral-700"
              >
                <Icon name="search" size={12} className="text-emerald-500" />
                Smart Set
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Empty state */}
      {sets.length === 0 && (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <Icon name="layers" size={28} className="text-neutral-300 dark:text-neutral-600 mb-2" />
          <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
            No asset sets yet.
          </p>
          <p className="text-[10px] text-neutral-400 dark:text-neutral-500 mt-0.5">
            Create a set to use with generation strategies.
          </p>
        </div>
      )}

      {/* Set list */}
      {sets.map((set) => (
        <button
          key={set.id}
          type="button"
          onClick={() => setEditingId(set.id)}
          className="flex items-center gap-2 px-2.5 py-2 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 text-left group transition-colors"
        >
          <div
            className="w-7 h-7 rounded-md flex items-center justify-center shrink-0"
            style={{ backgroundColor: set.color || (set.kind === 'manual' ? '#3B82F6' : '#10B981') }}
          >
            <Icon
              name={set.kind === 'manual' ? 'layers' : 'search'}
              size={14}
              color="#fff"
            />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[11px] font-medium text-neutral-800 dark:text-neutral-100 truncate">
              {set.name}
            </div>
            <div className="text-[9px] text-neutral-400">
              {set.kind === 'manual'
                ? `${set.assetIds.length} asset${set.assetIds.length !== 1 ? 's' : ''}`
                : 'Smart filter'}
            </div>
          </div>
          <Icon name="chevronRight" size={12} className="text-neutral-300 dark:text-neutral-600 opacity-0 group-hover:opacity-100" />
        </button>
      ))}
    </div>
  );
}
