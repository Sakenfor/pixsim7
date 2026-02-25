
import { HierarchicalSidebarNav } from '@pixsim7/shared.ui';
import { useEffect, useState } from 'react';

import type { CharacterDetail } from '@lib/api/characters';

import { GraphEditorSplitLayout } from '@/features/graph/components/graph/GraphEditorSplitLayout';
import { GraphSidebarSection } from '@/features/graph/components/graph/GraphSidebarSection';

import { BehaviorTab } from './tabs/BehaviorTab';
import { GameLinkTab } from './tabs/GameLinkTab';
import { IdentityTab } from './tabs/IdentityTab';
import { PersonalityTab } from './tabs/PersonalityTab';
import { ReferencePipelineTab } from './tabs/ReferencePipelineTab';
import { RenderingTab } from './tabs/RenderingTab';
import { VisualTab } from './tabs/VisualTab';
import { VoiceTab } from './tabs/VoiceTab';
import { VersionHistory } from './VersionHistory';

const TABS = [
  { id: 'identity', label: 'Identity' },
  { id: 'visual', label: 'Visual' },
  { id: 'personality', label: 'Personality' },
  { id: 'behavior', label: 'Behavior' },
  { id: 'voice', label: 'Voice' },
  { id: 'rendering', label: 'Rendering' },
  { id: 'references', label: 'References' },
  { id: 'game-link', label: 'Game Link' },
] as const;

type TabId = (typeof TABS)[number]['id'];

interface CharacterNavGroup {
  id: string;
  title: string;
  items: Array<(typeof TABS)[number]>;
}

const TAB_GROUPS: CharacterNavGroup[] = [
  {
    id: 'core',
    title: 'Core',
    items: TABS.filter((tab) => ['identity', 'visual', 'rendering'].includes(tab.id)),
  },
  {
    id: 'traits',
    title: 'Traits',
    items: TABS.filter((tab) => ['personality', 'behavior', 'voice'].includes(tab.id)),
  },
  {
    id: 'production',
    title: 'Production',
    items: TABS.filter((tab) => ['references', 'game-link'].includes(tab.id)),
  },
];

export interface CharacterEditorProps {
  character: Partial<CharacterDetail>;
  onChange: (patch: Partial<CharacterDetail>) => void;
  isCreateMode: boolean;
  onEvolved: () => void;
}

export function CharacterEditor({
  character,
  onChange,
  isCreateMode,
  onEvolved,
}: CharacterEditorProps) {
  const [activeTab, setActiveTab] = useState<TabId>('identity');
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => new Set(TAB_GROUPS.map((g) => g.id)));
  const activeTabLabel = TABS.find((tab) => tab.id === activeTab)?.label ?? activeTab;
  const activeGroupId = TAB_GROUPS.find((group) => group.items.some((item) => item.id === activeTab))?.id ?? TAB_GROUPS[0].id;

  useEffect(() => {
    setExpandedGroups((prev) => {
      if (prev.has(activeGroupId)) return prev;
      const next = new Set(prev);
      next.add(activeGroupId);
      return next;
    });
  }, [activeGroupId]);

  const toggleGroup = (groupId: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  };

  return (
    <GraphEditorSplitLayout
      sidebarWidthPx={220}
      sidebarClassName="bg-neutral-950/30"
      mainClassName="p-0"
      sidebar={(
        <div className="space-y-2">
          <GraphSidebarSection title="Character">
            <div className="rounded border border-neutral-800 bg-neutral-900/40 px-2 py-2">
              <div className="truncate text-xs font-medium text-neutral-200">
                {character.display_name || character.name || character.character_id || (isCreateMode ? 'New Character' : 'Character')}
              </div>
              <div className="mt-0.5 text-[11px] text-neutral-500">
                {isCreateMode ? 'Unsaved draft' : (character.character_id || 'No ID')}
              </div>
            </div>
          </GraphSidebarSection>

          <GraphSidebarSection title="Sections" className="mb-2" titleClassName="mb-1">
            <HierarchicalSidebarNav
              variant="dark"
              className="space-y-1"
              items={TAB_GROUPS.map((group) => ({
                id: group.id,
                label: group.title,
                selectOnClick: false,
                children: group.items.map((tab) => ({ id: tab.id, label: tab.label })),
              }))}
              expandedItemIds={expandedGroups}
              onToggleExpand={toggleGroup}
              onSelectChild={(_, childId) => setActiveTab(childId as TabId)}
              getItemState={(item) => (activeGroupId === item.id ? 'active' : 'inactive')}
              getChildState={(_, child) => (activeTab === child.id ? 'active' : 'inactive')}
            />
          </GraphSidebarSection>

          {!isCreateMode && character.character_id && (
            <GraphSidebarSection title="Versioning" className="mb-0" titleClassName="mb-1">
              <div className="rounded border border-neutral-800 bg-neutral-900/30 px-2 py-1.5 text-[11px] text-neutral-400">
                Version history is shown below the editor.
              </div>
            </GraphSidebarSection>
          )}
        </div>
      )}
      main={(
        <div className="flex h-full flex-col overflow-hidden">
          <div className="border-b border-neutral-800 px-4 py-2">
            <div className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
              Editor Section
            </div>
            <div className="mt-0.5 text-sm font-medium text-neutral-200">
              {activeTabLabel}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            {activeTab === 'identity' && (
              <IdentityTab character={character} onChange={onChange} isCreateMode={isCreateMode} />
            )}
            {activeTab === 'visual' && (
              <VisualTab character={character} onChange={onChange} />
            )}
            {activeTab === 'personality' && (
              <PersonalityTab character={character} onChange={onChange} />
            )}
            {activeTab === 'behavior' && (
              <BehaviorTab character={character} onChange={onChange} />
            )}
            {activeTab === 'voice' && (
              <VoiceTab character={character} onChange={onChange} />
            )}
            {activeTab === 'rendering' && (
              <RenderingTab character={character} onChange={onChange} />
            )}
            {activeTab === 'references' && (
              <ReferencePipelineTab character={character} onChange={onChange} />
            )}
            {activeTab === 'game-link' && (
              <GameLinkTab character={character} onChange={onChange} />
            )}
          </div>

          {!isCreateMode && character.character_id && (
            <div className="border-t border-neutral-800 p-4">
              <VersionHistory
                characterId={character.character_id}
                onEvolved={onEvolved}
              />
            </div>
          )}
        </div>
      )}
    />
  );
}
