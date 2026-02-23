/* eslint-disable react-refresh/only-export-components */
import clsx from 'clsx';
import { useState, useMemo, useCallback } from 'react';

import { Icon, type IconName } from '@lib/icons';

import type { AssetFilters } from '@features/assets';
import { useFilterMetadata } from '@features/assets/hooks/useFilterMetadata';

import { ruleInputClasses, ruleSelectClasses } from './filterRules';
import { TagPicker } from './TagPicker';

// ── Option constants ────────────────────────────────────────────────────

export const MEDIA_TYPE_OPTIONS: { value: string; label: string; icon: IconName }[] = [
  { value: '', label: 'Any', icon: 'layers' },
  { value: 'image', label: 'Image', icon: 'image' },
  { value: 'video', label: 'Video', icon: 'film' },
  { value: 'audio', label: 'Audio', icon: 'audio' },
];

export const OPERATION_TYPE_OPTIONS = [
  { value: '', label: 'Any' },
  { value: 'txt2img', label: 'txt2img' },
  { value: 'img2img', label: 'img2img' },
  { value: 'inpaint', label: 'Inpaint' },
  { value: 'upscale', label: 'Upscale' },
  { value: 'controlnet', label: 'ControlNet' },
];

export const UPLOAD_SOURCE_OPTIONS = [
  { value: '', label: 'Any' },
  { value: 'generated', label: 'Generated' },
  { value: 'web', label: 'Web Import' },
  { value: 'local', label: 'Local' },
  { value: 'video_capture', label: 'Video Capture' },
  { value: 'pixverse_sync', label: 'Pixverse Sync' },
];

export const PROVIDER_STATUS_OPTIONS = [
  { value: '', label: 'Any' },
  { value: 'ok', label: 'Provider OK' },
  { value: 'local_only', label: 'Local Only' },
  { value: 'flagged', label: 'Flagged' },
  { value: 'unknown', label: 'Unknown' },
];

export const MISSING_METADATA_FLAGS = [
  { key: 'missing_prompt', label: 'Prompt' },
  { key: 'missing_analysis', label: 'Analysis' },
  { key: 'missing_embedding', label: 'Embedding' },
  { key: 'missing_tags', label: 'Tags' },
] as const;

// ── Editor components ───────────────────────────────────────────────────

