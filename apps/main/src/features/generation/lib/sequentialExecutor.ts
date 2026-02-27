import { getGeneration, type GenerationResponse, type GenerationStatus } from '@lib/api/generations';

export const SEQUENTIAL_TERMINAL_GENERATION_STATUSES = [
  'completed',
  'failed',
  'cancelled',
] as const satisfies readonly GenerationStatus[];

export type SequentialTerminalGenerationStatus =
  (typeof SEQUENTIAL_TERMINAL_GENERATION_STATUSES)[number];

export interface SequentialGenerationTerminalResult {
  generation: GenerationResponse;
  generationId: number;
  status: SequentialTerminalGenerationStatus;
  assetId: number | null;
  errorMessage?: string | null;
}

export interface WaitForGenerationTerminalOptions {
  pollIntervalMs?: number;
  timeoutMs?: number;
  signal?: AbortSignal | null;
  getGenerationById?: (generationId: number) => Promise<GenerationResponse>;
  onPoll?: (generation: GenerationResponse) => void;
}

export class SequentialStepTimeoutError extends Error {
  constructor(
    public readonly generationId: number,
    public readonly timeoutMs: number,
  ) {
    super(`Generation ${generationId} did not complete within ${timeoutMs}ms`);
    this.name = 'SequentialStepTimeoutError';
  }
}

export async function waitForGenerationTerminal(
  generationId: number,
  options: WaitForGenerationTerminalOptions = {},
): Promise<SequentialGenerationTerminalResult> {
  const {
    pollIntervalMs = 2000,
    timeoutMs = 10 * 60 * 1000,
    signal,
    getGenerationById = getGeneration,
    onPoll,
  } = options;

  const startedAt = Date.now();

  while (true) {
    if (signal?.aborted) {
      throw signal.reason instanceof Error
        ? signal.reason
        : new DOMException('Aborted', 'AbortError');
    }

    const generation = await getGenerationById(generationId);
    onPoll?.(generation);

    if (
      generation.status === 'completed' ||
      generation.status === 'failed' ||
      generation.status === 'cancelled'
    ) {
      return {
        generation,
        generationId,
        status: generation.status,
        assetId: generation.asset?.id ?? null,
        errorMessage: generation.error_message,
      };
    }

    if (Date.now() - startedAt >= timeoutMs) {
      throw new SequentialStepTimeoutError(generationId, timeoutMs);
    }

    await new Promise<void>((resolve, reject) => {
      const timer = globalThis.setTimeout(() => {
        cleanup();
        resolve();
      }, pollIntervalMs);

      const onAbort = () => {
        cleanup();
        reject(
          signal?.reason instanceof Error
            ? signal.reason
            : new DOMException('Aborted', 'AbortError'),
        );
      };

      const cleanup = () => {
        globalThis.clearTimeout(timer);
        signal?.removeEventListener('abort', onAbort);
      };

      signal?.addEventListener('abort', onAbort, { once: true });
    });
  }
}

export type SequentialExecutionStepStatus =
  | 'pending'
  | 'submitting'
  | 'waiting'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'timeout'
  | 'skipped';

export interface SequentialExecutionStepDefinition<TStepMeta = Record<string, unknown>> {
  id: string;
  label?: string;
  metadata?: TStepMeta;
}

export interface SequentialExecutionStepRecord<TStepMeta = Record<string, unknown>> {
  step: SequentialExecutionStepDefinition<TStepMeta>;
  index: number;
  total: number;
  status: SequentialExecutionStepStatus;
  generationId: number | null;
  generationStatus: GenerationStatus | null;
  assetId: number | null;
  errorMessage: string | null;
  startedAt: number | null;
  completedAt: number | null;
  durationMs: number | null;
}

export interface SequentialExecutionResult<TStepMeta = Record<string, unknown>> {
  status: 'completed' | 'failed' | 'cancelled';
  steps: SequentialExecutionStepRecord<TStepMeta>[];
  completedStepCount: number;
  failedStepIndex: number | null;
  lastGenerationId: number | null;
  lastAssetId: number | null;
}

export interface SequentialSubmitStepResult {
  generationId: number;
}

export interface SequentialStepExecutionContext<TStepMeta = Record<string, unknown>> {
  step: SequentialExecutionStepDefinition<TStepMeta>;
  stepIndex: number;
  stepTotal: number;
  priorSteps: readonly SequentialExecutionStepRecord<TStepMeta>[];
  previousStep: SequentialExecutionStepRecord<TStepMeta> | null;
  previousGenerationId: number | null;
  previousAssetId: number | null;
  signal?: AbortSignal | null;
}

export interface ExecuteSequentialStepsOptions<TStepMeta = Record<string, unknown>> {
  steps: readonly SequentialExecutionStepDefinition<TStepMeta>[];
  submitStep: (
    context: SequentialStepExecutionContext<TStepMeta>,
  ) => Promise<SequentialSubmitStepResult>;
  waitForStep?: (
    generationId: number,
    context: SequentialStepExecutionContext<TStepMeta>,
  ) => Promise<SequentialGenerationTerminalResult>;
  onStepUpdate?: (record: SequentialExecutionStepRecord<TStepMeta>) => void;
  continueOnFailure?: boolean;
  signal?: AbortSignal | null;
}

function cloneStepRecord<TStepMeta>(
  record: SequentialExecutionStepRecord<TStepMeta>,
): SequentialExecutionStepRecord<TStepMeta> {
  return { ...record };
}

