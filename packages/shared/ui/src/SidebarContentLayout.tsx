import type { ReactNode } from 'react';
import clsx from 'clsx';

import { HierarchicalSidebarNav, type HierarchicalSidebarNavItem } from './HierarchicalSidebarNav';
import { SidebarPaneShell } from './SidebarPaneShell';

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
}: SidebarContentLayoutProps) {
  const items: HierarchicalSidebarNavItem[] = sections;

  return (
    <div className={clsx('flex-1 flex min-h-0', className)}>
      <SidebarPaneShell title={sidebarTitle} widthClassName={sidebarWidth} variant={variant}>
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

      <div className={clsx('flex-1 min-w-0 overflow-y-auto', contentClassName)}>
        {children}
      </div>
    </div>
  );
}
