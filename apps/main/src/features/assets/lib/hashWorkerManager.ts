/**
 * Hash Worker Manager
 *
 * Manages a pool of Web Workers for off-main-thread SHA-256 hashing with:
 * - resilient worker recovery (single worker crash does not disable the pool)
 * - adaptive scheduling (size-aware with aging to avoid starvation)
 * - optional per-file progress callbacks
 */

import { computeFileSha256 } from '@pixsim7/shared.helpers.core';

import type { HashProgressPhase, HashWorkerResponse } from '../workers/hashWorker';

type HashWorkerProgress = {
  loadedBytes: number;
  totalBytes: number;
  phase: HashProgressPhase;
};

type ComputeHashOptions = {
  onProgress?: (progress: HashWorkerProgress) => void;
};

type PendingRequest = {
  id: string;
  file: File;
  createdAtMs: number;
  retries: number;
  resolve: (sha256: string) => void;
  reject: (error: Error) => void;
  onProgress?: (progress: HashWorkerProgress) => void;
  timeout: ReturnType<typeof setTimeout> | null;
};

type WorkerSlot = {
  slotId: number;
  worker: Worker;
  activeRequestId: string | null;
  retireWhenIdle: boolean;
};

const MIN_POOL_SIZE = 1;
const MAX_POOL_SIZE = 8;
const HASH_REQUEST_TIMEOUT_MS = 45_000;
const MAX_TASK_RETRIES = 1;
const AGING_FULL_BOOST_MS = 15_000;

function getDefaultPoolSize(): number {
  const hardware = typeof navigator !== 'undefined'
    ? navigator.hardwareConcurrency
    : undefined;
  const baseline = Number.isFinite(hardware) ? Math.floor((hardware as number) / 2) : 2;
  return Math.max(2, Math.min(4, baseline));
}

function normalizePoolSize(size: number): number {
  const n = Math.trunc(size);
  if (!Number.isFinite(n)) return getDefaultPoolSize();
  return Math.min(MAX_POOL_SIZE, Math.max(MIN_POOL_SIZE, n));
}

function toError(error: unknown, fallbackMessage: string): Error {
  if (error instanceof Error) return error;
  return new Error(typeof error === 'string' ? error : fallbackMessage);
}

let workerSlots: WorkerSlot[] = [];
let nextSlotId = 0;
let requestCounter = 0;
let desiredPoolSize = getDefaultPoolSize();

const queuedRequests: PendingRequest[] = [];
const inFlightRequests = new Map<string, PendingRequest>();

let workerCreationWarned = false;
let fallbackWarned = false;

function logWorkerCreationFailure(error: unknown): void {
  if (workerCreationWarned) return;
  workerCreationWarned = true;
  console.warn('[HashWorkerManager] Failed to create hash worker:', error);
}

function logFallback(reason: string): void {
  if (fallbackWarned) return;
  fallbackWarned = true;
  console.warn(`[HashWorkerManager] Falling back to main-thread hashing (${reason})`);
}

function getSlotById(slotId: number): WorkerSlot | null {
  return workerSlots.find((slot) => slot.slotId === slotId) || null;
}

function removeSlot(slotId: number): void {
  workerSlots = workerSlots.filter((slot) => slot.slotId !== slotId);
}

function terminateWorkerInstance(worker: Worker): void {
  try {
    worker.terminate();
  } catch {
    // Ignore best-effort terminate failures.
  }
}

function terminateSlot(slot: WorkerSlot): void {
  terminateWorkerInstance(slot.worker);
  removeSlot(slot.slotId);
}

function clearRequestTimeout(request: PendingRequest): void {
  if (request.timeout) {
    clearTimeout(request.timeout);
    request.timeout = null;
  }
}

async function resolveWithMainThreadFallback(
  request: PendingRequest,
  fallbackReason: string,
): Promise<void> {
  logFallback(fallbackReason);
  try {
    const totalBytes = request.file.size;
    request.onProgress?.({
      loadedBytes: totalBytes,
      totalBytes,
      phase: 'digesting',
    });
    const sha256 = await computeFileSha256(request.file);
    request.resolve(sha256);
  } catch (error) {
    request.reject(toError(error, 'Main-thread hash failed'));
  }
}

