/**
 * Off-main-thread thumbnail generation.
 *
 * Uses an inline Web Worker with OffscreenCanvas to decode images, resize,
 * and JPEG-encode without blocking the UI thread. Falls back to main-thread
 * generation when workers or OffscreenCanvas are unavailable.
 */

const THUMBNAIL_MAX_SIZE = 400;
const JPEG_QUALITY = 0.8;

// ---------------------------------------------------------------------------
// Worker source (inlined as blob URL so no extra bundler config needed)
// ---------------------------------------------------------------------------

const WORKER_SOURCE = /* js */ `
self.onmessage = async (e) => {
  const { id, file, maxSize, quality } = e.data;
  try {
    const bitmap = await createImageBitmap(file);
    let w = bitmap.width;
    let h = bitmap.height;
    if (w > maxSize || h > maxSize) {
      if (w > h) {
        h = Math.round((h / w) * maxSize);
        w = maxSize;
      } else {
        w = Math.round((w / h) * maxSize);
        h = maxSize;
      }
    }
    const canvas = new OffscreenCanvas(w, h);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();
    const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality });
    self.postMessage({ id, blob });
  } catch (err) {
    self.postMessage({ id, error: String(err) });
  }
};
`;

// ---------------------------------------------------------------------------
// Worker pool (single worker, serialised queue — keeps memory low)
// ---------------------------------------------------------------------------

let _worker: Worker | null = null;
let _workerSupported: boolean | null = null;
let _idCounter = 0;
const _pending = new Map<number, { resolve: (b: Blob | null) => void }>();

function getWorker(): Worker | null {
  if (_workerSupported === false) return null;
  if (_worker) return _worker;

  try {
    const blob = new Blob([WORKER_SOURCE], { type: 'application/javascript' });
    const url = URL.createObjectURL(blob);
    const w = new Worker(url);
    w.onmessage = (e: MessageEvent) => {
      const { id, blob, error } = e.data;
      const entry = _pending.get(id);
      if (!entry) return;
      _pending.delete(id);
      if (error) {
        console.warn('[ThumbnailWorker] Worker error:', error);
        entry.resolve(null);
      } else {
        entry.resolve(blob ?? null);
      }
    };
    w.onerror = () => {
      // Worker failed to initialise — fall back to main thread
      _workerSupported = false;
      _worker = null;
      // Reject all pending
      for (const [, entry] of _pending) entry.resolve(null);
      _pending.clear();
    };
    _worker = w;
    _workerSupported = true;
    return w;
  } catch {
    _workerSupported = false;
    return null;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate a thumbnail blob off the main thread.
 * Returns null if the file can't be thumbnailed or the worker isn't available.
 */
export async function generateThumbnailOffThread(file: File): Promise<Blob | null> {
  if (!file.type.startsWith('image/')) return null;

  const worker = getWorker();
  if (!worker) return null; // caller should fall back to main-thread path

  const id = ++_idCounter;
  return new Promise<Blob | null>((resolve) => {
    _pending.set(id, { resolve });
    worker.postMessage(
      { id, file, maxSize: THUMBNAIL_MAX_SIZE, quality: JPEG_QUALITY },
    );
    // Safety timeout — don't leak promises if worker hangs
    setTimeout(() => {
      if (_pending.has(id)) {
        _pending.delete(id);
        resolve(null);
      }
    }, 15_000);
  });
}

/**
 * Whether off-thread thumbnail generation is likely supported.
 */
export function isThumbnailWorkerSupported(): boolean {
  if (_workerSupported !== null) return _workerSupported;
  return typeof Worker !== 'undefined' && typeof OffscreenCanvas !== 'undefined';
}
