/* eslint-disable react-refresh/only-export-components */
import clsx from 'clsx';
import { useState, useMemo, useCallback } from 'react';

import { Icon, type IconName } from '@lib/icons';

import type { AssetFilters } from '@features/assets';
import { useFilterMetadata } from '@features/assets/hooks/useFilterMetadata';
import { useProviderCapabilities } from '@features/providers';

import { OPERATION_METADATA, OPERATION_TYPES, type OperationType } from '@/types/operations';

import { ruleInputClasses, ruleSelectClasses } from './filterRules';
import { TagPicker } from './TagPicker';

// ── Option constants ────────────────────────────────────────────────────

export const MEDIA_TYPE_OPTIONS: { value: string; label: string; icon: IconName }[] = [
  { value: '', label: 'Any', icon: 'layers' },
  { value: 'image', label: 'Image', icon: 'image' },
  { value: 'video', label: 'Video', icon: 'film' },
  { value: 'audio', label: 'Audio', icon: 'audio' },
  { value: '3d_model', label: '3D Model', icon: 'layers' },
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

type EnumOption = {
  value: string;
  label: string;
  icon?: IconName;
  count?: number;
};

function parseMultiString(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value
      .map((v) => (typeof v === 'string' ? v.trim() : ''))
      .filter(Boolean);
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed ? [trimmed] : [];
  }
  return [];
}

