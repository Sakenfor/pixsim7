import { describe, it, expect, beforeEach, vi } from 'vitest';

// ============================================================================
// Mocks
// ============================================================================

const mockApi = vi.hoisted(() => ({
  getWorldBehavior: vi.fn(),
  createWorldRoutine: vi.fn(),
  updateWorldRoutine: vi.fn(),
  deleteWorldRoutine: vi.fn(),
}));

vi.mock('@lib/api/gameBehavior', () => mockApi);

// ============================================================================
// Tests
// ============================================================================

import { useRoutineGraphStore } from '../../stores/routineGraphStore';
import {
  loadRoutinesForWorld,
  saveAllRoutines,
  clearRoutineState,
  _resetLoadGeneration,
} from '../routineGraphService';

function getState() {
  return useRoutineGraphStore.getState();
}

describe('routineGraphService', () => {
  beforeEach(() => {
    getState().reset();
    _resetLoadGeneration();
    vi.clearAllMocks();
  });

  // ==========================================================================
  // loadRoutinesForWorld
  // ==========================================================================

  describe('loadRoutinesForWorld', () => {
    it('loads routines from backend and populates store', async () => {
      mockApi.getWorldBehavior.mockResolvedValue({
        version: 2,
        routines: {
          'r1': {
            id: 'r1',
            version: 1,
            name: 'Daily Routine',
            nodes: [
              {
                id: 'n1',
                nodeType: 'time_slot',
                timeRangeSeconds: { start: 0, end: 3600 },
                meta: { __editor: { position: { x: 50, y: 50 }, label: 'Morning' } },
              },
            ],
            edges: [],
          },
        },
        activities: {},
      });

      await loadRoutinesForWorld(42);

      expect(mockApi.getWorldBehavior).toHaveBeenCalledWith(42);
      expect(getState().worldId).toBe('42');
      expect(Object.keys(getState().graphs)).toHaveLength(1);
      expect(getState().graphs['r1'].name).toBe('Daily Routine');
      expect(getState().graphs['r1'].nodes[0].position).toEqual({ x: 50, y: 50 });
      expect(getState().graphs['r1'].nodes[0].label).toBe('Morning');
      // Auto-selects first graph
      expect(getState().currentGraphId).toBe('r1');
      // Marked as saved (not dirty)
      expect(getState().isDirty).toBe(false);
    });

    it('clears store immediately before fetch', async () => {
      // Pre-populate with stale data
      getState().setWorldId('99');
      getState().createGraph('Stale');

      mockApi.getWorldBehavior.mockResolvedValue({
        version: 2,
        routines: {},
        activities: {},
      });

      const promise = loadRoutinesForWorld(42);

      // Before fetch resolves, store should already be cleared
      expect(getState().worldId).toBe('42');
      expect(Object.keys(getState().graphs)).toHaveLength(0);

      await promise;
    });

    it('handles race condition: only second load lands', async () => {
      // First load: slow
      let resolveFirst!: (value: any) => void;
      const firstPromise = new Promise((resolve) => { resolveFirst = resolve; });
      mockApi.getWorldBehavior.mockReturnValueOnce(firstPromise);

      // Second load: fast
      mockApi.getWorldBehavior.mockResolvedValueOnce({
        version: 2,
        routines: {
          'r-fast': { id: 'r-fast', version: 1, name: 'Fast', nodes: [], edges: [] },
        },
        activities: {},
      });

      // Start both loads
      const load1 = loadRoutinesForWorld(10);
      const load2 = loadRoutinesForWorld(20);

      // Resolve second first
      await load2;

      // Now resolve the first (stale)
      resolveFirst({
        version: 2,
        routines: {
          'r-slow': { id: 'r-slow', version: 1, name: 'Slow', nodes: [], edges: [] },
        },
        activities: {},
      });
      await load1;

      // Store should have the fast (second) load's data, not the slow one
      expect(getState().worldId).toBe('20');
      expect(getState().graphs['r-fast']).toBeDefined();
      expect(getState().graphs['r-slow']).toBeUndefined();
    });

    it('handles empty routines', async () => {
      mockApi.getWorldBehavior.mockResolvedValue({
        version: 2,
        routines: {},
        activities: {},
      });

      await loadRoutinesForWorld(1);

      expect(Object.keys(getState().graphs)).toHaveLength(0);
      expect(getState().currentGraphId).toBeNull();
    });

    it('throws on API error', async () => {
      mockApi.getWorldBehavior.mockRejectedValue(new Error('Network error'));

      await expect(loadRoutinesForWorld(1)).rejects.toThrow('Network error');
    });
  });

  // ==========================================================================
  // saveAllRoutines
  // ==========================================================================

  describe('saveAllRoutines', () => {
    it('saves all graphs to backend and marks saved', async () => {
      // Populate store
      getState().setWorldId('42');
      getState().createGraph('Routine A');
      const graphId = Object.keys(getState().graphs)[0];

      mockApi.updateWorldRoutine.mockResolvedValue({});

      await saveAllRoutines(42);

      expect(mockApi.updateWorldRoutine).toHaveBeenCalledTimes(1);
      expect(mockApi.updateWorldRoutine.mock.calls[0][0]).toBe(42);
      expect(mockApi.updateWorldRoutine.mock.calls[0][1]).toBe(graphId);
      expect(getState().isDirty).toBe(false);
    });

    it('falls back to create on 404', async () => {
      getState().setWorldId('42');
      getState().createGraph('New Routine');

      mockApi.updateWorldRoutine.mockRejectedValue({ response: { status: 404 } });
      mockApi.createWorldRoutine.mockResolvedValue({});

      await saveAllRoutines(42);

      expect(mockApi.createWorldRoutine).toHaveBeenCalledTimes(1);
      expect(getState().isDirty).toBe(false);
    });
  });

  // ==========================================================================
  // clearRoutineState
  // ==========================================================================

  describe('clearRoutineState', () => {
    it('nulls worldId and clears graphs in store', () => {
      getState().setWorldId('42');
      getState().createGraph('Test');
      expect(getState().worldId).toBe('42');

      clearRoutineState();

      expect(getState().worldId).toBeNull();
      expect(Object.keys(getState().graphs)).toHaveLength(0);
    });
  });
});
