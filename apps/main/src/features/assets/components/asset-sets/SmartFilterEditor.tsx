import { Dropdown } from '@pixsim7/shared.ui';
import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { Icon } from '@lib/icons';

import type { AssetFilters } from '@features/assets';
import { useFilterMetadata } from '@features/assets/hooks/useFilterMetadata';
import { ClientFilterBar, FilterChip } from '@features/gallery/components/ClientFilterBar';
import {
  toMultiFilterValue,
  fromMultiFilterValue,
  dedupeOptions,
} from '@features/gallery/lib/filterValueHelpers';
import type {
  ClientFilterDef,
  ClientFilterValue,
} from '@features/gallery/lib/useClientFilters';
import { useFilterChipState } from '@features/gallery/lib/useFilterChipState';
import { useProviderCapabilities } from '@features/providers';

import {
  OPERATION_METADATA,
  OPERATION_TYPES,
  type OperationType,
} from '@/types/operations';

import {
  type FilterRuleType,
  RULE_DEFINITIONS,
  PRIMARY_RULES,
  OVERFLOW_RULES,
  getActiveCount,
} from './filterRules';
import {
  TagsRuleEditor,
  MediaTypeRuleEditor,
  SearchRuleEditor,
  DateRangeRuleEditor,
  DimensionsRuleEditor,
  OperationTypeRuleEditor,
  LineageRuleEditor,
  SortOrderRuleEditor,
  MaxResultsRuleEditor,
  UploadSourceRuleEditor,
  SourceFolderRuleEditor,
  ProviderStatusRuleEditor,
  ProviderRuleEditor,
  AnalysisTagsRuleEditor,
  MissingMetadataRuleEditor,
  IncludeArchivedRuleEditor,
  MEDIA_TYPE_OPTIONS,
  PROVIDER_STATUS_OPTIONS,
  UPLOAD_SOURCE_OPTIONS,
} from './ruleEditors';

// ── Shared client filter key mapping ────────────────────────────────────

type SharedClientFilterKey =
  | 'search'
  | 'mediaType'
  | 'uploadSource'
  | 'provider'
  | 'operationType'
  | 'providerStatus'
  | 'includeArchived';

const SHARED_CLIENT_RULES: SharedClientFilterKey[] = [
  'search',
  'mediaType',
  'uploadSource',
  'provider',
  'operationType',
  'providerStatus',
  'includeArchived',
];

const SHARED_CLIENT_RULE_SET = new Set<FilterRuleType>(SHARED_CLIENT_RULES);

const passthroughPredicate = () => true;

// ── Overflow menu for secondary filters ─────────────────────────────────

