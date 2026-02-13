/**
 * Hash Worker Manager
 *
 * Manages a small pool of Web Workers for off-main-thread SHA-256 hashing.
 * Falls back to main-thread computation if workers are unavailable.
 */

import { computeFileSha256 } from '@pixsim7/shared.helpers.core';

import type { HashWorkerResponse } from '../workers/hashWorker';

type PendingRequest = {
  resolve: (sha256: string) => void;
  reject: (error: Error) => void;
};

const MIN_POOL_SIZE = 1;
const MAX_POOL_SIZE = 8;
const HASH_REQUEST_TIMEOUT_MS = 45000;

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

let workers: Worker[] = [];
let nextWorkerIndex = 0;
let workerFailed = false;
let failureWarned = false;
const pending = new Map<string, PendingRequest>();
let requestCounter = 0;
let desiredPoolSize = getDefaultPoolSize();

function createWorker(): Worker | null {
  try {
    const worker = new Worker(
      new URL('../workers/hashWorker.ts', import.meta.url),
      { type: 'module' },
    );

    worker.addEventListener('message', (event: MessageEvent<HashWorkerResponse>) => {
      const { id, sha256, error } = event.data;
      const req = pending.get(id);
      if (!req) return;
      pending.delete(id);

      if (error !== undefined) {
        req.reject(new Error(error));
      } else {
        req.resolve(sha256);
      }
    });

    worker.addEventListener('error', (event) => {
      // On hard worker error, reject all pending requests for this worker
      // and mark workers as failed so we fall back to main thread
      console.warn('[HashWorkerManager] Worker error:', event.message);
      workerFailed = true;
      terminateAll();

      // Reject all pending
      for (const [id, req] of pending) {
        pending.delete(id);
        req.reject(new Error('Hash worker crashed'));
      }
    });

    return worker;
  } catch (e) {
    if (!failureWarned) {
      failureWarned = true;
      console.warn('[HashWorkerManager] Failed to create hash worker, falling back to main thread:', e);
    }
    workerFailed = true;
    return null;
  }
}

function ensurePool(): boolean {
  if (workerFailed) return false;
  if (workers.length !== desiredPoolSize && pending.size === 0) {
    terminateAll();
  }
  if (workers.length > 0) return true;

  for (let i = 0; i < desiredPoolSize; i++) {
    const w = createWorker();
    if (!w) return false;
    workers.push(w);
  }
  return true;
}

function getNextWorker(): Worker {
  const worker = workers[nextWorkerIndex % workers.length];
  nextWorkerIndex++;
  return worker;
}

function terminateAll(): void {
  for (const w of workers) {
    try { w.terminate(); } catch { /* ignore */ }
  }
  workers = [];
  nextWorkerIndex = 0;
}

/**
 * Compute SHA-256 of a File using a Web Worker.
 * Falls back to main-thread `computeFileSha256` if workers are unavailable.
 */
export async function computeFileSha256Worker(file: File): Promise<string> {
  // Fast path: if workers previously failed, go straight to main thread
  if (workerFailed) {
    return computeFileSha256(file);
  }

  if (!ensurePool()) {
    return computeFileSha256(file);
  }

  const id = `hash_${++requestCounter}`;

  try {
    const sha256 = await new Promise<string>((resolve, reject) => {
      const timeout = setTimeout(() => {
        const req = pending.get(id);
        if (!req) return;
        pending.delete(id);
        reject(new Error(`Hash worker timeout after ${HASH_REQUEST_TIMEOUT_MS}ms`));
      }, HASH_REQUEST_TIMEOUT_MS);

      pending.set(id, {
        resolve: (value) => {
          clearTimeout(timeout);
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timeout);
          reject(error);
        },
      });

      const worker = getNextWorker();
      worker.postMessage({ id, file });
    });
    return sha256;
  } catch {
    // Worker-level failure: fall back to main thread for this file
    if (!failureWarned) {
      failureWarned = true;
      console.warn('[HashWorkerManager] Worker hash failed, falling back to main thread');
    }
    return computeFileSha256(file);
  }
}

/**
 * Configure desired worker pool size for hashing.
 * If workers are idle, pool is recreated immediately; otherwise it is applied
 * after in-flight requests complete.
 */
export function setHashWorkerPoolSize(size: number): void {
  desiredPoolSize = normalizePoolSize(size);
  if (pending.size === 0 && workers.length !== desiredPoolSize) {
    terminateAll();
  }
}

/**
 * Terminate all workers. Call on cleanup / unmount if needed.
 */
export function disposeHashWorkers(): void {
  terminateAll();
  workerFailed = false;
  failureWarned = false;
  pending.clear();
  requestCounter = 0;
  desiredPoolSize = getDefaultPoolSize();
}
