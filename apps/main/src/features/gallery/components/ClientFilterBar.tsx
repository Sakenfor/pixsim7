import { Dropdown, Popover, Z } from '@pixsim7/shared.ui';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { Icon } from '@lib/icons';
import type { IconName } from '@lib/icons';

import { SearchHistoryList } from '@features/assets/components/SearchHistoryList';
import type { AssetFilters } from '@features/assets/hooks/useAssets';
import { useRecordSearchHistory } from '@features/assets/stores/searchHistoryStore';
import { useWorkspaceStore } from '@features/workspace/stores/workspaceStore';

import type {
  ClientEnumFilterOption,
  ClientFilterDef,
  ClientFilterValue,
} from '../lib/useClientFilters';
import { useFilterChipState } from '../lib/useFilterChipState';

const NULLISH_OPTION_TOKENS = new Set(['null', '(null)', 'undefined', '(undefined)']);

function normalizeOptionText(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (NULLISH_OPTION_TOKENS.has(trimmed.toLowerCase())) return undefined;
  return trimmed;
}

function getOptionDisplayLabel(opt: Pick<ClientEnumFilterOption, 'label' | 'value'>): string {
  return normalizeOptionText(opt.label) ?? normalizeOptionText(opt.value) ?? 'Unknown';
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface ClientFilterBarProps<T> {
  defs: ClientFilterDef<T>[];
  filterState: Record<string, ClientFilterValue>;
  derivedOptions: Record<string, ClientEnumFilterOption[]>;
  onFilterChange: (key: string, value: ClientFilterValue) => void;
  onReset?: () => void;
  popoverMode?: 'portal' | 'inline';
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ClientFilterBar<T>({
  defs,
  filterState,
  derivedOptions,
  onFilterChange,
  onReset,
  popoverMode = 'portal',
}: ClientFilterBarProps<T>) {
  const chipState = useFilterChipState();
  const triggerRefs = useRef(new Map<string, HTMLButtonElement | null>());
  const filterScrollCache = useRef(new Map<string, number>());

  const { primaryFilters, overflowFilters } = useMemo(() => {
    const sorted = [...defs].sort(
      (a, b) => (a.order ?? 99) - (b.order ?? 99),
    );
    const primary: ClientFilterDef<T>[] = [];
    const overflow: ClientFilterDef<T>[] = [];
    for (const f of sorted) {
      if (f.overflow) overflow.push(f);
      else primary.push(f);
    }
    return { primaryFilters: primary, overflowFilters: overflow };
  }, [defs]);

  const setTriggerRef = useCallback(
    (key: string) => (node: HTMLButtonElement | null) => {
      if (node) triggerRefs.current.set(key, node);
      else triggerRefs.current.delete(key);
    },
    [],
  );

  const hasOverflowSelection = overflowFilters.some((f) => {
    const val = filterState[f.key];
    return val !== undefined && val !== '' && val !== false;
  });

  const hasAnySelection = defs.some((f) => {
    const val = filterState[f.key];
    if (val === undefined || val === '' || val === false) return false;
    if (Array.isArray(val)) return val.length > 0;
    return true;
  });

  return (
    <div className="relative flex flex-nowrap items-start gap-1.5 min-w-0 flex-1 pb-1">
      {primaryFilters.map((filter) => {
        const selectedValue = filterState[filter.key];
        const selectedCount = Array.isArray(selectedValue)
          ? selectedValue.length
          : selectedValue
            ? 1
            : 0;
        const assetFilters =
          selectedCount > 0 ? filter.toAssetFilters?.(selectedValue) : undefined;
        const hasAssetFilters =
          assetFilters !== undefined && Object.keys(assetFilters).length > 0;

        return (
          <FilterChip
            key={filter.key}
            chipKey={filter.key}
            label={filter.label}
            icon={filter.icon ?? 'sliders'}
            count={selectedCount}
            isOpen={chipState.openFilters.has(filter.key)}
            isHovered={chipState.hoveredKey === filter.key}
            onToggleOpen={() => chipState.toggleOpen(filter.key)}
            onClose={() => chipState.closeChip(filter.key)}
            onMouseEnter={() => chipState.openHover(filter.key)}
            onMouseLeave={() => chipState.closeHover(filter.key)}
            popoverMode={popoverMode}
            wide={(filter.columns ?? 1) > 1}
            triggerRef={setTriggerRef(filter.key)}
            anchorEl={triggerRefs.current.get(filter.key) || null}
            triggerElRef={{ current: triggerRefs.current.get(filter.key) || null }}
            assetFilters={hasAssetFilters ? assetFilters : undefined}
            sourceLabel={filter.label}
          >
            <FilterContent
              filter={filter}
              value={filterState[filter.key]}
              options={derivedOptions[filter.key] || []}
              onChange={(value) => onFilterChange(filter.key, value)}
              scrollCache={filterScrollCache}
            />
          </FilterChip>
        );
      })}
      {overflowFilters.length > 0 && (
        <OverflowMenu
          filters={overflowFilters}
          filterState={filterState}
          derivedOptions={derivedOptions}
          onChange={onFilterChange}
          hasSelection={hasOverflowSelection}
          popoverMode={popoverMode}
        />
      )}
      {hasAnySelection && onReset && (
        <button
          type="button"
          onClick={onReset}
          className="flex-none inline-flex items-center justify-center h-7 w-7 rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900/60 text-neutral-500 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:text-neutral-700 dark:hover:text-neutral-200 text-xs transition-colors"
          title="Reset filters"
        >
          <Icon name="x" size={14} className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// FilterChip — single chip, exported for reuse
// ---------------------------------------------------------------------------

export interface FilterChipProps {
  chipKey: string;
  label: string;
  icon: IconName;
  count: number;
  isOpen: boolean;
  isHovered: boolean;
  onToggleOpen: () => void;
  onClose: () => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  popoverMode?: 'portal' | 'inline';
  wide?: boolean;
  /** When true, holds the dropdown open while an input/select/textarea inside is focused. */
  holdOpenOnFocus?: boolean;
  children: ReactNode;
  /** Ref callback for the trigger button (used internally by ClientFilterBar). */
  triggerRef?: (node: HTMLButtonElement | null) => void;
  /** Anchor element for portal positioning (used internally by ClientFilterBar). */
  anchorEl?: HTMLElement | null;
  /** Ref object to the trigger element for Dropdown's triggerRef (used internally). */
  triggerElRef?: React.RefObject<HTMLElement | null>;
  /**
   * When provided, a hover-revealed action button appears next to the chip that
   * opens a floating Mini Gallery panel scoped to this filter slice.
   */
  assetFilters?: AssetFilters;
  /** Human-readable label passed to the Mini Gallery as `sourceLabel`. */
  sourceLabel?: string;
}

export function FilterChip(props: FilterChipProps) {
  const {
    label,
    icon,
    count,
    isOpen,
    isHovered,
    onToggleOpen,
    onClose,
    onMouseEnter,
    onMouseLeave,
    popoverMode = 'portal',
    wide,
    holdOpenOnFocus,
    children,
    triggerRef: externalTriggerRef,
    anchorEl: externalAnchorEl,
    triggerElRef: externalTriggerElRef,
    assetFilters,
    sourceLabel,
  } = props;
  const internalButtonRef = useRef<HTMLButtonElement>(null);
  const [isInteracting, setIsInteracting] = useState(false);

  const showMiniGalleryAction = assetFilters !== undefined;
  const miniGalleryActionVisible = showMiniGalleryAction && (isHovered || isOpen);

  const handleOpenMiniGallery = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!assetFilters) return;
      const rect = internalButtonRef.current?.getBoundingClientRect();
      useWorkspaceStore.getState().openFloatingPanel('mini-gallery', {
        context: {
          initialFilters: assetFilters,
          sourceLabel: sourceLabel ?? label,
          suppressHoverActions: true,
        },
        x: rect ? rect.right + 8 : undefined,
        y: rect ? rect.top : undefined,
      });
    },
    [assetFilters, sourceLabel, label],
  );

  const hasSelection = count > 0;
  const isVisible = isOpen || isHovered || (holdOpenOnFocus ? isInteracting : false);
  const showLabel = hasSelection || isOpen || isHovered;

  // Use external anchor/ref when provided (ClientFilterBar passes these for portal mode),
  // otherwise fall back to the internal button ref.
  const anchorEl = externalAnchorEl ?? internalButtonRef.current;
  const triggerElRef = externalTriggerElRef ?? internalButtonRef;

  const shouldHoldOpenOnFocus = (target: EventTarget | null) => {
    if (!holdOpenOnFocus) return false;
    if (!(target instanceof HTMLElement)) return false;
    if (target.tagName === 'SELECT' || target.tagName === 'TEXTAREA') return true;
    if (target.tagName !== 'INPUT') return false;
    const input = target as HTMLInputElement;
    return !['checkbox', 'radio', 'button', 'submit', 'reset'].includes(input.type);
  };

  const handleFocusCapture: React.FocusEventHandler<HTMLDivElement> | undefined =
    holdOpenOnFocus
      ? (e) => {
          if (shouldHoldOpenOnFocus(e.target)) {
            setIsInteracting(true);
          }
        }
      : undefined;

  const handleBlurCapture: React.FocusEventHandler<HTMLDivElement> | undefined =
    holdOpenOnFocus
      ? (e) => {
          const container = e.currentTarget;
          const buttonEl = internalButtonRef.current;
          window.setTimeout(() => {
            const active = document.activeElement;
            if (
              active &&
              active !== document.body &&
              (container.contains(active) || buttonEl?.contains(active))
            ) {
              return;
            }
            setIsInteracting(false);
          }, 0);
        }
      : undefined;

  // Combine external ref callback with internal ref
  const setButtonRef = useCallback(
    (node: HTMLButtonElement | null) => {
      (internalButtonRef as React.MutableRefObject<HTMLButtonElement | null>).current = node;
      externalTriggerRef?.(node);
    },
    [externalTriggerRef],
  );

  return (
    <div
      className="relative flex-none"
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <button
        type="button"
        title={label}
        aria-expanded={isOpen}
        ref={setButtonRef}
        onClick={onToggleOpen}
        className={`relative z-20 inline-flex items-center h-7 px-1.5 rounded border text-xs transition-[background-color,border-color] duration-200 ${
          hasSelection
            ? 'border-accent/50 bg-accent/10 text-neutral-800 dark:text-neutral-100'
            : isOpen
              ? 'border-neutral-300 dark:border-neutral-600 bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-200'
              : 'border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900/60 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:text-neutral-700 dark:hover:text-neutral-200'
        }`}
      >
        <span className="relative flex-shrink-0">
          <Icon name={icon} size={14} className="w-3.5 h-3.5" />
          {hasSelection && (
            <span className="absolute -top-1.5 -right-1.5 text-[8px] leading-none px-0.5 min-w-[12px] text-center rounded-full bg-accent text-accent-text">
              {count}
            </span>
          )}
        </span>
        <span
          className="grid transition-[grid-template-columns] duration-200 ease-out"
          style={{ gridTemplateColumns: showLabel ? '1fr' : '0fr' }}
        >
          <span className="overflow-hidden min-w-0">
            <span className="ml-1.5 font-medium whitespace-nowrap">{label}</span>
          </span>
        </span>
      </button>
      {showMiniGalleryAction && (
        <button
          type="button"
          onClick={handleOpenMiniGallery}
          title={`Open ${sourceLabel ?? label} in Mini Gallery`}
          aria-label={`Open ${sourceLabel ?? label} in Mini Gallery`}
          tabIndex={miniGalleryActionVisible ? 0 : -1}
          className={`relative z-20 inline-flex items-center justify-center h-7 rounded border text-xs overflow-hidden transition-[width,opacity,margin,border-color,background-color] duration-200 border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-900/60 text-neutral-500 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:text-accent ${
            miniGalleryActionVisible
              ? 'w-7 ml-1 opacity-100'
              : 'w-0 ml-0 opacity-0 pointer-events-none border-transparent'
          }`}
        >
          <Icon name="externalLink" size={12} className="w-3 h-3" />
        </button>
      )}
      <FilterDropdown
        anchorEl={anchorEl}
        triggerRef={triggerElRef}
        visible={isVisible}
        wide={wide}
        mode={popoverMode}
        onClose={() => {
          onClose();
        }}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        onFocusCapture={handleFocusCapture}
        onBlurCapture={handleBlurCapture}
      >
        {children}
      </FilterDropdown>
    </div>
  );
}

// ---------------------------------------------------------------------------
// FilterDropdown — portal-based dropdown anchored to trigger
// ---------------------------------------------------------------------------

export interface FilterDropdownProps {
  anchorEl: HTMLElement | null;
  triggerRef?: React.RefObject<HTMLElement | null>;
  visible: boolean;
  wide?: boolean;
  mode?: 'portal' | 'inline';
  onClose?: () => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  onFocusCapture?: React.FocusEventHandler<HTMLDivElement>;
  onBlurCapture?: React.FocusEventHandler<HTMLDivElement>;
  children: ReactNode;
}

export function FilterDropdown({
  anchorEl,
  triggerRef,
  visible,
  wide,
  mode = 'portal',
  onClose,
  onMouseEnter,
  onMouseLeave,
  onFocusCapture,
  onBlurCapture,
  children,
}: FilterDropdownProps) {
  const [rect, setRect] = useState<DOMRect | null>(null);

  useLayoutEffect(() => {
    if (!visible || !anchorEl) {
      setRect(null);
      return;
    }
    const update = () => setRect(anchorEl.getBoundingClientRect());
    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [visible, anchorEl]);

  if (!visible || !rect) return null;

  const spacing = 8;
  const minWidth = wide ? 340 : 220;
  const maxWidth = wide ? 520 : 360;
  const width = Math.min(maxWidth, Math.max(minWidth, rect.width));
  const top = rect.bottom + spacing;
  const maxHeight = Math.max(120, window.innerHeight - top - 16);

  const content = (
    <Dropdown
      isOpen={visible}
      onClose={onClose || (() => undefined)}
      positionMode="static"
      minWidth={`${width}px`}
      className={wide ? 'max-w-[520px]' : 'max-w-[360px]'}
      closeOnOutsideClick={mode === 'inline'}
      triggerRef={triggerRef}
    >
      {children}
    </Dropdown>
  );

  if (mode === 'inline') {
    const availableBelow = Math.max(0, window.innerHeight - rect.bottom - 8);
    const availableAbove = Math.max(0, rect.top - 8);
    const openUp = availableBelow < 180 && availableAbove > availableBelow;
    return (
      <div
        className="absolute"
        style={{
          zIndex: Z.floatOverlay,
          left: 0,
          top: openUp ? undefined : `calc(100% + ${spacing}px)`,
          bottom: openUp ? `calc(100% + ${spacing}px)` : undefined,
          maxHeight,
        }}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        onFocusCapture={onFocusCapture}
        onBlurCapture={onBlurCapture}
      >
        {content}
      </div>
    );
  }

  return (
    <Popover
      open={visible}
      anchor={anchorEl}
      placement="bottom"
      align="start"
      offset={spacing}
      onClose={onClose || (() => undefined)}
      closeOnClickOutside={Boolean(onClose)}
      closeOnEscape={Boolean(onClose)}
      className={wide ? 'max-w-[520px]' : 'max-w-[360px]'}
      style={{ width, maxHeight }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onFocusCapture={onFocusCapture}
      onBlurCapture={onBlurCapture}
    >
      {content}
    </Popover>
  );
}

// ---------------------------------------------------------------------------
// FilterContent — renders the appropriate control for a filter type
// ---------------------------------------------------------------------------

export interface FilterContentProps<T> {
  filter: ClientFilterDef<T>;
  value: ClientFilterValue;
  options: ClientEnumFilterOption[];
  onChange: (value: ClientFilterValue) => void;
  scrollCache?: React.MutableRefObject<Map<string, number>>;
}

export function FilterContent<T>({
  filter,
  value,
  options,
  onChange,
  scrollCache,
}: FilterContentProps<T>) {
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Restore scroll position when the enum list mounts
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el || !scrollCache) return;
    const saved = scrollCache.current.get(filter.key);
    if (saved && saved > 0) {
      el.scrollTop = saved;
    }
  }, [filter.key, scrollCache]);

  // Save scroll position on unmount
  useEffect(() => {
    const cache = scrollCache;
    const key = filter.key;
    const el = scrollRef.current;
    return () => {
      if (el && cache) {
        cache.current.set(key, el.scrollTop);
      }
    };
  }, [filter.key, scrollCache]);

  const selectedValues = useMemo(() => {
    if (Array.isArray(value)) return value.map(String);
    if (value === undefined || value === '' || value === false) return [];
    return [String(value)];
  }, [value]);

  switch (filter.type) {
    case 'search': {
      return (
        <SearchFilterContent
          filterKey={filter.key}
          label={filter.label}
          icon={filter.icon}
          value={typeof value === 'string' ? value : undefined}
          toAssetFilters={filter.toAssetFilters}
          onChange={onChange}
        />
      );
    }

    case 'enum': {
      const cols = filter.columns ?? 1;
      const selectionMode = filter.selectionMode ?? 'multi';
      const hasOptionGroups = cols === 1 && options.some((opt) => opt.groupKey);
      const groupedOptions = hasOptionGroups
        ? (() => {
            const groups = new Map<
              string,
              { key: string; label: string; options: ClientEnumFilterOption[] }
            >();
            for (const opt of options) {
              const key = normalizeOptionText(opt.groupKey) ?? '__ungrouped__';
              const label = normalizeOptionText(opt.groupLabel) ?? (key === '__ungrouped__' ? 'Other' : key);
              const existing = groups.get(key);
              if (existing) {
                existing.options.push(opt);
                continue;
              }
              groups.set(key, { key, label, options: [opt] });
            }
            return Array.from(groups.values()).sort((a, b) =>
              a.label.localeCompare(b.label),
            );
          })()
        : [];
      const shouldRenderGroupHeaders = groupedOptions.length > 1;

      const renderOption = (opt: ClientEnumFilterOption) => {
        const isSelected = selectedValues.includes(opt.value);
        const extra = filter.renderOptionExtra?.(opt.value);
        const optDisplayLabel = getOptionDisplayLabel(opt);
        const optAssetFilters = filter.toAssetFilters?.(
          selectionMode === 'single' ? opt.value : [opt.value],
        );
        const optHasAssetFilters =
          optAssetFilters !== undefined && Object.keys(optAssetFilters).length > 0;
        return (
          <div key={opt.value} className="group/opt flex items-center gap-1">
            <label
              className="flex items-center gap-2 text-sm text-neutral-700 dark:text-neutral-200 cursor-pointer flex-1 min-w-0"
            >
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => {
                  if (selectionMode === 'single') {
                    onChange(isSelected ? undefined : opt.value);
                    return;
                  }
                  const next = new Set(selectedValues);
                  if (next.has(opt.value)) next.delete(opt.value);
                  else next.add(opt.value);
                  onChange(Array.from(next));
                }}
                className="accent-accent flex-shrink-0"
              />
              <span className="truncate">
                {optDisplayLabel}
                {opt.count !== undefined ? ` (${opt.count})` : ''}
              </span>
            </label>
            {optHasAssetFilters && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                  useWorkspaceStore.getState().openFloatingPanel('mini-gallery', {
                    context: {
                      initialFilters: optAssetFilters,
                      sourceLabel: optDisplayLabel,
                      suppressHoverActions: true,
                    },
                    x: rect.right + 8,
                    y: rect.top,
                  });
                }}
                title={`Open "${optDisplayLabel}" in Mini Gallery`}
                aria-label={`Open "${optDisplayLabel}" in Mini Gallery`}
                className="flex-shrink-0 inline-flex items-center justify-center h-5 w-5 rounded text-accent bg-accent/10 hover:bg-accent/25 hover:scale-110 opacity-0 group-hover/opt:opacity-100 transition-[opacity,transform,background-color] duration-150"
              >
                <Icon name="externalLink" size={12} className="w-3 h-3" />
              </button>
            )}
            {extra && (
              <span className="flex-shrink-0 flex items-center opacity-0 group-hover/opt:opacity-100 transition-opacity">
                {extra}
              </span>
            )}
          </div>
        );
      };

      return (
        <div
          ref={scrollRef}
          className={`max-h-[60vh] overflow-y-auto ${cols > 1 ? 'grid gap-x-3 gap-y-1' : 'flex flex-col gap-1'}`}
          style={cols > 1 ? { gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` } : undefined}
        >
          {options.length === 0 && (
            <div className="text-xs text-neutral-500 dark:text-neutral-400">
              No options available.
            </div>
          )}
          {!hasOptionGroups &&
            options.map((opt) => renderOption(opt))}
          {hasOptionGroups &&
            groupedOptions.map((group) => {
              const groupValues = group.options.map((o) => o.value);
              const groupAssetFilters = filter.toAssetFilters?.(groupValues);
              const groupHasAssetFilters =
                groupAssetFilters !== undefined &&
                Object.keys(groupAssetFilters).length > 0;
              return (
                <div key={group.key} className="space-y-1">
                  {shouldRenderGroupHeaders && (
                    <div className="group/header pt-1 first:pt-0 flex items-center gap-1">
                      <div className="flex-1 min-w-0 text-[10px] uppercase tracking-wider text-neutral-500 dark:text-neutral-400 font-semibold truncate">
                        {group.label}
                      </div>
                      {groupHasAssetFilters && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            e.preventDefault();
                            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                            useWorkspaceStore.getState().openFloatingPanel('mini-gallery', {
                              context: {
                                initialFilters: groupAssetFilters,
                                sourceLabel: group.label,
                                suppressHoverActions: true,
                              },
                              x: rect.right + 8,
                              y: rect.top,
                            });
                          }}
                          title={`Open all of "${group.label}" in Mini Gallery`}
                          aria-label={`Open all of "${group.label}" in Mini Gallery`}
                          className="flex-shrink-0 inline-flex items-center justify-center h-5 w-5 rounded text-accent bg-accent/10 hover:bg-accent/25 hover:scale-110 opacity-0 group-hover/header:opacity-100 transition-[opacity,transform,background-color] duration-150"
                        >
                          <Icon name="externalLink" size={12} className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  )}
                  {group.options.map((opt) => renderOption(opt))}
                </div>
              );
            })}
        </div>
      );
    }

    case 'boolean':
      return (
        <label className="flex items-center gap-2 px-3 py-1.5 text-sm text-neutral-700 dark:text-neutral-200 cursor-pointer">
          <input
            type="checkbox"
            checked={!!value}
            onChange={(e) => onChange(e.target.checked ? true : undefined)}
            className="accent-accent"
          />
          <span>{filter.label}</span>
        </label>
      );

    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// SearchFilterContent — search input + mini-gallery shortcut + history list
// ---------------------------------------------------------------------------

interface SearchFilterContentProps {
  filterKey: string;
  label: string;
  icon?: IconName;
  value: string | undefined;
  toAssetFilters?: (value: ClientFilterValue) => AssetFilters | undefined;
  onChange: (value: ClientFilterValue) => void;
}

function SearchFilterContent({
  filterKey,
  label,
  icon,
  value,
  toAssetFilters,
  onChange,
}: SearchFilterContentProps) {
  const trimmed = (value ?? '').trim();
  const searchAssetFilters =
    trimmed.length > 0 ? toAssetFilters?.(trimmed) : undefined;
  const searchHasAssetFilters =
    searchAssetFilters !== undefined &&
    Object.keys(searchAssetFilters).length > 0;

  // History only meaningfully composes with toAssetFilters: without a
  // translator, recents have no mini-gallery shortcut and we can't place
  // them — so opt-in via the same gate as the live-query icon.
  const historyEnabled = toAssetFilters !== undefined;

  useRecordSearchHistory(historyEnabled ? filterKey : null, value);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <div className="relative w-full">
          {icon && (
            <Icon
              name={icon}
              className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400"
            />
          )}
          <input
            type="text"
            placeholder={label}
            value={value ?? ''}
            onChange={(e) => onChange(e.target.value || undefined)}
            className={`w-full bg-white dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 rounded px-3 py-1.5 text-sm text-neutral-800 dark:text-neutral-200 focus:outline-none focus:border-accent ${icon ? 'pl-8' : ''}`}
          />
        </div>
        {searchHasAssetFilters && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
              useWorkspaceStore.getState().openFloatingPanel('mini-gallery', {
                context: {
                  initialFilters: searchAssetFilters,
                  sourceLabel: `"${trimmed}"`,
                  suppressHoverActions: true,
                },
                x: rect.right + 8,
                y: rect.top,
              });
            }}
            title={`Open "${trimmed}" in Mini Gallery`}
            aria-label={`Open search "${trimmed}" in Mini Gallery`}
            className="flex-shrink-0 inline-flex items-center justify-center h-7 w-7 rounded text-accent bg-accent/10 hover:bg-accent/25 hover:scale-110 transition-[transform,background-color] duration-150"
          >
            <Icon name="externalLink" size={12} className="w-3 h-3" />
          </button>
        )}
      </div>
      {historyEnabled && (
        <SearchHistoryList
          filterKey={filterKey}
          currentValue={value}
          onPick={(query) => onChange(query)}
          toFilters={(query) => toAssetFilters?.(query)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// OverflowMenu — "..." button for overflow filters
// ---------------------------------------------------------------------------

function OverflowMenu<T>({
  filters,
  filterState,
  derivedOptions,
  onChange,
  hasSelection,
  popoverMode = 'portal',
}: {
  filters: ClientFilterDef<T>[];
  filterState: Record<string, ClientFilterValue>;
  derivedOptions: Record<string, ClientEnumFilterOption[]>;
  onChange: (key: string, value: ClientFilterValue) => void;
  hasSelection: boolean;
  popoverMode?: 'portal' | 'inline';
}) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement | null>(null);
  const [rect, setRect] = useState<DOMRect | null>(null);

  useLayoutEffect(() => {
    if (!open || !anchorRef.current) {
      setRect(null);
      return;
    }
    const update = () => setRect(anchorRef.current?.getBoundingClientRect() ?? null);
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
          hasSelection
            ? 'border-accent/50 bg-accent/10 text-accent'
            : 'border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900/60 text-neutral-500 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:text-neutral-700 dark:hover:text-neutral-200'
        }`}
      >
        <Icon name="moreHorizontal" size={14} className="w-3.5 h-3.5" />
      </button>
      {open &&
        rect &&
        (() => {
          const content = (
            <Dropdown
              isOpen={open}
              onClose={() => setOpen(false)}
              positionMode="static"
              minWidth="200px"
              className="max-w-[280px]"
              triggerRef={anchorRef}
            >
              <div className="space-y-2">
                {filters.map((filter) => (
                  <FilterContent
                    key={filter.key}
                    filter={filter}
                    value={filterState[filter.key]}
                    options={derivedOptions[filter.key] || []}
                    onChange={(value) => onChange(filter.key, value)}
                  />
                ))}
              </div>
            </Dropdown>
          );

          if (popoverMode === 'inline') {
            const availableBelow = Math.max(0, window.innerHeight - rect.bottom - 8);
            const availableAbove = Math.max(0, rect.top - 8);
            const openUp = availableBelow < 220 && availableAbove > availableBelow;
            return (
              <div
                className="absolute"
                style={{
                  zIndex: Z.floatOverlay,
                  right: 0,
                  top: openUp ? undefined : 'calc(100% + 6px)',
                  bottom: openUp ? 'calc(100% + 6px)' : undefined,
                }}
              >
                {content}
              </div>
            );
          }

          return (
            <Popover
              open={open}
              anchor={anchorRef.current}
              placement="bottom"
              align="start"
              offset={6}
              onClose={() => setOpen(false)}
              triggerRef={anchorRef}
            >
              {content}
            </Popover>
          );
        })()}
    </div>
  );
}
