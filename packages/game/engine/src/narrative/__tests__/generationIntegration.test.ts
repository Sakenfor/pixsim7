/**
 * Safety net tests for generationIntegration.ts
 * These lightweight smoke tests verify current functionality before refactoring.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createGenerationBridge,
  createBlockGenerationHooks,
  createFusionGenerationHooks,
  isExplicitStrategy,
  type GenerationService,
  type ContentPoolProvider,
  type GenerationHookContext,
  type NarrativeRuntimeState,
  type GameSessionDTO,
  type ActionBlockNode,
} from '../generation';

// Mock dependencies
const mockGenerationService: GenerationService = {
  generate: vi.fn().mockResolvedValue({ content: 'generated-url', jobId: 'job-123' }),
  queueGeneration: vi.fn().mockResolvedValue({ id: 'job-123', status: 'pending' }),
  getJobStatus: vi.fn().mockResolvedValue({ id: 'job-123', status: 'completed', result: 'generated-url' }),
  cancel: vi.fn().mockResolvedValue(true),
  isAvailable: vi.fn().mockResolvedValue(true),
};

const mockContentPool: ContentPoolProvider = {
  find: vi.fn().mockResolvedValue([{ id: 'pool-1', url: 'http://pool-video.mp4', type: 'video' }]),
};

const mockBlockResolver = {
  resolveBlocks: vi.fn().mockResolvedValue({ success: true, sequence: [] }),
};

const mockFusionResolver = {
  resolveAssets: vi.fn().mockResolvedValue({ sourceImage: 'img-1', targetPose: 'pose-1' }),
};

// Helper to create mock action block node
function createMockNode(strategy: string): ActionBlockNode {
  return {
    id: 'node-1',
    type: 'action_block',
    narrativeGeneration: { strategy },
  } as any;
}

// Helper to create mock context
function createMockContext(strategy: string): GenerationHookContext {
  return {
    node: createMockNode(strategy),
    program: { id: 'prog-1', nodes: [] } as any,
    session: { id: 'session-1' } as GameSessionDTO,
    state: { activeProgramId: 'prog-1' } as any,
    npcId: 1,
    generationConfig: { strategy: strategy as any },
  };
}

describe('GenerationIntegration Safety Net', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createGenerationBridge', () => {
    it('should create bridge instance', () => {
      const bridge = createGenerationBridge({ service: mockGenerationService });
      expect(bridge).toBeDefined();
      expect(bridge.getHooks).toBeDefined();
      expect(bridge.resolveContent).toBeDefined();
    });
  });

  describe('GenerationBridge.resolveContent - Strategy Tests', () => {
    it('should handle pool_only strategy', async () => {
      const bridge = createGenerationBridge({ pool: mockContentPool });
      const context = createMockContext('pool_only');

      await bridge.resolveContent(context);
      expect(mockContentPool.find).toHaveBeenCalled();
    });

    it('should handle pool_fallback strategy', async () => {
      const bridge = createGenerationBridge({
        service: mockGenerationService,
        pool: mockContentPool,
      });
      const context = createMockContext('pool_fallback');

      await bridge.resolveContent(context);
      expect(mockContentPool.find).toHaveBeenCalled();
    });

    it('should handle generate_new strategy', async () => {
      const bridge = createGenerationBridge({ service: mockGenerationService });
      const context = createMockContext('generate_new');

      await bridge.resolveContent(context);
      expect(mockGenerationService.generate).toHaveBeenCalled();
    });

    it('should handle generate_fallback strategy', async () => {
      const bridge = createGenerationBridge({
        service: mockGenerationService,
        pool: mockContentPool,
      });
      const context = createMockContext('generate_fallback');

      await bridge.resolveContent(context);
      expect(mockGenerationService.generate).toHaveBeenCalled();
    });

    it('should handle dynamic strategy', async () => {
      const bridge = createGenerationBridge({ service: mockGenerationService });
      const context = createMockContext('dynamic');

      await bridge.resolveContent(context);
      // Should use default behavior
    });

    it('should handle extend_video strategy', async () => {
      const bridge = createGenerationBridge({ service: mockGenerationService });
      const context = createMockContext('extend_video');

      await bridge.resolveContent(context);
      expect(mockGenerationService.generate).toHaveBeenCalled();
    });

    it('should handle regen_simple strategy', async () => {
      const bridge = createGenerationBridge({ service: mockGenerationService });
      const context = createMockContext('regen_simple');

      await bridge.resolveContent(context);
      expect(mockGenerationService.generate).toHaveBeenCalled();
    });

    it('should handle regen_with_context strategy', async () => {
      const bridge = createGenerationBridge({ service: mockGenerationService });
      const context = createMockContext('regen_with_context');

      await bridge.resolveContent(context);
      expect(mockGenerationService.generate).toHaveBeenCalled();
    });

    it('should handle refine_result strategy', async () => {
      const bridge = createGenerationBridge({ service: mockGenerationService });
      const context = createMockContext('refine_result');

      await bridge.resolveContent(context);
      expect(mockGenerationService.generate).toHaveBeenCalled();
    });
  });

  describe('createBlockGenerationHooks', () => {
    it('should return hooks object', () => {
      const hooks = createBlockGenerationHooks({ blockResolver: mockBlockResolver });

      expect(hooks).toBeDefined();
      expect(hooks.resolveContent).toBeDefined();
    });
  });

  describe('createFusionGenerationHooks', () => {
    it('should return hooks object', () => {
      const hooks = createFusionGenerationHooks({ bridge: createGenerationBridge({}), fusionResolver: mockFusionResolver });

      expect(hooks).toBeDefined();
      expect(hooks.resolveContent).toBeDefined();
    });
  });

  describe('isExplicitStrategy', () => {
    it('should return true for explicit strategies', () => {
      expect(isExplicitStrategy('extend_video')).toBe(true);
      expect(isExplicitStrategy('regen_simple')).toBe(true);
      expect(isExplicitStrategy('regen_with_context')).toBe(true);
      expect(isExplicitStrategy('refine_result')).toBe(true);
    });

    it('should return false for non-explicit strategies', () => {
      expect(isExplicitStrategy('generate_new')).toBe(false);
      expect(isExplicitStrategy('pool_only')).toBe(false);
      expect(isExplicitStrategy('pool_fallback')).toBe(false);
      expect(isExplicitStrategy('generate_fallback')).toBe(false);
      expect(isExplicitStrategy('dynamic')).toBe(false);
    });
  });
});
