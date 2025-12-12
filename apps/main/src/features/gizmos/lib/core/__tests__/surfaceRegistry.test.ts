/**
 * Tests for Gizmo Surface Registry
 */

import { GizmoSurfaceRegistry } from '../surfaceRegistry';
import type { GizmoSurfaceDefinition } from '../surfaceRegistry';

describe('GizmoSurfaceRegistry', () => {
  let registry: GizmoSurfaceRegistry;

  beforeEach(() => {
    registry = new GizmoSurfaceRegistry();
  });

  it('should register and retrieve a surface', () => {
    const surface: GizmoSurfaceDefinition = {
      id: 'test-gizmo',
      label: 'Test Gizmo',
      description: 'A test gizmo surface',
      category: 'debug',
    };

    registry.register(surface);

    expect(registry.has('test-gizmo')).toBe(true);
    expect(registry.get('test-gizmo')).toEqual(surface);
  });

  it('should return all registered surfaces', () => {
    const surface1: GizmoSurfaceDefinition = {
      id: 'gizmo-1',
      label: 'Gizmo 1',
      category: 'scene',
    };

    const surface2: GizmoSurfaceDefinition = {
      id: 'gizmo-2',
      label: 'Gizmo 2',
      category: 'npc',
    };

    registry.registerAll([surface1, surface2]);

    expect(registry.count).toBe(2);
    expect(registry.getAll()).toHaveLength(2);
  });

  it('should filter surfaces by category', () => {
    registry.registerAll([
      { id: 'scene-1', label: 'Scene 1', category: 'scene' },
      { id: 'scene-2', label: 'Scene 2', category: 'scene' },
      { id: 'npc-1', label: 'NPC 1', category: 'npc' },
    ]);

    const sceneGizmos = registry.getByCategory('scene');
    expect(sceneGizmos).toHaveLength(2);
    expect(sceneGizmos.every(g => g.category === 'scene')).toBe(true);
  });

  it('should filter surfaces by context', () => {
    registry.registerAll([
      {
        id: 'gizmo-1',
        label: 'Gizmo 1',
        supportsContexts: ['scene-editor', 'game-2d'],
      },
      {
        id: 'gizmo-2',
        label: 'Gizmo 2',
        supportsContexts: ['game-3d'],
      },
      {
        id: 'gizmo-3',
        label: 'Gizmo 3',
        supportsContexts: ['scene-editor', 'game-3d'],
      },
    ]);

    const sceneEditorGizmos = registry.getByContext('scene-editor');
    expect(sceneEditorGizmos).toHaveLength(2);
    expect(sceneEditorGizmos.map(g => g.id)).toContain('gizmo-1');
    expect(sceneEditorGizmos.map(g => g.id)).toContain('gizmo-3');
  });

  it('should filter surfaces by tag', () => {
    registry.registerAll([
      { id: 'gizmo-1', label: 'Gizmo 1', tags: ['debug', 'advanced'] },
      { id: 'gizmo-2', label: 'Gizmo 2', tags: ['debug'] },
      { id: 'gizmo-3', label: 'Gizmo 3', tags: ['basic'] },
    ]);

    const debugGizmos = registry.getByTag('debug');
    expect(debugGizmos).toHaveLength(2);
  });

  it('should sort surfaces by priority', () => {
    registry.registerAll([
      { id: 'low', label: 'Low', priority: 1 },
      { id: 'high', label: 'High', priority: 10 },
      { id: 'medium', label: 'Medium', priority: 5 },
      { id: 'none', label: 'None' }, // No priority = 0
    ]);

    const sorted = registry.getSortedByPriority();
    expect(sorted[0].id).toBe('high');
    expect(sorted[1].id).toBe('medium');
    expect(sorted[2].id).toBe('low');
    expect(sorted[3].id).toBe('none');
  });

  it('should unregister a surface', () => {
    registry.register({ id: 'test', label: 'Test' });
    expect(registry.has('test')).toBe(true);

    registry.unregister('test');
    expect(registry.has('test')).toBe(false);
  });

  it('should clear all surfaces', () => {
    registry.registerAll([
      { id: 'gizmo-1', label: 'Gizmo 1' },
      { id: 'gizmo-2', label: 'Gizmo 2' },
    ]);

    expect(registry.count).toBe(2);

    registry.clear();
    expect(registry.count).toBe(0);
    expect(registry.getAll()).toHaveLength(0);
  });

  it('should warn when overwriting existing surface', () => {
    const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

    registry.register({ id: 'test', label: 'Test 1' });
    registry.register({ id: 'test', label: 'Test 2' });

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Overwriting existing surface: test')
    );

    consoleSpy.mockRestore();
  });

  it('should search surfaces by query', () => {
    registry.registerAll([
      { id: 'brain-playground', label: 'Brain Playground', description: 'NPC brain simulator', tags: ['debug', 'npc'] },
      { id: 'mood-timeline', label: 'Mood Timeline', description: 'Track NPC mood changes', tags: ['npc', 'timeline'] },
      { id: 'relationship-graph', label: 'Relationship Graph', description: 'Visualize relationships', tags: ['social'] },
    ]);

    // Search by id
    expect(registry.search('brain').map(s => s.id)).toContain('brain-playground');

    // Search by label
    expect(registry.search('mood').map(s => s.id)).toContain('mood-timeline');

    // Search by description
    expect(registry.search('simulator').map(s => s.id)).toContain('brain-playground');

    // Search by tag
    const npcSurfaces = registry.search('npc');
    expect(npcSurfaces).toHaveLength(2);
    expect(npcSurfaces.map(s => s.id)).toContain('brain-playground');
    expect(npcSurfaces.map(s => s.id)).toContain('mood-timeline');

    // Case-insensitive search
    expect(registry.search('BRAIN').map(s => s.id)).toContain('brain-playground');
  });
});
