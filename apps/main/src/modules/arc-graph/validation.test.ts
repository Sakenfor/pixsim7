/**
 * Tests for Arc Graph Validation
 */

import { describe, it, expect } from 'vitest';
import {
  validateArcGraphReferences,
  validateArcGraphStructure,
  validateArcGraph,
} from './validation';
import type { ArcGraph, ArcGraphNode } from './types';

describe('Arc Graph Validation', () => {
  describe('validateArcGraphReferences', () => {
    it('should return no issues when all scene references are valid', () => {
      const arcGraph: ArcGraph = {
        id: 'test-arc',
        title: 'Test Arc',
        nodes: [
          {
            id: 'node1',
            type: 'arc',
            label: 'Arc 1',
            arcId: 'arc1',
            sceneId: 'scene1',
          },
          {
            id: 'node2',
            type: 'quest',
            label: 'Quest 1',
            questId: 'quest1',
            sceneId: 'scene2',
          },
        ],
        edges: [],
      };

      const sceneIds = new Set(['scene1', 'scene2', 'scene3']);
      const issues = validateArcGraphReferences(arcGraph, sceneIds);

      expect(issues).toHaveLength(0);
    });

    it('should detect broken scene references', () => {
      const arcGraph: ArcGraph = {
        id: 'test-arc',
        title: 'Test Arc',
        nodes: [
          {
            id: 'node1',
            type: 'arc',
            label: 'Arc 1',
            arcId: 'arc1',
            sceneId: 'nonexistent-scene',
          },
        ],
        edges: [],
      };

      const sceneIds = new Set(['scene1', 'scene2']);
      const issues = validateArcGraphReferences(arcGraph, sceneIds);

      expect(issues).toHaveLength(1);
      expect(issues[0].type).toBe('broken-scene-reference');
      expect(issues[0].severity).toBe('error');
      expect(issues[0].message).toContain('nonexistent-scene');
    });

    it('should ignore arc_group nodes', () => {
      const arcGraph: ArcGraph = {
        id: 'test-arc',
        title: 'Test Arc',
        nodes: [
          {
            id: 'group1',
            type: 'arc_group',
            label: 'Group 1',
            childNodeIds: [],
            collapsed: false,
          },
        ],
        edges: [],
      };

      const sceneIds = new Set(['scene1']);
      const issues = validateArcGraphReferences(arcGraph, sceneIds);

      expect(issues).toHaveLength(0);
    });

    it('should handle nodes without scene references', () => {
      const arcGraph: ArcGraph = {
        id: 'test-arc',
        title: 'Test Arc',
        nodes: [
          {
            id: 'node1',
            type: 'arc',
            label: 'Arc 1',
            arcId: 'arc1',
            // No sceneId
          },
        ],
        edges: [],
      };

      const sceneIds = new Set(['scene1']);
      const issues = validateArcGraphReferences(arcGraph, sceneIds);

      expect(issues).toHaveLength(0);
    });

    it('should include worldId in error details when provided', () => {
      const arcGraph: ArcGraph = {
        id: 'test-arc',
        title: 'Test Arc',
        nodes: [
          {
            id: 'node1',
            type: 'arc',
            label: 'Arc 1',
            arcId: 'arc1',
            sceneId: 'bad-scene',
          },
        ],
        edges: [],
      };

      const sceneIds = new Set(['scene1']);
      const issues = validateArcGraphReferences(arcGraph, sceneIds, 'world1');

      expect(issues).toHaveLength(1);
      expect(issues[0].details).toContain('world1');
    });
  });

  describe('validateArcGraphStructure', () => {
    it('should return error when start node is missing', () => {
      const arcGraph: ArcGraph = {
        id: 'test-arc',
        title: 'Test Arc',
        nodes: [
          {
            id: 'node1',
            type: 'arc',
            label: 'Arc 1',
            arcId: 'arc1',
          },
        ],
        edges: [],
        // No startNodeId
      };

      const issues = validateArcGraphStructure(arcGraph);

      expect(issues.length).toBeGreaterThan(0);
      expect(issues[0].type).toBe('missing-start');
      expect(issues[0].severity).toBe('error');
    });

    it('should detect unreachable nodes', () => {
      const arcGraph: ArcGraph = {
        id: 'test-arc',
        title: 'Test Arc',
        nodes: [
          {
            id: 'node1',
            type: 'arc',
            label: 'Start Arc',
            arcId: 'arc1',
          },
          {
            id: 'node2',
            type: 'arc',
            label: 'Unreachable Arc',
            arcId: 'arc2',
          },
        ],
        edges: [],
        startNodeId: 'node1',
      };

      const issues = validateArcGraphStructure(arcGraph);

      const unreachableIssues = issues.filter(i => i.type === 'unreachable');
      expect(unreachableIssues).toHaveLength(1);
      expect(unreachableIssues[0].severity).toBe('warning');
      expect(unreachableIssues[0].nodeId).toBe('node2');
    });

    it('should detect dead ends', () => {
      const arcGraph: ArcGraph = {
        id: 'test-arc',
        title: 'Test Arc',
        nodes: [
          {
            id: 'node1',
            type: 'arc',
            label: 'Arc 1',
            arcId: 'arc1',
          },
        ],
        edges: [],
        startNodeId: 'node1',
      };

      const issues = validateArcGraphStructure(arcGraph);

      const deadEndIssues = issues.filter(i => i.type === 'dead-end');
      expect(deadEndIssues).toHaveLength(1);
      expect(deadEndIssues[0].severity).toBe('warning');
    });

    it('should not report dead ends for milestone nodes', () => {
      const arcGraph: ArcGraph = {
        id: 'test-arc',
        title: 'Test Arc',
        nodes: [
          {
            id: 'node1',
            type: 'milestone',
            label: 'Final Milestone',
            milestoneId: 'milestone1',
          },
        ],
        edges: [],
        startNodeId: 'node1',
      };

      const issues = validateArcGraphStructure(arcGraph);

      const deadEndIssues = issues.filter(i => i.type === 'dead-end');
      expect(deadEndIssues).toHaveLength(0);
    });

    it('should detect cycles', () => {
      const arcGraph: ArcGraph = {
        id: 'test-arc',
        title: 'Test Arc',
        nodes: [
          {
            id: 'node1',
            type: 'arc',
            label: 'Arc 1',
            arcId: 'arc1',
          },
          {
            id: 'node2',
            type: 'arc',
            label: 'Arc 2',
            arcId: 'arc2',
          },
        ],
        edges: [
          { id: 'edge1', from: 'node1', to: 'node2' },
          { id: 'edge2', from: 'node2', to: 'node1' },
        ],
        startNodeId: 'node1',
      };

      const issues = validateArcGraphStructure(arcGraph);

      const cycleIssues = issues.filter(i => i.type === 'cycle');
      expect(cycleIssues.length).toBeGreaterThan(0);
      expect(cycleIssues[0].severity).toBe('warning');
    });
  });

  describe('validateArcGraph', () => {
    it('should detect duplicate node IDs', () => {
      const arcGraph: ArcGraph = {
        id: 'test-arc',
        title: 'Test Arc',
        nodes: [
          {
            id: 'node1',
            type: 'arc',
            label: 'Arc 1',
            arcId: 'arc1',
          },
          {
            id: 'node1', // Duplicate
            type: 'arc',
            label: 'Arc 2',
            arcId: 'arc2',
          },
        ],
        edges: [],
        startNodeId: 'node1',
      };

      const sceneIds = new Set<string>();
      const result = validateArcGraph(arcGraph, sceneIds);

      expect(result.valid).toBe(false);
      const duplicateIssues = result.issues.filter(
        i => i.type === 'invalid-requirements' && i.message.includes('Duplicate')
      );
      expect(duplicateIssues.length).toBeGreaterThan(0);
    });

    it('should detect invalid edge references', () => {
      const arcGraph: ArcGraph = {
        id: 'test-arc',
        title: 'Test Arc',
        nodes: [
          {
            id: 'node1',
            type: 'arc',
            label: 'Arc 1',
            arcId: 'arc1',
          },
        ],
        edges: [
          { id: 'edge1', from: 'node1', to: 'nonexistent' },
        ],
        startNodeId: 'node1',
      };

      const sceneIds = new Set<string>();
      const result = validateArcGraph(arcGraph, sceneIds);

      expect(result.valid).toBe(false);
      const edgeIssues = result.issues.filter(
        i => i.message.includes('non-existent target node')
      );
      expect(edgeIssues.length).toBeGreaterThan(0);
    });

    it('should combine all validation checks', () => {
      const arcGraph: ArcGraph = {
        id: 'test-arc',
        title: 'Test Arc',
        nodes: [
          {
            id: 'node1',
            type: 'arc',
            label: 'Arc 1',
            arcId: 'arc1',
            sceneId: 'bad-scene', // Broken reference
          },
        ],
        edges: [],
        // Missing start node
      };

      const sceneIds = new Set(['scene1']);
      const result = validateArcGraph(arcGraph, sceneIds);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should return valid result for a well-formed arc graph', () => {
      const arcGraph: ArcGraph = {
        id: 'test-arc',
        title: 'Test Arc',
        nodes: [
          {
            id: 'node1',
            type: 'arc',
            label: 'Arc 1',
            arcId: 'arc1',
            sceneId: 'scene1',
          },
          {
            id: 'node2',
            type: 'milestone',
            label: 'Milestone',
            milestoneId: 'milestone1',
          },
        ],
        edges: [
          { id: 'edge1', from: 'node1', to: 'node2' },
        ],
        startNodeId: 'node1',
      };

      const sceneIds = new Set(['scene1']);
      const result = validateArcGraph(arcGraph, sceneIds);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });
});
