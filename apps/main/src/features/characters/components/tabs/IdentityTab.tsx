import { Badge, FormField, Input, Select } from '@pixsim7/shared.ui';
import { useEffect, useState } from 'react';

import type { CharacterDetail } from '@lib/api/characters';
import { pixsimClient } from '@lib/api/client';

export interface IdentityTabProps {
  character: Partial<CharacterDetail>;
  onChange: (patch: Partial<CharacterDetail>) => void;
  isCreateMode: boolean;
}

const CATEGORIES = ['creature', 'human', 'hybrid', 'fantasy'];

interface SpeciesOption {
  id: string;
  label: string;
  category: string;
}

function stripPrefix(id: string): string {
  return id.startsWith('species:') ? id.slice(8) : id;
}

export function IdentityTab({ character, onChange, isCreateMode }: IdentityTabProps) {
  const [speciesList, setSpeciesList] = useState<SpeciesOption[]>([]);

  useEffect(() => {
    pixsimClient.get<SpeciesOption[]>('/meta/species')
      .then((list) => setSpeciesList(list))
      .catch(() => {});
  }, []);

  const hasSpeciesSet = !!character.species;
  const speciesLocked = !isCreateMode && hasSpeciesSet;

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

      <FormField
        label="Species"
        helpText={speciesLocked ? 'Locked after save — visual traits are authored against this species.' : undefined}
      >
        {speciesLocked ? (
          <div className="flex items-center gap-2 rounded-md border border-neutral-700/50 bg-neutral-900/50 px-3 py-1.5">
            <span className="text-sm text-neutral-200">{character.species}</span>
            {speciesList.find((s) => stripPrefix(s.id) === character.species) && (
              <Badge color="blue">
                {speciesList.find((s) => stripPrefix(s.id) === character.species)!.label}
              </Badge>
            )}
          </div>
        ) : (
          <Select
            size="sm"
            value={character.species ?? ''}
            onChange={(e) => onChange({ species: e.target.value })}
          >
            <option value="">Select species...</option>
            {speciesList.map((sp) => (
              <option key={sp.id} value={stripPrefix(sp.id)}>
                {sp.label} ({stripPrefix(sp.id)})
              </option>
            ))}
          </Select>
        )}
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
