import { apiClient } from './client';

export type JobStatus = 'queued' | 'pending' | 'processing' | 'completed' | 'failed';

export interface JobResponse {
  id: number;
  user_id: number;
  workspace_id?: number | null;
  operation_type: string;
  provider_id: string;
  params: Record<string, any>;
  status: JobStatus;
  error_message?: string | null;
  retry_count: number;
  priority: number;
  parent_job_id?: number | null;
  scheduled_at?: string | null;
  created_at: string;
  started_at?: string | null;
  completed_at?: string | null;
}

export interface JobListResponse {
  jobs: JobResponse[];
  total: number;
  limit: number;
  offset: number;
}

export async function getJob(jobId: number): Promise<JobResponse> {
  const res = await apiClient.get<JobResponse>(`/jobs/${jobId}`);
  return res.data;
}

export async function listJobs(params?: {
  status?: JobStatus;
  operation_type?: string;
  limit?: number;
  offset?: number;
}): Promise<JobListResponse> {
  const res = await apiClient.get<JobListResponse>(`/jobs`, { params });
  return res.data;
}

/**
 * Cancel a job by ID.
 * Only works for jobs in 'pending' or 'processing' status.
 *
 * @param jobId - The job ID to cancel
 * @throws If job is already in terminal state or doesn't exist
 */
export async function cancelJob(jobId: number): Promise<void> {
  await apiClient.delete(`/jobs/${jobId}`);
}

/**
 * Retry a failed job by creating a new job with the same parameters.
 * Sets the parent_job_id to link the retry to the original failed job.
 *
 * @param failedJob - The failed job to retry
 * @returns New job created for the retry
 */
export async function retryJob(failedJob: JobResponse): Promise<JobResponse> {
  const payload = {
    operation_type: failedJob.operation_type,
    provider_id: failedJob.provider_id,
    params: failedJob.params,
    parent_job_id: failedJob.id,
  };

  const res = await apiClient.post<JobResponse>('/jobs', payload);
  return res.data;
}
