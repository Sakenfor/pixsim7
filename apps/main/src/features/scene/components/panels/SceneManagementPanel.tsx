/**
 * Scene Management Panel
 *
 * Unified panel for all scene-related workflows:
 * - Scene Library: Browse, create, and manage scenes
 * - Scene Collections: Organize scenes into chapters and episodes
 * - Scene Playback: Test and preview scenes in the editor
 */

import { useState, useMemo } from 'react';

import { Icon } from '@lib/icons';

import { useGraphStore } from '@features/graph';

import { SceneCollectionPanel } from './SceneCollectionPanel';
import { SceneLibraryPanel } from './SceneLibraryPanel';
import { ScenePlaybackPanel } from './ScenePlaybackPanel';


type TabId = 'library' | 'collections' | 'playback';

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

export function SceneManagementPanel({
  selectedCollectionId,
  onCollectionSelect,
  startNodeId,
  onPlaybackStart,
  onPlaybackStop,
  initialTab = 'library',
}: SceneManagementPanelProps) {
  const [activeTab, setActiveTab] = useState<TabId>(initialTab);
  const listScenes = useGraphStore((s) => s.listScenes);

  // Get available scene IDs for collection validation
  const availableSceneIds = useMemo(() => {
    const scenes = listScenes();
    return new Set(scenes.map((scene) => scene.id));
  }, [listScenes]);

  const tabs = [
    {
      id: 'library' as const,
      label: 'Scene Library',
      icon: '📚',
      description: 'Browse, create, and manage scenes',
    },
    {
      id: 'collections' as const,
      label: 'Collections',
      icon: '📑',
      description: 'Organize scenes into chapters and episodes',
    },
    {
      id: 'playback' as const,
      label: 'Playback',
      icon: '▶️',
      description: 'Test and preview scenes',
    },
  ];

  return (
    <div className="h-full flex flex-col">
      {/* Tab Navigation */}
      <div className="border-b border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-900">
        <div className="flex overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`
                flex-shrink-0 px-4 py-3 text-sm font-medium border-b-2 transition-colors
                ${
                  activeTab === tab.id
                    ? 'border-blue-600 text-blue-600 dark:text-blue-400 bg-white dark:bg-neutral-950'
                    : 'border-transparent text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800'
                }
              `}
              title={tab.description}
            >
              <Icon name={tab.icon} size={16} className="mr-2" />
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-auto">
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
      </div>
    </div>
  );
}