export function TagsRuleEditor({
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

  const tagMode = ((filters as Record<string, unknown>).tag__mode === 'all' ? 'all' : 'any') as 'any' | 'all';

  return (
    <TagPicker
      selected={selectedTags}
      onChangeTags={(tags) => onChange({ ...filters, tag: tags.length > 0 ? tags : undefined })}
      tagMode={tagMode}
      onChangeTagMode={(mode) =>
        onChange({ ...filters, tag__mode: mode === 'all' ? 'all' : undefined })
      }
    />
  );
}

export function MediaTypeRuleEditor({
  filters,
  onChange,
}: {
  filters: AssetFilters;
  onChange: (filters: AssetFilters) => void;
}) {
  const currentMediaType = (Array.isArray(filters.media_type) ? filters.media_type[0] : filters.media_type) ?? '';

  return (
    <div className="flex gap-1 flex-wrap">
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
  );
}

export function SearchRuleEditor({
  filters,
  onChange,
}: {
  filters: AssetFilters;
  onChange: (filters: AssetFilters) => void;
}) {
  return (
    <div className="relative">
      <Icon name="search" size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-neutral-400" />
      <input
        type="text"
        value={filters.q ?? ''}
        onChange={(e) => onChange({ ...filters, q: e.target.value || undefined })}
        placeholder="Keyword filter…"
        className={clsx(ruleInputClasses, 'pl-6')}
      />
    </div>
  );
}

export function DateRangeRuleEditor({
  filters,
  onChange,
}: {
  filters: AssetFilters;
  onChange: (filters: AssetFilters) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      <input
        type="date"
        className={clsx(ruleInputClasses, 'flex-1')}
        value={filters.created_from ?? ''}
        onChange={(e) => onChange({ ...filters, created_from: e.target.value || undefined })}
      />
      <span className="text-[10px] text-neutral-400 shrink-0">to</span>
      <input
        type="date"
        className={clsx(ruleInputClasses, 'flex-1')}
        value={filters.created_to ?? ''}
        onChange={(e) => onChange({ ...filters, created_to: e.target.value || undefined })}
      />
    </div>
  );
}

export function DimensionsRuleEditor({
  filters,
  onChange,
}: {
  filters: AssetFilters;
  onChange: (filters: AssetFilters) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-1">
      <input
        type="number"
        placeholder="Min W"
        min={0}
        className={ruleInputClasses}
        value={filters.min_width ?? ''}
        onChange={(e) => onChange({ ...filters, min_width: e.target.value ? Number(e.target.value) : undefined })}
      />
      <input
        type="number"
        placeholder="Max W"
        min={0}
        className={ruleInputClasses}
        value={filters.max_width ?? ''}
        onChange={(e) => onChange({ ...filters, max_width: e.target.value ? Number(e.target.value) : undefined })}
      />
      <input
        type="number"
        placeholder="Min H"
        min={0}
        className={ruleInputClasses}
        value={filters.min_height ?? ''}
        onChange={(e) => onChange({ ...filters, min_height: e.target.value ? Number(e.target.value) : undefined })}
      />
      <input
        type="number"
        placeholder="Max H"
        min={0}
        className={ruleInputClasses}
        value={filters.max_height ?? ''}
        onChange={(e) => onChange({ ...filters, max_height: e.target.value ? Number(e.target.value) : undefined })}
      />
    </div>
  );
}

export function OperationTypeRuleEditor({
  filters,
  onChange,
}: {
  filters: AssetFilters;
  onChange: (filters: AssetFilters) => void;
}) {
  return (
    <select
      className={ruleSelectClasses}
      value={filters.operation_type ?? ''}
      onChange={(e) => onChange({ ...filters, operation_type: e.target.value || undefined })}
    >
      {OPERATION_TYPE_OPTIONS.map((opt) => (
        <option key={opt.value} value={opt.value}>{opt.label}</option>
      ))}
    </select>
  );
}

export function LineageRuleEditor({
  filters,
  onChange,
}: {
  filters: AssetFilters;
  onChange: (filters: AssetFilters) => void;
}) {
  const value =
    filters.has_parent === true
      ? 'has_parent'
      : filters.has_parent === false
        ? 'no_parent'
        : filters.has_children === true
          ? 'has_children'
          : '';

  return (
    <select
      className={ruleSelectClasses}
      value={value}
      onChange={(e) => {
        const v = e.target.value;
        onChange({
          ...filters,
          has_parent: v === 'has_parent' ? true : v === 'no_parent' ? false : undefined,
          has_children: v === 'has_children' ? true : undefined,
        });
      }}
    >
      <option value="">Any Lineage</option>
      <option value="has_parent">Has Parent</option>
      <option value="has_children">Has Children</option>
      <option value="no_parent">Original (No Parent)</option>
    </select>
  );
}

export function SortOrderRuleEditor({
  filters,
  onChange,
}: {
  filters: AssetFilters;
  onChange: (filters: AssetFilters) => void;
}) {
  return (
    <div className="flex gap-1">
      <select
        className={clsx(ruleSelectClasses, 'flex-1')}
        value={filters.sort_by ?? ''}
        onChange={(e) =>
          onChange({ ...filters, sort_by: (e.target.value || undefined) as AssetFilters['sort_by'] })
        }
      >
        <option value="">Default</option>
        <option value="created_at">Created At</option>
        <option value="file_size_bytes">File Size</option>
      </select>
      <select
        className={clsx(ruleSelectClasses, 'flex-1')}
        value={filters.sort_dir ?? ''}
        onChange={(e) =>
          onChange({ ...filters, sort_dir: (e.target.value || undefined) as AssetFilters['sort_dir'] })
        }
      >
        <option value="">Default</option>
        <option value="desc">Descending</option>
        <option value="asc">Ascending</option>
      </select>
    </div>
  );
}

export function MaxResultsRuleEditor({
  maxResults,
  onChange,
}: {
  maxResults?: number;
  onChange: (maxResults?: number) => void;
}) {
  return (
    <input
      type="number"
      min={1}
      placeholder="No limit"
      className={ruleInputClasses}
      value={maxResults ?? ''}
      onChange={(e) => onChange(e.target.value ? Number(e.target.value) : undefined)}
    />
  );
}

export function UploadSourceRuleEditor({
  filters,
  onChange,
}: {
  filters: AssetFilters;
  onChange: (filters: AssetFilters) => void;
}) {
  return (
    <select
      className={ruleSelectClasses}
      value={(filters as Record<string, unknown>).upload_method as string ?? ''}
      onChange={(e) => onChange({ ...filters, upload_method: e.target.value || undefined })}
    >
      {UPLOAD_SOURCE_OPTIONS.map((opt) => (
        <option key={opt.value} value={opt.value}>{opt.label}</option>
      ))}
    </select>
  );
}

export function SourceFolderRuleEditor({
  filters,
  onChange,
}: {
  filters: AssetFilters;
  onChange: (filters: AssetFilters) => void;
}) {
  const uploadMethod = useMemo(() => {
    const raw = (filters as Record<string, unknown>).upload_method;
    if (Array.isArray(raw)) return typeof raw[0] === 'string' ? raw[0] : '';
    return typeof raw === 'string' ? raw : '';
  }, [filters]);
  // Show the local-folder dropdown when upload_method is 'local' or not set at all
  // (source folders are inherently a local-asset concept).
  // Only fall back to the plain text input when explicitly set to another method.
  const showLocalDropdown = !uploadMethod || uploadMethod === 'local';

  if (showLocalDropdown) {
    return <LocalSourceFolderRuleEditor filters={filters} onChange={onChange} />;
  }

  return (
    <div className="relative">
      <Icon name="folderTree" size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-neutral-400" />
      <input
        type="text"
        value={(filters as Record<string, unknown>).source_path as string ?? ''}
        onChange={(e) => onChange({ ...filters, source_path: e.target.value || undefined })}
        placeholder="folder/subfolder"
        className={clsx(ruleInputClasses, 'pl-6')}
      />
    </div>
  );
}

function LocalSourceFolderRuleEditor({
  filters,
  onChange,
}: {
  filters: AssetFilters;
  onChange: (filters: AssetFilters) => void;
}) {
  const { metadata, loading } = useFilterMetadata({
    include: ['source_path'],
    context: { upload_method: 'local' },
  });

  const sourcePathValue = useMemo(() => {
    const raw = (filters as Record<string, unknown>).source_path;
    if (Array.isArray(raw)) return typeof raw[0] === 'string' ? raw[0] : '';
    return typeof raw === 'string' ? raw : '';
  }, [filters]);

  const availablePaths = useMemo(() => {
    const options = metadata?.options?.source_path ?? [];
    return Array.from(
      new Set(
        options
          .map((opt) => String(opt.value ?? '').trim())
          .filter(Boolean),
      ),
    ).sort((a, b) => a.localeCompare(b));
  }, [metadata]);

  const folderMap = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const path of availablePaths) {
      const [folder, ...rest] = path.split('/');
      if (!folder) continue;
      const subfolder = rest.join('/').trim();
      const existing = map.get(folder) ?? [];
      if (subfolder && !existing.includes(subfolder)) {
        existing.push(subfolder);
      }
      if (!map.has(folder)) {
        map.set(folder, existing);
      }
    }
    for (const [, subs] of map) {
      subs.sort((a, b) => a.localeCompare(b));
    }
    return map;
  }, [availablePaths]);

  const parsedSelection = useMemo(() => {
    if (!sourcePathValue) {
      return { folder: '', subfolder: '' };
    }
    const [folder, ...rest] = sourcePathValue.split('/');
    return {
      folder: folder ?? '',
      subfolder: rest.join('/'),
    };
  }, [sourcePathValue]);

  const folderOptions = useMemo(() => Array.from(folderMap.keys()).sort((a, b) => a.localeCompare(b)), [folderMap]);
  const subfolderOptions = useMemo(
    () => (parsedSelection.folder ? (folderMap.get(parsedSelection.folder) ?? []) : []),
    [folderMap, parsedSelection.folder],
  );

  const applySourcePath = useCallback((folder: string, subfolder: string) => {
    const nextPath = folder ? (subfolder ? `${folder}/${subfolder}` : folder) : undefined;
    onChange({ ...filters, source_path: nextPath });
  }, [filters, onChange]);

  const hasMetadataOptions = folderOptions.length > 0;

  return (
    <div className="flex flex-col gap-1.5">
      {hasMetadataOptions && (
        <>
          <select
            className={ruleSelectClasses}
            value={parsedSelection.folder}
            onChange={(e) => applySourcePath(e.target.value, '')}
          >
            <option value="">Any local folder</option>
            {folderOptions.map((folder) => (
              <option key={folder} value={folder}>{folder}</option>
            ))}
          </select>
          <select
            className={ruleSelectClasses}
            value={parsedSelection.subfolder}
            disabled={!parsedSelection.folder}
            onChange={(e) => applySourcePath(parsedSelection.folder, e.target.value)}
          >
            <option value="">
              {parsedSelection.folder ? 'Any subfolder (or folder root)' : 'Choose folder first'}
            </option>
            {subfolderOptions.map((subfolder) => (
              <option key={subfolder} value={subfolder}>{subfolder}</option>
            ))}
          </select>
        </>
      )}

      <div className="relative">
        <Icon name="folderTree" size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-neutral-400" />
        <input
          type="text"
          value={sourcePathValue}
          onChange={(e) => onChange({ ...filters, source_path: e.target.value || undefined })}
          placeholder={hasMetadataOptions ? 'Or type custom path…' : 'folder/subfolder'}
          className={clsx(ruleInputClasses, 'pl-6')}
        />
      </div>

      {(loading || hasMetadataOptions) && (
        <div className="text-[10px] text-neutral-400">
          {loading ? 'Loading local folders…' : 'Tip: folder + subfolder dropdowns are based on existing local assets.'}
        </div>
      )}
    </div>
  );
}

