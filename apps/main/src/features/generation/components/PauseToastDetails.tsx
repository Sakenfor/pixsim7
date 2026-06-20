/**
 * Inline detail body for the bottom-right pause toast (v2 expand).
 *
 * Renders the shared GenerationGroupList scoped to exactly the generation ids
 * carried by one toast, reading fresh models from the store so the inline
 * Resume / Retry / Cancel actions act on current state (and rows drop out as
 * they leave the paused state).
 */
import { useMemo } from 'react';

import type { GenerationModel } from '../models';
import { useGenerationsStore } from '../stores/generationsStore';

import { GenerationGroupList } from './GenerationGroupList';

export function PauseToastDetails({ ids }: { ids: number[] }) {
  const generations = useGenerationsStore((s) => s.generations);

  const scoped = useMemo(() => {
    const out: GenerationModel[] = [];
    for (const id of ids) {
      const g = generations.get(id);
      if (g) out.push(g);
    }
    return out;
  }, [generations, ids]);

  return (
    <GenerationGroupList
      generations={scoped}
      groupBy="prompt"
      tone="paused"
      emptyLabel="These generations are no longer paused"
    />
  );
}
