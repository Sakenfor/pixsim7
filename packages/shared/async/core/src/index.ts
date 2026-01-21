/**
 * @pixsim7/shared.async
 *
 * Async utilities (polling, debouncing, etc.) - framework-agnostic.
 *
 * This package provides utilities for async operations like polling with
 * adaptive backoff, debouncing, throttling, etc.
 *
 * @example
 * ```ts
 * import { pollUntil } from '@pixsim7/shared.async.core';
 *
 * const cancel = pollUntil(
 *   () => fetchJob(jobId),
 *   (job) => job.status === 'completed',
 *   { base: 3000, max: 30000 }
 * );
 * ```
 *
 * @packageDocumentation
 */

export * from './pollUntil';
