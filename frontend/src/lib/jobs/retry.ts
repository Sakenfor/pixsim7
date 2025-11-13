/**
 * Job retry utilities.
 * Wraps the retryJob API call with additional logic for parent_job_id tracking.
 */

import { retryJob as apiRetryJob, type JobResponse } from '../api/jobs';

export interface RetryOptions {
  /** Optional callback when retry succeeds */
  onSuccess?: (newJob: JobResponse) => void;
  /** Optional callback when retry fails */
  onError?: (error: any) => void;
}

/**
 * Retry a failed job, creating a new job with the same parameters.
 * Automatically links the new job to the failed job via parent_job_id.
 *
 * @param failedJob - The failed job to retry
 * @param options - Optional callbacks
 * @returns Promise resolving to the new job
 *
 * @example
 * ```ts
 * const newJob = await retryFailedJob(failedJob, {
 *   onSuccess: (job) => console.log('Retry created:', job.id),
 *   onError: (err) => console.error('Retry failed:', err),
 * });
 * ```
 */
export async function retryFailedJob(
  failedJob: JobResponse,
  options?: RetryOptions
): Promise<JobResponse> {
  try {
    const newJob = await apiRetryJob(failedJob);

    // Invoke success callback
    options?.onSuccess?.(newJob);

    return newJob;
  } catch (error) {
    // Invoke error callback
    options?.onError?.(error);
    throw error;
  }
}

/**
 * Check if a job can be retried.
 * A job can be retried if it has failed and has original params available.
 *
 * @param job - Job to check
 * @param originalParams - Original parameters used to create the job
 * @returns True if the job can be retried
 */
export function canRetryJob(
  job: JobResponse | undefined,
  originalParams?: Record<string, any>
): boolean {
  if (!job) return false;
  if (job.status !== 'failed') return false;

  // Check if we have params to retry with
  return Boolean(originalParams || job.params);
}

/**
 * Get a human-readable message about why a job cannot be retried.
 *
 * @param job - Job to check
 * @param originalParams - Original parameters
 * @returns Reason message or null if can retry
 */
export function getRetryDisabledReason(
  job: JobResponse | undefined,
  originalParams?: Record<string, any>
): string | null {
  if (!job) return 'Job not found';
  if (job.status !== 'failed') return 'Job has not failed';
  if (!originalParams && !job.params) return 'Original parameters not available';
  return null;
}