export function ProviderStatusRuleEditor({
  filters,
  onChange,
}: {
  filters: AssetFilters;
  onChange: (filters: AssetFilters) => void;
}) {
  return (
    <select
      className={ruleSelectClasses}
      value={filters.provider_status ?? ''}
      onChange={(e) =>
        onChange({ ...filters, provider_status: (e.target.value || undefined) as AssetFilters['provider_status'] })
      }
    >
      {PROVIDER_STATUS_OPTIONS.map((opt) => (
        <option key={opt.value} value={opt.value}>{opt.label}</option>
      ))}
    </select>
  );
}

export function AnalysisTagsRuleEditor({
  filters,
  onChange,
}: {
  filters: AssetFilters;
  onChange: (filters: AssetFilters) => void;
}) {
  const raw = filters.analysis_tags;
  const selected = useMemo(() => {
    if (!raw) return [] as string[];
    return Array.isArray(raw) ? raw : [raw];
  }, [raw]);
  const [input, setInput] = useState('');

  const addTag = useCallback(
    (tag: string) => {
      const t = tag.trim().toLowerCase();
      if (t && !selected.includes(t)) {
        onChange({ ...filters, analysis_tags: [...selected, t] });
      }
      setInput('');
    },
    [selected, filters, onChange],
  );

  const removeTag = useCallback(
    (tag: string) => {
      const next = selected.filter((t) => t !== tag);
      onChange({ ...filters, analysis_tags: next.length > 0 ? next : undefined });
    },
    [selected, filters, onChange],
  );

  return (
    <div className="flex flex-col gap-1">
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {selected.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 pl-1.5 pr-0.5 py-0.5 rounded-md bg-purple-500/15 text-purple-600 dark:text-purple-400 text-[10px] font-medium"
            >
              {tag}
              <button
                type="button"
                onClick={() => removeTag(tag)}
                className="p-0.5 rounded hover:bg-purple-500/25"
              >
                <Icon name="x" size={8} />
              </button>
            </span>
          ))}
        </div>
      )}
      <input
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && input.trim()) {
            e.preventDefault();
            addTag(input);
          }
          if (e.key === 'Backspace' && !input && selected.length > 0) {
            removeTag(selected[selected.length - 1]);
          }
        }}
        placeholder={selected.length > 0 ? 'Add more…' : 'Type prompt-derived tag…'}
        className={ruleInputClasses}
      />
    </div>
  );
}

