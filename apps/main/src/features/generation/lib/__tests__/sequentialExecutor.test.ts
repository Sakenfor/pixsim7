import { describe, expect, it, vi } from 'vitest';

import {
  createSequentialStepRunContextMetadata,
  executeSequentialSteps,
  type SequentialExecutionStepDefinition,
} from '../sequentialExecutor';

describe('executeSequentialSteps', () => {
  it('passes previous asset/generation to later steps and completes in order', async () => {
    const steps: SequentialExecutionStepDefinition[] = [
      { id: 'step_a', label: 'A' },
      { id: 'step_b', label: 'B' },
    ];

    const seenContexts: Array<{ stepId: string; prevGen: number | null; prevAsset: number | null }> = [];
    const updates: Array<{ stepId: string; status: string }> = [];
    let nextGenerationId = 100;

    const result = await executeSequentialSteps({
      steps,
      submitStep: async (ctx) => {
        seenContexts.push({
          stepId: ctx.step.id,
          prevGen: ctx.previousGenerationId,
          prevAsset: ctx.previousAssetId,
        });
        return { generationId: nextGenerationId++ };
      },
      waitForStep: async (generationId) => ({
        generation: {
          id: generationId,
          status: 'completed',
          asset: { id: generationId + 1000 } as any,
          error_message: null,
        } as any,
        generationId,
        status: 'completed',
        assetId: generationId + 1000,
        errorMessage: null,
      }),
      onStepUpdate: (record) => {
        updates.push({ stepId: record.step.id, status: record.status });
      },
    });

    expect(result.status).toBe('completed');
    expect(result.completedStepCount).toBe(2);
    expect(result.lastGenerationId).toBe(101);
    expect(result.lastAssetId).toBe(1101);

    expect(seenContexts).toEqual([
      { stepId: 'step_a', prevGen: null, prevAsset: null },
      { stepId: 'step_b', prevGen: 100, prevAsset: 1100 },
    ]);

    expect(updates).toEqual(
      expect.arrayContaining([
        { stepId: 'step_a', status: 'submitting' },
        { stepId: 'step_a', status: 'waiting' },
        { stepId: 'step_a', status: 'completed' },
        { stepId: 'step_b', status: 'submitting' },
        { stepId: 'step_b', status: 'waiting' },
        { stepId: 'step_b', status: 'completed' },
      ]),
    );
  });

  it('stops on first failed terminal step by default', async () => {
    const submitStep = vi.fn(async (ctx: { stepIndex: number }) => ({ generationId: ctx.stepIndex + 1 }));

    const result = await executeSequentialSteps({
      steps: [{ id: 'one' }, { id: 'two' }, { id: 'three' }],
      submitStep,
      waitForStep: async (generationId) => ({
        generation: { id: generationId, status: generationId === 2 ? 'failed' : 'completed', asset: generationId === 2 ? null : ({ id: generationId * 10 } as any), error_message: generationId === 2 ? 'boom' : null } as any,
        generationId,
        status: generationId === 2 ? 'failed' : 'completed',
        assetId: generationId === 2 ? null : generationId * 10,
        errorMessage: generationId === 2 ? 'boom' : null,
      }),
    });

    expect(result.status).toBe('failed');
    expect(result.failedStepIndex).toBe(1);
    expect(result.steps[0]?.status).toBe('completed');
    expect(result.steps[1]?.status).toBe('failed');
    expect(result.steps[2]?.status).toBe('pending');
    expect(submitStep).toHaveBeenCalledTimes(2);
  });
});

describe('createSequentialStepRunContextMetadata', () => {
  it('produces canonical snake_case step metadata keys', () => {
    expect(
      createSequentialStepRunContextMetadata({
        chainId: 'chain_1',
        executionId: 'exec_1',
        stepId: 'step_a',
        stepIndex: 0,
        stepTotal: 3,
        sourceGenerationId: 42,
        sourceAssetId: 99,
        metadata: { custom_flag: true },
      }),
    ).toEqual({
      custom_flag: true,
      chain_id: 'chain_1',
      chain_execution_id: 'exec_1',
      chain_step_id: 'step_a',
      chain_step_index: 0,
      chain_total_steps: 3,
      chain_source_generation_id: 42,
      chain_source_asset_id: 99,
    });
  });
});

