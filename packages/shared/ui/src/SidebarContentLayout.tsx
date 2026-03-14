import type { ReactNode } from 'react';
import clsx from 'clsx';

import { HierarchicalSidebarNav, type HierarchicalSidebarNavItem } from './HierarchicalSidebarNav';
import { SidebarPaneShell, type SidebarPaneShellProps } from './SidebarPaneShell';

export interface SidebarContentLayoutSection {
  id: string;
  label: string;
  icon?: ReactNode;
  children?: { id: string; label: string; icon?: ReactNode }[];
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
  children: ReactNode;
  contentClassName?: string;
  navClassName?: string;
  className?: string;
  /** Enable collapse toggle on the sidebar. */
  collapsible?: boolean;
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
  expandedWidth,
  persistKey,
  defaultCollapsed,
  collapsed,
  onCollapsedChange,
  detachable,
}: SidebarContentLayoutProps) {
  const items: HierarchicalSidebarNavItem[] = sections;

  return (
    <div className={clsx('flex-1 flex min-h-0', className)}>
      <SidebarPaneShell
        title={sidebarTitle}
        widthClassName={sidebarWidth}
        variant={variant}
        collapsible={collapsible}
        expandedWidth={expandedWidth}
        persistKey={persistKey}
        defaultCollapsed={defaultCollapsed}
        collapsed={collapsed}
        onCollapsedChange={onCollapsedChange}
        detachable={detachable}
      >
        <HierarchicalSidebarNav
          className={navClassName}
          items={items}
          expandedItemIds={expandedSectionIds}
          onSelectItem={onSelectSection}
          onToggleExpand={onToggleExpand}
          onSelectChild={onSelectChild}
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
        {children}
      </div>
    </div>
  );
}
