/**
 * galleryPrependLock
 *
 * A tiny ref-counted lock that suppresses live-prepend into the gallery while
 * the user is hovering a card.
 *
 * Why: a freshly generated asset live-prepends at index 0, shifting every
 * existing card down one stride. If the user is idle-hovering a card (watching
 * its looping preview), that shift slides the card out from under a stationary
 * cursor — the browser transfers :hover to the neighbour now under the pointer,
 * which cold-loads its own <video> and flashes "Loading video…". The card you
 * were watching effectively "freezes to loading" every time an asset lands.
 *
 * This is the hover analogue of useAssets' existing pointer-down prepend freeze
 * (which keeps a press from archiving the wrong card mid-gesture). While the
 * lock is held, useAssets queues incoming prepends and flushes them once the
 * lock releases (hover-out). Updates/removes are unaffected — only positional
 * prepends are deferred. The recents strip stays live regardless.
 */

let lockCount = 0;
const releaseListeners = new Set<() => void>();

/** True while at least one gallery card hover-preview is active. */
export function isGalleryHoverLocked(): boolean {
  return lockCount > 0;
}

/**
 * Acquire the lock (call while hovering a gallery card). Returns a release fn;
 * call it exactly once on hover-out / unmount. The lock is ref-counted so
 * overlapping hovers (rare, but possible during fast card transitions) compose.
 */
export function acquireGalleryHoverLock(): () => void {
  lockCount += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    lockCount = Math.max(0, lockCount - 1);
    if (lockCount === 0) {
      for (const listener of releaseListeners) {
        try {
          listener();
        } catch {
          /* a flush failure in one consumer shouldn't block the others */
        }
      }
    }
  };
}

/**
 * Subscribe to "lock fully released" (count returned to 0). Consumers use this
 * to flush prepends they deferred while the lock was held. Returns unsubscribe.
 */
export function subscribeGalleryHoverUnlock(listener: () => void): () => void {
  releaseListeners.add(listener);
  return () => {
    releaseListeners.delete(listener);
  };
}
