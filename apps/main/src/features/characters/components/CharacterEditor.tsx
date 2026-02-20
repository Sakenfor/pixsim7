import { Tabs } from '@pixsim7/shared.ui';
import { useState } from 'react';

import type { CharacterDetail } from '@lib/api/characters';

import { VersionHistory } from './VersionHistory';
import { BehaviorTab } from './tabs/BehaviorTab';
import { GameLinkTab } from './tabs/GameLinkTab';
import { IdentityTab } from './tabs/IdentityTab';
import { PersonalityTab } from './tabs/PersonalityTab';
import { RenderingTab } from './tabs/RenderingTab';
import { VisualTab } from './tabs/VisualTab';
import { VoiceTab } from './tabs/VoiceTab';

const TABS = [
  { id: 'identity', label: 'Identity' },
  { id: 'visual', label: 'Visual' },
  { id: 'personality', label: 'Personality' },
  { id: 'behavior', label: 'Behavior' },
  { id: 'voice', label: 'Voice' },
  { id: 'rendering', label: 'Rendering' },
  { id: 'game-link', label: 'Game Link' },
] as const;

type TabId = (typeof TABS)[number]['id'];

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

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <Tabs
        tabs={[...TABS]}
        value={activeTab}
        onChange={(id) => setActiveTab(id as TabId)}
      />

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
  );
}
