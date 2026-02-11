/**
 * Scene Completeness Checks — Built-in providers
 *
 * Each provider inspects one structural aspect of a scene.
 * `registerBuiltinSceneChecks` adds them all to a registry.
 */

import type { CompletenessCheck, SceneAuthoringInput } from './types';
import type { CheckProvider, CompletenessRegistry } from './registry';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function check(
  id: string,
  label: string,
  passes: boolean,
  detail?: string,
): CompletenessCheck {
  return {
    id,
    label,
    status: passes ? 'complete' : 'incomplete',
    detail: passes ? undefined : detail,
  };
}

function warn(
  id: string,
  label: string,
  detail: string,
): CompletenessCheck {
  return { id, label, status: 'warning', detail };
}

// ---------------------------------------------------------------------------
// Individual providers
// ---------------------------------------------------------------------------

export const checkSceneIdentity: CheckProvider<SceneAuthoringInput> = (scene) => [
  check('scene.hasTitle', 'Has a title', (scene.title ?? '').trim().length > 0, 'Scene needs a title'),
];

export const checkSceneStartNode: CheckProvider<SceneAuthoringInput> = (scene) => [
  check('scene.hasStartNode', 'Has a start node', scene.startNodeId != null, 'Define an entry node for the scene'),
];

export const checkSceneNodes: CheckProvider<SceneAuthoringInput> = (scene) => [
  check('scene.hasNodes', 'Has at least one node', (scene.nodes?.length ?? 0) > 0, 'Add at least one node'),
];

export const checkSceneEndNode: CheckProvider<SceneAuthoringInput> = (scene) => {
  const endNodes = (scene.nodes ?? []).filter((n) => n.nodeType === 'end');
  return [
    check(
      'scene.hasEndNode',
      'Has at least one end node',
      endNodes.length > 0,
      'Add an end node so the scene can conclude',
    ),
  ];
};

export const checkSceneReachability: CheckProvider<SceneAuthoringInput> = (scene) => {
  const nodes = scene.nodes ?? [];
  const edges = scene.edges ?? [];
  if (scene.startNodeId == null || nodes.length === 0) return [];

  const adj = new Map<string, string[]>();
  for (const e of edges) {
    const from = String(e.from_node_id);
    const to = String(e.to_node_id);
    if (!adj.has(from)) adj.set(from, []);
    adj.get(from)!.push(to);
  }

  const visited = new Set<string>();
  const queue = [String(scene.startNodeId)];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    if (visited.has(cur)) continue;
    visited.add(cur);
    for (const next of adj.get(cur) ?? []) {
      if (!visited.has(next)) queue.push(next);
    }
  }

  const unreachable = nodes.filter((n) => !visited.has(String(n.id)));
  if (unreachable.length > 0) {
    return [
      warn(
        'scene.unreachableNodes',
        'Unreachable nodes',
        `${unreachable.length} node(s) cannot be reached from the start node`,
      ),
    ];
  }
  return [check('scene.allReachable', 'All nodes reachable', true)];
};

export const checkSceneDeadEnds: CheckProvider<SceneAuthoringInput> = (scene) => {
  const nodes = scene.nodes ?? [];
  const edges = scene.edges ?? [];
  if (scene.startNodeId == null || nodes.length === 0) return [];

  const outDegree = new Map<string, number>();
  for (const e of edges) {
    const from = String(e.from_node_id);
    outDegree.set(from, (outDegree.get(from) ?? 0) + 1);
  }

  const deadEnds = nodes.filter(
    (n) => n.nodeType !== 'end' && (outDegree.get(String(n.id)) ?? 0) === 0,
  );
  if (deadEnds.length > 0) {
    return [
      warn(
        'scene.deadEndNodes',
        'Dead-end nodes',
        `${deadEnds.length} non-end node(s) have no outgoing edges`,
      ),
    ];
  }
  return [];
};

export const checkSceneContent: CheckProvider<SceneAuthoringInput> = (scene) => {
  const nodes = scene.nodes ?? [];
  const contentless = nodes.filter(
    (n) => n.nodeType !== 'end' && n.nodeType !== 'condition' && !n.hasContent,
  );
  if (contentless.length > 0) {
    return [
      warn(
        'scene.contentlessNodes',
        'Nodes without content',
        `${contentless.length} node(s) have no asset or generation config`,
      ),
    ];
  }
  return [];
};

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

/** Register all built-in scene check providers into a registry. */
export function registerBuiltinSceneChecks(registry: CompletenessRegistry): void {
  registry.register('scene', 'core.identity', checkSceneIdentity);
  registry.register('scene', 'core.startNode', checkSceneStartNode);
  registry.register('scene', 'core.nodes', checkSceneNodes);
  registry.register('scene', 'core.endNode', checkSceneEndNode);
  registry.register('scene', 'core.reachability', checkSceneReachability);
  registry.register('scene', 'core.deadEnds', checkSceneDeadEnds);
  registry.register('scene', 'core.content', checkSceneContent);
}
