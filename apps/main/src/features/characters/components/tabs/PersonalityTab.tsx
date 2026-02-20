import type { CharacterDetail } from '@lib/api/characters';

import { JsonTraitsEditor } from '../JsonTraitsEditor';

const SUGGESTED_KEYS = ['demeanor', 'intelligence', 'temperament', 'motivations'];

export interface PersonalityTabProps {
  character: Partial<CharacterDetail>;
  onChange: (patch: Partial<CharacterDetail>) => void;
}

export function PersonalityTab({ character, onChange }: PersonalityTabProps) {
  return (
    <div className="space-y-3">
      <p className="text-xs text-neutral-500">Define the character's personality traits and motivations.</p>
      <JsonTraitsEditor
        traits={(character.personality_traits as Record<string, unknown>) ?? {}}
        onChange={(personality_traits) => onChange({ personality_traits })}
        suggestedKeys={SUGGESTED_KEYS}
      />
    </div>
  );
}
