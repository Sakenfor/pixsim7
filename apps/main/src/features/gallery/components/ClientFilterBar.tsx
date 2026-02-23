import { Dropdown } from '@pixsim7/shared.ui';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';

import { Icon } from '@lib/icons';

import type { ClientFilterDef, ClientFilterValue } from '../lib/useClientFilters';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface ClientFilterBarProps<T> {
  defs: ClientFilterDef<T>[];
  filterState: Record<string, ClientFilterValue>;
  derivedOptions: Record<string, Array<{ value: string; label: string; count?: number }>>;
  onFilterChange: (key: string, value: ClientFilterValue) => void;
  onReset?: () => void;
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
}: ClientFilterBarProps<T>) {
  const [openFilters, setOpenFilters] = useState<Set<string>>(new Set());
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);
  const triggerRefs = useRef(new Map<string, HTMLButtonElement | null>());
  const hoverTimeoutRef = useRef<number | null>(null);
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

  const openHover = useCallback((key: string) => {
    if (hoverTimeoutRef.current !== null) {
      window.clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    setHoveredKey(key);
  }, []);

  const closeHover = useCallback((key: string) => {
    if (hoverTimeoutRef.current !== null) {
      window.clearTimeout(hoverTimeoutRef.current);
    }
    hoverTimeoutRef.current = window.setTimeout(() => {
      setHoveredKey((prev) => (prev === key ? null : prev));
    }, 120);
  }, []);

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
      {primaryFilters.map((filter) => (
        <FilterChip
          key={filter.key}
          filter={filter}
          filterState={filterState}
          derivedOptions={derivedOptions}
          openFilters={openFilters}
          setOpenFilters={setOpenFilters}
          hoveredKey={hoveredKey}
          openHover={openHover}
          closeHover={closeHover}
          setTriggerRef={setTriggerRef}
          triggerRefs={triggerRefs}
          onFilterChange={onFilterChange}
          scrollCache={filterScrollCache}
          expandedKeys={expandedKeys}
        />
      ))}
      {overflowFilters.length > 0 && (
        <OverflowMenu
          filters={overflowFilters}
          filterState={filterState}
          derivedOptions={derivedOptions}
          onChange={onFilterChange}
          hasSelection={hasOverflowSelection}
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
// FilterChip — single chip in the bar
// ---------------------------------------------------------------------------

function FilterChip<T>({
  filter,
  filterState,
  derivedOptions,
  openFilters,
  setOpenFilters,
  hoveredKey,
  openHover,
  closeHover,
  setTriggerRef,
  triggerRefs,
  onFilterChange,
  scrollCache,
  expandedKeys,
}: {
  filter: ClientFilterDef<T>;
  filterState: Record<string, ClientFilterValue>;
  derivedOptions: Record<string, Array<{ value: string; label: string; count?: number }>>;
  openFilters: Set<string>;
  setOpenFilters: React.Dispatch<React.SetStateAction<Set<string>>>;
  hoveredKey: string | null;
  openHover: (key: string) => void;
  closeHover: (key: string) => void;
  setTriggerRef: (key: string) => (node: HTMLButtonElement | null) => void;
  triggerRefs: React.MutableRefObject<Map<string, HTMLButtonElement | null>>;
  onFilterChange: (key: string, value: ClientFilterValue) => void;
  scrollCache: React.MutableRefObject<Map<string, number>>;
  expandedKeys: ReadonlySet<string>;
}) {
  const isOpen = openFilters.has(filter.key);
  const isHovered = hoveredKey === filter.key;
  const isVisible = isOpen || isHovered;
  const selectedValue = filterState[filter.key];
  const selectedCount = Array.isArray(selectedValue)
    ? selectedValue.length
    : selectedValue
      ? 1
      : 0;
  const hasSelection = selectedCount > 0;
  const resolvedIcon = filter.icon ?? 'sliders';
  const showLabel = hasSelection || isOpen || isHovered || expandedKeys.has(filter.key);

  return (
    <div
      className="relative flex-none"
      onMouseEnter={() => openHover(filter.key)}
      onMouseLeave={() => closeHover(filter.key)}
    >
      <button
        type="button"
        title={filter.label}
        aria-expanded={isOpen}
        ref={setTriggerRef(filter.key)}
        onClick={() =>
          setOpenFilters((prev) => {
            const next = new Set(prev);
            if (next.has(filter.key)) next.delete(filter.key);
            else next.add(filter.key);
            return next;
          })
        }
        className={`relative z-20 inline-flex items-center gap-1.5 h-7 px-1.5 rounded border text-xs transition-[background-color,border-color] duration-200 ${
          hasSelection
            ? 'border-accent/50 bg-accent/10 text-neutral-800 dark:text-neutral-100'
            : isOpen
              ? 'border-neutral-300 dark:border-neutral-600 bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-200'
              : 'border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900/60 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:text-neutral-700 dark:hover:text-neutral-200'
        }`}
      >
        <span className="relative flex-shrink-0">
          <Icon name={resolvedIcon} size={14} className="w-3.5 h-3.5" />
          {hasSelection && (
            <span className="absolute -top-1.5 -right-1.5 text-[8px] leading-none px-0.5 min-w-[12px] text-center rounded-full bg-accent text-accent-text">
              {selectedCount}
            </span>
          )}
        </span>
        {showLabel && (
          <span className="font-medium whitespace-nowrap">{filter.label}</span>
        )}
      </button>
      <FilterDropdown
        anchorEl={triggerRefs.current.get(filter.key) || null}
        visible={isVisible}
        wide={(filter.columns ?? 1) > 1}
        onClose={() => {
          setOpenFilters((prev) => {
            if (!prev.has(filter.key)) return prev;
            const next = new Set(prev);
            next.delete(filter.key);
            return next;
          });
          setHoveredKey((prev) => (prev === filter.key ? null : prev));
        }}
        onMouseEnter={() => openHover(filter.key)}
        onMouseLeave={() => closeHover(filter.key)}
      >
        <FilterContent
          filter={filter}
          value={filterState[filter.key]}
          options={derivedOptions[filter.key] || []}
          onChange={(value) => onFilterChange(filter.key, value)}
          scrollCache={scrollCache}
        />
      </FilterDropdown>
    </div>
  );
}

// ---------------------------------------------------------------------------
// FilterDropdown — portal-based dropdown anchored to trigger
// ---------------------------------------------------------------------------

function FilterDropdown({
  anchorEl,
  visible,
  wide,
  onClose,
  onMouseEnter,
  onMouseLeave,
  children,
}: {
  anchorEl: HTMLElement | null;
  visible: boolean;
  wide?: boolean;
  onClose?: () => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  children: ReactNode;
}) {
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
  const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
  const top = rect.bottom + spacing;
  const maxHeight = Math.max(120, window.innerHeight - top - 16);

  return createPortal(
    <div
      className="z-popover"
      style={{ position: 'fixed', left, top, maxHeight }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <Dropdown
        isOpen={visible}
        onClose={onClose || (() => undefined)}
        positionMode="static"
        minWidth={`${width}px`}
        className={wide ? 'max-w-[520px]' : 'max-w-[360px]'}
      >
        {children}
      </Dropdown>
    </div>,
    document.body,
  );
}

// ---------------------------------------------------------------------------
// FilterContent — renders the appropriate control for a filter type
// ---------------------------------------------------------------------------

function FilterContent<T>({
  filter,
  value,
  options,
  onChange,
  scrollCache,
}: {
  filter: ClientFilterDef<T>;
  value: ClientFilterValue;
  options: Array<{ value: string; label: string; count?: number }>;
  onChange: (value: ClientFilterValue) => void;
  scrollCache?: React.MutableRefObject<Map<string, number>>;
}) {
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
    return () => {
      const el = scrollRef.current;
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
    case 'search':
      return (
        <div className="flex items-center gap-2">
          <div className="relative w-full">
            {filter.icon && (
              <Icon
                name={filter.icon}
                className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400"
              />
            )}
            <input
              type="text"
              placeholder={filter.label}
              value={(value as string) || ''}
              onChange={(e) => onChange(e.target.value || undefined)}
              className={`w-full bg-white dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 rounded px-3 py-1.5 text-sm text-neutral-800 dark:text-neutral-200 focus:outline-none focus:border-accent ${filter.icon ? 'pl-8' : ''}`}
            />
          </div>
        </div>
      );

    case 'enum': {
      const cols = filter.columns ?? 1;
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
          {options.map((opt) => {
            const isSelected = selectedValues.includes(opt.value);
            const extra = filter.renderOptionExtra?.(opt.value);
            return (
              <div key={opt.value} className="group/opt flex items-center gap-1">
                <label
                  className="flex items-center gap-2 text-sm text-neutral-700 dark:text-neutral-200 cursor-pointer flex-1 min-w-0"
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => {
                      const next = new Set(selectedValues);
                      if (next.has(opt.value)) next.delete(opt.value);
                      else next.add(opt.value);
                      onChange(Array.from(next));
                    }}
                    className="accent-accent flex-shrink-0"
                  />
                  <span className="truncate">
                    {opt.label}
                    {opt.count !== undefined ? ` (${opt.count})` : ''}
                  </span>
                </label>
                {extra && (
                  <span className="flex-shrink-0 flex items-center opacity-0 group-hover/opt:opacity-100 transition-opacity">
                    {extra}
                  </span>
                )}
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
// OverflowMenu — "..." button for overflow filters
// ---------------------------------------------------------------------------

function OverflowMenu<T>({
  filters,
  filterState,
  derivedOptions,
  onChange,
  hasSelection,
}: {
  filters: ClientFilterDef<T>[];
  filterState: Record<string, ClientFilterValue>;
  derivedOptions: Record<string, Array<{ value: string; label: string; count?: number }>>;
  onChange: (key: string, value: ClientFilterValue) => void;
  hasSelection: boolean;
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
        createPortal(
          <div
            className="z-popover"
            style={{
              position: 'fixed',
              left: Math.max(8, Math.min(rect.left, window.innerWidth - 240 - 8)),
              top: rect.bottom + 6,
            }}
          >
            <Dropdown
              isOpen={open}
              onClose={() => setOpen(false)}
              positionMode="static"
              minWidth="200px"
              className="max-w-[280px]"
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
          </div>,
          document.body,
        )}
    </div>
  );
}
