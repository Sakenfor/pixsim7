/**
 * useBridgeStatus — read-only hook over the shared bridge status store.
 *
 * All consumers share one poll loop. The hook returns the current snapshot
 * and stays subscribed for the lifetime of the component; the store starts
 * polling on first subscriber and stops shortly after the last unsubscribes.
 *
 * For surfaces that need to react to bridge events imperatively (e.g.
 * AIAssistantPanel's auto-restart-on-drop logic), import bridgeStatusStore
 * directly and call refresh() / read getSnapshot().
 */
import { useSyncExternalStore } from 'react';

import { bridgeStatusStore, type BridgeStatusSnapshot } from './bridgeStatusStore';

export function useBridgeStatus(): BridgeStatusSnapshot {
  return useSyncExternalStore(bridgeStatusStore.subscribe, bridgeStatusStore.getSnapshot);
}