export function MissingMetadataRuleEditor({
  filters,
  onChange,
}: {
  filters: AssetFilters;
  onChange: (filters: AssetFilters) => void;
}) {
  const record = filters as Record<string, unknown>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {MISSING_METADATA_FLAGS.map((flag) => {
        const active = record[flag.key] === true;
        return (
          <button
            key={flag.key}
            type="button"
            onClick={() => onChange({ ...filters, [flag.key]: active ? undefined : true })}
            className={clsx(
              'flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium transition-colors',
              active
                ? 'bg-amber-500/20 text-amber-700 dark:text-amber-400'
                : 'bg-white dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-700',
            )}
          >
            {active && <Icon name="check" size={9} />}
            {flag.label}
          </button>
        );
      })}
    </div>
  );
}

export function IncludeArchivedRuleEditor({
  filters,
  onChange,
}: {
  filters: AssetFilters;
  onChange: (filters: AssetFilters) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange({ ...filters, include_archived: !filters.include_archived || undefined })}
      className={clsx(
        'flex items-center gap-1.5 px-2 py-1 rounded-lg text-[10px] font-medium transition-colors',
        filters.include_archived
          ? 'bg-accent text-accent-text'
          : 'bg-white dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-700',
      )}
    >
      <Icon name="archive" size={11} />
      {filters.include_archived ? 'Showing archived' : 'Hidden (click to include)'}
    </button>
  );
}
