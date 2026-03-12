/**
 * Scene Management Panel
 *
 * Unified panel for all scene-related workflows:
 * - Scene Builder: Scene context and runtime actions
 * - Scene Library: Browse, create, and manage scenes
 * - Scene Collections: Organize scenes into chapters and episodes
 * - Scene Playback: Test and preview scenes in the editor
 */

import { SidebarContentLayout } from '@pixsim7/shared.ui';
import { useMemo, useState } from 'react';

import { Icon } from '@lib/icons';

import { useGraphStore } from '@features/graph';

import { SceneBuilderPanel } from './SceneBuilderPanel';
import { SceneCollectionPanel } from './SceneCollectionPanel';
import { SceneLibraryPanel } from './SceneLibraryPanel';
import { ScenePlaybackPanel } from './ScenePlaybackPanel';

type TabId = 'builder' | 'library' | 'collections' | 'playback';
type SectionId = 'authoring' | 'runtime';

interface SceneManagementPanelProps {
  // Scene collection props
  selectedCollectionId?: string | null;
  onCollectionSelect?: (collectionId: string | null) => void;

  // Scene playback props
  startNodeId?: string | null;
  onPlaybackStart?: () => void;
  onPlaybackStop?: () => void;

  // Initial tab
  initialTab?: TabId;
}

function getSectionIdForTab(tabId: TabId): SectionId {
  return tabId === 'playback' ? 'runtime' : 'authoring';
}

function getDefaultTabForSection(sectionId: SectionId): TabId {
  return sectionId === 'runtime' ? 'playback' : 'builder';
}

export function SceneManagementPanel({
  selectedCollectionId,
  onCollectionSelect,
  startNodeId,
  onPlaybackStart,
  onPlaybackStop,
  initialTab = 'library',
}: SceneManagementPanelProps) {
  const [activeTab, setActiveTab] = useState<TabId>(initialTab);
  const [expandedSectionIds, setExpandedSectionIds] = useState<Set<string>>(
    () => new Set<SectionId>(['authoring', 'runtime']),
  );
  const listScenes = useGraphStore((s) => s.listScenes);

  // Get available scene IDs for collection validation
  const availableSceneIds = useMemo(() => {
    const scenes = listScenes();
    return new Set(scenes.map((scene) => scene.id));
  }, [listScenes]);

  const navSections = useMemo(
    () => [
      {
        id: 'authoring',
        label: 'Authoring',
        icon: <Icon name="layoutGrid" size={14} className="flex-shrink-0" />,
        children: [
          {
            id: 'builder',
            label: 'Builder',
            icon: <Icon name="layoutGrid" size={12} className="flex-shrink-0" />,
          },
          {
            id: 'library',
            label: 'Scene Library',
            icon: <Icon name="library" size={12} className="flex-shrink-0" />,
          },
          {
            id: 'collections',
            label: 'Collections',
            icon: <Icon name="folderTree" size={12} className="flex-shrink-0" />,
          },
        ],
      },
      {
        id: 'runtime',
        label: 'Runtime',
        icon: <Icon name="play" size={14} className="flex-shrink-0" />,
        children: [
          {
            id: 'playback',
            label: 'Playback',
            icon: <Icon name="play" size={12} className="flex-shrink-0" />,
          },
        ],
      },
    ],
    [],
  );

  const activeSectionId = getSectionIdForTab(activeTab);

  const handleSelectSection = (sectionId: string) => {
    if (sectionId !== 'authoring' && sectionId !== 'runtime') {
      return;
    }
    setActiveTab(getDefaultTabForSection(sectionId));
  };

  const handleSelectChild = (_parentId: string, childId: string) => {
    if (childId === 'builder' || childId === 'library' || childId === 'collections' || childId === 'playback') {
      setActiveTab(childId);
    }
  };

  const handleToggleExpand = (sectionId: string) => {
    setExpandedSectionIds((prev) => {
      const next = new Set(prev);
      if (next.has(sectionId)) {
        next.delete(sectionId);
      } else {
        next.add(sectionId);
      }
      return next;
    });
  };

  return (
    <div className="h-full min-h-0 flex bg-white dark:bg-neutral-900">
      <SidebarContentLayout
        sections={navSections}
        activeSectionId={activeSectionId}
        onSelectSection={handleSelectSection}
        activeChildId={activeTab}
        onSelectChild={handleSelectChild}
        expandedSectionIds={expandedSectionIds}
        onToggleExpand={handleToggleExpand}
        sidebarTitle="Scene Management"
        sidebarWidth="w-56"
        variant="light"
        navClassName="space-y-1"
      >
        {activeTab === 'builder' && <SceneBuilderPanel showInspector={false} />}

        {activeTab === 'library' && <SceneLibraryPanel />}

        {activeTab === 'collections' && (
          <SceneCollectionPanel
            availableSceneIds={availableSceneIds}
            selectedCollectionId={selectedCollectionId}
            onCollectionSelect={onCollectionSelect}
          />
        )}

        {activeTab === 'playback' && (
          <ScenePlaybackPanel
            startNodeId={startNodeId}
            onPlaybackStart={onPlaybackStart}
            onPlaybackStop={onPlaybackStop}
          />
        )}
      </SidebarContentLayout>
    </div>
  );
}
