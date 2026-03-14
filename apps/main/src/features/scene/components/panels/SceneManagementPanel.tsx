/**
 * Scene Management Panel
 *
 * Unified panel for all scene-related workflows:
 * - Scene Builder: Scene context and runtime actions
 * - Scene Library: Browse, create, and manage scenes
 * - Scene Collections: Organize scenes into chapters and episodes
 * - Scene Playback: Test and preview scenes in the editor
 */

import { Badge, SidebarContentLayout, useDetachableSidebarNav } from '@pixsim7/shared.ui';
import { useMemo } from 'react';

import { Icon } from '@lib/icons';

import { useGraphStore } from '@features/graph';
import { useDetachableSidebar } from '@features/panels/lib/useDetachableSidebar';
import { useProjectSessionStore } from '@features/scene';

import { SceneBuilderPanel } from './SceneBuilderPanel';
import { SceneCollectionPanel } from './SceneCollectionPanel';
import { SceneLibraryPanel } from './SceneLibraryPanel';
import { ScenePlaybackPanel } from './ScenePlaybackPanel';

type TabId = 'builder' | 'library' | 'collections' | 'playback';

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

function ProjectContextHeader() {
  const projectName = useProjectSessionStore((s) => s.currentProjectName);
  const dirty = useProjectSessionStore((s) => s.dirty);
  const sourceWorldId = useProjectSessionStore((s) => s.currentProjectSourceWorldId);
  const listScenes = useGraphStore((s) => s.listScenes);
  const sceneCount = listScenes().length;

  return (
    <span className="flex flex-col gap-0.5 leading-tight">
      <span className="flex items-center gap-1.5">
        <span className="truncate text-sm">{projectName || 'Unsaved Project'}</span>
        {dirty && <Badge color="yellow">unsaved</Badge>}
      </span>
      <span className="flex items-center gap-1.5 text-xs font-normal text-neutral-500 dark:text-neutral-400">
        <span>{sceneCount} scene{sceneCount !== 1 ? 's' : ''}</span>
        {sourceWorldId != null && <Badge color="blue">world {sourceWorldId}</Badge>}
      </span>
    </span>
  );
}

export function SceneManagementPanel({
  selectedCollectionId,
  onCollectionSelect,
  startNodeId,
  onPlaybackStart,
  onPlaybackStop,
  initialTab = 'library',
}: SceneManagementPanelProps) {
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
            id: 'builder' as TabId,
            label: 'Builder',
            icon: <Icon name="layoutGrid" size={12} className="flex-shrink-0" />,
          },
          {
            id: 'library' as TabId,
            label: 'Scene Library',
            icon: <Icon name="library" size={12} className="flex-shrink-0" />,
          },
          {
            id: 'collections' as TabId,
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
            id: 'playback' as TabId,
            label: 'Playback',
            icon: <Icon name="play" size={12} className="flex-shrink-0" />,
          },
        ],
      },
    ],
    [],
  );

  const nav = useDetachableSidebarNav({
    sidebarId: 'scene-management-sidebar',
    sections: navSections,
    initial: initialTab,
  });
  const sidebar = useDetachableSidebar({
    sidebarId: 'scene-management-sidebar',
    companionPanelId: 'scene-management-nav',
    dockviewId: 'workspace',
  });
  const activeTab = nav.activeId as TabId;

  return (
    <div className="h-full min-h-0 flex bg-white dark:bg-neutral-900">
      <SidebarContentLayout
        sections={navSections}
        activeSectionId={nav.activeSectionId}
        onSelectSection={nav.selectSection}
        activeChildId={nav.activeChildId}
        onSelectChild={nav.selectChild}
        expandedSectionIds={nav.expandedSectionIds}
        onToggleExpand={nav.toggleExpand}
        sidebarTitle={<ProjectContextHeader />}
        sidebarWidth="w-56"
        variant="light"
        navClassName="space-y-1"
        collapsible
        expandedWidth={224}
        persistKey="scene-management-sidebar"
        detachable={sidebar.detachableProps}
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