function computeQueueScore(request: PendingRequest, nowMs: number): number {
  const size = Math.max(1, request.file.size || 1);
  const ageMs = Math.max(0, nowMs - request.createdAtMs);
  const ageDiscount = Math.min(0.85, ageMs / AGING_FULL_BOOST_MS);
  return size * (1 - ageDiscount);
}

function dequeueNextRequest(): PendingRequest | undefined {
  if (queuedRequests.length === 0) return undefined;

  const nowMs = Date.now();
  let bestIndex = 0;
  let bestScore = Number.POSITIVE_INFINITY;

  for (let i = 0; i < queuedRequests.length; i++) {
    const req = queuedRequests[i];
    const score = computeQueueScore(req, nowMs);
    if (score < bestScore) {
      bestScore = score;
      bestIndex = i;
    }
  }

  const [next] = queuedRequests.splice(bestIndex, 1);
  return next;
}

function handleRequestFailure(
  slot: WorkerSlot | null,
  requestId: string,
  error: Error,
  retryOnWorker: boolean,
): void {
  const request = inFlightRequests.get(requestId);
  if (!request) {
    if (slot && slot.activeRequestId === requestId) {
      slot.activeRequestId = null;
    }
    return;
  }

  inFlightRequests.delete(requestId);
  clearRequestTimeout(request);

  if (slot && slot.activeRequestId === requestId) {
    slot.activeRequestId = null;
  }

  const canRetry = retryOnWorker && request.retries < MAX_TASK_RETRIES && workerSlots.length > 0;
  if (canRetry) {
    request.retries += 1;
    request.createdAtMs = Date.now();
    queuedRequests.unshift(request);
  } else {
    void resolveWithMainThreadFallback(request, error.message).finally(() => {
      dispatchWork();
    });
  }

  if (slot && slot.retireWhenIdle && slot.activeRequestId === null) {
    terminateSlot(slot);
  }
}

function handleWorkerMessage(slotId: number, event: MessageEvent<HashWorkerResponse>): void {
  const slot = getSlotById(slotId);
  if (!slot) return;

  const data = event.data;
  const request = inFlightRequests.get(data.id);
  if (!request) return;

  if (data.kind === 'progress') {
    request.onProgress?.({
      loadedBytes: data.loadedBytes,
      totalBytes: data.totalBytes,
      phase: data.phase,
    });
    return;
  }

  inFlightRequests.delete(data.id);
  clearRequestTimeout(request);
  if (slot.activeRequestId === data.id) {
    slot.activeRequestId = null;
  }

  if (data.kind === 'error') {
    void resolveWithMainThreadFallback(request, data.error).finally(() => {
      dispatchWork();
    });
  } else {
    request.resolve(data.sha256);
    dispatchWork();
  }

  if (slot.retireWhenIdle && slot.activeRequestId === null) {
    terminateSlot(slot);
  }
}

function createWorkerInstance(slotId: number): Worker | null {
  try {
    const worker = new Worker(
      new URL('../workers/hashWorker.ts', import.meta.url),
      { type: 'module' },
    );

    worker.addEventListener('message', (event: MessageEvent<HashWorkerResponse>) => {
      handleWorkerMessage(slotId, event);
    });

    worker.addEventListener('error', (event) => {
      const message = event.message || 'Unknown hash worker error';
      handleWorkerCrash(slotId, new Error(message));
    });

    worker.addEventListener('messageerror', () => {
      handleWorkerCrash(slotId, new Error('Hash worker message protocol error'));
    });

    return worker;
  } catch (error) {
    logWorkerCreationFailure(error);
    return null;
  }
}

function replaceSlotWorker(slot: WorkerSlot, reason: Error): WorkerSlot | null {
  console.warn('[HashWorkerManager] Replacing failed worker', {
    slotId: slot.slotId,
    reason: reason.message,
  });

  terminateWorkerInstance(slot.worker);
  const nextWorker = createWorkerInstance(slot.slotId);
  if (!nextWorker) {
    removeSlot(slot.slotId);
    return null;
  }

  slot.worker = nextWorker;
  slot.activeRequestId = null;
  return slot;
}

function handleWorkerCrash(slotId: number, reason: Error): void {
  const slot = getSlotById(slotId);
  if (!slot) return;

  const activeRequestId = slot.activeRequestId;
  const recoveredSlot = replaceSlotWorker(slot, reason);

  if (activeRequestId) {
    handleRequestFailure(recoveredSlot, activeRequestId, reason, true);
  }

  dispatchWork();
}

