/**
 * Web Worker for computing SHA-256 hashes off the main thread.
 *
 * Protocol:
 *   Request:  { id: string, file: File }
 *   Response: { id: string, sha256: string } | { id: string, error: string }
 */

export type HashWorkerRequest = {
  id: string;
  file: File;
};

export type HashWorkerResponse =
  | { id: string; sha256: string; error?: undefined }
  | { id: string; error: string; sha256?: undefined };

const ctx = globalThis as unknown as DedicatedWorkerGlobalScope;

ctx.addEventListener('message', async (event: MessageEvent<HashWorkerRequest>) => {
  const { id, file } = event.data;

  try {
    const buffer = await file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    const hashArray = new Uint8Array(hashBuffer);

    // Build hex string
    let hex = '';
    for (let i = 0; i < hashArray.length; i++) {
      hex += hashArray[i].toString(16).padStart(2, '0');
    }

    ctx.postMessage({ id, sha256: hex } satisfies HashWorkerResponse);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    ctx.postMessage({ id, error: message } satisfies HashWorkerResponse);
  }
});
