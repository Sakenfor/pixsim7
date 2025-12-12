import type { DraftSceneNode, DraftEdge } from '../../modules/scene-builder';

/**
 * Clipboard data structure for graph nodes and edges
 */
interface ClipboardData {
  nodes: DraftSceneNode[];
  edges: DraftEdge[];
  type: 'pixsim7-graph-snippet';
  version: number;
}

const CLIPBOARD_KEY = 'pixsim7-clipboard';
const CLIPBOARD_VERSION = 1;

/**
 * Graph clipboard utilities
 *
 * Simple copy/paste system for scene graph nodes and edges.
 * Uses localStorage to avoid CORS restrictions with system clipboard.
 */
export const graphClipboard = {
  /**
   * Copy selected nodes and their edges to clipboard
   *
   * @param nodeIds - IDs of nodes to copy
   * @param allNodes - All nodes in the scene
   * @param allEdges - All edges in the scene
   */
  copy(nodeIds: string[], allNodes: DraftSceneNode[], allEdges: DraftEdge[]): void {
    if (nodeIds.length === 0) {
      console.warn('[Clipboard] No nodes selected to copy');
      return;
    }

    const nodes = allNodes.filter((n) => nodeIds.includes(n.id));
    const nodeIdSet = new Set(nodeIds);

    // Include edges where both source and target are selected
    const edges = allEdges.filter((e) => nodeIdSet.has(e.from) && nodeIdSet.has(e.to));

    const data: ClipboardData = {
      nodes,
      edges,
      type: 'pixsim7-graph-snippet',
      version: CLIPBOARD_VERSION,
    };

    try {
      localStorage.setItem(CLIPBOARD_KEY, JSON.stringify(data));
      console.log(`[Clipboard] Copied ${nodes.length} node(s) and ${edges.length} edge(s)`);
    } catch (error) {
      console.error('[Clipboard] Failed to copy to localStorage:', error);
    }
  },

  /**
   * Paste nodes from clipboard into scene
   *
   * @param currentNodes - Current nodes in the scene (for collision detection)
   * @param offsetPosition - Optional offset to apply to pasted nodes
   * @returns New nodes and edges with regenerated IDs, or null if clipboard is empty
   */
  paste(
    currentNodes: DraftSceneNode[],
    offsetPosition?: { x: number; y: number }
  ): { nodes: DraftSceneNode[]; edges: DraftEdge[] } | null {
    const clipboardJson = localStorage.getItem(CLIPBOARD_KEY);
    if (!clipboardJson) {
      console.warn('[Clipboard] Clipboard is empty');
      return null;
    }

    try {
      const data: ClipboardData = JSON.parse(clipboardJson);

      // Validate clipboard data
      if (data.type !== 'pixsim7-graph-snippet') {
        console.error('[Clipboard] Invalid clipboard data type');
        return null;
      }

      if (!Array.isArray(data.nodes) || !Array.isArray(data.edges)) {
        console.error('[Clipboard] Invalid clipboard data structure');
        return null;
      }

      // Generate new IDs for pasted nodes to avoid collisions
      const idMap = new Map<string, string>();
      const timestamp = Date.now();

      const pastedNodes = data.nodes.map((node, index) => {
        const newId = `${node.id}_copy_${timestamp}_${index}`;
        idMap.set(node.id, newId);

        // Clone node
        const clonedNode: DraftSceneNode = JSON.parse(JSON.stringify(node));
        clonedNode.id = newId;

        // Apply position offset if provided
        if (clonedNode.metadata?.position && offsetPosition) {
          clonedNode.metadata.position = {
            x: clonedNode.metadata.position.x + offsetPosition.x,
            y: clonedNode.metadata.position.y + offsetPosition.y,
          };
        }

        // Update label to indicate copy
        if (clonedNode.metadata?.label) {
          clonedNode.metadata.label = `${clonedNode.metadata.label} (copy)`;
        }

        return clonedNode;
      });

      // Remap edge IDs and node references
      const pastedEdges = data.edges
        .map((edge) => {
          const newFromId = idMap.get(edge.from);
          const newToId = idMap.get(edge.to);

          // Only include edge if both nodes exist in the pasted set
          if (!newFromId || !newToId) {
            return null;
          }

          const clonedEdge: DraftEdge = JSON.parse(JSON.stringify(edge));
          clonedEdge.id = `edge_${newFromId}_${newToId}_${timestamp}`;
          clonedEdge.from = newFromId;
          clonedEdge.to = newToId;

          return clonedEdge;
        })
        .filter((edge): edge is DraftEdge => edge !== null);

      console.log(
        `[Clipboard] Pasted ${pastedNodes.length} node(s) and ${pastedEdges.length} edge(s)`
      );

      return { nodes: pastedNodes, edges: pastedEdges };
    } catch (error) {
      console.error('[Clipboard] Failed to paste from clipboard:', error);
      return null;
    }
  },

  /**
   * Check if clipboard has valid graph data
   *
   * @returns True if clipboard contains valid graph snippet data
   */
  hasClipboardData(): boolean {
    const data = localStorage.getItem(CLIPBOARD_KEY);
    if (!data) return false;

    try {
      const parsed = JSON.parse(data);
      return parsed.type === 'pixsim7-graph-snippet' && Array.isArray(parsed.nodes);
    } catch {
      return false;
    }
  },

  /**
   * Clear clipboard data
   */
  clear(): void {
    localStorage.removeItem(CLIPBOARD_KEY);
    console.log('[Clipboard] Cleared');
  },

  /**
   * Get clipboard stats (for UI display)
   *
   * @returns Number of nodes and edges in clipboard, or null if empty
   */
  getStats(): { nodeCount: number; edgeCount: number } | null {
    const data = localStorage.getItem(CLIPBOARD_KEY);
    if (!data) return null;

    try {
      const parsed: ClipboardData = JSON.parse(data);
      if (parsed.type !== 'pixsim7-graph-snippet') return null;

      return {
        nodeCount: parsed.nodes?.length || 0,
        edgeCount: parsed.edges?.length || 0,
      };
    } catch {
      return null;
    }
  },
};
