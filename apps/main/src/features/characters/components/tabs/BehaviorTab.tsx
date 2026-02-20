import type { CharacterDetail } from '@lib/api/characters';

import { JsonTraitsEditor } from '../JsonTraitsEditor';

const SUGGESTED_KEYS = ['movement_style', 'social_behavior', 'combat_style', 'quirks'];

export interface BehaviorTabProps {
  character: Partial<CharacterDetail>;
  onChange: (patch: Partial<CharacterDetail>) => void;
}

export function BehaviorTab({ character, onChange }: BehaviorTabProps) {
  return (
    <div className="space-y-3">
      <p className="text-xs text-neutral-500">Define behavioral patterns and quirks.</p>
      <JsonTraitsEditor
        traits={(character.behavioral_patterns as Record<string, unknown>) ?? {}}
        onChange={(behavioral_patterns) => onChange({ behavioral_patterns })}
        suggestedKeys={SUGGESTED_KEYS}
      />
    </div>
  );
}
