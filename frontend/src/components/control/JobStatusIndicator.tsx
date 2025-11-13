import clsx from 'clsx';
import { useEffect, useState } from 'react';
import { useJobStatus } from '../../hooks/useJobStatus';
import { useJobsStore, isJobTerminal, type JobRecordExtended } from '../../stores/jobsStore';
import { cancelJob as apiCancelJob, retryJob as apiRetryJob } from '../../lib/api/jobs';
import { useToast } from '../../stores/toastStore';
import { formatRelativeTime } from '../../lib/time/formatDuration';
import { ccSelectors } from '../../stores/selectors';
import { useControlCenterStore } from '../../stores/controlCenterStore';

export interface JobStatusIndicatorProps {
  jobId: number;
  /** Variant: 'inline' for compact display, 'card' for full details */
  variant?: 'inline' | 'card';
}

export function JobStatusIndicator({ jobId, variant = 'inline' }: JobStatusIndicatorProps) {
  const { job, loading, error } = useJobStatus(jobId, { intervalMs: 3000 });
  const setWatchingJob = useJobsStore(s => s.setWatchingJob);
  const markCancelled = useJobsStore(s => s.markCancelled);
  const setLastCreatedJob = useJobsStore(s => s.setLastCreatedJob);
  const addOrUpdateJob = useJobsStore(s => s.addOrUpdateJob);
  const generating = useControlCenterStore(ccSelectors.generating);

  const toast = useToast();
  const [isRetrying, setIsRetrying] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    if (job && isJobTerminal(job.status)) {
      // Stop actively watching when done
      setWatchingJob(null);
    }
  }, [job, setWatchingJob]);

  const status = job?.status || (loading ? 'pending' : undefined);
  const label = error ? 'Error' : status ? status : 'Unknown';

  const jobExtended = job as JobRecordExtended | undefined;
  const canRetry = status === 'failed' && !generating && jobExtended?.originalParams;
  const canCancel = status && ['pending', 'processing', 'queued'].includes(status);

  const handleRetry = async () => {
    if (!jobExtended || !canRetry) return;

    // Confirm action
    if (!window.confirm(`Retry job #${jobId}?`)) return;

    setIsRetrying(true);
    try {
      const newJob = await apiRetryJob(jobExtended);
      addOrUpdateJob(newJob, jobExtended.originalParams);
      setLastCreatedJob(newJob.id);
      toast.success(`Retry submitted (#${newJob.id})`);
    } catch (err: any) {
      const msg = err.response?.data?.detail || err.message || 'Failed to retry job';
      toast.error(msg);
    } finally {
      setIsRetrying(false);
    }
  };

  const handleCancel = async () => {
    if (!canCancel) return;

    // Confirm action
    if (!window.confirm(`Cancel job #${jobId}?`)) return;

    setIsCancelling(true);
    try {
      await apiCancelJob(jobId);
      markCancelled(jobId);
      toast.success(`Job #${jobId} cancelled`);
    } catch (err: any) {
      // Handle race condition: job already terminal
      if (err.response?.status === 404 || err.response?.status === 400) {
        toast.info('Job already completed or failed');
      } else {
        const msg = err.response?.data?.detail || err.message || 'Failed to cancel job';
        toast.error(msg);
      }
    } finally {
      setIsCancelling(false);
    }
  };

  const color = error
    ? 'bg-red-100 text-red-700 border-red-300 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800'
    : status === 'completed'
    ? 'bg-green-100 text-green-700 border-green-300 dark:bg-green-900/30 dark:text-green-300 dark:border-green-800'
    : status === 'failed'
    ? 'bg-red-100 text-red-700 border-red-300 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800'
    : 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800';

  // Inline variant (legacy, compact)
  if (variant === 'inline') {
    return (
      <div className={clsx('text-xs inline-flex items-center gap-2 p-2 rounded border', color)}>
        <span>Job #{jobId}</span>
        <span className="opacity-80">{label}</span>
        {job?.error_message && (
          <span className="opacity-80">- {job.error_message}</span>
        )}
        {job?.completed_at && (
          <span className="opacity-60">at {new Date(job.completed_at).toLocaleTimeString()}</span>
        )}
      </div>
    );
  }

  // Card variant (full details with actions)
  return (
    <div className={clsx('text-sm rounded border p-3 flex flex-col gap-2', color)} role="status">
      {/* Header */}
      <div className="flex items-center gap-2 justify-between">
        <div className="flex items-center gap-2">
          <span className="font-medium">Job #{jobId}</span>
          <span className="opacity-80 capitalize">{label}</span>
          {(job?.retry_count ?? 0) > 0 && (
            <span
              className="text-xs px-1.5 py-0.5 rounded bg-white/50 dark:bg-black/20"
              title={`Retry count: ${job?.retry_count}`}
            >
              Retry {job?.retry_count}
            </span>
          )}
        </div>
        <span className="text-xs opacity-60">
          {job?.created_at ? formatRelativeTime(job.created_at) : ''}
        </span>
      </div>

      {/* Error message (expandable) */}
      {job?.error_message && (
        <div className="text-xs">
          <button
            onClick={() => setShowDetails(!showDetails)}
            className="text-current opacity-80 hover:opacity-100 underline"
          >
            {showDetails ? 'Hide' : 'Show'} error details
          </button>
          {showDetails && (
            <div className="mt-1 p-2 bg-white/50 dark:bg-black/20 rounded font-mono text-xs break-words">
              {job.error_message}
            </div>
          )}
        </div>
      )}

      {/* Parent job reference */}
      {job?.parent_job_id && (
        <div className="text-xs opacity-70">
          Retry of <span className="font-medium">#{job.parent_job_id}</span>
        </div>
      )}

      {/* Action buttons */}
      {(canRetry || canCancel) && (
        <div className="flex gap-2 pt-1">
          {canRetry && (
            <button
              onClick={handleRetry}
              disabled={isRetrying}
              className={clsx(
                'text-xs px-3 py-1.5 rounded border transition-colors',
                'bg-white dark:bg-neutral-900',
                'border-current hover:bg-current hover:text-white dark:hover:text-black',
                'disabled:opacity-50 disabled:cursor-not-allowed'
              )}
              aria-label="Retry job"
            >
              {isRetrying ? 'Retrying...' : 'Retry'}
            </button>
          )}
          {canCancel && (
            <button
              onClick={handleCancel}
              disabled={isCancelling}
              className={clsx(
                'text-xs px-3 py-1.5 rounded border transition-colors',
                'bg-white dark:bg-neutral-900',
                'border-current hover:bg-current hover:text-white dark:hover:text-black',
                'disabled:opacity-50 disabled:cursor-not-allowed'
              )}
              aria-label="Cancel job"
            >
              {isCancelling ? 'Cancelling...' : 'Cancel'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
