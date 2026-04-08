import { useEffect, useState } from 'react';

import {
  resolveTemplate,
  type CharacterDetail,
  type AvailableKeyEntry,
} from '@lib/api/characters';

import { JsonTraitsEditor, type KeyHint } from '../JsonTraitsEditor';

const FALLBACK_KEYS = ['build', 'height', 'skin_fur', 'distinguishing_marks', 'eyes', 'clothing', 'accessories'];

export interface VisualTabProps {
  character: Partial<CharacterDetail>;
  onChange: (patch: Partial<CharacterDetail>) => void;
}

function toKeyHints(keys: AvailableKeyEntry[]): KeyHint[] {
  return keys.map((k) => ({
    key: k.key,
    default: k.default,
    origin: k.origin,
  }));
}

export function VisualTab({ character, onChange }: VisualTabProps) {
  const [keyHints, setKeyHints] = useState<KeyHint[] | null>(null);
  const characterId = character.character_id;

  // Fetch species-aware key hints when character has a species
  useEffect(() => {
    if (!characterId) {
      setKeyHints(null);
      return;
    }
    let cancelled = false;
    resolveTemplate({ character_id: characterId })
      .then((res) => {
        if (!cancelled && res.available_keys?.length) {
          setKeyHints(toKeyHints(res.available_keys));
        }
      })
      .catch(() => {
        // Silently fall back to defaults
      });
    return () => { cancelled = true; };
  }, [characterId, character.species]);

  return (
    <div className="space-y-3">
      <p className="text-xs text-neutral-500">
        Define the character's visual appearance traits.
        {character.species && (
          <span className="text-neutral-600">
            {' '}Keys and defaults from species: <span className="text-neutral-400">{character.species}</span>
          </span>
        )}
      </p>
      <JsonTraitsEditor
        traits={(character.visual_traits as Record<string, unknown>) ?? {}}
        onChange={(visual_traits) => onChange({ visual_traits })}
        keyHints={keyHints ?? undefined}
        suggestedKeys={keyHints ? undefined : FALLBACK_KEYS}
      />
    </div>
  );
}
