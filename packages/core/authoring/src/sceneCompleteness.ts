/**
 * Scene Entity Schema
 *
 * Field-level scene completeness.
 */

import { entity, field } from './entitySchema';
import type { EntitySchema } from './entitySchema';
import type { SceneAuthoringInput } from './types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function hasReachabilityContext(scene: SceneAuthoringInput): boolean {
  return scene.startNodeId != null && (scene.nodes?.length ?? 0) > 0;
}

function countUnreachableNodes(scene: SceneAuthoringInput): number {
  if (!hasReachabilityContext(scene)) return 0;

  const nodes = scene.nodes ?? [];
  const edges = scene.edges ?? [];

  const adjacency = new Map<string, string[]>();
  for (const edge of edges) {
    const from = String(edge.from_node_id);
    const to = String(edge.to_node_id);
    if (!adjacency.has(from)) adjacency.set(from, []);
    adjacency.get(from)!.push(to);
  }

  const visited = new Set<string>();
  const queue = [String(scene.startNodeId)];
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);
    for (const next of adjacency.get(current) ?? []) {
      if (!visited.has(next)) queue.push(next);
    }
  }

  return nodes.filter((node) => !visited.has(String(node.id))).length;
}

function countDeadEnds(scene: SceneAuthoringInput): number {
  if (!hasReachabilityContext(scene)) return 0;

  const nodes = scene.nodes ?? [];
  const edges = scene.edges ?? [];

  const outDegree = new Map<string, number>();
  for (const edge of edges) {
    const from = String(edge.from_node_id);
    outDegree.set(from, (outDegree.get(from) ?? 0) + 1);
  }

  return nodes.filter(
    (node) => node.nodeType !== 'end' && (outDegree.get(String(node.id)) ?? 0) === 0,
  ).length;
}

function countContentlessNodes(scene: SceneAuthoringInput): number {
  const nodes = scene.nodes ?? [];
  return nodes.filter(
    (node) => node.nodeType !== 'end' && node.nodeType !== 'condition' && !node.hasContent,
  ).length;
}

// ---------------------------------------------------------------------------
// Schema factory
// ---------------------------------------------------------------------------

export function createSceneSchema(): EntitySchema<SceneAuthoringInput> {
  return entity<SceneAuthoringInput>('scene', {
    // ---- Identity ---------------------------------------------------------
    title: field
      .string<SceneAuthoringInput>('Has a title', 'Scene needs a title')
      .id('scene.hasTitle'),

    // ---- Core structure ---------------------------------------------------
    startNodeId: field
      .ref<SceneAuthoringInput>('Has a start node', 'Define an entry node for the scene')
      .id('scene.hasStartNode'),

    nodes: field
      .array<SceneAuthoringInput>('Has at least one node', 'Add at least one node')
      .id('scene.hasNodes'),

    endNode: field
      .custom<SceneAuthoringInput>(
        'Has at least one end node',
        (scene) => (scene.nodes ?? []).some((node) => node.nodeType === 'end'),
        'Add an end node so the scene can conclude',
      )
      .id('scene.hasEndNode'),

    // ---- Reachability -----------------------------------------------------
    allReachable: field
      .custom<SceneAuthoringInput>(
        'All nodes reachable',
        (scene) => {
          if (!hasReachabilityContext(scene)) return 'skip';
          return countUnreachableNodes(scene) === 0 ? true : 'skip';
        },
      )
      .id('scene.allReachable'),

    unreachableNodes: field
      .custom<SceneAuthoringInput>(
        'Unreachable nodes',
        (scene) => {
          if (!hasReachabilityContext(scene)) return 'skip';
          return countUnreachableNodes(scene) > 0 ? false : 'skip';
        },
        (scene) =>
          `${countUnreachableNodes(scene)} node(s) cannot be reached from the start node`,
      )
      .warn()
      .id('scene.unreachableNodes'),

    deadEndNodes: field
      .custom<SceneAuthoringInput>(
        'Dead-end nodes',
        (scene) => {
          if (!hasReachabilityContext(scene)) return 'skip';
          return countDeadEnds(scene) > 0 ? false : 'skip';
        },
        (scene) => `${countDeadEnds(scene)} non-end node(s) have no outgoing edges`,
      )
      .warn()
      .id('scene.deadEndNodes'),

    // ---- Content coverage -------------------------------------------------
    contentlessNodes: field
      .custom<SceneAuthoringInput>(
        'Nodes without content',
        (scene) => (countContentlessNodes(scene) > 0 ? false : 'skip'),
        (scene) =>
          `${countContentlessNodes(scene)} node(s) have no asset or generation config`,
      )
      .warn()
      .id('scene.contentlessNodes'),
  });
}

// Shared singleton for simple use-cases.
export const sceneSchema = createSceneSchema();
