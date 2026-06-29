import type { ReactNode } from 'react';
import clsx from 'clsx';

import { HierarchicalSidebarNav, type HierarchicalSidebarNavItem } from './HierarchicalSidebarNav';
import { SidebarPaneShell, type SidebarPaneShellProps } from './SidebarPaneShell';

export interface SidebarContentLayoutChild<TChildId extends string = string> {
  id: TChildId;
  label: string;
  icon?: ReactNode;
  extra?: ReactNode;
  /**
   * Declarative content pane for this child. When set, the layout renders it for
   * the active child itself — the consumer no longer needs a manual
   * `{activeChildId === '…' && <X/>}` switch. A ReactNode is fine (element
   * creation is cheap; only the active one is mounted). Omit to fall back to the
   * parent section's `content`, then to the `children` render prop.
   */
  content?: ReactNode;
}

/**
 * A sidebar section. Generic over the CHILD id type (`TChildId`, default
 * `string`) so a consumer with narrow child ids can type them once and have that
 * flow into a `useSidebarNav<…, TChildId>` call without a cast — pass
 * `SidebarContentLayoutSection<MyChildId>[]`. Flat sections (no children) should
 * use `SidebarContentLayoutSection<never>[]` so the (vacuous) child id matches a
 * `useSidebarNav<…, never>`. The default keeps every existing `string`-id
 * consumer working unchanged.
 */
export interface SidebarContentLayoutSection<TChildId extends string = string> {
  id: string;
  label: string;
  icon?: ReactNode;
  children?: SidebarContentLayoutChild<TChildId>[];
  /**
   * Declarative content pane for this section. When set, the layout renders it
   * for the active section itself (see {@link SidebarContentLayoutChild.content}),
   * so consumers can describe panes inline instead of hand-writing a
   * `{activeSectionId === '…' && <X/>}` chain. Mixing is supported: sections
   * without `content` fall through to the `children` render prop, so a consumer
   * can migrate one section at a time.
   */
  content?: ReactNode;
  selectOnClick?: boolean;
  toggleOnClickIfExpandable?: boolean;
}

export interface SidebarContentLayoutProps {
  sections: SidebarContentLayoutSection[];
  activeSectionId: string;
  onSelectSection: (sectionId: string) => void;
  activeChildId?: string;
  onSelectChild?: (parentId: string, childId: string) => void;
  expandedSectionIds?: ReadonlySet<string>;
  onToggleExpand?: (sectionId: string) => void;
  sidebarTitle?: ReactNode;
  sidebarWidth?: string;
  variant?: 'light' | 'dark';
  /**
   * Manual content render. Optional now: when a section/child declares `content`,
   * the layout renders that for the active node and this prop is only the
   * fallback for nodes that don't. Provide it for the classic
   * `{activeId === '…' && <X/>}` pattern, omit it for fully-declarative sidebars.
   */
  children?: ReactNode;
  contentClassName?: string;
  navClassName?: string;
  className?: string;
  /** Enable collapse toggle on the sidebar. */
  collapsible?: boolean;
  /** Enable drag-to-resize on the sidebar edge. */
  resizable?: boolean;
  /** Width in px when expanded (used when collapsible=true). */
  expandedWidth?: number;
  /** localStorage persistence key for collapse state. */
  persistKey?: string;
  /** Initial collapsed state. */
  defaultCollapsed?: boolean;
  /** Controlled collapsed state. */
  collapsed?: boolean;
  /** Callback when collapsed state changes. */
  onCollapsedChange?: (v: boolean) => void;
  /** Enable detach/dock-back support. */
  detachable?: SidebarPaneShellProps['detachable'];
  /** Hide title when inside a floating panel or when dockview tabs are visible. */
  autoHideTitle?: boolean;
  /** Render child `extra` inline (right-aligned, single row) instead of a 2nd line. */
  inlineChildExtra?: boolean;
}

export function SidebarContentLayout({
  sections,
  activeSectionId,
  onSelectSection,
  activeChildId,
  onSelectChild,
  expandedSectionIds,
  onToggleExpand,
  sidebarTitle,
  sidebarWidth = 'w-40',
  variant = 'light',
  children,
  contentClassName,
  navClassName,
  className,
  collapsible,
  resizable,
  expandedWidth,
  persistKey,
  defaultCollapsed,
  collapsed,
  onCollapsedChange,
  detachable,
  autoHideTitle,
  inlineChildExtra,
}: SidebarContentLayoutProps) {
  const items: HierarchicalSidebarNavItem[] = sections;

  // Resolve the active pane: prefer the active CHILD's declarative `content`,
  // then the active SECTION's `content`, then the manual `children` render prop.
  // The fall-through lets a consumer mix declarative and manual sections (and
  // migrate incrementally) — a section without `content` simply uses `children`.
  const activeSection = sections.find((s) => s.id === activeSectionId);
  const activeChild = activeChildId
    ? activeSection?.children?.find((c) => c.id === activeChildId)
    : undefined;
  const pane: ReactNode =
    activeChild?.content !== undefined
      ? activeChild.content
      : activeSection?.content !== undefined
      ? activeSection.content
      : children;

  return (
    <div className={clsx('flex-1 flex min-h-0 h-full', className)}>
      <SidebarPaneShell
        title={sidebarTitle}
        widthClassName={sidebarWidth}
        variant={variant}
        collapsible={collapsible}
        resizable={resizable}
        expandedWidth={expandedWidth}
        persistKey={persistKey}
        defaultCollapsed={defaultCollapsed}
        collapsed={collapsed}
        onCollapsedChange={onCollapsedChange}
        detachable={detachable}
        autoHideTitle={autoHideTitle}
      >
        <HierarchicalSidebarNav
          className={navClassName}
          items={items}
          expandedItemIds={expandedSectionIds}
          onSelectItem={onSelectSection}
          onToggleExpand={onToggleExpand}
          onSelectChild={onSelectChild}
          inlineChildExtra={inlineChildExtra}
          getItemState={(item) => {
            if (item.id !== activeSectionId) return 'inactive';
            return activeChildId ? 'ancestor' : 'active';
          }}
          getChildState={(item, child) =>
            item.id === activeSectionId && activeChildId === child.id ? 'active' : 'inactive'
          }
          variant={variant}
        />
      </SidebarPaneShell>

      <div className={clsx('flex-1 min-w-0 min-h-0 h-full', contentClassName)}>
        {pane}
      </div>
    </div>
  );
}
