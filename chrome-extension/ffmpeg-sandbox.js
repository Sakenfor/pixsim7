/**
 * FFmpeg Sandbox Worker
 * Runs in a sandboxed iframe to allow loading external scripts
 * Communicates with parent via postMessage
 */

console.log('[FFmpeg Sandbox] Script starting, FFmpegWASM:', typeof FFmpegWASM);

let ffmpegInstance = null;
let ffmpegLoading = false;
let workerBlobUrl = null;

// Wait for FFmpegWASM to be available (may take a moment after script load)
async function waitForFFmpegWASM(timeout = 5000) {
  const start = Date.now();
  while (typeof FFmpegWASM === 'undefined') {
    if (Date.now() - start > timeout) {
      throw new Error('FFmpegWASM not available after ' + timeout + 'ms');
    }
    await new Promise(r => setTimeout(r, 100));
  }
  console.log('[FFmpeg Sandbox] FFmpegWASM is available');
  return FFmpegWASM;
}

// Create blob URL for worker script to avoid origin issues
async function getWorkerBlobUrl() {
  if (workerBlobUrl) return workerBlobUrl;

  try {
    // Fetch the worker script
    const response = await fetch('814.ffmpeg.js');
    const scriptText = await response.text();

    // Create blob URL
    const blob = new Blob([scriptText], { type: 'application/javascript' });
    workerBlobUrl = URL.createObjectURL(blob);
    console.log('[FFmpeg Sandbox] Created worker blob URL');
    return workerBlobUrl;
  } catch (e) {
    console.error('[FFmpeg Sandbox] Failed to create worker blob URL:', e);
    return null;
  }
}

// Initialize FFmpeg
async function initFFmpeg() {
  if (ffmpegInstance) return ffmpegInstance;
  if (ffmpegLoading) {
    while (ffmpegLoading) {
      await new Promise(r => setTimeout(r, 100));
    }
    return ffmpegInstance;
  }

  ffmpegLoading = true;

  try {
    // Wait for FFmpegWASM to be available
    const wasm = await waitForFFmpegWASM();

    const { FFmpeg } = wasm;
    if (!FFmpeg) {
      throw new Error('FFmpeg class not found in FFmpegWASM');
    }

    console.log('[FFmpeg Sandbox] Creating FFmpeg instance...');
    ffmpegInstance = new FFmpeg();

    // Forward progress to parent
    ffmpegInstance.on('progress', ({ progress }) => {
      window.parent.postMessage({
        type: 'ffmpeg-progress',
        progress: progress || 0
      }, '*');
    });

    ffmpegInstance.on('log', ({ message }) => {
      console.log('[FFmpeg Sandbox]', message);
    });

    console.log('[FFmpeg Sandbox] Loading FFmpeg core from CDN...');

    // Get worker blob URL to avoid origin issues
    const classWorkerURL = await getWorkerBlobUrl();

    // Load FFmpeg core
    await ffmpegInstance.load({
      coreURL: 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd/ffmpeg-core.js',
      wasmURL: 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd/ffmpeg-core.wasm',
      classWorkerURL: classWorkerURL,
    });

    console.log('[FFmpeg Sandbox] FFmpeg core loaded successfully');
    ffmpegLoading = false;
    return ffmpegInstance;
  } catch (e) {
    console.error('[FFmpeg Sandbox] Init error:', e);
    ffmpegLoading = false;
    ffmpegInstance = null;
    throw e;
  }
}

// Convert video to MP4
async function convertToMp4(fileData, inputExt) {
  const ffmpeg = await initFFmpeg();

  const inputName = 'input.' + inputExt;
  const outputName = 'output.mp4';

  // Write input file
  await ffmpeg.writeFile(inputName, new Uint8Array(fileData));

  // Convert
  await ffmpeg.exec([
    '-i', inputName,
    '-c:v', 'libx264',
    '-preset', 'ultrafast',
    '-crf', '23',
    '-c:a', 'aac',
    '-b:a', '128k',
    '-movflags', '+faststart',
    '-y',
    outputName
  ]);

  // Read output
  const data = await ffmpeg.readFile(outputName);

  // Cleanup
  await ffmpeg.deleteFile(inputName);
  await ffmpeg.deleteFile(outputName);

  return data;
}

// Handle messages from parent
window.addEventListener('message', async (event) => {
  const { type, id, fileData, inputExt } = event.data;

  if (type === 'ffmpeg-init') {
    try {
      await initFFmpeg();
      window.parent.postMessage({ type: 'ffmpeg-init-result', id, success: true }, '*');
    } catch (e) {
      window.parent.postMessage({ type: 'ffmpeg-init-result', id, success: false, error: e.message }, '*');
    }
  }

  if (type === 'ffmpeg-convert') {
    try {
      const result = await convertToMp4(fileData, inputExt);
      // Transfer the buffer back
      window.parent.postMessage(
        { type: 'ffmpeg-convert-result', id, success: true, data: result.buffer },
        '*',
        [result.buffer]
      );
    } catch (e) {
      window.parent.postMessage({ type: 'ffmpeg-convert-result', id, success: false, error: e.message }, '*');
    }
  }
});

// Check if FFmpegWASM loaded and signal ready with status
console.log('[FFmpeg Sandbox] Checking FFmpegWASM availability...');
console.log('[FFmpeg Sandbox] FFmpegWASM type:', typeof FFmpegWASM);

if (typeof FFmpegWASM !== 'undefined') {
  console.log('[FFmpeg Sandbox] FFmpegWASM is available, signaling ready');
  window.parent.postMessage({ type: 'ffmpeg-sandbox-ready', ffmpegAvailable: true }, '*');
} else {
  console.error('[FFmpeg Sandbox] FFmpegWASM not available - local script failed to load');
  window.parent.postMessage({ type: 'ffmpeg-sandbox-ready', ffmpegAvailable: false, error: 'Local FFmpeg script failed to load' }, '*');
}
