import type {
  ExecuteInteractionRequest,
  ExecuteInteractionResponse,
  GameSessionDTO,
  GameWorldDetail,
} from '@pixsim7/shared.types';
import { describe, expect, it, vi } from 'vitest';
import { createGameRuntime } from '../GameRuntime';

function createSession(flags: Record<string, unknown> = {}): GameSessionDTO {
  return {
    id: 1,
    user_id: 100,
    scene_id: 1,
    current_node_id: 1,
    world_id: 1,
    flags,
    stats: {},
    world_time: 0,
    version: 1,
  };
}

function createRuntime(session: GameSessionDTO) {
  const executeInteraction = vi.fn(
    async (_req: ExecuteInteractionRequest): Promise<ExecuteInteractionResponse> => ({
      success: true,
      timestamp: Date.now(),
    })
  );
  const resolveTemplate = vi.fn(async () => ({
    resolved: true,
    runtimeKind: 'npc',
    runtimeId: 1,
    templateKind: 'characterInstance',
    templateId: 'default',
  }));

  const runtime = createGameRuntime({
    apiClient: {
      fetchSession: vi.fn(async () => session),
      updateSession: vi.fn(async () => session),
      createSession: vi.fn(async () => session),
      getWorld: vi.fn(async () => ({ id: 1, world_time: 0 } as GameWorldDetail)),
      advanceWorldTime: vi.fn(async () => ({ id: 1, world_time: 0 } as GameWorldDetail)),
      listInteractions: vi.fn(async () => ({
        interactions: [],
        worldId: 1,
        sessionId: 1,
        timestamp: Date.now(),
      })),
      executeInteraction,
      resolveTemplate,
    },
  });

  return { runtime, executeInteraction, resolveTemplate };
}

describe('GameRuntime target normalization via game object paths', () => {
  it('resolves legacy inventory item IDs into canonical item refs', async () => {
    const session = createSession({
      inventory: { items: [{ id: 'flower', qty: 2 }] },
    });
    const { runtime, executeInteraction } = createRuntime(session);
    await runtime.loadSession(1, false);

    await runtime.applyInteraction({
      interactionId: 'give_item',
      worldId: 1,
      sessionId: 1,
      target: {
        kind: 'item',
        id: 'flower',
      },
    });

    expect(executeInteraction).toHaveBeenCalledTimes(1);
    const request = executeInteraction.mock.calls[0][0] as ExecuteInteractionRequest;
    expect(request.target).toMatchObject({
      kind: 'item',
      id: 'flower',
      ref: 'item:flower',
    });
    expect(request.participants?.[0]).toMatchObject({
      role: 'target',
      kind: 'item',
      id: 'flower',
      ref: 'item:flower',
    });
  });

  it('preserves string refs and infers kind/id for non-numeric custom targets', async () => {
    const session = createSession();
    const { runtime, executeInteraction } = createRuntime(session);
    await runtime.loadSession(1, false);

    await runtime.applyInteraction({
      interactionId: 'inspect_artifact',
      worldId: 1,
      sessionId: 1,
      target: {
        ref: 'artifact:rune_alpha' as any,
      },
    });

    expect(executeInteraction).toHaveBeenCalledTimes(1);
    const request = executeInteraction.mock.calls[0][0] as ExecuteInteractionRequest;
    expect(request.target).toMatchObject({
      kind: 'artifact',
      id: 'rune_alpha',
      ref: 'artifact:rune_alpha',
    });
  });

  it('normalizes template/runtime kind aliases when resolving template targets', async () => {
    const session = createSession();
    const { runtime, executeInteraction, resolveTemplate } = createRuntime(session);
    resolveTemplate.mockResolvedValue({
      resolved: true,
      runtimeKind: 'gameNpc',
      runtimeId: 7,
      templateKind: 'characterInstance',
      templateId: 'char-1',
    });
    await runtime.loadSession(1, false);

    await runtime.applyInteraction({
      interactionId: 'talk_alias_target',
      worldId: 1,
      sessionId: 1,
      target: {
        templateKind: 'npc_template' as any,
        templateId: 'char-1',
      },
    });

    expect(resolveTemplate).toHaveBeenCalledWith(
      'characterInstance',
      'char-1',
      expect.any(Object)
    );

    expect(executeInteraction).toHaveBeenCalledTimes(1);
    const request = executeInteraction.mock.calls[0][0] as ExecuteInteractionRequest;
    expect(request.target).toMatchObject({
      kind: 'npc',
      id: 7,
      ref: 'npc:7',
    });
  });
});
