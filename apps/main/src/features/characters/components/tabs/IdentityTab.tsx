import { FormField, Input, Select } from '@pixsim7/shared.ui';

import type { CharacterDetail } from '@lib/api/characters';

export interface IdentityTabProps {
  character: Partial<CharacterDetail>;
  onChange: (patch: Partial<CharacterDetail>) => void;
  isCreateMode: boolean;
}

const CATEGORIES = ['creature', 'human', 'hybrid', 'fantasy'];

export function IdentityTab({ character, onChange, isCreateMode }: IdentityTabProps) {
  return (
    <div className="space-y-4">
      <FormField label="Character ID" helpText="Unique slug identifier (e.g. gorilla_01)">
        <Input
          size="sm"
          value={character.character_id ?? ''}
          onChange={(e) => onChange({ character_id: e.target.value })}
          disabled={!isCreateMode}
          placeholder="gorilla_01"
        />
      </FormField>

      <FormField label="Name">
        <Input
          size="sm"
          value={character.name ?? ''}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder="Koba"
        />
      </FormField>

      <FormField label="Display Name" helpText="Auto-generated if left empty">
        <Input
          size="sm"
          value={character.display_name ?? ''}
          onChange={(e) => onChange({ display_name: e.target.value })}
          placeholder="Koba the Gorilla"
        />
      </FormField>

      <FormField label="Category">
        <Select
          size="sm"
          value={character.category ?? 'creature'}
          onChange={(e) => onChange({ category: e.target.value })}
        >
          {CATEGORIES.map((cat) => (
            <option key={cat} value={cat}>
              {cat}
            </option>
          ))}
        </Select>
      </FormField>

      <FormField label="Species">
        <Input
          size="sm"
          value={character.species ?? ''}
          onChange={(e) => onChange({ species: e.target.value })}
          placeholder="gorilla"
        />
      </FormField>

      <FormField label="Archetype">
        <Input
          size="sm"
          value={character.archetype ?? ''}
          onChange={(e) => onChange({ archetype: e.target.value })}
          placeholder="warrior"
        />
      </FormField>
    </div>
  );
}
