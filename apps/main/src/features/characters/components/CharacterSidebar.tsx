import { Badge, Button, Input, Select } from '@pixsim7/shared.ui';
import clsx from 'clsx';
import { useCallback, useEffect, useRef, useState } from 'react';

import {
  searchCharacters,
  type CharacterSummary,
} from '@lib/api/characters';

const CATEGORIES = [
  { value: '', label: 'All Categories' },
  { value: 'creature', label: 'Creature' },
  { value: 'human', label: 'Human' },
  { value: 'hybrid', label: 'Hybrid' },
  { value: 'fantasy', label: 'Fantasy' },
];

export interface CharacterSidebarProps {
  characters: CharacterSummary[];
  selectedCharacterId: string | null;
  onSelect: (characterId: string) => void;
  onCreateNew: () => void;
  onSearchResults: (results: CharacterSummary[] | null) => void;
  embedded?: boolean;
  className?: string;
}

export function CharacterSidebar({
  characters,
  selectedCharacterId,
  onSelect,
  onCreateNew,
  onSearchResults,
  embedded = false,
  className,
}: CharacterSidebarProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const doSearch = useCallback(
    async (q: string) => {
      if (q.length > 2) {
        try {
          const results = await searchCharacters(q);
          onSearchResults(results);
        } catch {
          // fall back to full list
          onSearchResults(null);
        }
      } else {
        onSearchResults(null);
      }
    },
    [onSearchResults],
  );

  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(searchQuery), 300);
    return () => clearTimeout(debounceRef.current);
  }, [searchQuery, doSearch]);

  const filtered = categoryFilter
    ? characters.filter((c) => c.category === categoryFilter)
    : characters;

  return (
    <div
      className={clsx(
        'flex h-full flex-col',
        embedded ? 'w-full' : 'w-64 shrink-0 border-r border-neutral-800',
        className,
      )}
    >
      <div className="space-y-2 p-3">
        <Input
          size="sm"
          placeholder="Search characters..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        <Select
          size="sm"
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
        >
          {CATEGORIES.map((cat) => (
            <option key={cat.value} value={cat.value}>
              {cat.label}
            </option>
          ))}
        </Select>
      </div>

      <div className="flex-1 overflow-y-auto">
        {filtered.map((char) => (
          <button
            key={char.character_id}
            className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-neutral-800 ${
              selectedCharacterId === char.character_id
                ? 'bg-neutral-800 text-neutral-100'
                : 'text-neutral-400'
            }`}
            onClick={() => onSelect(char.character_id)}
          >
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium">
                {char.display_name || char.name || char.character_id}
              </div>
              <div className="flex items-center gap-1.5">
                {char.species && (
                  <Badge color="blue">{char.species}</Badge>
                )}
                <span className="text-xs text-neutral-600">
                  {char.usage_count} uses
                </span>
              </div>
            </div>
          </button>
        ))}

        {filtered.length === 0 && (
          <div className="px-3 py-6 text-center text-xs text-neutral-600">
            No characters found
          </div>
        )}
      </div>

      <div className="border-t border-neutral-800 p-3">
        <Button variant="primary" size="sm" className="w-full" onClick={onCreateNew}>
          New Character
        </Button>
      </div>
    </div>
  );
}