function ensurePool(): void {
  // Grow pool up to desired size.
  while (workerSlots.length < desiredPoolSize) {
    const slotId = ++nextSlotId;
    const worker = createWorkerInstance(slotId);
    if (!worker) break;
    workerSlots.push({
      slotId,
      worker,
      activeRequestId: null,
      retireWhenIdle: false,
    });
  }

  // Shrink pool if needed: terminate idle first, then mark active for retirement.
  let overflow = workerSlots.length - desiredPoolSize;
  if (overflow <= 0) return;

  const idleSlots = workerSlots.filter((slot) => slot.activeRequestId === null);
  for (const slot of idleSlots) {
    if (overflow <= 0) break;
    terminateSlot(slot);
    overflow -= 1;
  }

  if (overflow <= 0) return;

  for (const slot of workerSlots) {
    if (overflow <= 0) break;
    if (slot.activeRequestId !== null) {
      slot.retireWhenIdle = true;
      overflow -= 1;
    }
  }
}

function assignRequestToSlot(slot: WorkerSlot, request: PendingRequest): void {
  slot.activeRequestId = request.id;
  inFlightRequests.set(request.id, request);

  request.timeout = setTimeout(() => {
    const activeSlot = getSlotById(slot.slotId);
    if (!activeSlot || activeSlot.activeRequestId !== request.id) return;
    handleWorkerCrash(slot.slotId, new Error(`Hash worker timeout after ${HASH_REQUEST_TIMEOUT_MS}ms`));
  }, HASH_REQUEST_TIMEOUT_MS);

  try {
    slot.worker.postMessage({ id: request.id, file: request.file });
  } catch (error) {
    handleWorkerCrash(slot.slotId, toError(error, 'Failed to post hash task to worker'));
  }
}

function dispatchWork(): void {
  ensurePool();

  if (workerSlots.length === 0) {
    while (queuedRequests.length > 0) {
      const request = queuedRequests.shift();
      if (!request) continue;
      void resolveWithMainThreadFallback(request, 'no_workers_available');
    }
    return;
  }

  for (const slot of [...workerSlots]) {
    if (slot.activeRequestId !== null) continue;
    if (slot.retireWhenIdle) {
      terminateSlot(slot);
      continue;
    }

    const next = dequeueNextRequest();
    if (!next) break;
    assignRequestToSlot(slot, next);
  }
}

/**
 * Compute SHA-256 of a File using the hash worker pool.
 * Falls back to main-thread hashing if workers are unavailable.
 */
export async function computeFileSha256Worker(
  file: File,
  options?: ComputeHashOptions,
): Promise<string> {
  ensurePool();

  if (workerSlots.length === 0) {
    logFallback('workers_unavailable');
    return computeFileSha256(file);
  }

  const id = `hash_${++requestCounter}`;
  return await new Promise<string>((resolve, reject) => {
    queuedRequests.push({
      id,
      file,
      createdAtMs: Date.now(),
      retries: 0,
      resolve,
      reject,
      onProgress: options?.onProgress,
      timeout: null,
    });
    dispatchWork();
  });
}

/**
 * Configure desired worker pool size for hashing.
 */
export function setHashWorkerPoolSize(size: number): void {
  desiredPoolSize = normalizePoolSize(size);
  ensurePool();
  dispatchWork();
}

/**
 * Terminate all workers and reset manager state.
 */
export function disposeHashWorkers(): void {
  for (const request of inFlightRequests.values()) {
    clearRequestTimeout(request);
    request.reject(new Error('Hash workers disposed'));
  }
  inFlightRequests.clear();

  while (queuedRequests.length > 0) {
    const request = queuedRequests.shift();
    if (request) {
      request.reject(new Error('Hash workers disposed'));
    }
  }

  for (const slot of workerSlots) {
    terminateWorkerInstance(slot.worker);
  }
  workerSlots = [];

  requestCounter = 0;
  nextSlotId = 0;
  desiredPoolSize = getDefaultPoolSize();
  workerCreationWarned = false;
  fallbackWarned = false;
}

export type { ComputeHashOptions, HashWorkerProgress };

