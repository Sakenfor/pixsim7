/**
 * Stable selector helpers to prevent unnecessary re-renders.
 * These selectors avoid inline object creation and maintain referential equality
 * when underlying values haven't changed.
 */

import type { ControlCenterState } from './controlCenterStore';
import type { JobResponse } from '../lib/api/jobs';

// ─────────────────────────────────────────────────────────────────────────────
// Control Center Selectors
// ─────────────────────────────────────────────────────────────────────────────

export const ccSelectors = {
  /** Basic operation configuration (operation type, provider, preset) */
  operationBasics: (s: ControlCenterState) => ({
    operationType: s.operationType,
    providerId: s.providerId,
    presetId: s.presetId,
  }),

  /** Selected preset parameters */
  presetParams: (s: ControlCenterState) => s.presetParams,

  /** Whether asset generation is in progress */
  generating: (s: ControlCenterState) => s.generating,

  /** Current operation type */
  operationType: (s: ControlCenterState) => s.operationType,

  /** Selected provider ID */
  providerId: (s: ControlCenterState) => s.providerId,

  /** Selected preset ID */
  presetId: (s: ControlCenterState) => s.presetId,

  /** Recent prompts history */
  recentPrompts: (s: ControlCenterState) => s.recentPrompts,

  /** Dock open/pinned state */
  dockState: (s: ControlCenterState) => ({
    open: s.open,
    pinned: s.pinned,
    height: s.height,
  }),

  /** Active module in control center */
  activeModule: (s: ControlCenterState) => s.activeModule,
};

// ─────────────────────────────────────────────────────────────────────────────
// Jobs Store Selectors
// ─────────────────────────────────────────────────────────────────────────────

export const jobsSelectors = {
  /** Get a specific job by ID */
  byId: (id: number | null) => (s: { jobs: Record<number, JobResponse> }) =>
    id ? s.jobs[id] : undefined,

  /** ID of the last created job */
  lastCreatedJobId: (s: { lastCreatedJobId: number | null }) => s.lastCreatedJobId,

  /** ID of the job currently being watched/polled */
  watchingJobId: (s: { watchingJobId: number | null }) => s.watchingJobId,

  /** All jobs as an array, sorted by creation date (newest first) */
  allJobsSorted: (s: { jobs: Record<number, JobResponse> }) =>
    Object.values(s.jobs).sort((a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    ),

  /** Active jobs (not completed or failed) */
  activeJobs: (s: { jobs: Record<number, JobResponse> }) =>
    Object.values(s.jobs).filter(j => j.status !== 'completed' && j.status !== 'failed'),

  /** Failed jobs */
  failedJobs: (s: { jobs: Record<number, JobResponse> }) =>
    Object.values(s.jobs).filter(j => j.status === 'failed'),

  /** Completed jobs */
  completedJobs: (s: { jobs: Record<number, JobResponse> }) =>
    Object.values(s.jobs).filter(j => j.status === 'completed'),
};
