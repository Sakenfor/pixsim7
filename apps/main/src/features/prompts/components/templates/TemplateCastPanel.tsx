/**
 * TemplateCastPanel — Inline cast UI for templates with castable character bindings.
 *
 * Shows one dropdown per castable role. "Random" picks a random character
 * from the filtered list at roll time.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';

import type { CastSpec, CharacterBindings } from '@lib/api/blockTemplates';
import type { CharacterSummary } from '@lib/api/characters';
import { listCharacters } from '@lib/api/characters';
import { Icon } from '@lib/icons';

interface CastableRole {
  role: string;
  cast: CastSpec;
  defaultCharacterId: string;
}

interface TemplateCastPanelProps {
  roles: CastableRole[];
  onRoll: (bindings: CharacterBindings) => void;
  rolling?: boolean;
}

const RANDOM_SENTINEL = '__random__';

export type { CastableRole };

export function TemplateCastPanel({ roles, onRoll, rolling }: TemplateCastPanelProps) {
  // Per-role selection: character_id or RANDOM_SENTINEL
  const [selections, setSelections] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const r of roles) {
      init[r.role] = RANDOM_SENTINEL;
    }
    return init;
  });

  // Per-cast-spec character lists, keyed by a cache key derived from filters
  const [characterLists, setCharacterLists] = useState<
    Record<string, CharacterSummary[]>
  >({});
  const [loading, setLoading] = useState(true);

  // Deduplicate filter combos so we don't fetch the same list twice
  const filterCombos = useMemo(() => {
    const seen = new Map<string, { species?: string; category?: string }>();
    for (const r of roles) {
      const key = `${r.cast.filter_species ?? ''}|${r.cast.filter_category ?? ''}`;
      if (!seen.has(key)) {
        seen.set(key, {
          species: r.cast.filter_species,
          category: r.cast.filter_category,
        });
      }
    }
    return seen;
  }, [roles]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    const fetches = [...filterCombos.entries()].map(async ([key, filters]) => {
      const chars = await listCharacters({
        species: filters.species,
        category: filters.category,
        limit: 50,
      });
      return [key, chars] as const;
    });

    void Promise.all(fetches).then((results) => {
      if (cancelled) return;
      const map: Record<string, CharacterSummary[]> = {};
      for (const [key, chars] of results) {
        map[key] = chars;
      }
      setCharacterLists(map);
      setLoading(false);
    });

    return () => { cancelled = true; };
  }, [filterCombos]);

  const cacheKeyForRole = useCallback(
    (r: CastableRole) =>
      `${r.cast.filter_species ?? ''}|${r.cast.filter_category ?? ''}`,
    [],
  );

  const handleRoll = useCallback(() => {
    const bindings: CharacterBindings = {};
    for (const r of roles) {
      const selected = selections[r.role];
      if (selected === RANDOM_SENTINEL) {
        const chars = characterLists[cacheKeyForRole(r)] ?? [];
        if (chars.length > 0) {
          const pick = chars[Math.floor(Math.random() * chars.length)];
          bindings[r.role] = { character_id: pick.character_id };
        } else {
          // Fall back to template default
          bindings[r.role] = { character_id: r.defaultCharacterId };
        }
      } else {
        bindings[r.role] = { character_id: selected };
      }
    }
    onRoll(bindings);
  }, [roles, selections, characterLists, cacheKeyForRole, onRoll]);

  return (
    <div className="flex flex-col gap-2 px-2.5 py-2">
      <div className="flex items-center gap-1.5 text-[11px] font-medium text-neutral-600 dark:text-neutral-300">
        <Icon name="users" size={12} className="shrink-0" />
        Cast
      </div>

      {loading ? (
        <div className="text-[11px] text-neutral-500 py-1">Loading characters...</div>
      ) : (
        roles.map((r) => {
          const chars = characterLists[cacheKeyForRole(r)] ?? [];
          return (
            <div key={r.role} className="flex items-center gap-2">
              <span className="text-[11px] text-neutral-500 dark:text-neutral-400 w-20 truncate shrink-0">
                {r.cast.label}
              </span>
              <select
                value={selections[r.role] ?? RANDOM_SENTINEL}
                onChange={(e) =>
                  setSelections((prev) => ({ ...prev, [r.role]: e.target.value }))
                }
                className="flex-1 text-[11px] bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded px-1.5 py-1 text-neutral-700 dark:text-neutral-200 outline-none min-w-0"
              >
                <option value={RANDOM_SENTINEL}>Random</option>
                {chars.map((c) => (
                  <option key={c.character_id} value={c.character_id}>
                    {c.display_name ?? c.name ?? c.character_id}
                  </option>
                ))}
              </select>
            </div>
          );
        })
      )}

      <button
        type="button"
        disabled={rolling || loading}
        onClick={handleRoll}
        className="mt-1 px-3 py-1.5 rounded text-xs font-medium bg-blue-600 text-white hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
      >
        <Icon name="shuffle" size={12} className={rolling ? 'animate-spin' : ''} />
        Roll
      </button>
    </div>
  );
}
