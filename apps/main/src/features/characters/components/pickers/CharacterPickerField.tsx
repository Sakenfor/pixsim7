/**
 * CharacterPickerField
 *
 * Inline-search picker for a single character. Mirrors the surface-level
 * shape of AssetPickerField but without a gallery affordance — there is
 * no character-gallery analog yet, so just a debounced inline search +
 * selection display + clear button.
 *
 * Consumed by RefPickerField when an op_ref.capability resolves to a
 * character (subject / target). The dispatcher converts the picked
 * value's `character_id` into the canonical `character:<character_id>`
 * entity-ref token the executor expects.
 */
import { Search, User, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { searchCharacters, type CharacterSummary } from '@lib/api/characters';

export interface PickedCharacter {
  /** UUID PK from the characters table. */
  id: string;
  /** Stable user-facing string slug (e.g. 'anne_v3'). Use this as the
   *  identity in entity-refs — it survives version bumps where `id`
   *  doesn't. */
  character_id: string;
  name: string;
  species: string | null;
}

export interface CharacterPickerFieldProps {
  value?: PickedCharacter | null;
  onChange: (character: PickedCharacter | null) => void;
  label?: string;
  className?: string;
  placeholder?: string;
  /** Max search results shown in the dropdown. */
  limit?: number;
}

const SEARCH_DEBOUNCE_MS = 250;

function characterSummaryToPicked(c: CharacterSummary): PickedCharacter {
  return {
    id: c.id,
    character_id: c.character_id,
    name: c.display_name || c.name || c.character_id,
    species: c.species,
  };
}

export function CharacterPickerField({
  value,
  onChange,
  label,
  className,
  placeholder = 'Search characters…',
  limit = 8,
}: CharacterPickerFieldProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CharacterSummary[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout>>();
  // Monotonic request id — discard stale responses when the user types
  // faster than the search resolves.
  const requestIdRef = useRef(0);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    clearTimeout(searchTimerRef.current);
    if (!isOpen) return;
    const trimmed = query.trim();
    // Empty query while open: show recent / first page (limit results).
    const requestId = ++requestIdRef.current;
    searchTimerRef.current = setTimeout(async () => {
      setIsLoading(true);
      try {
        const response = await searchCharacters(trimmed || '', limit);
        if (requestIdRef.current !== requestId) return;
        setResults(response);
      } catch {
        if (requestIdRef.current !== requestId) return;
        setResults([]);
      } finally {
        if (requestIdRef.current === requestId) {
          setIsLoading(false);
        }
      }
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(searchTimerRef.current);
  }, [query, isOpen, limit]);

  const handleSelect = useCallback(
    (c: CharacterSummary) => {
      onChange(characterSummaryToPicked(c));
      setIsOpen(false);
      setQuery('');
    },
    [onChange],
  );

  const handleClear = useCallback(() => {
    onChange(null);
    setQuery('');
    setIsOpen(false);
  }, [onChange]);

  return (
    <div ref={containerRef} className={className}>
      {label && (
        <label className="block text-[10px] text-neutral-500 dark:text-neutral-400 mb-0.5">
          {label}
        </label>
      )}

      {value ? (
        <div className="flex items-center gap-2 p-1.5 border border-neutral-200 dark:border-neutral-700 rounded bg-neutral-50 dark:bg-neutral-800/50">
          <div className="w-8 h-8 rounded bg-neutral-200 dark:bg-neutral-700 flex items-center justify-center flex-shrink-0">
            <User className="w-4 h-4 text-neutral-400" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs text-neutral-700 dark:text-neutral-200 truncate">
              {value.name}
            </div>
            <div className="text-[10px] text-neutral-400 truncate">
              {value.species ? `${value.species} · ` : ''}{value.character_id}
            </div>
          </div>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={handleClear}
            className="p-1 rounded hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300"
            title="Clear character"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ) : (
        <div className="relative">
          <div className="flex items-center gap-1 px-2 py-1 border border-neutral-200 dark:border-neutral-700 rounded bg-white dark:bg-neutral-900">
            <Search className="w-3 h-3 text-neutral-400 flex-shrink-0" />
            <input
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setIsOpen(true);
              }}
              onFocus={() => setIsOpen(true)}
              placeholder={placeholder}
              className="flex-1 min-w-0 bg-transparent text-xs text-neutral-700 dark:text-neutral-200 placeholder:text-neutral-400 focus:outline-none"
            />
          </div>

          {isOpen && (
            <div className="absolute z-50 left-0 right-0 mt-1 max-h-56 overflow-y-auto rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 shadow-md">
              {isLoading && (
                <div className="px-2 py-1.5 text-[11px] text-neutral-500">Searching…</div>
              )}
              {!isLoading && results.length === 0 && (
                <div className="px-2 py-1.5 text-[11px] text-neutral-400 italic">
                  {query.trim() ? 'No characters match' : 'Type to search…'}
                </div>
              )}
              {!isLoading && results.map((c) => (
                <button
                  type="button"
                  key={c.id}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => handleSelect(c)}
                  className="w-full text-left px-2 py-1.5 text-xs hover:bg-neutral-100 dark:hover:bg-neutral-800 flex items-center gap-2"
                >
                  <User className="w-3 h-3 text-neutral-400 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="truncate text-neutral-700 dark:text-neutral-200">
                      {c.display_name || c.name || c.character_id}
                    </div>
                    <div className="text-[10px] text-neutral-400 truncate">
                      {c.species ? `${c.species} · ` : ''}{c.character_id}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
