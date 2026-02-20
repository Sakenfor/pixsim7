import type { CharacterDetail } from '@lib/api/characters';

import { JsonTraitsEditor } from '../JsonTraitsEditor';

const SUGGESTED_KEYS = ['voice_type', 'speech_pattern', 'breathing', 'signature_sounds'];

export interface VoiceTabProps {
  character: Partial<CharacterDetail>;
  onChange: (patch: Partial<CharacterDetail>) => void;
}

export function VoiceTab({ character, onChange }: VoiceTabProps) {
  return (
    <div className="space-y-3">
      <p className="text-xs text-neutral-500">Define voice and sound profile.</p>
      <JsonTraitsEditor
        traits={(character.voice_profile as Record<string, unknown>) ?? {}}
        onChange={(voice_profile) => onChange({ voice_profile })}
        suggestedKeys={SUGGESTED_KEYS}
      />
    </div>
  );
}
