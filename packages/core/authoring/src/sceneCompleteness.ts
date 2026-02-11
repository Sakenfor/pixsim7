/**
 * Scene Completeness Checks
 *
 * Evaluates how "ready for play" a scene is by checking structural
 * requirements: start node, end nodes, reachability, dead ends.
 */

import type {
  CompletenessCheck,
  EntityCompleteness,
  SceneAuthoringInput,
} from './types';

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

/**
 * Run all completeness checks for a single scene.
 */
export function checkSceneCompleteness(scene: SceneAuthoringInput): EntityCompleteness {
  const checks: CompletenessCheck[] = [];
  const nodes = scene.nodes ?? [];
  const edges = scene.edges ?? [];

  // --- Identity ---
  checks.push(
    check('scene.hasTitle', 'Has a title', (scene.title ?? '').trim().length > 0, 'Scene needs a title'),
  );

  // --- Start node ---
  const hasStart = scene.startNodeId != null;
  checks.push(
    check('scene.hasStartNode', 'Has a start node', hasStart, 'Define an entry node for the scene'),
  );

  // --- Nodes exist ---
  checks.push(
    check('scene.hasNodes', 'Has at least one node', nodes.length > 0, 'Add at least one node'),
  );

  // --- End node ---
  const endNodes = nodes.filter((n) => n.nodeType === 'end');
  checks.push(
    check(
      'scene.hasEndNode',
      'Has at least one end node',
      endNodes.length > 0,
      'Add an end node so the scene can conclude',
    ),
  );

  // --- Reachability (BFS from start) ---
  if (hasStart && nodes.length > 0) {
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
      checks.push(
        warn(
          'scene.unreachableNodes',
          'Unreachable nodes',
          `${unreachable.length} node(s) cannot be reached from the start node`,
        ),
      );
    } else {
      checks.push(check('scene.allReachable', 'All nodes reachable', true));
    }

    // --- Dead-end non-end nodes ---
    const outDegree = new Map<string, number>();
    for (const e of edges) {
      const from = String(e.from_node_id);
      outDegree.set(from, (outDegree.get(from) ?? 0) + 1);
    }
    const deadEnds = nodes.filter(
      (n) => n.nodeType !== 'end' && (outDegree.get(String(n.id)) ?? 0) === 0,
    );
    if (deadEnds.length > 0) {
      checks.push(
        warn(
          'scene.deadEndNodes',
          'Dead-end nodes',
          `${deadEnds.length} non-end node(s) have no outgoing edges`,
        ),
      );
    }
  }

  // --- Content coverage ---
  const contentless = nodes.filter(
    (n) => n.nodeType !== 'end' && n.nodeType !== 'condition' && !n.hasContent,
  );
  if (contentless.length > 0) {
    checks.push(
      warn(
        'scene.contentlessNodes',
        'Nodes without content',
        `${contentless.length} node(s) have no asset or generation config`,
      ),
    );
  }

  const passed = checks.filter((c) => c.status === 'complete').length;
  const total = checks.length;

  return {
    entityType: 'scene',
    entityId: scene.id,
    entityName: scene.title,
    checks,
    score: total === 0 ? 1 : passed / total,
  };
}

/**
 * Run completeness checks for a batch of scenes.
 */
export function checkSceneBatchCompleteness(
  scenes: SceneAuthoringInput[],
): EntityCompleteness[] {
  return scenes.map(checkSceneCompleteness);
}
