/**
 * Tests for Graph Dependency Tracking
 */

import { describe, it, expect } from 'vitest';
import {
  buildArcSceneDependencyIndex,
  getArcNodesForScene,
  getSceneForArcNode,
  sceneHasDependencies,
  getDependencyCount,
} from './dependencies';
import type { ArcGraph } from '../../modules/arc-graph/types';

describe('Graph Dependency Tracking', () => {
  describe('buildArcSceneDependencyIndex', () => {
    it('should build index from empty arc graphs', () => {
      const arcGraphs: Record<string, ArcGraph> = {};
      const index = buildArcSceneDependencyIndex(arcGraphs);

      expect(index.sceneToArcNodes.size).toBe(0);
      expect(index.arcNodeToScene.size).toBe(0);
    });

    it('should build index from arc graphs with scene references', () => {
      const arcGraphs: Record<string, ArcGraph> = {
        arc1: {
          id: 'arc1',
          title: 'Arc 1',
          nodes: [
            {
              id: 'node1',
              type: 'arc',
              label: 'Arc Node 1',
              arcId: 'arc1',
              sceneId: 'scene1',
            },
            {
              id: 'node2',
              type: 'quest',
              label: 'Quest Node 1',
              questId: 'quest1',
              sceneId: 'scene2',
            },
          ],
          edges: [],
        },
      };

      const index = buildArcSceneDependencyIndex(arcGraphs);

      expect(index.sceneToArcNodes.size).toBe(2);
      expect(index.sceneToArcNodes.get('scene1')).toContain('node1');
      expect(index.sceneToArcNodes.get('scene2')).toContain('node2');
      expect(index.arcNodeToScene.get('node1')).toBe('scene1');
      expect(index.arcNodeToScene.get('node2')).toBe('scene2');
    });

    it('should handle multiple arc nodes referencing the same scene', () => {
      const arcGraphs: Record<string, ArcGraph> = {
        arc1: {
          id: 'arc1',
          title: 'Arc 1',
          nodes: [
            {
              id: 'node1',
              type: 'arc',
              label: 'Arc Node 1',
              arcId: 'arc1',
              sceneId: 'scene1',
            },
            {
              id: 'node2',
              type: 'arc',
              label: 'Arc Node 2',
              arcId: 'arc2',
              sceneId: 'scene1', // Same scene
            },
            {
              id: 'node3',
              type: 'quest',
              label: 'Quest Node',
              questId: 'quest1',
              sceneId: 'scene1', // Same scene again
            },
          ],
          edges: [],
        },
      };

      const index = buildArcSceneDependencyIndex(arcGraphs);

      const scene1Deps = index.sceneToArcNodes.get('scene1');
      expect(scene1Deps?.size).toBe(3);
      expect(scene1Deps).toContain('node1');
      expect(scene1Deps).toContain('node2');
      expect(scene1Deps).toContain('node3');
    });

    it('should ignore arc_group nodes', () => {
      const arcGraphs: Record<string, ArcGraph> = {
        arc1: {
          id: 'arc1',
          title: 'Arc 1',
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
        },
      };

      const index = buildArcSceneDependencyIndex(arcGraphs);

      expect(index.sceneToArcNodes.size).toBe(0);
      expect(index.arcNodeToScene.size).toBe(0);
    });

    it('should handle nodes without scene references', () => {
      const arcGraphs: Record<string, ArcGraph> = {
        arc1: {
          id: 'arc1',
          title: 'Arc 1',
          nodes: [
            {
              id: 'node1',
              type: 'arc',
              label: 'Arc Node 1',
              arcId: 'arc1',
              // No sceneId
            },
          ],
          edges: [],
        },
      };

      const index = buildArcSceneDependencyIndex(arcGraphs);

      expect(index.sceneToArcNodes.size).toBe(0);
      expect(index.arcNodeToScene.size).toBe(0);
    });

    it('should handle multiple arc graphs', () => {
      const arcGraphs: Record<string, ArcGraph> = {
        arc1: {
          id: 'arc1',
          title: 'Arc 1',
          nodes: [
            {
              id: 'node1',
              type: 'arc',
              label: 'Arc Node 1',
              arcId: 'arc1',
              sceneId: 'scene1',
            },
          ],
          edges: [],
        },
        arc2: {
          id: 'arc2',
          title: 'Arc 2',
          nodes: [
            {
              id: 'node2',
              type: 'arc',
              label: 'Arc Node 2',
              arcId: 'arc2',
              sceneId: 'scene1', // Same scene as arc1
            },
          ],
          edges: [],
        },
      };

      const index = buildArcSceneDependencyIndex(arcGraphs);

      const scene1Deps = index.sceneToArcNodes.get('scene1');
      expect(scene1Deps?.size).toBe(2);
      expect(scene1Deps).toContain('node1');
      expect(scene1Deps).toContain('node2');
    });
  });

  describe('getArcNodesForScene', () => {
    it('should return empty array for scene with no dependencies', () => {
      const index = buildArcSceneDependencyIndex({});
      const nodes = getArcNodesForScene(index, 'scene1');

      expect(nodes).toEqual([]);
    });

    it('should return all arc nodes that reference a scene', () => {
      const arcGraphs: Record<string, ArcGraph> = {
        arc1: {
          id: 'arc1',
          title: 'Arc 1',
          nodes: [
            {
              id: 'node1',
              type: 'arc',
              label: 'Arc Node 1',
              arcId: 'arc1',
              sceneId: 'scene1',
            },
            {
              id: 'node2',
              type: 'quest',
              label: 'Quest Node',
              questId: 'quest1',
              sceneId: 'scene1',
            },
          ],
          edges: [],
        },
      };

      const index = buildArcSceneDependencyIndex(arcGraphs);
      const nodes = getArcNodesForScene(index, 'scene1');

      expect(nodes).toHaveLength(2);
      expect(nodes).toContain('node1');
      expect(nodes).toContain('node2');
    });
  });

  describe('getSceneForArcNode', () => {
    it('should return undefined for arc node with no scene reference', () => {
      const index = buildArcSceneDependencyIndex({});
      const scene = getSceneForArcNode(index, 'node1');

      expect(scene).toBeUndefined();
    });

    it('should return scene ID for arc node', () => {
      const arcGraphs: Record<string, ArcGraph> = {
        arc1: {
          id: 'arc1',
          title: 'Arc 1',
          nodes: [
            {
              id: 'node1',
              type: 'arc',
              label: 'Arc Node 1',
              arcId: 'arc1',
              sceneId: 'scene1',
            },
          ],
          edges: [],
        },
      };

      const index = buildArcSceneDependencyIndex(arcGraphs);
      const scene = getSceneForArcNode(index, 'node1');

      expect(scene).toBe('scene1');
    });
  });

  describe('sceneHasDependencies', () => {
    it('should return false for scene with no dependencies', () => {
      const index = buildArcSceneDependencyIndex({});
      const hasDeps = sceneHasDependencies(index, 'scene1');

      expect(hasDeps).toBe(false);
    });

    it('should return true for scene with dependencies', () => {
      const arcGraphs: Record<string, ArcGraph> = {
        arc1: {
          id: 'arc1',
          title: 'Arc 1',
          nodes: [
            {
              id: 'node1',
              type: 'arc',
              label: 'Arc Node 1',
              arcId: 'arc1',
              sceneId: 'scene1',
            },
          ],
          edges: [],
        },
      };

      const index = buildArcSceneDependencyIndex(arcGraphs);
      const hasDeps = sceneHasDependencies(index, 'scene1');

      expect(hasDeps).toBe(true);
    });
  });

  describe('getDependencyCount', () => {
    it('should return 0 for scene with no dependencies', () => {
      const index = buildArcSceneDependencyIndex({});
      const count = getDependencyCount(index, 'scene1');

      expect(count).toBe(0);
    });

    it('should return correct count for scene with dependencies', () => {
      const arcGraphs: Record<string, ArcGraph> = {
        arc1: {
          id: 'arc1',
          title: 'Arc 1',
          nodes: [
            {
              id: 'node1',
              type: 'arc',
              label: 'Arc Node 1',
              arcId: 'arc1',
              sceneId: 'scene1',
            },
            {
              id: 'node2',
              type: 'quest',
              label: 'Quest Node',
              questId: 'quest1',
              sceneId: 'scene1',
            },
            {
              id: 'node3',
              type: 'milestone',
              label: 'Milestone',
              milestoneId: 'milestone1',
              sceneId: 'scene1',
            },
          ],
          edges: [],
        },
      };

      const index = buildArcSceneDependencyIndex(arcGraphs);
      const count = getDependencyCount(index, 'scene1');

      expect(count).toBe(3);
    });
  });
});
