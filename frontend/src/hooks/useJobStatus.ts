import { useEffect, useRef, useState } from 'react';
import { getJob, type JobResponse } from '../lib/api/jobs';
import { useJobsStore, isJobTerminal } from '../stores/jobsStore';
import { pollUntil } from '../lib/polling/pollUntil';
import { jobsSelectors } from '../stores/selectors';

export interface UseJobStatusOptions {
  /** Base polling interval in ms (default: 3000) */
  intervalMs?: number;
  /** Max polling interval in ms (default: 30000) */
  maxIntervalMs?: number;
  /** Time before backoff starts in ms (default: 60000) */
  backoffStartMs?: number;
}

export function useJobStatus(
  jobId: number | null,
  opts?: UseJobStatusOptions
) {
  const { intervalMs = 3000, maxIntervalMs = 30000, backoffStartMs = 60000 } = opts ?? {};

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const job = useJobsStore(jobsSelectors.byId(jobId));
  const addOrUpdateJob = useJobsStore(s => s.addOrUpdateJob);
  const watchingJobId = useJobsStore(s => s.watchingJobId);
  const setWatchingJob = useJobsStore(s => s.setWatchingJob);

  const cancelRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!jobId) {
      setLoading(false);
      setError(null);
      return;
    }

    // Track currently watched job
    if (watchingJobId !== jobId) {
      setWatchingJob(jobId);
    }

    // Cancel any previous polling
    if (cancelRef.current) {
      cancelRef.current();
      cancelRef.current = null;
    }

    // Start polling with adaptive backoff
    setLoading(true);
    setError(null);

    const cancel = pollUntil(
      () => getJob(jobId),
      (data) => isJobTerminal(data.status),
      {
        base: intervalMs,
        max: maxIntervalMs,
        backoffStartMs,
        onFetch: (data: JobResponse) => {
          addOrUpdateJob(data);
          setLoading(false);
          setError(null);
        },
        onError: (err: any) => {
          const errorMsg = err.response?.data?.detail || err.message || 'Failed to fetch job';
          setError(errorMsg);
          setLoading(false);
        },
      }
    );

    cancelRef.current = cancel;

    return () => {
      cancel();
      cancelRef.current = null;
    };
  }, [jobId, intervalMs, maxIntervalMs, backoffStartMs, addOrUpdateJob, watchingJobId, setWatchingJob]);

  return { job, loading, error };
}
