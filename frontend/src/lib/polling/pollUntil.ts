/**
 * Generic polling utility with adaptive backoff.
 *
 * Polls a function until a terminal condition is met, with exponential backoff
 * after a configurable elapsed time threshold.
 *
 * @example
 * ```ts
 * const cancel = pollUntil(
 *   () => fetchJob(jobId),
 *   (job) => job.status === 'completed' || job.status === 'failed',
 *   {
 *     base: 3000,
 *     max: 30000,
 *     backoffStartMs: 60000,
 *     multiplier: 2,
 *   }
 * );
 *
 * // Later, to stop polling:
 * cancel();
 * ```
 */

export interface PollConfig {
  /** Base interval in ms (default: 3000) */
  base?: number;
  /** Maximum interval in ms (default: 30000) */
  max?: number;
  /** Time elapsed before backoff starts in ms (default: 60000) */
  backoffStartMs?: number;
  /** Backoff multiplier (default: 2) */
  multiplier?: number;
  /** Optional callback for each successful fetch */
  onFetch?: (data: any) => void;
  /** Optional callback for errors */
  onError?: (error: any) => void;
}

export interface PollState {
  active: boolean;
  timerId: number | null;
  startTime: number;
  currentInterval: number;
  backoffCycleCount: number;
}

/**
 * Start polling until a terminal condition is met.
 *
 * @param fetchFn - Async function that fetches the data
 * @param isTerminal - Predicate that determines if polling should stop
 * @param config - Polling configuration
 * @returns Cancel function to stop polling
 */
export function pollUntil<T>(
  fetchFn: () => Promise<T>,
  isTerminal: (data: T) => boolean,
  config: PollConfig = {}
): () => void {
  const {
    base = 3000,
    max = 30000,
    backoffStartMs = 60000,
    multiplier = 2,
    onFetch,
    onError,
  } = config;

  const state: PollState = {
    active: true,
    timerId: null,
    startTime: Date.now(),
    currentInterval: base,
    backoffCycleCount: 0,
  };

  async function poll() {
    if (!state.active) return;

    try {
      const data = await fetchFn();

      if (!state.active) return;

      // Notify callback
      onFetch?.(data);

      // Check terminal condition
      if (isTerminal(data)) {
        state.active = false;
        return;
      }

      // Calculate next interval with backoff logic
      const elapsed = Date.now() - state.startTime;

      if (elapsed > backoffStartMs) {
        // Apply exponential backoff
        const nextInterval = Math.min(state.currentInterval * multiplier, max);
        if (nextInterval !== state.currentInterval) {
          state.currentInterval = nextInterval;
          state.backoffCycleCount++;

          // Debug log for prolonged polling
          if (state.backoffCycleCount === 10) {
            console.debug('[POLL] Prolonged polling detected (10 backoff cycles)', {
              elapsed,
              currentInterval: state.currentInterval,
            });
          }
        }
      }

      // Schedule next poll
      schedule();
    } catch (error) {
      if (!state.active) return;

      onError?.(error);

      // Continue polling on error (the consumer can decide to cancel if needed)
      schedule();
    }
  }

  function schedule() {
    if (!state.active) return;

    state.timerId = window.setTimeout(() => {
      poll();
    }, state.currentInterval);
  }

  // Start polling immediately
  poll();

  // Return cancel function
  return () => {
    state.active = false;
    if (state.timerId !== null) {
      clearTimeout(state.timerId);
      state.timerId = null;
    }
  };
}

/**
 * Create a polling controller that can be restarted.
 * Useful for managing multiple polling sessions (e.g., when job ID changes).
 */
export class PollController<T> {
  private cancelFn: (() => void) | null = null;
  private fetchFn: () => Promise<T>;
  private isTerminal: (data: T) => boolean;
  private config: PollConfig;

  constructor(
    fetchFn: () => Promise<T>,
    isTerminal: (data: T) => boolean,
    config: PollConfig = {}
  ) {
    this.fetchFn = fetchFn;
    this.isTerminal = isTerminal;
    this.config = config;
  }

  /**
   * Start or restart polling
   */
  start(): void {
    this.stop();
    this.cancelFn = pollUntil(this.fetchFn, this.isTerminal, this.config);
  }

  /**
   * Stop current polling session
   */
  stop(): void {
    if (this.cancelFn) {
      this.cancelFn();
      this.cancelFn = null;
    }
  }

  /**
   * Check if currently polling
   */
  isActive(): boolean {
    return this.cancelFn !== null;
  }
}
