(function() {
  try {
    if (window.__pxs7UploadInterceptorInstalled) return;
    window.__pxs7UploadInterceptorInstalled = true;

    // State for intercepting multipart uploads
    window.__pxs7PendingImageUrl = null;  // Set by content script when we want to intercept
    window.__pxs7FakeUploadId = null;     // Track fake multipart upload

    const FAKE_UPLOAD_ID = 'PXS7_FAKE_UPLOAD_' + Date.now();
    const FAKE_ETAG = '"pxs7fake' + Date.now() + '"';

  // Helper to check if we should intercept this OSS request
  function shouldInterceptOSS(url) {
    return window.__pxs7PendingImageUrl && url.includes('aliyuncs.com');
  }

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

    // === Intercept batch_upload_media ===
    if (window.__pxs7PendingImageUrl && method === 'POST' && url.includes('batch_upload_media')) {
      const urlToReturn = window.__pxs7PendingImageUrl;
      console.log('[PixSim7] Intercepting batch_upload_media, returning:', urlToReturn);

      window.__pxs7PendingImageUrl = null;
      window.__pxs7FakeUploadId = null;

      setTimeout(() => {
        const mediaId = Date.now();
        // Extract filename from URL
        const urlPath = new URL(urlToReturn).pathname;
        const filename = urlPath.split('/').pop() || 'image.jpg';

        const responseObj = {
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

        console.log('[PixSim7] batch_upload_media response:', responseObj);
        fakeXHRResponse(xhr, 200, JSON.stringify(responseObj), responseObj);
        console.log('[PixSim7] batch_upload_media response sent');
      }, 50);
      return;
    }

    // === Intercept OSS multipart: POST ?uploads= (initiate) ===
    if (shouldInterceptOSS(url) && method === 'POST' && url.includes('?uploads')) {
      console.log('[PixSim7] Intercepting multipart initiate');
      window.__pxs7FakeUploadId = FAKE_UPLOAD_ID;

      setTimeout(() => {
        // OSS returns XML with uploadId
        const xml = `<?xml version="1.0" encoding="UTF-8"?>
<InitiateMultipartUploadResult>
  <Bucket>pixverse-fe-upload</Bucket>
  <Key>upload/fake.jpg</Key>
  <UploadId>${FAKE_UPLOAD_ID}</UploadId>
</InitiateMultipartUploadResult>`;

        fakeXHRResponse(xhr, 200, xml);
        console.log('[PixSim7] Multipart initiate response sent');
      }, 30);
      return;
    }

    // === Intercept OSS multipart: PUT ?partNumber= (upload part) ===
    if (shouldInterceptOSS(url) && method === 'PUT' && url.includes('partNumber=')) {
      console.log('[PixSim7] Intercepting multipart part upload');

      // Simulate progress
      setTimeout(() => {
        xhr.dispatchEvent(new ProgressEvent('progress', { loaded: 50, total: 100 }));
        if (xhr.upload) xhr.upload.dispatchEvent(new ProgressEvent('progress', { loaded: 50, total: 100 }));
      }, 20);

      setTimeout(() => {
        xhr.dispatchEvent(new ProgressEvent('progress', { loaded: 100, total: 100 }));
        if (xhr.upload) xhr.upload.dispatchEvent(new ProgressEvent('progress', { loaded: 100, total: 100 }));

        // PUT part returns 200 with ETag header
        fakeXHRResponse(xhr, 200, '', null, { 'ETag': FAKE_ETAG });
        console.log('[PixSim7] Multipart part upload response sent');
      }, 50);
      return;
    }

    // === Intercept OSS multipart: POST ?uploadId= (complete) ===
    if (shouldInterceptOSS(url) && method === 'POST' && url.includes('uploadId=') && !url.includes('uploads')) {
      console.log('[PixSim7] Intercepting multipart complete');

      setTimeout(() => {
        // Extract key from URL for response
        const keyMatch = url.match(/\/upload\/([^?]+)/);
        const key = keyMatch ? keyMatch[1] : 'fake.jpg';

        // OSS returns XML with final location
        const xml = `<?xml version="1.0" encoding="UTF-8"?>
<CompleteMultipartUploadResult>
  <Location>https://pixverse-fe-upload.oss-accelerate.aliyuncs.com/upload/${key}</Location>
  <Bucket>pixverse-fe-upload</Bucket>
  <Key>upload/${key}</Key>
  <ETag>"fakeetag"</ETag>
</CompleteMultipartUploadResult>`;

        fakeXHRResponse(xhr, 200, xml);
        console.log('[PixSim7] Multipart complete response sent');
      }, 30);
      return;
    }

    // Not intercepting - pass through
    return originalXHRSend.call(this, body);
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

    // Fake getResponseHeader
    if (headers) {
      xhr.getResponseHeader = function(name) {
        return headers[name] || null;
      };
    }

    // Fire events
    xhr.dispatchEvent(new Event('readystatechange'));
    xhr.dispatchEvent(new ProgressEvent('progress', { loaded: 100, total: 100 }));
    xhr.dispatchEvent(new Event('load'));
    xhr.dispatchEvent(new Event('loadend'));

    if (xhr.onreadystatechange) xhr.onreadystatechange();
    if (xhr.onload) xhr.onload(new Event('load'));
    if (xhr.onloadend) xhr.onloadend(new Event('loadend'));
  }

  // Listen for messages from content script
  window.addEventListener('__pxs7SetPendingUrl', function(e) {
    window.__pxs7PendingImageUrl = e.detail;
    window.__pxs7FakeUploadId = null;
    console.log('[PixSim7] Pending URL set:', e.detail);
  });

  console.log('[PixSim7] Upload interceptor installed (multipart support)');
  } catch (e) {
    console.error('[PixSim7] Upload interceptor failed:', e);
  }
})();
