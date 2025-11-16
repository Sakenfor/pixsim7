import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { JobResponse, JobStatus } from '../lib/api/jobs';
import { createBackendStorage } from '../lib/backendStorage';

const MAX_JOBS = 25;

/**
 * Extended job record with client-side metadata
 */
export interface JobRecordExtended extends JobResponse {
  /** Original params when job was created, used for retry */
  originalParams?: Record<string, any>;
}

interface JobsState {
  jobs: Record<number, JobRecordExtended>;
  lastCreatedJobId: number | null;
  watchingJobId: number | null; // actively polled in UI
  addOrUpdateJob: (job: JobResponse, originalParams?: Record<string, any>) => void;
  setLastCreatedJob: (id: number) => void;
  setWatchingJob: (id: number | null) => void;
  clearCompletedJobs: () => void;
  markCancelled: (jobId: number) => void;
}

export const useJobsStore = create<JobsState>()(persist(
  (set) => ({
    jobs: {},
    lastCreatedJobId: null,
    watchingJobId: null,
    addOrUpdateJob: (job, originalParams) => set((s) => {
      const existingJob = s.jobs[job.id];
      const updatedJob: JobRecordExtended = {
        ...job,
        originalParams: existingJob?.originalParams ?? originalParams ?? job.params,
      };

      const updatedJobs = { ...s.jobs, [job.id]: updatedJob };

      // Enforce MAX_JOBS limit: remove oldest terminal jobs if we exceed the limit
      const allJobs = Object.values(updatedJobs);
      if (allJobs.length > MAX_JOBS) {
        // Sort by created_at (oldest first)
        const sortedJobs = allJobs.sort((a, b) =>
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        );

        // Remove oldest terminal jobs until we're at MAX_JOBS
        const jobsToRemove: number[] = [];
        for (const j of sortedJobs) {
          if (allJobs.length - jobsToRemove.length <= MAX_JOBS) break;
          if (isJobTerminal(j.status) && j.id !== s.watchingJobId) {
            jobsToRemove.push(j.id);
          }
        }

        jobsToRemove.forEach(id => {
          delete updatedJobs[id];
        });
      }

      return { jobs: updatedJobs };
    }),
    setLastCreatedJob: (id) => set({ lastCreatedJobId: id, watchingJobId: id }),
    setWatchingJob: (id) => set({ watchingJobId: id }),
    clearCompletedJobs: () => set((s) => {
      const next: Record<number, JobRecordExtended> = {};
      Object.values(s.jobs).forEach(j => {
        if (j.status !== 'completed' && j.status !== 'failed') {
          next[j.id] = j;
        }
      });
      return { jobs: next };
    }),
    markCancelled: (jobId) => set((s) => {
      const job = s.jobs[jobId];
      if (!job) return s;

      return {
        jobs: {
          ...s.jobs,
          [jobId]: {
            ...job,
            status: 'failed' as JobStatus,
            error_message: 'Cancelled by user',
          },
        },
      };
    }),
  }),
  {
    name: 'jobs-store-v1',
    storage: createBackendStorage('jobsUi'),
    partialize: (state) => ({
      jobs: state.jobs,
      lastCreatedJobId: state.lastCreatedJobId,
    }),
  }
));

export function isJobTerminal(status: JobStatus) {
  return status === 'completed' || status === 'failed';
}
