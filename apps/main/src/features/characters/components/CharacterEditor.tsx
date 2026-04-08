import { HierarchicalSidebarNav, SidebarPaneShell } from '@pixsim7/shared.ui';
import { useEffect, useState } from 'react';

import type { CharacterDetail } from '@lib/api/characters';

import { BehaviorTab } from './tabs/BehaviorTab';
import { GameLinkTab } from './tabs/GameLinkTab';
import { IdentityTab } from './tabs/IdentityTab';
import { PersonalityTab } from './tabs/PersonalityTab';
import { ReferencePipelineTab, type ProductionSection } from './tabs/ReferencePipelineTab';
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
  { id: 'ref-ingest', label: 'Ingest' },
  { id: 'ref-slots', label: 'Slots' },
  { id: 'ref-assets', label: 'Assets' },
  { id: 'ref-scene-prep', label: 'Scene Prep' },
  { id: 'ref-quick-batch', label: 'Quick Batch' },
  { id: 'ref-templates', label: 'Templates' },
  { id: 'ref-tagging', label: 'Tagging' },
  { id: 'game-link', label: 'Game Link' },
] as const;

const REF_SECTION_MAP: Partial<Record<string, ProductionSection>> = {
  'ref-ingest': 'ingest',
  'ref-slots': 'slots',
  'ref-assets': 'assets',
  'ref-scene-prep': 'scene-prep',
  'ref-quick-batch': 'quick-batch',
  'ref-templates': 'templates',
  'ref-tagging': 'tagging',
};

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
    items: TABS.filter((tab) =>
      ['ref-ingest', 'ref-slots', 'ref-assets', 'ref-scene-prep', 'ref-quick-batch', 'ref-templates', 'ref-tagging', 'game-link'].includes(tab.id),
    ),
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
  const refSection = REF_SECTION_MAP[activeTab] ?? null;
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
    <div className="flex h-full overflow-hidden">
      <SidebarPaneShell
        title="Sections"
        variant="dark"
        collapsible
        resizable
        expandedWidth={200}
        persistKey="character-editor-nav"
        bodyScrollable
        autoHideTitle={false}
      >
        <div className="space-y-3 px-1">
          <div className="rounded border border-neutral-800 bg-neutral-900/40 px-2 py-2">
            <div className="truncate text-xs font-medium text-neutral-200">
              {character.display_name || character.name || character.character_id || (isCreateMode ? 'New Character' : 'Character')}
            </div>
            <div className="mt-0.5 text-[11px] text-neutral-500">
              {isCreateMode ? 'Unsaved draft' : (character.character_id || 'No ID')}
            </div>
          </div>

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
        </div>
      </SidebarPaneShell>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <div className="shrink-0 border-b border-neutral-800 px-4 py-2">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-neutral-600">
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
          {refSection != null && (
            <ReferencePipelineTab character={character} onChange={onChange} section={refSection} />
          )}
          {activeTab === 'game-link' && (
            <GameLinkTab character={character} onChange={onChange} />
          )}
        </div>

        {!isCreateMode && character.character_id && (
          <div className="shrink-0 border-t border-neutral-800 p-4">
            <VersionHistory
              characterId={character.character_id}
              onEvolved={onEvolved}
            />
          </div>
        )}
      </div>
    </div>
  );
}
