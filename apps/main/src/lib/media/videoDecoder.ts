/**
 * Video decoder lifecycle helpers.
 *
 * Decoded video frames + decoder buffers live in the browser's GPU/native
 * process, invisible to JS memory APIs, and Chrome reclaims a detached
 * <video>'s decoder lazily — too slowly under rapid generation, so they pile up
 * (the multi-GB tab). These helpers release the decoder eagerly and keep a
 * declaratively-sourced <video> from ending up sourceless after a detach.
 *
 * See plan `viewer-media-memory`.
 */
import { useCallback, useRef } from 'react';

type VideoRefLike =
  | React.MutableRefObject<HTMLVideoElement | null>
  | React.RefObject<HTMLVideoElement>
  | ((el: HTMLVideoElement | null) => void);

/**
 * Release a <video>'s native/GPU decoder immediately instead of waiting on the
 * browser's lazy reclaim: pause, clear the source, and `load()` to drop the
 * buffers. Setting `src=undefined` alone does not free the decoder. Best-effort
 * — safe to call on a detached element.
 */
export function releaseVideoDecoder(el: HTMLVideoElement | null): void {
  if (!el) return;
  try {
    el.pause();
    el.removeAttribute('src');
    el.load();
  } catch {
    /* best effort — detached / teardown */
  }
}

/**
 * Callback ref that owns a viewer <video>'s decoder lifecycle for a
 * declaratively-supplied `src` (keep `src={src}` on the element — React still
 * does the initial set; this hook only repairs + releases):
 *
 *  - **Restore on reattach.** When the same element is detached then re-attached
 *    — React StrictMode double-invokes refs in dev (attach→detach→attach), and
 *    dockview panel moves can detach/reattach a node without a React unmount —
 *    a prior detach's `releaseVideoDecoder` will have stripped `src`. React does
 *    NOT re-apply an unchanged declarative `src`, so the element would be left
 *    sourceless (readyState 0, never loads). Restore it here.
 *  - **Release on detach.** Free the decoder when the element goes away (clip
 *    switch via `key`, tab-suspend unmount, viewer close) instead of trusting
 *    lazy reclaim.
 *
 * Pass `forwardRef` to keep an external ref (play/scrub controls, registries) in
 * sync — object refs have no detach hook of their own.
 */
export function useManagedVideoSource(
  src: string | undefined,
  forwardRef?: VideoRefLike,
): (el: HTMLVideoElement | null) => void {
  const lastElRef = useRef<HTMLVideoElement | null>(null);
  // Latest desired src, read at ref-callback time (which runs after commit).
  const srcRef = useRef<string | undefined>(src);
  srcRef.current = src;

  return useCallback(
    (el: HTMLVideoElement | null) => {
      if (el) {
        lastElRef.current = el;
        if (srcRef.current && !el.getAttribute('src')) {
          el.src = srcRef.current;
          el.load();
        }
      } else {
        releaseVideoDecoder(lastElRef.current);
        lastElRef.current = null;
      }
      if (typeof forwardRef === 'function') {
        forwardRef(el);
      } else if (forwardRef) {
        (forwardRef as { current: HTMLVideoElement | null }).current = el;
      }
    },
    [forwardRef],
  );
}
