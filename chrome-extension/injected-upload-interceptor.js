(function() {
  try {
    if (window.__pxs7UploadInterceptorInstalled) return;
    window.__pxs7UploadInterceptorInstalled = true;

    // Debug logging - uses console.debug (only visible with Verbose level in DevTools)
    const debugLog = (...args) => console.debug('[PixSim7 Upload]', ...args);

    // State for intercepting multipart uploads
    window.__pxs7PendingImageUrl = null;  // Set by content script when we want to intercept
    window.__pxs7FakeUploadId = null;     // Track fake multipart upload
    window.__pxs7UploadInProgress = false; // Track when we're mid-upload

    const FAKE_UPLOAD_ID = 'PXS7_FAKE_UPLOAD_' + Date.now();
    const FAKE_ETAG = '"pxs7fake' + Date.now() + '"';

  // Helper to check if we should intercept this OSS request
  // DISABLED - OSS interception causes SDK errors, just intercept batch_upload_media
  function shouldInterceptOSS(url) {
    return false; // Disabled - let OSS requests pass through or fail naturally
    // return window.__pxs7PendingImageUrl && url.includes('aliyuncs.com');
  }

  // Build the fake batch_upload_media response
  function buildBatchUploadResponse(urlToReturn) {
    const mediaId = Date.now();
    const urlPath = new URL(urlToReturn).pathname;
    const filename = urlPath.split('/').pop() || 'image.jpg';

    return {
      ErrCode: 0,
      ErrMsg: 'success',
      Resp: {
        result: [{
          id: mediaId,
          url: urlToReturn,
          path: decodeURIComponent(urlPath.replace(/^\//, '')),
          size: 100000,
          name: decodeURIComponent(filename),
          category: 0,
          err_msg: ''
        }]
      }
    };
  }

  // Signal upload completion to content script
  function signalUploadComplete(url) {
    window.__pxs7UploadInProgress = false;
    window.dispatchEvent(new CustomEvent('__pxs7UploadComplete', {
      detail: { url, success: true }
    }));
  }

  // === Suppress Pixverse's internal upload errors ===
  // Pixverse's antd Upload component has a bug where a callback ('O' in minified code)
  // is undefined during the React re-render triggered by onSuccess/flushSync.
  // This only happens with programmatic file input changes (our extension's slot filling).
  window.addEventListener('unhandledrejection', function(e) {
    if (window.__pxs7UploadInProgress && e.reason instanceof TypeError &&
        e.reason.message.includes('is not a function')) {
      e.preventDefault();
      debugLog('Suppressed Pixverse upload callback error:', e.reason.message);
    }
  });

  // Intercept XHR (Pixverse uses XHR for OSS uploads)
  const originalXHROpen = XMLHttpRequest.prototype.open;
  const originalXHRSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function(method, url, ...args) {
    this._pxs7Url = String(url);
    this._pxs7Method = method.toUpperCase();
    return originalXHROpen.call(this, method, url, ...args);
  };

  XMLHttpRequest.prototype.send = function(body) {
    const xhr = this;
    const url = this._pxs7Url;
    const method = this._pxs7Method;

    // Log upload-related requests when we have a pending image
    if (window.__pxs7UploadInProgress && method === 'POST') {
      debugLog('XHR POST during upload:', url);
    }

    // === Intercept batch_upload_media ===
    if (window.__pxs7PendingImageUrl && method === 'POST' && url.includes('batch_upload_media')) {
      const urlToReturn = window.__pxs7PendingImageUrl;
      debugLog('Intercepting batch_upload_media (XHR), returning:', urlToReturn);

      window.__pxs7PendingImageUrl = null;
      window.__pxs7FakeUploadId = null;

      setTimeout(() => {
        const responseObj = buildBatchUploadResponse(urlToReturn);
        debugLog('batch_upload_media response:', responseObj);
        fakeXHRResponse(xhr, 200, JSON.stringify(responseObj), responseObj);
        debugLog('batch_upload_media response sent');
        signalUploadComplete(urlToReturn);
      }, 50);
      return;
    }

    // === Intercept OSS multipart: POST ?uploads= (initiate) ===
    if (shouldInterceptOSS(url) && method === 'POST' && url.includes('?uploads')) {
      debugLog('Intercepting multipart initiate');
      window.__pxs7FakeUploadId = FAKE_UPLOAD_ID;

      setTimeout(() => {
        const xml = `<?xml version="1.0" encoding="UTF-8"?>
<InitiateMultipartUploadResult>
  <Bucket>pixverse-fe-upload</Bucket>
  <Key>upload/fake.jpg</Key>
  <UploadId>${FAKE_UPLOAD_ID}</UploadId>
</InitiateMultipartUploadResult>`;

        fakeXHRResponse(xhr, 200, xml);
        debugLog('Multipart initiate response sent');
      }, 30);
      return;
    }

    // === Intercept OSS multipart: PUT ?partNumber= (upload part) ===
    if (shouldInterceptOSS(url) && method === 'PUT' && url.includes('partNumber=')) {
      debugLog('Intercepting multipart part upload');

      setTimeout(() => {
        xhr.dispatchEvent(new ProgressEvent('progress', { loaded: 50, total: 100 }));
        if (xhr.upload) xhr.upload.dispatchEvent(new ProgressEvent('progress', { loaded: 50, total: 100 }));
      }, 20);

      setTimeout(() => {
        xhr.dispatchEvent(new ProgressEvent('progress', { loaded: 100, total: 100 }));
        if (xhr.upload) xhr.upload.dispatchEvent(new ProgressEvent('progress', { loaded: 100, total: 100 }));

        fakeXHRResponse(xhr, 200, '', null, { 'ETag': FAKE_ETAG });
        debugLog('Multipart part upload response sent');
      }, 50);
      return;
    }

    // === Intercept OSS multipart: POST ?uploadId= (complete) ===
    if (shouldInterceptOSS(url) && method === 'POST' && url.includes('uploadId=') && !url.includes('uploads')) {
      debugLog('Intercepting multipart complete');

      setTimeout(() => {
        const keyMatch = url.match(/\/upload\/([^?]+)/);
        const key = keyMatch ? keyMatch[1] : 'fake.jpg';

        const xml = `<?xml version="1.0" encoding="UTF-8"?>
<CompleteMultipartUploadResult>
  <Location>https://pixverse-fe-upload.oss-accelerate.aliyuncs.com/upload/${key}</Location>
  <Bucket>pixverse-fe-upload</Bucket>
  <Key>upload/${key}</Key>
  <ETag>"fakeetag"</ETag>
</CompleteMultipartUploadResult>`;

        fakeXHRResponse(xhr, 200, xml);
        debugLog('Multipart complete response sent');
      }, 30);
      return;
    }

    // Not intercepting - pass through
    return originalXHRSend.call(this, body);
  };

  // === Intercept fetch (Pixverse may use fetch instead of XHR for uploads) ===
  const originalFetch = window.fetch;
  window.fetch = function(input, init) {
    const url = typeof input === 'string' ? input : (input instanceof URL ? input.href : input?.url || '');
    const method = (init?.method || 'GET').toUpperCase();

    if (window.__pxs7UploadInProgress && method === 'POST') {
      debugLog('fetch POST during upload:', url);
    }

    if (window.__pxs7PendingImageUrl && method === 'POST' && url.includes('batch_upload_media')) {
      const urlToReturn = window.__pxs7PendingImageUrl;
      debugLog('Intercepting batch_upload_media (fetch), returning:', urlToReturn);

      window.__pxs7PendingImageUrl = null;
      window.__pxs7FakeUploadId = null;

      const responseObj = buildBatchUploadResponse(urlToReturn);
      debugLog('batch_upload_media fetch response:', responseObj);

      // Return a fake Response after a short delay
      return new Promise((resolve) => {
        setTimeout(() => {
          resolve(new Response(JSON.stringify(responseObj), {
            status: 200,
            statusText: 'OK',
            headers: { 'Content-Type': 'application/json' }
          }));
          signalUploadComplete(urlToReturn);
        }, 50);
      });
    }

    return originalFetch.apply(this, arguments);
  };

  // Helper to fake XHR response
  function fakeXHRResponse(xhr, status, responseText, responseJson, headers) {
    Object.defineProperty(xhr, 'readyState', { value: 4, writable: true, configurable: true });
    Object.defineProperty(xhr, 'status', { value: status, writable: true, configurable: true });
    Object.defineProperty(xhr, 'statusText', { value: status === 200 ? 'OK' : 'Error', writable: true, configurable: true });
    Object.defineProperty(xhr, 'responseText', { value: responseText, writable: true, configurable: true });
    Object.defineProperty(xhr, 'responseURL', { value: xhr._pxs7Url, writable: true, configurable: true });

    if (responseJson && xhr.responseType === 'json') {
      Object.defineProperty(xhr, 'response', { value: responseJson, writable: true, configurable: true });
    } else {
      Object.defineProperty(xhr, 'response', { value: responseText, writable: true, configurable: true });
    }

    // Parse XML and set responseXML for OSS SDK
    if (responseText && responseText.trim().startsWith('<?xml')) {
      try {
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(responseText, 'application/xml');
        Object.defineProperty(xhr, 'responseXML', { value: xmlDoc, writable: true, configurable: true });
      } catch (e) {
        console.warn('[PixSim7] Failed to parse XML response:', e);
      }
    }

    // Fake getResponseHeader - include common headers OSS SDK might check
    const defaultHeaders = {
      'Content-Type': responseText?.startsWith('<?xml') ? 'application/xml' : 'application/json',
      'x-oss-request-id': 'pxs7-fake-' + Date.now(),
      ...headers
    };
    xhr.getResponseHeader = function(name) {
      const key = Object.keys(defaultHeaders).find(k => k.toLowerCase() === name.toLowerCase());
      return key ? defaultHeaders[key] : null;
    };
    xhr.getAllResponseHeaders = function() {
      return Object.entries(defaultHeaders).map(([k, v]) => `${k}: ${v}`).join('\r\n');
    };

    // Fire events - dispatchEvent already triggers on* property handlers,
    // so we must NOT call them explicitly (would cause double-processing)
    xhr.dispatchEvent(new Event('readystatechange'));
    xhr.dispatchEvent(new ProgressEvent('progress', { loaded: 100, total: 100 }));
    xhr.dispatchEvent(new Event('load'));
    xhr.dispatchEvent(new Event('loadend'));
  }

  // Listen for messages from content script
  window.addEventListener('__pxs7SetPendingUrl', function(e) {
    window.__pxs7PendingImageUrl = e.detail;
    window.__pxs7FakeUploadId = null;
    window.__pxs7UploadInProgress = true;
    debugLog('Pending URL set:', e.detail);
  });

  // Auto-clear upload-in-progress flag after timeout
  window.addEventListener('__pxs7SetPendingUrl', function() {
    setTimeout(() => { window.__pxs7UploadInProgress = false; }, 10000);
  });

  debugLog('Upload interceptor installed (multipart + fetch support)');
  } catch (e) {
    console.error('[PixSim7] Upload interceptor failed:', e);
  }
})();
