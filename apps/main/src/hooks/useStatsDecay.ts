/**
 * useStatsDecay Hook
 *
 * React hook for managing stats decay timer lifecycle.
 * Ensures the decay timer runs only when needed and prevents:
 * - Multiple timers when multiple gizmos mount
 * - Premature timer stop when one gizmo unmounts while others remain
 *
 * @example
 * ```tsx
 * function MyGizmo() {
 *   // Timer starts on mount, stops on unmount (reference counted)
 *   useStatsDecay();
 *
 *   // Or with custom interval
 *   useStatsDecay(50); // 50ms interval
 *
 *   return <div>...</div>;
 * }
 * ```
 */

import { useEffect, useRef } from 'react';
import { useInteractionStatsStore } from '@features/gizmos/stores/interactionStatsStore';

/**
 * Hook to subscribe to the stats decay timer.
 *
 * The timer is reference-counted:
 * - Starts when the first subscriber joins
 * - Stops when the last subscriber leaves
 *
 * @param intervalMs - Decay tick interval in milliseconds (default: 100)
 * @param enabled - Whether decay is enabled (default: true)
 */
export function useStatsDecay(intervalMs: number = 100, enabled: boolean = true): void {
  const subscribeDecay = useInteractionStatsStore((s) => s.subscribeDecay);
  const unsubscribeRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!enabled) {
      // If disabled but was previously subscribed, unsubscribe
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
      return;
    }

    // Subscribe to decay timer
    unsubscribeRef.current = subscribeDecay(intervalMs);

    // Cleanup on unmount or when dependencies change
    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
    };
  }, [subscribeDecay, intervalMs, enabled]);
}

/**
 * Hook that returns decay timer status.
 * Useful for debugging or displaying timer state in UI.
 */
export function useStatsDecayStatus(): {
  isRunning: boolean;
  subscriberCount: number;
} {
  const isDecayRunning = useInteractionStatsStore((s) => s.isDecayRunning);
  const decaySubscriberCount = useInteractionStatsStore((s) => s.decaySubscriberCount);

  return {
    isRunning: isDecayRunning,
    subscriberCount: decaySubscriberCount,
  };
}

export default useStatsDecay;
