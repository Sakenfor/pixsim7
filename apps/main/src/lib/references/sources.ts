/**
 * Built-in reference sources — auto-register on import.
 *
 * Import this module once (e.g. from app init) to register the core sources.
 * Features can also register their own sources directly via referenceRegistry.
 */
import { pixsimClient } from '@lib/api/client';

import { referenceRegistry } from './registry';

referenceRegistry.register({
  type: 'plan',
  icon: 'clipboard',
  label: 'Plans',
  fetch: () =>
    pixsimClient
      .get<{ plans: Array<{ id: string; title: string; status: string; stage?: string }> }>('/dev/plans')
      .then((r) =>
        (r.plans || []).map((p) => ({
          type: 'plan' as const,
          id: p.id,
          label: p.title,
          detail: `${p.status}${p.stage ? ` · ${p.stage}` : ''}`,
        })),
      )
      .catch(() => []),
});

referenceRegistry.register({
  type: 'world',
  icon: 'globe',
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
  label: 'Projects',
  fetch: () =>
    pixsimClient
      .get<Array<{ project_id: string; name: string; world_name?: string }>>('/game/worlds/projects/snapshots')
      .then((r) =>
        (r || []).map((p) => ({
          type: 'project' as const,
          id: p.project_id,
          label: p.name,
          detail: p.world_name,
        })),
      )
      .catch(() => []),
});