function MultiEnumChecklist({
  options,
  selectedValues,
  onChange,
  anyLabel = 'Any',
}: {
  options: EnumOption[];
  selectedValues: string[];
  onChange: (next: string[]) => void;
  anyLabel?: string;
}) {
  const selectedSet = useMemo(() => new Set(selectedValues), [selectedValues]);

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={() => onChange([])}
        className={clsx(
          'w-full flex items-center gap-2 px-2 py-1.5 rounded text-[11px] text-left transition-colors',
          selectedValues.length === 0
            ? 'bg-accent/10 text-accent'
            : 'hover:bg-neutral-100 dark:hover:bg-neutral-700/50 text-neutral-700 dark:text-neutral-200',
        )}
      >
        <span className="inline-flex h-3.5 w-3.5 items-center justify-center rounded border border-neutral-300 dark:border-neutral-600 text-[9px]">
          {selectedValues.length === 0 ? <Icon name="check" size={9} /> : null}
        </span>
        <span className="flex-1">{anyLabel}</span>
      </button>

      <div className="max-h-48 overflow-y-auto space-y-0.5 pr-0.5">
        {options.map((opt) => {
          const checked = selectedSet.has(opt.value);
          return (
            <label
              key={opt.value}
              className={clsx(
                'w-full flex items-center gap-2 px-2 py-1 rounded text-[11px] cursor-pointer transition-colors',
                checked
                  ? 'bg-accent/10 text-accent'
                  : 'hover:bg-neutral-100 dark:hover:bg-neutral-700/50 text-neutral-700 dark:text-neutral-200',
              )}
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={(e) => {
                  const next = e.target.checked
                    ? [...selectedValues, opt.value]
                    : selectedValues.filter((v) => v !== opt.value);
                  onChange(Array.from(new Set(next)));
                }}
                className="accent-accent h-3 w-3"
              />
              {opt.icon && <Icon name={opt.icon} size={11} className="text-neutral-400 shrink-0" />}
              <span className="flex-1">{opt.label}</span>
              {typeof opt.count === 'number' && (
                <span className="text-[9px] text-neutral-400 tabular-nums">{opt.count}</span>
              )}
            </label>
          );
        })}
      </div>
    </div>
  );
}

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
  const selectedMediaTypes = useMemo(
    () => parseMultiString(filters.media_type),
    [filters.media_type],
  );

  return (
    <MultiEnumChecklist
      options={MEDIA_TYPE_OPTIONS.filter((opt) => opt.value)}
      selectedValues={selectedMediaTypes}
      anyLabel="Any media"
      onChange={(next) =>
        onChange({
          ...filters,
          media_type:
            next.length === 0
              ? undefined
              : (next.length === 1 ? next[0] : next) as AssetFilters['media_type'],
        })
      }
    />
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
  const { metadata } = useFilterMetadata({ include: ['operation_type'] });
  const { capabilities } = useProviderCapabilities();
  const selectedProviderIds = useMemo(
    () => parseMultiString((filters as Record<string, unknown>).effective_provider_id ?? filters.provider_id),
    [filters],
  );

  const metadataOptions = useMemo(
    () => (metadata?.options?.operation_type ?? []).map((opt) => String(opt.value ?? '').trim()).filter(Boolean),
    [metadata],
  );
  const allProviderOperations = useMemo(
    () =>
      Array.from(
        new Set(
          capabilities.flatMap((cap) =>
            Array.isArray(cap.operations)
              ? cap.operations.map((value) => String(value ?? '').trim()).filter(Boolean)
              : [],
          ),
        ),
      ),
    [capabilities],
  );

  const operationOptions = useMemo(() => {
    const selectedProviderOps =
      selectedProviderIds.length > 0
        ? Array.from(
            new Set(
              capabilities
                .filter((cap) => selectedProviderIds.includes(String(cap.provider_id)))
                .flatMap((cap) =>
                  Array.isArray(cap.operations)
                    ? cap.operations.map((value) => String(value ?? '').trim()).filter(Boolean)
                    : [],
                ),
            ),
          )
        : [];
    const preferred = selectedProviderOps.length > 0 ? selectedProviderOps : allProviderOperations;

    const current = typeof filters.operation_type === 'string' ? filters.operation_type : '';
    const values = Array.from(
      new Set([
        ...metadataOptions,
        ...preferred,
        ...OPERATION_TYPES,
        ...(current ? [current] : []),
        ...OPERATION_TYPE_OPTIONS.map((opt) => opt.value).filter(Boolean),
      ].filter(Boolean)),
    );

    const metadataLabelMap = new Map(
      (metadata?.options?.operation_type ?? [])
        .map((opt) => [String(opt.value ?? ''), String(opt.label ?? '')] as const)
        .filter(([value]) => Boolean(value)),
    );

    const prettify = (value: string) =>
      value
        .replace(/[_-]+/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase());

    const getLabel = (value: string) => {
      const opMeta = OPERATION_METADATA[value as OperationType];
      if (opMeta?.label) return opMeta.label;
      const metadataLabel = metadataLabelMap.get(value);
      if (metadataLabel && metadataLabel !== value) return metadataLabel;
      return prettify(value);
    };

    return values
      .map((value) => ({ value, label: getLabel(value) }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [
    selectedProviderIds,
    capabilities,
    allProviderOperations,
    metadataOptions,
    metadata?.options?.operation_type,
    filters.operation_type,
  ]);

  return (
    <select
      className={ruleSelectClasses}
      value={filters.operation_type ?? ''}
      onChange={(e) => onChange({ ...filters, operation_type: e.target.value || undefined })}
    >
      <option value="">Any operation</option>
      {operationOptions.map((opt) => (
        <option key={opt.value} value={opt.value}>{opt.label}</option>
      ))}
    </select>
  );
}

export function ProviderRuleEditor({
  filters,
  onChange,
}: {
  filters: AssetFilters;
  onChange: (filters: AssetFilters) => void;
}) {
  const { metadata } = useFilterMetadata({ include: ['effective_provider_id'], includeCounts: true });
  const providerOptions = useMemo(
    () =>
      (metadata?.options?.effective_provider_id ?? [])
        .map((opt) => ({
          value: String(opt.value ?? '').trim(),
          label: String(opt.label ?? opt.value ?? '').trim(),
          count: typeof opt.count === 'number' ? opt.count : undefined,
        }))
        .filter((opt) => opt.value.length > 0),
    [metadata],
  );
  const selectedValues = useMemo(
    () => parseMultiString((filters as Record<string, unknown>).effective_provider_id ?? filters.provider_id),
    [filters],
  );

  return (
    <MultiEnumChecklist
      options={providerOptions}
      selectedValues={selectedValues}
      anyLabel="Any provider"
      onChange={(next) =>
        onChange({
          ...filters,
          effective_provider_id:
            next.length === 0
              ? undefined
              : (next.length === 1 ? next[0] : next) as AssetFilters['effective_provider_id'],
          // Clear legacy strict provider filter so effective-provider semantics apply.
          provider_id: undefined,
        })
      }
    />
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
  const selectedValues = useMemo(
    () => parseMultiString((filters as Record<string, unknown>).upload_method),
    [filters],
  );
  return (
    <MultiEnumChecklist
      options={UPLOAD_SOURCE_OPTIONS.filter((opt) => opt.value)}
      selectedValues={selectedValues}
      anyLabel="Any source"
      onChange={(next) =>
        onChange({
          ...filters,
          upload_method:
            next.length === 0
              ? undefined
              : (next.length === 1 ? next[0] : next),
        })
      }
    />
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
    if (Array.isArray(raw)) return raw.filter((v): v is string => typeof v === 'string');
    return typeof raw === 'string' ? raw : '';
  }, [filters]);
  // Show the local-folder dropdown when upload_method is 'local' or not set at all
  // (source folders are inherently a local-asset concept).
  // Only fall back to the plain text input when explicitly set to another method.
  const showLocalDropdown = !uploadMethod || uploadMethod === 'local' || (Array.isArray(uploadMethod) && uploadMethod.includes('local'));

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
  const sourcePathMetadataContext = useMemo(() => {
    const record = filters as Record<string, unknown>;
    const context: Record<string, unknown> = {};

    // Preserve relevant upstream filters so source_path options reflect the
    // currently targeted asset subset (e.g. provider-specific uploads), instead
    // of forcing a local-only universe that can hide valid subfolders.
    for (const key of [
      'upload_method',
      'provider_id',
      'effective_provider_id',
      'provider_status',
      'operation_type',
      'include_archived',
    ] as const) {
      const value = record[key];
      if (value === undefined || value === null || value === '' || value === false) {
        continue;
      }
      if (Array.isArray(value) && value.length === 0) {
        continue;
      }
      context[key] = value;
    }

    if (context.upload_method === undefined) {
      context.upload_method = 'local';
    }

    return Object.keys(context).length > 0 ? context : undefined;
  }, [filters]);

  const { metadata, loading } = useFilterMetadata({
    include: ['source_path'],
    includeCounts: true,
    context: sourcePathMetadataContext,
  });

  const sourcePathValues = useMemo(() => {
    const raw = (filters as Record<string, unknown>).source_path;
    if (Array.isArray(raw)) {
      return raw.filter((v): v is string => typeof v === 'string' && v.trim().length > 0);
    }
    return typeof raw === 'string' && raw.trim() ? [raw] : [];
  }, [filters]);
  const sourcePathValue = sourcePathValues[0] ?? '';
  const selectedPathSet = useMemo(() => new Set(sourcePathValues), [sourcePathValues]);

  const sourcePathOptions = useMemo(() => {
    return (metadata?.options?.source_path ?? [])
      .map((opt) => ({
        value: String(opt.value ?? '').trim(),
        count: typeof opt.count === 'number' ? opt.count : undefined,
      }))
      .filter((opt) => opt.value.length > 0);
  }, [metadata]);

  const availablePaths = useMemo(
    () =>
      Array.from(new Set(sourcePathOptions.map((opt) => opt.value))).sort((a, b) =>
        a.localeCompare(b),
      ),
    [sourcePathOptions],
  );

  const pathCountMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const option of sourcePathOptions) {
      if (typeof option.count === 'number') {
        map.set(option.value, option.count);
      }
    }
    return map;
  }, [sourcePathOptions]);

  const folderMap = useMemo(() => {
    const map = new Map<
      string,
      {
        subfolders: string[];
        rootCount?: number;
      }
    >();
    for (const path of availablePaths) {
      const [folder, ...rest] = path.split('/');
      if (!folder) continue;
      const subfolder = rest.join('/').trim();
      const existing = map.get(folder) ?? { subfolders: [] as string[] };
      if (subfolder && !existing.subfolders.includes(subfolder)) {
        existing.subfolders.push(subfolder);
      } else if (!subfolder) {
        existing.rootCount = pathCountMap.get(path);
      }
      if (!map.has(folder)) {
        map.set(folder, existing);
      }
    }
    for (const [, entry] of map) {
      entry.subfolders.sort((a, b) => a.localeCompare(b));
    }
    return map;
  }, [availablePaths, pathCountMap]);

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

  const folderOptions = useMemo(
    () =>
      Array.from(folderMap.keys())
        .sort((a, b) => a.localeCompare(b))
        .map((folder) => {
          const entry = folderMap.get(folder);
          const exactPaths = [
            folder,
            ...(entry?.subfolders ?? []).map((subfolder) => `${folder}/${subfolder}`),
          ];
          const count = exactPaths.reduce(
            (sum, path) => sum + (pathCountMap.get(path) ?? 0),
            0,
          );
          return {
            value: folder,
            label: folder,
            ...(count > 0 ? { count } : {}),
          };
        }),
    [folderMap, pathCountMap],
  );
  const subfolderOptions = useMemo(
    () =>
      (parsedSelection.folder ? folderMap.get(parsedSelection.folder)?.subfolders ?? [] : []),
    [folderMap, parsedSelection.folder],
  );

  const folderChecklistSelection = useMemo(() => {
    const selected: string[] = [];
    for (const folder of folderOptions.map((opt) => opt.value)) {
      const entry = folderMap.get(folder);
      const exactPaths = [
        folder,
        ...(entry?.subfolders ?? []).map((subfolder) => `${folder}/${subfolder}`),
      ];
      if (exactPaths.length > 0 && exactPaths.every((path) => selectedPathSet.has(path))) {
        selected.push(folder);
      }
    }
    return selected;
  }, [folderMap, folderOptions, selectedPathSet]);

  const subfolderChecklistOptions = useMemo(() => {
    const scopedFolders =
      folderChecklistSelection.length > 0
        ? folderChecklistSelection
        : Array.from(
            new Set(
              sourcePathValues
                .map((path) => path.split('/')[0]?.trim())
                .filter(Boolean) as string[],
            ),
          );
    if (scopedFolders.length === 0) return [] as EnumOption[];

    const includeFolderName = scopedFolders.length > 1;
    const options: EnumOption[] = [];
    for (const folder of scopedFolders) {
      const entry = folderMap.get(folder);
      if (!entry) continue;
      options.push({
        value: folder,
        label: includeFolderName ? `${folder} / (root)` : '(folder root)',
        count: pathCountMap.get(folder),
        icon: 'folder',
      });
      for (const subfolder of entry.subfolders) {
        const exactPath = `${folder}/${subfolder}`;
        options.push({
          value: exactPath,
          label: includeFolderName ? `${folder} / ${subfolder}` : subfolder,
          count: pathCountMap.get(exactPath),
          icon: 'folderTree',
        });
      }
    }
    return options;
  }, [folderChecklistSelection, folderMap, pathCountMap, sourcePathValues]);

  const applySourcePathSelection = useCallback(
    (selectedPaths: string[]) => {
      const normalized = Array.from(
        new Set(selectedPaths.map((v) => v.trim()).filter(Boolean)),
      );
      onChange({
        ...filters,
        source_path:
          normalized.length === 0
            ? undefined
            : normalized.length === 1
              ? normalized[0]
              : normalized,
      });
    },
    [filters, onChange],
  );

  const applyFolderChecklistSelection = useCallback(
    (selectedFolders: string[]) => {
      const next = new Set<string>(
        sourcePathValues.filter((path) => {
          const [folder] = path.split('/');
          return folder ? !folderOptions.some((opt) => opt.value === folder) : true;
        }),
      );

      for (const folder of selectedFolders) {
        const entry = folderMap.get(folder);
        next.add(folder);
        for (const subfolder of entry?.subfolders ?? []) {
          next.add(`${folder}/${subfolder}`);
        }
      }

      applySourcePathSelection(Array.from(next));
    },
    [applySourcePathSelection, folderMap, folderOptions, sourcePathValues],
  );

  const applySubfolderChecklistSelection = useCallback(
    (nextSelected: string[]) => {
      const scopedValues = new Set(subfolderChecklistOptions.map((opt) => opt.value));
      const preserved = sourcePathValues.filter((path) => !scopedValues.has(path));
      applySourcePathSelection([...preserved, ...nextSelected]);
    },
    [applySourcePathSelection, sourcePathValues, subfolderChecklistOptions],
  );

  const applySourcePath = useCallback((folder: string, subfolder: string) => {
    if (!folder) {
      onChange({ ...filters, source_path: undefined });
      return;
    }

    if (subfolder) {
      onChange({ ...filters, source_path: `${folder}/${subfolder}` });
      return;
    }

    // "Any subfolder (or folder root)" should include the folder root path and
    // all known nested paths under that folder, not just an exact folder match.
    const knownSubfolders = folderMap.get(folder)?.subfolders ?? [];
    const aggregatePaths = Array.from(
      new Set([folder, ...knownSubfolders.map((value) => `${folder}/${value}`)]),
    );
    onChange({
      ...filters,
      source_path: aggregatePaths.length === 1 ? aggregatePaths[0] : aggregatePaths,
    });
  }, [filters, folderMap, onChange]);

  const hasMetadataOptions = folderOptions.length > 0;

  return (
    <div className="flex flex-col gap-1.5">
      {hasMetadataOptions && (
        <>
          <div className="rounded-lg border border-neutral-200 dark:border-neutral-700 p-2">
            <div className="mb-1 text-[10px] font-medium text-neutral-500 dark:text-neutral-400">
              Folders (checking a folder includes its root + all subfolders)
            </div>
            <MultiEnumChecklist
              options={folderOptions}
              selectedValues={folderChecklistSelection}
              anyLabel="Any local folder"
              onChange={applyFolderChecklistSelection}
            />
          </div>

          <div className="rounded-lg border border-neutral-200 dark:border-neutral-700 p-2">
            <div className="mb-1 text-[10px] font-medium text-neutral-500 dark:text-neutral-400">
              Subfolders / exact paths
            </div>
            {subfolderChecklistOptions.length > 0 ? (
              <MultiEnumChecklist
                options={subfolderChecklistOptions}
                selectedValues={sourcePathValues.filter((value) =>
                  subfolderChecklistOptions.some((opt) => opt.value === value),
                )}
                anyLabel="Use folder-level selection only"
                onChange={applySubfolderChecklistSelection}
              />
            ) : (
              <div className="text-[10px] text-neutral-400 px-1 py-1">
                Select a folder (or use the legacy dropdowns / text input below).
              </div>
            )}
          </div>

          <details className="rounded-lg border border-neutral-200 dark:border-neutral-700 p-2">
            <summary className="cursor-pointer text-[10px] font-medium text-neutral-500 dark:text-neutral-400 select-none">
              Legacy quick pick (single folder/subfolder)
            </summary>
            <div className="mt-2 flex flex-col gap-1.5">
              <select
                className={ruleSelectClasses}
                value={parsedSelection.folder}
                onChange={(e) => applySourcePath(e.target.value, '')}
              >
                <option value="">Any local folder</option>
                {folderOptions.map((folder) => (
                  <option key={folder.value} value={folder.value}>{folder.label}</option>
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
            </div>
          </details>
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

function NamespaceTagRuleEditor({
  filters,
  onChange,
  filterKey,
  placeholder,
}: {
  filters: AssetFilters;
  onChange: (filters: AssetFilters) => void;
  filterKey: keyof AssetFilters;
  placeholder?: string;
}) {
  const raw = filters[filterKey] as string | string[] | undefined;
  const selected = useMemo(() => {
    if (!raw) return [] as string[];
    return Array.isArray(raw) ? raw : [raw];
  }, [raw]);
  const [input, setInput] = useState('');

  const addTag = useCallback(
    (tag: string) => {
      const t = tag.trim().toLowerCase();
      if (t && !selected.includes(t)) {
        onChange({ ...filters, [filterKey]: [...selected, t] });
      }
      setInput('');
    },
    [selected, filters, onChange, filterKey],
  );

  const removeTag = useCallback(
    (tag: string) => {
      const next = selected.filter((t) => t !== tag);
      onChange({ ...filters, [filterKey]: next.length > 0 ? next : undefined });
    },
    [selected, filters, onChange, filterKey],
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
        placeholder={selected.length > 0 ? 'Add more…' : placeholder ?? 'Type tag…'}
        className={ruleInputClasses}
      />
    </div>
  );
}

export function ContentElementsRuleEditor(props: { filters: AssetFilters; onChange: (f: AssetFilters) => void }) {
  return <NamespaceTagRuleEditor {...props} filterKey="content_elements" placeholder="e.g. has:character" />;
}

export function StyleTagsRuleEditor(props: { filters: AssetFilters; onChange: (f: AssetFilters) => void }) {
  return <NamespaceTagRuleEditor {...props} filterKey="style_tags" placeholder="e.g. mood:tender" />;
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
