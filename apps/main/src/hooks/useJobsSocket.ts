/**
 * Hook for jobs WebSocket connection
 * TODO: Implement real WebSocket connection to jobs feed
 */

import { useState, useEffect } from 'react';

interface UseJobsSocketOptions {
  autoConnect?: boolean;
}

interface JobsSocketState {
  connected: boolean;
  error: string | null;
}

export function useJobsSocket(options: UseJobsSocketOptions = {}): JobsSocketState {
  const [state, setState] = useState<JobsSocketState>({
    connected: false,
    error: null,
  });

  useEffect(() => {
    if (!options.autoConnect) return;

    // TODO: Implement WebSocket connection to /ws/jobs
    // For now, just mark as not connected
    setState({ connected: false, error: null });
  }, [options.autoConnect]);

  return state;
}