function OverflowMenu({
  filters,
  maxResults,
  hasAnyActive,
  ruleTypes = OVERFLOW_RULES,
  renderEditor,
}: {
  filters: AssetFilters;
  maxResults?: number;
  hasAnyActive: boolean;
  ruleTypes?: FilterRuleType[];
  renderEditor: (ruleType: FilterRuleType) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<FilterRuleType | null>(null);
  const anchorRef = useRef<HTMLButtonElement>(null);
  const [rect, setRect] = useState<DOMRect | null>(null);

  useLayoutEffect(() => {
    if (!open || !anchorRef.current) {
      setRect(null);
      return;
    }
    const update = () =>
      setRect(anchorRef.current?.getBoundingClientRect() ?? null);
    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [open]);

  return (
    <div className="relative flex-none">
      <button
        ref={anchorRef}
        type="button"
        title="More filters"
        onClick={() => setOpen((prev) => !prev)}
        className={`inline-flex items-center justify-center h-7 w-7 rounded border text-xs transition-colors ${
          hasAnyActive
            ? 'border-accent/50 bg-accent/10 text-accent'
            : 'border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900/60 text-neutral-500 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:text-neutral-700 dark:hover:text-neutral-200'
        }`}
      >
        <Icon name="moreHorizontal" size={14} className="w-3.5 h-3.5" />
      </button>
      {open &&
        rect &&
        (() => {
          const spacing = 6;
          const availableBelow = Math.max(0, window.innerHeight - rect.bottom - 8);
          const availableAbove = Math.max(0, rect.top - 8);
          const openUp = availableBelow < 220 && availableAbove > availableBelow;
          return (
            <div
              className="absolute z-[9998]"
              style={{
                right: 0,
                top: openUp ? undefined : `calc(100% + ${spacing}px)`,
                bottom: openUp ? `calc(100% + ${spacing}px)` : undefined,
              }}
            >
              <Dropdown
                isOpen={open}
                onClose={() => setOpen(false)}
                positionMode="static"
                minWidth="240px"
                className="max-w-[320px]"
                triggerRef={anchorRef}
                closeOnOutsideClick={false}
              >
                <div className="flex flex-col max-h-[60vh] overflow-y-auto">
                  {ruleTypes.map((ruleType) => {
                    const def = RULE_DEFINITIONS[ruleType];
                    const count = getActiveCount(ruleType, filters, maxResults);
                    const isExpanded = expanded === ruleType;
                    return (
                      <div key={ruleType}>
                        <button
                          type="button"
                          onClick={() =>
                            setExpanded(isExpanded ? null : ruleType)
                          }
                          className="w-full flex items-center gap-2 px-3 py-2 text-[11px] text-left hover:bg-neutral-100 dark:hover:bg-neutral-700/50 text-neutral-700 dark:text-neutral-200"
                        >
                          <Icon
                            name={def.icon}
                            size={12}
                            className="text-neutral-400 shrink-0"
                          />
                          <span className="flex-1">{def.label}</span>
                          {count > 0 && (
                            <span className="text-[9px] px-1 rounded-full bg-accent text-accent-text">
                              {count}
                            </span>
                          )}
                          <Icon
                            name="chevronDown"
                            size={10}
                            className={`text-neutral-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                          />
                        </button>
                        {isExpanded && (
                          <div className="px-3 pb-2">
                            {renderEditor(ruleType)}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </Dropdown>
            </div>
          );
        })()}
    </div>
  );
}

// ── Smart set filter editor ─────────────────────────────────────────────

export function SmartFilterEditor({
  filters,
  maxResults,
  onChange,
}: {
  filters: AssetFilters;
  maxResults?: number;
  onChange: (filters: AssetFilters, maxResults?: number) => void;
}) {
  const chipState = useFilterChipState();

  const updateFilters = useCallback(
    (next: AssetFilters) => onChange(next, maxResults),
    [onChange, maxResults],
  );

  const updateMaxResults = useCallback(
    (next?: number) => onChange(filters, next),
    [onChange, filters],
  );

  const { metadata } = useFilterMetadata({
    include: [
      'media_type',
      'upload_method',
      'effective_provider_id',
      'operation_type',
      'provider_status',
    ],
    includeCounts: true,
  });
  const { capabilities } = useProviderCapabilities();

  const sharedClientDefs = useMemo<ClientFilterDef<never>[]>(() => {
    const defs: Array<{
      ruleType: SharedClientFilterKey;
      key: string;
      type: 'search' | 'enum' | 'boolean';
      selectionMode?: 'single' | 'multi';
      columns?: number;
      overflow?: boolean;
    }> = [
      { ruleType: 'mediaType', key: 'media_type', type: 'enum' },
      { ruleType: 'search', key: 'q', type: 'search' },
      { ruleType: 'uploadSource', key: 'upload_method', type: 'enum' },
      { ruleType: 'provider', key: 'effective_provider_id', type: 'enum', columns: 2 },
      {
        ruleType: 'operationType',
        key: 'operation_type',
        type: 'enum',
        selectionMode: 'single',
      },
      {
        ruleType: 'providerStatus',
        key: 'provider_status',
        type: 'enum',
        selectionMode: 'single',
      },
      {
        ruleType: 'includeArchived',
        key: 'include_archived',
        type: 'boolean',
      },
    ];

    return defs.map(({ ruleType, key, type, columns, selectionMode, overflow }, index) => ({
      key,
      label: RULE_DEFINITIONS[ruleType].label,
      icon: RULE_DEFINITIONS[ruleType].icon,
      type,
      selectionMode,
      order: index,
      columns,
      overflow,
      predicate: passthroughPredicate,
    }));
  }, []);

  const sharedFilterState = useMemo<Record<string, ClientFilterValue>>(
    () => ({
      media_type: toMultiFilterValue(filters.media_type),
      q: filters.q,
      upload_method: toMultiFilterValue(
        (filters as Record<string, unknown>).upload_method,
      ),
      effective_provider_id: toMultiFilterValue(
        (filters as Record<string, unknown>).effective_provider_id ?? filters.provider_id,
      ),
      operation_type:
        typeof filters.operation_type === 'string'
          ? filters.operation_type
          : undefined,
      provider_status:
        typeof filters.provider_status === 'string'
          ? filters.provider_status
          : undefined,
      include_archived: filters.include_archived ? true : undefined,
    }),
    [filters],
  );

  const selectedProviderIds = useMemo(
    () =>
      toMultiFilterValue(
        (filters as Record<string, unknown>).effective_provider_id ?? filters.provider_id,
      ) ?? [],
    [filters],
  );

  const operationOptions = useMemo<
    Array<{ value: string; label: string; count?: number }>
  >(() => {
    const metadataOps = (metadata?.options?.operation_type ?? [])
      .map((opt) => ({
        value: String(opt.value ?? '').trim(),
        label: String(opt.label ?? opt.value ?? '').trim(),
        count: typeof opt.count === 'number' ? opt.count : undefined,
      }))
      .filter((opt) => opt.value);

    const providerScopedOps =
      selectedProviderIds.length > 0
        ? capabilities
            .filter((cap) =>
              selectedProviderIds.includes(String(cap.provider_id ?? '')),
            )
            .flatMap((cap) =>
              Array.isArray(cap.operations)
                ? cap.operations.map((value) => String(value ?? '').trim())
                : [],
            )
            .filter(Boolean)
        : [];

    const allProviderOps = capabilities
      .flatMap((cap) =>
        Array.isArray(cap.operations)
          ? cap.operations.map((value) => String(value ?? '').trim())
          : [],
      )
      .filter(Boolean);

    const metadataLabelMap = new Map(
      metadataOps.map((opt) => [opt.value, opt.label] as const),
    );
    const metadataCountMap = new Map(
      metadataOps
        .filter((opt) => typeof opt.count === 'number')
        .map((opt) => [opt.value, opt.count as number] as const),
    );

    const current =
      typeof filters.operation_type === 'string' ? filters.operation_type : '';
    const preferredValues =
      providerScopedOps.length > 0 ? providerScopedOps : allProviderOps;
    const values = Array.from(
      new Set([
        ...preferredValues,
        ...metadataOps.map((opt) => opt.value),
        ...OPERATION_TYPES,
        ...(current ? [current] : []),
      ]),
    ).filter(Boolean);

    const prettify = (value: string) =>
      value
        .replace(/[_-]+/g, ' ')
        .replace(/\b\w/g, (char) => char.toUpperCase());

    return dedupeOptions(
      values
        .map((value) => {
          const opMeta = OPERATION_METADATA[value as OperationType];
          const label = opMeta?.label || metadataLabelMap.get(value) || prettify(value);
          const count = metadataCountMap.get(value);
          return {
            value,
            label,
            ...(typeof count === 'number' ? { count } : {}),
          };
        })
        .sort((a, b) => a.label.localeCompare(b.label)),
    );
  }, [capabilities, filters.operation_type, metadata, selectedProviderIds]);

  const sharedDerivedOptions = useMemo<
    Record<string, Array<{ value: string; label: string; count?: number }>>
  >(() => {
    const fromMetadata = (
      key:
        | 'media_type'
        | 'upload_method'
        | 'provider_id'
        | 'effective_provider_id'
        | 'provider_status',
    ) =>
      dedupeOptions(
        (metadata?.options?.[key] ?? [])
          .map((opt) => ({
            value: String(opt.value ?? '').trim(),
            label: String(opt.label ?? opt.value ?? '').trim(),
            count: typeof opt.count === 'number' ? opt.count : undefined,
          }))
          .filter((opt) => opt.value.length > 0),
      );

    const mediaFallback = dedupeOptions(
      MEDIA_TYPE_OPTIONS.filter((opt) => opt.value).map((opt) => ({
        value: opt.value,
        label: opt.label,
      })),
    );

    const uploadFallback = dedupeOptions(
      UPLOAD_SOURCE_OPTIONS.filter((opt) => opt.value).map((opt) => ({
        value: opt.value,
        label: opt.label,
      })),
    );

    const providerCurrent = (
      toMultiFilterValue(
        (filters as Record<string, unknown>).effective_provider_id ?? filters.provider_id,
      ) ?? []
    ).map(
      (value) => ({ value, label: value }),
    );
    const providerStatusFallback = dedupeOptions(
      PROVIDER_STATUS_OPTIONS.filter((opt) => opt.value).map((opt) => ({
        value: opt.value,
        label: opt.label,
      })),
    );

    return {
      media_type: fromMetadata('media_type').length > 0 ? fromMetadata('media_type') : mediaFallback,
      upload_method:
        fromMetadata('upload_method').length > 0
          ? fromMetadata('upload_method')
          : uploadFallback,
      effective_provider_id: dedupeOptions([
        ...fromMetadata('effective_provider_id'),
        ...providerCurrent,
      ]),
      operation_type: operationOptions,
      provider_status:
        fromMetadata('provider_status').length > 0
          ? fromMetadata('provider_status')
          : providerStatusFallback,
    };
  }, [filters, metadata, operationOptions]);

  const handleSharedClientFilterChange = useCallback(
    (key: string, value: ClientFilterValue) => {
      switch (key) {
        case 'q':
          updateFilters({
            ...filters,
            q: (typeof value === 'string' && value) ? value : undefined,
          });
          return;
        case 'media_type':
          updateFilters({
            ...filters,
            media_type: fromMultiFilterValue(value) as AssetFilters['media_type'],
          });
          return;
        case 'effective_provider_id':
          updateFilters({
            ...filters,
            effective_provider_id: fromMultiFilterValue(value) as AssetFilters['effective_provider_id'],
            // Clear legacy strict provider filter so effective-provider semantics apply.
            provider_id: undefined,
          });
          return;
        case 'operation_type':
          updateFilters({
            ...filters,
            operation_type:
              typeof value === 'string' && value
                ? (value as AssetFilters['operation_type'])
                : undefined,
          });
          return;
        case 'provider_status':
          updateFilters({
            ...filters,
            provider_status:
              typeof value === 'string' && value
                ? (value as AssetFilters['provider_status'])
                : undefined,
          });
          return;
        case 'include_archived':
          updateFilters({
            ...filters,
            include_archived: value === true ? true : undefined,
          });
          return;
        case 'upload_method':
          updateFilters({
            ...filters,
            upload_method: fromMultiFilterValue(value),
          } as AssetFilters);
          return;
        default:
          return;
      }
    },
    [filters, updateFilters],
  );

  const renderEditor = useCallback(
    (ruleType: FilterRuleType) => {
      switch (ruleType) {
        case 'tags':
          return <TagsRuleEditor filters={filters} onChange={updateFilters} />;
        case 'mediaType':
          return (
            <MediaTypeRuleEditor filters={filters} onChange={updateFilters} />
          );
        case 'search':
          return (
            <SearchRuleEditor filters={filters} onChange={updateFilters} />
          );
        case 'dateRange':
          return (
            <DateRangeRuleEditor filters={filters} onChange={updateFilters} />
          );
        case 'provider':
          return <ProviderRuleEditor filters={filters} onChange={updateFilters} />;
        case 'dimensions':
          return (
            <DimensionsRuleEditor filters={filters} onChange={updateFilters} />
          );
        case 'operationType':
          return (
            <OperationTypeRuleEditor
              filters={filters}
              onChange={updateFilters}
            />
          );
        case 'lineage':
          return (
            <LineageRuleEditor filters={filters} onChange={updateFilters} />
          );
        case 'sortOrder':
          return (
            <SortOrderRuleEditor filters={filters} onChange={updateFilters} />
          );
        case 'maxResults':
          return (
            <MaxResultsRuleEditor
              maxResults={maxResults}
              onChange={updateMaxResults}
            />
          );
        case 'uploadSource':
          return (
            <UploadSourceRuleEditor
              filters={filters}
              onChange={updateFilters}
            />
          );
        case 'sourceFolder':
          return (
            <SourceFolderRuleEditor
              filters={filters}
              onChange={updateFilters}
            />
          );
        case 'providerStatus':
          return (
            <ProviderStatusRuleEditor
              filters={filters}
              onChange={updateFilters}
            />
          );
        case 'analysisTags':
          return (
            <AnalysisTagsRuleEditor
              filters={filters}
              onChange={updateFilters}
            />
          );
        case 'missingMetadata':
          return (
            <MissingMetadataRuleEditor
              filters={filters}
              onChange={updateFilters}
            />
          );
        case 'includeArchived':
          return (
            <IncludeArchivedRuleEditor
              filters={filters}
              onChange={updateFilters}
            />
          );
      }
    },
    [filters, maxResults, updateFilters, updateMaxResults],
  );

  const customPrimaryRules = useMemo(
    () => PRIMARY_RULES.filter((ruleType) => !SHARED_CLIENT_RULE_SET.has(ruleType)),
    [],
  );

  const customOverflowRules = useMemo(
    () => OVERFLOW_RULES.filter((ruleType) => !SHARED_CLIENT_RULE_SET.has(ruleType)),
    [],
  );

  const hasAnyActive = useMemo(
    () =>
      [...PRIMARY_RULES, ...OVERFLOW_RULES].some(
        (r) => getActiveCount(r, filters, maxResults) > 0,
      ),
    [filters, maxResults],
  );

  const hasAnyOverflowActive = useMemo(
    () =>
      customOverflowRules.some(
        (r) => getActiveCount(r, filters, maxResults) > 0,
      ),
    [customOverflowRules, filters, maxResults],
  );

  const handleReset = useCallback(() => {
    onChange({}, undefined);
  }, [onChange]);

  return (
    <div className="relative z-10 isolate flex flex-wrap items-start gap-1.5 w-full overflow-visible pb-1">
      {customPrimaryRules
        .filter((ruleType) => ruleType === 'tags')
        .map((ruleType) => {
          const def = RULE_DEFINITIONS[ruleType];
          const count = getActiveCount(ruleType, filters, maxResults);
          return (
            <FilterChip
              key={ruleType}
              chipKey={ruleType}
              label={def.label}
              icon={def.icon}
              count={count}
              isOpen={chipState.openFilters.has(ruleType)}
              isHovered={chipState.hoveredKey === ruleType}
              onToggleOpen={() => chipState.toggleOpen(ruleType)}
              onClose={() => chipState.closeChip(ruleType)}
              onMouseEnter={() => chipState.openHover(ruleType)}
              onMouseLeave={() => chipState.closeHover(ruleType)}
              popoverMode="inline"
              holdOpenOnFocus
            >
              {renderEditor(ruleType)}
            </FilterChip>
          );
        })}

      <div className="flex-none min-w-0">
        <ClientFilterBar
          defs={sharedClientDefs}
          filterState={sharedFilterState}
          derivedOptions={sharedDerivedOptions}
          onFilterChange={handleSharedClientFilterChange}
          popoverMode="inline"
        />
      </div>

      {customPrimaryRules
        .filter((ruleType) => ruleType !== 'tags')
        .map((ruleType) => {
          const def = RULE_DEFINITIONS[ruleType];
          const count = getActiveCount(ruleType, filters, maxResults);
          return (
            <FilterChip
              key={ruleType}
              chipKey={ruleType}
              label={def.label}
              icon={def.icon}
              count={count}
              isOpen={chipState.openFilters.has(ruleType)}
              isHovered={chipState.hoveredKey === ruleType}
              onToggleOpen={() => chipState.toggleOpen(ruleType)}
              onClose={() => chipState.closeChip(ruleType)}
              onMouseEnter={() => chipState.openHover(ruleType)}
              onMouseLeave={() => chipState.closeHover(ruleType)}
              popoverMode="inline"
              holdOpenOnFocus
            >
              {renderEditor(ruleType)}
            </FilterChip>
          );
        })}
      {customOverflowRules.length > 0 && (
        <OverflowMenu
          filters={filters}
          maxResults={maxResults}
          hasAnyActive={hasAnyOverflowActive}
          ruleTypes={customOverflowRules}
          renderEditor={renderEditor}
        />
      )}
      {hasAnyActive && (
        <button
          type="button"
          onClick={handleReset}
          className="flex-none inline-flex items-center justify-center h-7 w-7 rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900/60 text-neutral-500 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:text-neutral-700 dark:hover:text-neutral-200 text-xs transition-colors"
          title="Reset filters"
        >
          <Icon name="x" size={14} className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}
