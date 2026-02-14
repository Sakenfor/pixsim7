/**
 * Web Worker for computing SHA-256 hashes off the main thread.
 *
 * Protocol:
 *   Request:  { id: string, file: File }
 *   Response:
 *     - Progress: { id, kind: 'progress', phase, loadedBytes, totalBytes }
 *     - Success:  { id, kind: 'done', sha256 }
 *     - Error:    { id, kind: 'error', error }
 */

export type HashWorkerRequest = {
  id: string;
  file: File;
};

export type HashProgressPhase = 'reading' | 'digesting';

export type HashWorkerResponse =
  | {
      id: string;
      kind: 'progress';
      phase: HashProgressPhase;
      loadedBytes: number;
      totalBytes: number;
    }
  | { id: string; kind: 'done'; sha256: string }
  | { id: string; kind: 'error'; error: string };

const ctx = globalThis as unknown as DedicatedWorkerGlobalScope;
const READ_CHUNK_SIZE_BYTES = 4 * 1024 * 1024;

async function readFileWithProgress(
  file: File,
  id: string,
): Promise<ArrayBuffer> {
  const totalBytes = file.size;
  // Preserve previous behavior for empty files.
  if (totalBytes <= 0) {
    return file.arrayBuffer();
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;

  while (offset < totalBytes) {
    const end = Math.min(offset + READ_CHUNK_SIZE_BYTES, totalBytes);
    const chunk = file.slice(offset, end);
    const chunkBuffer = await chunk.arrayBuffer();
    const chunkBytes = new Uint8Array(chunkBuffer);

    bytes.set(chunkBytes, offset);
    offset += chunkBytes.byteLength;

    ctx.postMessage({
      id,
      kind: 'progress',
      phase: 'reading',
      loadedBytes: offset,
      totalBytes,
    } satisfies HashWorkerResponse);
  }

  return bytes.buffer;
}

ctx.addEventListener('message', async (event: MessageEvent<HashWorkerRequest>) => {
  const { id, file } = event.data;

  try {
    const buffer = await readFileWithProgress(file, id);
    ctx.postMessage({
      id,
      kind: 'progress',
      phase: 'digesting',
      loadedBytes: file.size,
      totalBytes: file.size,
    } satisfies HashWorkerResponse);

    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    const hashArray = new Uint8Array(hashBuffer);

    // Build hex string
    let hex = '';
    for (let i = 0; i < hashArray.length; i++) {
      hex += hashArray[i].toString(16).padStart(2, '0');
    }

    ctx.postMessage({ id, kind: 'done', sha256: hex } satisfies HashWorkerResponse);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    ctx.postMessage({ id, kind: 'error', error: message } satisfies HashWorkerResponse);
  }
});

