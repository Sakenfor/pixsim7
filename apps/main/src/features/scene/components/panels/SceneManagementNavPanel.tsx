/**
 * SceneManagementNavPanel
 *
 * Standalone dockview panel that renders the SceneManagement sidebar navigation.
 * Used when the sidebar is "popped out" from the host panel.
 * Reads/writes nav state from the shared detachable sidebar store.
 */

import { HierarchicalSidebarNav, useDetachableSidebarStore } from '@pixsim7/shared.ui';
import { useMemo } from 'react';

import { Icon } from '@lib/icons';

const SIDEBAR_ID = 'scene-management-sidebar';

export function SceneManagementNavPanel() {
  const store = useDetachableSidebarStore();
  const entry = store.sidebars[SIDEBAR_ID];

  const sections = useMemo(
    () => [
      {
        id: 'authoring',
        label: 'Authoring',
        icon: <Icon name="layoutGrid" size={14} className="flex-shrink-0" />,
        children: [
          { id: 'builder', label: 'Builder', icon: <Icon name="layoutGrid" size={12} className="flex-shrink-0" /> },
          { id: 'library', label: 'Scene Library', icon: <Icon name="library" size={12} className="flex-shrink-0" /> },
          { id: 'collections', label: 'Collections', icon: <Icon name="folderTree" size={12} className="flex-shrink-0" /> },
        ],
      },
      {
        id: 'runtime',
        label: 'Runtime',
        icon: <Icon name="play" size={14} className="flex-shrink-0" />,
        children: [
          { id: 'playback', label: 'Playback', icon: <Icon name="play" size={12} className="flex-shrink-0" /> },
        ],
      },
    ],
    [],
  );

  const expandedSectionIds = useMemo(
    () => new Set(entry?.expandedSectionIds ?? ['authoring', 'runtime']),
    [entry?.expandedSectionIds],
  );

  const activeSectionId = entry?.activeSectionId ?? 'authoring';
  const activeChildId = entry?.activeChildId;

  return (
    <div className="h-full overflow-y-auto bg-white dark:bg-neutral-900 p-2">
      <div className="flex items-center justify-between px-2 pb-2">
        <h2 className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">Scene Navigation</h2>
        <button
          type="button"
          onClick={() => store.dockBack(SIDEBAR_ID)}
          className="text-xs text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200"
          aria-label="Dock back into host panel"
        >
          Dock back
        </button>
      </div>
      <HierarchicalSidebarNav
        className="space-y-1"
        items={sections}
        expandedItemIds={expandedSectionIds}
        onSelectItem={(sectionId) => store.setActiveSection(SIDEBAR_ID, sectionId)}
        onToggleExpand={(sectionId) => store.toggleExpand(SIDEBAR_ID, sectionId)}
        onSelectChild={(parentId, childId) => store.setActiveChild(SIDEBAR_ID, parentId, childId)}
        getItemState={(item) => {
          if (item.id !== activeSectionId) return 'inactive';
          return activeChildId ? 'ancestor' : 'active';
        }}
        getChildState={(item, child) =>
          item.id === activeSectionId && activeChildId === child.id ? 'active' : 'inactive'
        }
        variant="light"
      />
    </div>
  );
}
