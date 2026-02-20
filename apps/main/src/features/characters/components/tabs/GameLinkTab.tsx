import { FormField, Select, Switch } from '@pixsim7/shared.ui';
import { useEffect, useState } from 'react';

import { listGameNpcs, type GameNpcSummary } from '@lib/api/game';
import type { CharacterDetail } from '@lib/api/characters';

export interface GameLinkTabProps {
  character: Partial<CharacterDetail>;
  onChange: (patch: Partial<CharacterDetail>) => void;
}

export function GameLinkTab({ character, onChange }: GameLinkTabProps) {
  const [npcs, setNpcs] = useState<GameNpcSummary[]>([]);

  useEffect(() => {
    listGameNpcs()
      .then(setNpcs)
      .catch(() => {});
  }, []);

  return (
    <div className="space-y-4">
      <FormField label="Game NPC" helpText="Link this character to a game NPC for sync">
        <Select
          size="sm"
          value={character.game_npc_id != null ? String(character.game_npc_id) : ''}
          onChange={(e) =>
            onChange({ game_npc_id: e.target.value ? Number(e.target.value) : null })
          }
        >
          <option value="">None</option>
          {npcs.map((npc) => (
            <option key={npc.id} value={String(npc.id)}>
              {npc.name}
            </option>
          ))}
        </Select>
      </FormField>

      <FormField label="Sync with Game">
        <div className="flex items-center gap-2">
          <Switch
            checked={character.sync_with_game ?? false}
            onCheckedChange={(checked) => onChange({ sync_with_game: checked })}
            size="sm"
          />
          <span className="text-xs text-neutral-400">
            Auto-sync changes with game NPC
          </span>
        </div>
      </FormField>
    </div>
  );
}
