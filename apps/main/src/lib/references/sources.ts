/**
 * Built-in reference sources — auto-register on import.
 *
 * Import this module once (e.g. from app init) to register the core sources.
 * Features can also register their own sources directly via referenceRegistry.
 */
import { pixsimClient } from '@lib/api/client';

import { referenceRegistry } from './registry';

const _STATUS_ORDER: Record<string, number> = { active: 0, done: 1, parked: 2 };
const _STATUS_COLOR: Record<string, string> = {
  active: 'text-emerald-400',
  done: 'text-neutral-500',
  parked: 'text-amber-400',
};

referenceRegistry.register({
  type: 'plan',
  icon: 'clipboard',
  color: 'text-blue-400',
  label: 'Plans',
  fetch: () =>
    pixsimClient
      .get<{ plans: Array<{ id: string; title: string; status: string; stage?: string }> }>('/dev/plans', { params: { limit: 200, include_hidden: false } })
      .then((r) =>
        (r.plans || [])
          .sort((a, b) => (_STATUS_ORDER[a.status] ?? 9) - (_STATUS_ORDER[b.status] ?? 9))
          .map((p) => ({
            type: 'plan' as const,
            id: p.id,
            label: p.title,
            detail: `${p.status}${p.stage ? ` · ${p.stage}` : ''}`,
            detailColor: _STATUS_COLOR[p.status],
          })),
      )
      .catch(() => []),
});

referenceRegistry.register({
  type: 'world',
  icon: 'globe',
  color: 'text-emerald-400',
  label: 'Worlds',
  fetch: () =>
    pixsimClient
      .get<{ items: Array<{ id: number; name: string; description?: string }> }>('/game/worlds/')
      .then((r) =>
        (r.items || []).map((w) => ({
          type: 'world' as const,
          id: String(w.id),
          label: w.name,
          detail: w.description,
        })),
      )
      .catch(() => []),
});

referenceRegistry.register({
  type: 'project',
  icon: 'folder',
  color: 'text-amber-400',
  label: 'Projects',
  fetch: () =>
    pixsimClient
      .get<Array<{ id: number; name: string; source_world_id?: number }>>('/game/worlds/projects/snapshots')
      .then((r) =>
        (r || []).map((p) => ({
          type: 'project' as const,
          id: String(p.id),
          label: p.name,
        })),
      )
      .catch(() => []),
});
