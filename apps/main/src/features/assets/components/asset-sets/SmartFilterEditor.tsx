import { Dropdown } from '@pixsim7/shared.ui';
import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';

import { Icon } from '@lib/icons';

import type { AssetFilters } from '@features/assets';

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
  AnalysisTagsRuleEditor,
  MissingMetadataRuleEditor,
  IncludeArchivedRuleEditor,
} from './ruleEditors';

// ── Portal-based dropdown anchored to a trigger element ─────────────────

function ChipDropdown({
  anchorEl,
  visible,
  onClose,
  onMouseEnter,
  onMouseLeave,
  children,
}: {
  anchorEl: HTMLElement | null;
  visible: boolean;
  onClose: () => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  children: React.ReactNode;
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
  const minWidth = 220;
  const maxWidth = 360;
  const width = Math.min(maxWidth, Math.max(minWidth, rect.width));
  const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
  const top = rect.bottom + spacing;

  return createPortal(
    <div
      className="z-popover"
      style={{ position: 'fixed', left, top }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <Dropdown
        isOpen={visible}
        onClose={onClose}
        positionMode="static"
        minWidth={`${width}px`}
        className="max-w-[360px]"
      >
        {children}
      </Dropdown>
    </div>,
    document.body,
  );
}

// ── Single chip in the filter bar ───────────────────────────────────────

function SmartFilterChip({
  ruleType,
  count,
  isOpen,
  isHovered,
  onToggleOpen,
  onCloseChip,
  onMouseEnter,
  onMouseLeave,
  children,
}: {
  ruleType: FilterRuleType;
  count: number;
  isOpen: boolean;
  isHovered: boolean;
  onToggleOpen: () => void;
  onCloseChip: () => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  children: React.ReactNode;
}) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const def = RULE_DEFINITIONS[ruleType];
  const hasSelection = count > 0;
  const isVisible = isOpen || isHovered;
  const showLabel = hasSelection || isOpen || isHovered;

  return (
    <div
      className="relative flex-none"
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <button
        type="button"
        title={def.label}
        aria-expanded={isOpen}
        ref={buttonRef}
        onClick={onToggleOpen}
        className={`relative z-20 inline-flex items-center gap-1.5 h-7 px-1.5 rounded border text-xs transition-[background-color,border-color] duration-200 ${
          hasSelection
            ? 'border-accent/50 bg-accent/10 text-neutral-800 dark:text-neutral-100'
            : isOpen
              ? 'border-neutral-300 dark:border-neutral-600 bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-200'
              : 'border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900/60 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:text-neutral-700 dark:hover:text-neutral-200'
        }`}
      >
        <span className="relative flex-shrink-0">
          <Icon name={def.icon} size={14} className="w-3.5 h-3.5" />
          {hasSelection && (
            <span className="absolute -top-1.5 -right-1.5 text-[8px] leading-none px-0.5 min-w-[12px] text-center rounded-full bg-accent text-accent-text">
              {count}
            </span>
          )}
        </span>
        {showLabel && (
          <span className="font-medium whitespace-nowrap">{def.label}</span>
        )}
      </button>
      <ChipDropdown
        anchorEl={buttonRef.current}
        visible={isVisible}
        onClose={onCloseChip}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
      >
        {children}
      </ChipDropdown>
    </div>
  );
}

// ── Overflow menu for secondary filters ─────────────────────────────────

function OverflowMenu({
  filters,
  maxResults,
  hasAnyActive,
  renderEditor,
}: {
  filters: AssetFilters;
  maxResults?: number;
  hasAnyActive: boolean;
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
        createPortal(
          <div
            className="z-popover"
            style={{
              position: 'fixed',
              left: Math.max(
                8,
                Math.min(rect.left, window.innerWidth - 280 - 8),
              ),
              top: rect.bottom + 6,
            }}
          >
            <Dropdown
              isOpen={open}
              onClose={() => setOpen(false)}
              positionMode="static"
              minWidth="240px"
              className="max-w-[320px]"
            >
              <div className="flex flex-col max-h-[60vh] overflow-y-auto">
                {OVERFLOW_RULES.map((ruleType) => {
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
          </div>,
          document.body,
        )}
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
  const [openChips, setOpenChips] = useState<Set<string>>(new Set());
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);
  const hoverTimeoutRef = useRef<number | null>(null);

  const updateFilters = useCallback(
    (next: AssetFilters) => onChange(next, maxResults),
    [onChange, maxResults],
  );

  const updateMaxResults = useCallback(
    (next?: number) => onChange(filters, next),
    [onChange, filters],
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

  const toggleOpen = useCallback((key: string) => {
    setOpenChips((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const closeChip = useCallback((key: string) => {
    setOpenChips((prev) => {
      if (!prev.has(key)) return prev;
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
    setHoveredKey((prev) => (prev === key ? null : prev));
  }, []);

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

  const hasAnyActive = useMemo(
    () =>
      [...PRIMARY_RULES, ...OVERFLOW_RULES].some(
        (r) => getActiveCount(r, filters, maxResults) > 0,
      ),
    [filters, maxResults],
  );

  const hasAnyOverflowActive = useMemo(
    () =>
      OVERFLOW_RULES.some(
        (r) => getActiveCount(r, filters, maxResults) > 0,
      ),
    [filters, maxResults],
  );

  const handleReset = useCallback(() => {
    onChange({}, undefined);
  }, [onChange]);

  return (
    <div className="relative flex flex-wrap items-start gap-1.5 w-full overflow-x-auto overflow-y-visible pb-1">
      {PRIMARY_RULES.map((ruleType) => {
        const count = getActiveCount(ruleType, filters, maxResults);
        return (
          <SmartFilterChip
            key={ruleType}
            ruleType={ruleType}
            count={count}
            isOpen={openChips.has(ruleType)}
            isHovered={hoveredKey === ruleType}
            onToggleOpen={() => toggleOpen(ruleType)}
            onCloseChip={() => closeChip(ruleType)}
            onMouseEnter={() => openHover(ruleType)}
            onMouseLeave={() => closeHover(ruleType)}
          >
            {renderEditor(ruleType)}
          </SmartFilterChip>
        );
      })}
      {OVERFLOW_RULES.length > 0 && (
        <OverflowMenu
          filters={filters}
          maxResults={maxResults}
          hasAnyActive={hasAnyOverflowActive}
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

