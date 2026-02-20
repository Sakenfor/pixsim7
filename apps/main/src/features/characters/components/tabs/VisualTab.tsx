import type { CharacterDetail } from '@lib/api/characters';

import { JsonTraitsEditor } from '../JsonTraitsEditor';

const SUGGESTED_KEYS = ['build', 'height', 'skin_fur', 'distinguishing_marks', 'eyes', 'clothing', 'accessories'];

export interface VisualTabProps {
  character: Partial<CharacterDetail>;
  onChange: (patch: Partial<CharacterDetail>) => void;
}

export function VisualTab({ character, onChange }: VisualTabProps) {
  return (
    <div className="space-y-3">
      <p className="text-xs text-neutral-500">Define the character's visual appearance traits.</p>
      <JsonTraitsEditor
        traits={(character.visual_traits as Record<string, unknown>) ?? {}}
        onChange={(visual_traits) => onChange({ visual_traits })}
        suggestedKeys={SUGGESTED_KEYS}
      />
    </div>
  );
}
