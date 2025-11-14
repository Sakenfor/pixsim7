/**
 * Graph validation utilities
 * Semantic checks beyond JSON schema validation
 */

export interface ValidationIssue {
  severity: 'error' | 'warning' | 'info';
  type: string;
  message: string;
  nodeId?: string;
  edgeId?: string;
}

export interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
}

/**
 * Validate graph semantics
 */
export function validateGraph(graph: any): ValidationResult {
  const issues: ValidationIssue[] = [];

  // Check entry node exists
  if (!graph.nodes[graph.entry]) {
    issues.push({
      severity: 'error',
      type: 'missing_entry',
      message: `Entry node "${graph.entry}" does not exist`,
    });
  }

  // Check node structure
  for (const [nodeId, node] of Object.entries(graph.nodes) as [string, any][]) {
    // Check edge targets exist
    if (node.edges) {
      for (const targetId of node.edges) {
        if (!graph.nodes[targetId]) {
          issues.push({
            severity: 'error',
            type: 'missing_target',
            message: `Node "${nodeId}" references non-existent target "${targetId}"`,
            nodeId,
          });
        }
      }
    }

    // Check node-specific requirements
    if (node.type === 'SceneCall' && !node.sceneRef) {
      issues.push({
        severity: 'warning',
        type: 'missing_scene_ref',
        message: `SceneCall node "${nodeId}" has no sceneRef`,
        nodeId,
      });
    }

    if (node.type === 'Subgraph' && !node.subgraph) {
      issues.push({
        severity: 'warning',
        type: 'missing_subgraph',
        message: `Subgraph node "${nodeId}" has no subgraph reference`,
        nodeId,
      });
    }

    if (node.type === 'Video' && (!node.video?.segments || node.video.segments.length === 0)) {
      issues.push({
        severity: 'warning',
        type: 'missing_video_segments',
        message: `Video node "${nodeId}" has no segments`,
        nodeId,
      });
    }

    if (node.type === 'Choice' && (!node.edges || node.edges.length === 0)) {
      issues.push({
        severity: 'error',
        type: 'choice_no_edges',
        message: `Choice node "${nodeId}" must have at least one edge`,
        nodeId,
      });
    }
  }

  // Reachability analysis
  const reachable = findReachableNodes(graph, graph.entry);
  const allNodes = Object.keys(graph.nodes);
  const unreachable = allNodes.filter(id => !reachable.has(id));

  for (const nodeId of unreachable) {
    issues.push({
      severity: 'warning',
      type: 'unreachable_node',
      message: `Node "${nodeId}" is unreachable from entry`,
      nodeId,
    });
  }

  // Cycle detection (warn about cycles without escape)
  const cycles = detectCycles(graph);
  for (const cycle of cycles) {
    // Check if cycle has any exit or condition that could break it
    const hasExit = cycle.some(nodeId => {
      const node = graph.nodes[nodeId];
      return node.conditions?.length > 0 || node.type === 'Choice' || node.type === 'Random';
    });

    if (!hasExit) {
      issues.push({
        severity: 'error',
        type: 'infinite_cycle',
        message: `Detected infinite cycle with no escape: ${cycle.join(' -> ')}`,
      });
    }
  }

  // Dead ends (nodes with no edges and not terminal types)
  const terminalTypes = new Set(['SceneCall', 'Timer']);
  for (const [nodeId, node] of Object.entries(graph.nodes) as [string, any][]) {
    if (!node.edges || node.edges.length === 0) {
      if (!terminalTypes.has(node.type)) {
        issues.push({
          severity: 'info',
          type: 'dead_end',
          message: `Node "${nodeId}" has no outgoing edges (dead end)`,
          nodeId,
        });
      }
    }
  }

  return {
    valid: issues.filter(i => i.severity === 'error').length === 0,
    issues,
  };
}

/**
 * Find all nodes reachable from a given start node
 */
function findReachableNodes(graph: any, startId: string): Set<string> {
  const reachable = new Set<string>();
  const queue = [startId];

  while (queue.length > 0) {
    const nodeId = queue.shift()!;
    if (reachable.has(nodeId)) continue;
    reachable.add(nodeId);

    const node = graph.nodes[nodeId];
    if (node?.edges) {
      queue.push(...node.edges);
    }
  }

  return reachable;
}

/**
 * Detect cycles in the graph
 */
function detectCycles(graph: any): string[][] {
  const cycles: string[][] = [];
  const visited = new Set<string>();
  const recStack = new Set<string>();
  const path: string[] = [];

  function dfs(nodeId: string): void {
    if (recStack.has(nodeId)) {
      // Found a cycle
      const cycleStart = path.indexOf(nodeId);
      cycles.push(path.slice(cycleStart).concat(nodeId));
      return;
    }

    if (visited.has(nodeId)) return;

    visited.add(nodeId);
    recStack.add(nodeId);
    path.push(nodeId);

    const node = graph.nodes[nodeId];
    if (node?.edges) {
      for (const targetId of node.edges) {
        if (graph.nodes[targetId]) {
          dfs(targetId);
        }
      }
    }

    path.pop();
    recStack.delete(nodeId);
  }

  for (const nodeId of Object.keys(graph.nodes)) {
    if (!visited.has(nodeId)) {
      dfs(nodeId);
    }
  }

  return cycles;
}

/**
 * Check if graph is deterministic (no random/choice nodes)
 */
export function isDeterministic(graph: any): boolean {
  for (const node of Object.values(graph.nodes) as any[]) {
    if (node.type === 'Random' || node.type === 'Choice') {
      return false;
    }
    if (node.conditions?.some((c: any) => c.kind === 'randomChance')) {
      return false;
    }
  }
  return true;
}

/**
 * Get graph statistics
 */
export function getGraphStats(graph: any) {
  const nodeTypes = new Map<string, number>();
  let totalEdges = 0;
  let conditionalNodes = 0;
  let terminalNodes = 0;

  for (const node of Object.values(graph.nodes) as any[]) {
    // Count node types
    const count = nodeTypes.get(node.type) || 0;
    nodeTypes.set(node.type, count + 1);

    // Count edges
    if (node.edges) totalEdges += node.edges.length;

    // Count conditional nodes
    if (node.conditions && node.conditions.length > 0) conditionalNodes++;

    // Count terminal nodes
    if (!node.edges || node.edges.length === 0) terminalNodes++;
  }

  return {
    totalNodes: Object.keys(graph.nodes).length,
    nodeTypes: Object.fromEntries(nodeTypes),
    totalEdges,
    conditionalNodes,
    terminalNodes,
    isDeterministic: isDeterministic(graph),
  };
}
