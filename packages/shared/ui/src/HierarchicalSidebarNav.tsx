import type { ReactNode } from 'react';

export type HierarchicalSidebarNavState = 'inactive' | 'active' | 'ancestor';

export interface HierarchicalSidebarNavChildItem {
  id: string;
  label: string;
  icon?: ReactNode;
  /** Optional content rendered right-aligned after the label (e.g. badges). */
  extra?: ReactNode;
}

export interface HierarchicalSidebarNavItem {
  id: string;
  label: string;
  icon?: ReactNode;
  children?: HierarchicalSidebarNavChildItem[];
  selectOnClick?: boolean;
  toggleOnClickIfExpandable?: boolean;
}

export interface HierarchicalSidebarNavProps {
  items: HierarchicalSidebarNavItem[];
  expandedItemIds?: ReadonlySet<string>;
  onToggleExpand?: (itemId: string) => void;
  onSelectItem?: (itemId: string) => void;
  onSelectChild?: (itemId: string, childId: string) => void;
  getItemState?: (item: HierarchicalSidebarNavItem) => HierarchicalSidebarNavState;
  getChildState?: (
    item: HierarchicalSidebarNavItem,
    child: HierarchicalSidebarNavChildItem,
  ) => 'inactive' | 'active';
  variant?: 'light' | 'dark';
  className?: string;
}

function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg
      className={`h-3 w-3 transition-transform ${expanded ? 'rotate-90' : ''}`}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
    </svg>
  );
}

function getItemClasses(variant: 'light' | 'dark', state: HierarchicalSidebarNavState) {
  const base =
    variant === 'light'
      ? 'w-full flex items-center gap-2 px-3 py-2 text-left text-xs rounded-md transition-colors'
      : 'flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs transition-colors';

  if (variant === 'light') {
    const tone =
      state === 'active'
        ? 'bg-blue-500 text-white'
        : state === 'ancestor'
        ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
        : 'hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-700 dark:text-neutral-300';
    return `${base} ${tone}`;
  }

  const tone =
    state === 'active' || state === 'ancestor'
      ? 'bg-neutral-900 text-neutral-100'
      : 'text-neutral-300 hover:bg-neutral-900/60 hover:text-neutral-100';
  return `${base} ${tone}`;
}

function getChildClasses(variant: 'light' | 'dark', active: boolean, hasExtra: boolean) {
  const base =
    variant === 'light'
      ? `w-full flex ${hasExtra ? 'flex-col items-start gap-0.5' : 'items-center gap-2'} pl-3 pr-2 py-1.5 text-left text-[11px] rounded-r-md transition-colors`
      : `w-full flex ${hasExtra ? 'flex-col items-start gap-0.5' : 'items-center gap-2'} rounded-r px-2 py-1.5 text-left text-[11px] transition-colors`;

  if (variant === 'light') {
    const tone = active
      ? 'bg-blue-500 text-white'
      : 'hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-600 dark:text-neutral-400';
    return `${base} ${tone}`;
  }

  const tone = active
    ? 'bg-blue-600 text-white'
    : 'text-neutral-400 hover:bg-neutral-900/60 hover:text-neutral-200';
  return `${base} ${tone}`;
}

function getChildContainerClasses(variant: 'light' | 'dark') {
  return variant === 'light'
    ? 'ml-4 mt-0.5 space-y-0.5 border-l border-neutral-200 dark:border-neutral-700'
    : 'ml-4 mt-1 space-y-1 border-l border-neutral-800 pl-2';
}

function getChevronButtonClasses(variant: 'light' | 'dark') {
  return variant === 'light'
    ? 'p-0.5 -ml-1 hover:bg-neutral-200 dark:hover:bg-neutral-700 rounded'
    : 'inline-flex h-4 w-4 items-center justify-center rounded hover:bg-neutral-800';
}

export function HierarchicalSidebarNav({
  items,
  expandedItemIds,
  onToggleExpand,
  onSelectItem,
  onSelectChild,
  getItemState,
  getChildState,
  variant = 'light',
  className,
}: HierarchicalSidebarNavProps) {
  return (
    <div className={className}>
      {items.map((item) => {
        const hasChildren = Boolean(item.children?.length);
        const isExpanded = hasChildren && expandedItemIds ? expandedItemIds.has(item.id) : false;
        const itemState = getItemState?.(item) ?? 'inactive';

        return (
          <div key={item.id} className="select-none">
            <button
              type="button"
              onClick={() => {
                if (hasChildren && item.toggleOnClickIfExpandable !== false) {
                  onToggleExpand?.(item.id);
                }
                if (item.selectOnClick !== false) {
                  onSelectItem?.(item.id);
                }
              }}
              className={getItemClasses(variant, itemState)}
            >
              {hasChildren && (
                <span
                  className={getChevronButtonClasses(variant)}
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleExpand?.(item.id);
                  }}
                >
                  <ChevronIcon expanded={Boolean(isExpanded)} />
                </span>
              )}
              {item.icon ? <span className="flex-shrink-0">{item.icon}</span> : null}
              <span className="truncate font-medium">{item.label}</span>
            </button>

            {hasChildren && isExpanded && (
              <div className={getChildContainerClasses(variant)}>
                {item.children!.map((child) => {
                  const isChildActive = (getChildState?.(item, child) ?? 'inactive') === 'active';
                  const hasExtra = !!child.extra;
                  return (
                    <button
                      key={child.id}
                      type="button"
                      onClick={() => onSelectChild?.(item.id, child.id)}
                      className={getChildClasses(variant, isChildActive, hasExtra)}
                    >
                      <span className="flex items-center gap-2 w-full min-w-0">
                        {child.icon ? <span className="flex-shrink-0">{child.icon}</span> : null}
                        <span className="truncate flex-1">{child.label}</span>
                      </span>
                      {hasExtra && (
                        <span className="flex items-center gap-1 pl-5 w-full text-[9px] opacity-75">
                          {child.extra}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
