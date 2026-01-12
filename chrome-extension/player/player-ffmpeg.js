/**
 * Player FFmpeg - Video conversion using sandboxed FFmpeg
 */
(function() {
  'use strict';

  const { elements, utils } = window.PXS7Player;
  const { showToast, getExtension } = utils;

  // FFmpeg sandbox state
  let ffmpegSandbox = null;
  let ffmpegReady = false;
  let ffmpegLoading = false;
  let conversionCancelled = false;
  let pendingCallbacks = {};
  let callbackId = 0;

  // Format categories
  const NATIVE_FORMATS = ['mp4', 'webm', 'ogg', 'mov'];
  const TRY_DIRECT_FORMATS = ['mkv', 'm4v', '3gp'];
  const CONVERTIBLE_FORMATS = ['avi', 'wmv', 'flv', 'mpeg', 'mpg', 'ts', 'mts', 'm2ts'];

  function needsConversion(filename) {
    const ext = getExtension(filename);
    if (NATIVE_FORMATS.includes(ext)) return false;
    if (CONVERTIBLE_FORMATS.includes(ext)) return true;
    return false;
  }

  function showConvertUI(message, progress = 0, detail = '') {
    elements.convertOverlay.classList.remove('hidden');
    elements.dropZone.classList.add('hidden');
    elements.convertText.textContent = message;
    elements.convertProgressBar.style.width = `${progress}%`;
    elements.convertDetail.textContent = detail;
  }

  function hideConvertUI() {
    elements.convertOverlay.classList.add('hidden');
  }

  // Cancel button handler
  elements.convertCancel.addEventListener('click', () => {
    conversionCancelled = true;
    hideConvertUI();
    elements.dropZone.classList.remove('hidden');
    showToast('Conversion cancelled', false);
  });

  function initFFmpegSandbox() {
    return new Promise((resolve, reject) => {
      if (ffmpegReady && ffmpegSandbox) {
        resolve();
        return;
      }

      if (ffmpegLoading) {
        const checkReady = setInterval(() => {
          if (ffmpegReady) {
            clearInterval(checkReady);
            resolve();
          }
        }, 100);
        return;
      }

      ffmpegLoading = true;
      console.log('[FFmpeg] Creating sandbox iframe...');

      const iframe = document.createElement('iframe');
      iframe.src = chrome.runtime.getURL('ffmpeg-sandbox.html');
      iframe.style.cssText = 'position: absolute; width: 0; height: 0; border: 0; visibility: hidden;';
      iframe.id = 'ffmpeg-sandbox';
      document.body.appendChild(iframe);
      ffmpegSandbox = iframe;

      let initTimeout = null;

      const messageHandler = (event) => {
        if (event.source !== iframe.contentWindow) return;

        const { type, id, success, error, data, progress } = event.data;

        if (type === 'ffmpeg-sandbox-ready') {
          console.log('[FFmpeg] Sandbox ready, ffmpegAvailable:', event.data.ffmpegAvailable);

          if (event.data.ffmpegAvailable === false) {
            ffmpegLoading = false;
            const errorMsg = event.data.error || 'FFmpeg library could not be loaded from CDN';
            console.error('[FFmpeg] Sandbox reported FFmpeg not available:', errorMsg);
            reject(new Error(errorMsg + '. Try converting the video externally using HandBrake or similar.'));
            return;
          }

          console.log('[FFmpeg] Initializing FFmpeg in sandbox...');
          const initId = ++callbackId;
          pendingCallbacks[initId] = { resolve, reject };
          iframe.contentWindow.postMessage({ type: 'ffmpeg-init', id: initId }, '*');

          initTimeout = setTimeout(() => {
            if (!ffmpegReady) {
              ffmpegLoading = false;
              reject(new Error('FFmpeg initialization timed out. The WASM file (~25MB) may still be downloading.'));
            }
          }, 120000);
        }

        if (type === 'ffmpeg-init-result') {
          clearTimeout(initTimeout);
          ffmpegLoading = false;
          if (success) {
            console.log('[FFmpeg] FFmpeg initialized successfully');
            ffmpegReady = true;
            if (pendingCallbacks[id]) {
              pendingCallbacks[id].resolve();
              delete pendingCallbacks[id];
            }
          } else {
            console.error('[FFmpeg] FFmpeg init failed:', error);
            if (pendingCallbacks[id]) {
              pendingCallbacks[id].reject(new Error(error));
              delete pendingCallbacks[id];
            }
          }
        }

        if (type === 'ffmpeg-convert-result') {
          if (pendingCallbacks[id]) {
            if (success) {
              pendingCallbacks[id].resolve(new Uint8Array(data));
            } else {
              pendingCallbacks[id].reject(new Error(error));
            }
            delete pendingCallbacks[id];
          }
        }

        if (type === 'ffmpeg-progress') {
          const pct = Math.round((progress || 0) * 100);
          showConvertUI('Converting...', 30 + pct * 0.7, `${pct}% complete`);
        }
      };

      window.addEventListener('message', messageHandler);

      iframe.onerror = () => {
        ffmpegLoading = false;
        reject(new Error('Failed to create FFmpeg sandbox'));
      };
    });
  }

  async function convertInSandbox(fileData, inputExt) {
    if (!ffmpegReady || !ffmpegSandbox) {
      throw new Error('FFmpeg not initialized');
    }

    return new Promise((resolve, reject) => {
      const id = ++callbackId;
      pendingCallbacks[id] = { resolve, reject };

      ffmpegSandbox.contentWindow.postMessage({
        type: 'ffmpeg-convert',
        id,
        fileData,
        inputExt
      }, '*');

      setTimeout(() => {
        if (pendingCallbacks[id]) {
          pendingCallbacks[id].reject(new Error('Conversion timed out'));
          delete pendingCallbacks[id];
        }
      }, 300000);
    });
  }

  async function loadFFmpeg() {
    if (ffmpegReady) return;

    showConvertUI('Loading FFmpeg...', 5, 'Setting up sandbox...');

    try {
      showConvertUI('Loading FFmpeg...', 10, 'Downloading WASM (~25MB)...');
      await initFFmpegSandbox();
      showConvertUI('FFmpeg ready!', 30);
    } catch (e) {
      hideConvertUI();
      console.error('Failed to load FFmpeg:', e);
      throw new Error('Failed to load FFmpeg: ' + e.message);
    }
  }

  async function convertToMp4(file) {
    conversionCancelled = false;
    showConvertUI('Loading FFmpeg...', 5);

    try {
      await loadFFmpeg();
      if (conversionCancelled) throw new Error('Conversion cancelled');

      showConvertUI('Reading file...', 25);
      const fileData = await file.arrayBuffer();
      if (conversionCancelled) throw new Error('Conversion cancelled');

      showConvertUI('Converting to MP4...', 30, 'This may take a while for large files');
      const resultData = await convertInSandbox(fileData, getExtension(file.name));
      if (conversionCancelled) throw new Error('Conversion cancelled');

      showConvertUI('Finalizing...', 95);
      const blob = new Blob([resultData], { type: 'video/mp4' });
      const url = URL.createObjectURL(blob);

      hideConvertUI();
      return { url, name: file.name.replace(/\.[^.]+$/, '.mp4') };
    } catch (e) {
      hideConvertUI();
      if (e.message === 'Conversion cancelled') throw e;
      console.error('Conversion failed:', e);
      throw new Error('Video conversion failed: ' + e.message);
    }
  }

  // Export
  window.PXS7Player.ffmpeg = {
    NATIVE_FORMATS,
    TRY_DIRECT_FORMATS,
    CONVERTIBLE_FORMATS,
    needsConversion,
    convertToMp4,
    showConvertUI,
    hideConvertUI,
  };
})();