function makeInitialStepRecord<TStepMeta>(
  step: SequentialExecutionStepDefinition<TStepMeta>,
  index: number,
  total: number,
): SequentialExecutionStepRecord<TStepMeta> {
  return {
    step,
    index,
    total,
    status: 'pending',
    generationId: null,
    generationStatus: null,
    assetId: null,
    errorMessage: null,
    startedAt: null,
    completedAt: null,
    durationMs: null,
  };
}

export async function executeSequentialSteps<TStepMeta = Record<string, unknown>>(
  options: ExecuteSequentialStepsOptions<TStepMeta>,
): Promise<SequentialExecutionResult<TStepMeta>> {
  const {
    steps,
    submitStep,
    waitForStep = (generationId) => waitForGenerationTerminal(generationId),
    onStepUpdate,
    continueOnFailure = false,
    signal,
  } = options;

  const stepRecords: SequentialExecutionStepRecord<TStepMeta>[] = steps.map((step, index) =>
    makeInitialStepRecord(step, index, steps.length),
  );

  let lastGenerationId: number | null = null;
  let lastAssetId: number | null = null;
  let failedStepIndex: number | null = null;

  for (let i = 0; i < stepRecords.length; i++) {
    if (signal?.aborted) {
      return {
        status: 'cancelled',
        steps: stepRecords.map(cloneStepRecord),
        completedStepCount: stepRecords.filter((s) => s.status === 'completed').length,
        failedStepIndex,
        lastGenerationId,
        lastAssetId,
      };
    }

    const record = stepRecords[i];
    const previousStep = i > 0 ? stepRecords[i - 1] : null;
    const context: SequentialStepExecutionContext<TStepMeta> = {
      step: record.step,
      stepIndex: i,
      stepTotal: stepRecords.length,
      priorSteps: stepRecords.slice(0, i).map(cloneStepRecord),
      previousStep: previousStep ? cloneStepRecord(previousStep) : null,
      previousGenerationId: lastGenerationId,
      previousAssetId: lastAssetId,
      signal,
    };

    record.status = 'submitting';
    record.startedAt = Date.now();
    onStepUpdate?.(cloneStepRecord(record));

    try {
      const submission = await submitStep(context);
      record.generationId = submission.generationId;
      lastGenerationId = submission.generationId;
      record.status = 'waiting';
      onStepUpdate?.(cloneStepRecord(record));

      const terminal = await waitForStep(submission.generationId, context);
      record.generationStatus = terminal.status;
      record.assetId = terminal.assetId;
      record.errorMessage = terminal.errorMessage ?? null;
      record.completedAt = Date.now();
      record.durationMs = record.startedAt ? record.completedAt - record.startedAt : null;

      if (terminal.status === 'completed') {
        record.status = 'completed';
        lastAssetId = terminal.assetId;
      } else if (terminal.status === 'cancelled') {
        record.status = 'cancelled';
      } else {
        record.status = 'failed';
      }

      onStepUpdate?.(cloneStepRecord(record));

      if (record.status !== 'completed') {
        failedStepIndex = i;
        if (!continueOnFailure) {
          return {
            status: record.status === 'cancelled' ? 'cancelled' : 'failed',
            steps: stepRecords.map(cloneStepRecord),
            completedStepCount: stepRecords.filter((s) => s.status === 'completed').length,
            failedStepIndex,
            lastGenerationId,
            lastAssetId,
          };
        }
      }
    } catch (error) {
      record.completedAt = Date.now();
      record.durationMs = record.startedAt ? record.completedAt - record.startedAt : null;
      record.errorMessage = error instanceof Error ? error.message : String(error);
      record.status = error instanceof SequentialStepTimeoutError ? 'timeout' : 'failed';
      onStepUpdate?.(cloneStepRecord(record));
      failedStepIndex = i;

      if (!continueOnFailure) {
        return {
          status: 'failed',
          steps: stepRecords.map(cloneStepRecord),
          completedStepCount: stepRecords.filter((s) => s.status === 'completed').length,
          failedStepIndex,
          lastGenerationId,
          lastAssetId,
        };
      }
    }
  }

  return {
    status: 'completed',
    steps: stepRecords.map(cloneStepRecord),
    completedStepCount: stepRecords.filter((s) => s.status === 'completed').length,
    failedStepIndex,
    lastGenerationId,
    lastAssetId,
  };
}

export interface SequentialStepRunContextMetadataInput {
  chainId?: string;
  executionId?: string;
  stepId: string;
  stepIndex: number;
  stepTotal: number;
  sourceGenerationId?: number | null;
  sourceAssetId?: number | null;
  metadata?: Record<string, unknown>;
}

/**
 * Canonical runContext metadata patch for sequential/chain-like execution.
 * Merge this into GenerationRunItemDescriptor.metadata / run descriptor metadata.
 */
export function createSequentialStepRunContextMetadata(
  input: SequentialStepRunContextMetadataInput,
): Record<string, unknown> {
  return {
    ...(input.metadata || {}),
    ...(input.chainId ? { chain_id: input.chainId } : {}),
    ...(input.executionId ? { chain_execution_id: input.executionId } : {}),
    chain_step_id: input.stepId,
    chain_step_index: input.stepIndex,
    chain_total_steps: input.stepTotal,
    ...(input.sourceGenerationId != null ? { chain_source_generation_id: input.sourceGenerationId } : {}),
    ...(input.sourceAssetId != null ? { chain_source_asset_id: input.sourceAssetId } : {}),
  };
}
