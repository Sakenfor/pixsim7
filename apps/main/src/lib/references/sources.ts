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

interface PlanEntry {
  id: string;
  title: string;
  status: string;
  stage?: string;
  parent_id?: string | null;
  children?: Array<{ id: string; title: string; status: string; stage?: string }>;
}

function _buildPlanTree(plans: PlanEntry[]): import('./types').ReferenceItem[] {
  const sorted = [...plans].sort((a, b) => (_STATUS_ORDER[a.status] ?? 9) - (_STATUS_ORDER[b.status] ?? 9));
  const childIds = new Set<string>();
  // Collect children from the inline `children` array on each plan
  for (const p of sorted) {
    if (p.children) {
      for (const c of p.children) childIds.add(c.id);
    }
  }
  // Also collect plans that have parent_id set (in case children aren't inlined)
  for (const p of sorted) {
    if (p.parent_id) childIds.add(p.id);
  }

  const result: import('./types').ReferenceItem[] = [];
  for (const p of sorted) {
    // Skip children at top level — they'll appear under their parent
    if (childIds.has(p.id)) continue;
    result.push({
      type: 'plan' as const,
      id: p.id,
      label: p.title,
      detail: `${p.status}${p.stage ? ` · ${p.stage}` : ''}`,
      detailColor: _STATUS_COLOR[p.status],
    });
    // Append inline children directly beneath
    if (p.children && p.children.length > 0) {
      const sortedChildren = [...p.children].sort((a, b) => (_STATUS_ORDER[a.status] ?? 9) - (_STATUS_ORDER[b.status] ?? 9));
      for (const c of sortedChildren) {
        result.push({
          type: 'plan' as const,
          id: c.id,
          label: c.title,
          detail: `${c.status}${c.stage ? ` · ${c.stage}` : ''}`,
          detailColor: _STATUS_COLOR[c.status],
          indent: 1,
        });
      }
    }
  }
  return result;
}

referenceRegistry.register({
  type: 'plan',
  icon: 'clipboard',
  color: 'text-blue-400',
  label: 'Plans',
  fetch: () =>
    pixsimClient
      .get<{ plans: PlanEntry[] }>('/dev/plans', { params: { limit: 200, include_hidden: false } })
      .then((r) => _buildPlanTree(r.plans || []))
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
