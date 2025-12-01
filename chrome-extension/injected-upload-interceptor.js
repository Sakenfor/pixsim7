(function() {
  try {
    if (window.__pxs7UploadInterceptorInstalled) return;
    window.__pxs7UploadInterceptorInstalled = true;
    window.__pxs7PendingImageUrl = null;
    window.__pxs7InterceptedUrl = null; // Store URL after OSS intercept for batch_upload

  // Intercept fetch
  const originalFetch = window.fetch;
  window.fetch = async function(url, options = {}) {
    const urlStr = typeof url === 'string' ? url : url.url || '';
    const method = (options.method || 'GET').toUpperCase();

    // Log all POSTs for debugging
    if (method === 'POST' || method === 'PUT') {
      console.log('[PixSim7] fetch', method + ':', urlStr);
    }

    // Intercept batch_upload_media - return our cached URL
    if (window.__pxs7InterceptedUrl && method === 'POST' &&
        urlStr.includes('batch_upload_media')) {
      console.log('[PixSim7] Intercepting batch_upload_media, returning:', window.__pxs7InterceptedUrl);

      const urlToReturn = window.__pxs7InterceptedUrl;
      window.__pxs7InterceptedUrl = null;

      return new Response(JSON.stringify({
        code: 0,
        data: [{
          url: urlToReturn,
          media_url: urlToReturn,
          id: Date.now(),
          type: 'image'
        }],
        message: 'success'
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Intercept OSS/file uploads
    if (window.__pxs7PendingImageUrl && (method === 'POST' || method === 'PUT') &&
        (urlStr.includes('/upload') || urlStr.includes('/oss') ||
         urlStr.includes('aliyuncs.com') || urlStr.includes('/file'))) {
      console.log('[PixSim7] Intercepting fetch upload, returning:', window.__pxs7PendingImageUrl);

      const urlToReturn = window.__pxs7PendingImageUrl;
      window.__pxs7InterceptedUrl = urlToReturn; // Save for batch_upload
      window.__pxs7PendingImageUrl = null;

      return new Response(JSON.stringify({
        code: 0,
        data: { url: urlToReturn },
        url: urlToReturn,
        message: 'success'
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return originalFetch.call(this, url, options);
  };

  // Also intercept XHR
  const originalXHROpen = XMLHttpRequest.prototype.open;
  const originalXHRSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function(method, url, ...args) {
    this._pxs7Url = url;
    this._pxs7Method = method;
    if (method === 'POST' || method === 'PUT') {
      console.log('[PixSim7] XHR', method + ':', url);
    }
    return originalXHROpen.call(this, method, url, ...args);
  };

  XMLHttpRequest.prototype.send = function(body) {
    const xhr = this;

    // Debug: log state when batch_upload_media is called
    if (this._pxs7Url.includes('batch_upload_media')) {
      console.log('[PixSim7] batch_upload_media called, interceptedUrl:', window.__pxs7InterceptedUrl, 'pendingUrl:', window.__pxs7PendingImageUrl);
    }

    // Intercept batch_upload_media - check both interceptedUrl AND pendingUrl
    const urlForBatch = window.__pxs7InterceptedUrl || window.__pxs7PendingImageUrl;
    if (urlForBatch && this._pxs7Method === 'POST' &&
        this._pxs7Url.includes('batch_upload_media')) {
      console.log('[PixSim7] Intercepting XHR batch_upload_media, returning:', urlForBatch);

      const urlToReturn = urlForBatch;
      window.__pxs7InterceptedUrl = null;
      window.__pxs7PendingImageUrl = null; // Clear both

      setTimeout(() => {
        // Build response matching Pixverse's expected format
        const mediaId = Date.now();
        const responseObj = {
          code: 0,
          message: 'success',
          data: [{
            id: mediaId,
            media_id: mediaId,
            url: urlToReturn,
            media_url: urlToReturn,
            origin_url: urlToReturn,
            thumbnail_url: urlToReturn,
            type: 'image',
            media_type: 'image',
            status: 'success',
            width: 1024,
            height: 1024
          }]
        };
        const responseData = JSON.stringify(responseObj);

        // Handle different response types
        Object.defineProperty(xhr, 'readyState', { value: 4, writable: true });
        Object.defineProperty(xhr, 'status', { value: 200, writable: true });
        Object.defineProperty(xhr, 'statusText', { value: 'OK', writable: true });
        Object.defineProperty(xhr, 'responseText', { value: responseData, writable: true });
        Object.defineProperty(xhr, 'responseURL', { value: xhr._pxs7Url, writable: true });

        // Set response based on responseType
        if (xhr.responseType === 'json' || xhr.responseType === '') {
          try {
            Object.defineProperty(xhr, 'response', { value: xhr.responseType === 'json' ? responseObj : responseData, writable: true });
          } catch(e) {
            Object.defineProperty(xhr, 'response', { value: responseData, writable: true });
          }
        } else {
          Object.defineProperty(xhr, 'response', { value: responseData, writable: true });
        }

        console.log('[PixSim7] batch_upload_media response sent:', responseObj);

        xhr.dispatchEvent(new Event('readystatechange'));
        xhr.dispatchEvent(new ProgressEvent('progress', { loaded: 100, total: 100 }));
        xhr.dispatchEvent(new Event('load'));
        xhr.dispatchEvent(new Event('loadend'));
        if (xhr.onload) xhr.onload(new Event('load'));
        if (xhr.onreadystatechange) xhr.onreadystatechange();
        if (xhr.onprogress) xhr.onprogress(new ProgressEvent('progress', { loaded: 100, total: 100 }));
        if (xhr.onloadend) xhr.onloadend(new Event('loadend'));
      }, 100);
      return;
    }

    // Intercept OSS upload (PUT to aliyuncs)
    if (window.__pxs7PendingImageUrl &&
        (this._pxs7Method === 'POST' || this._pxs7Method === 'PUT') &&
        (this._pxs7Url.includes('/upload') || this._pxs7Url.includes('/oss') ||
         this._pxs7Url.includes('aliyuncs.com') || this._pxs7Url.includes('/file'))) {
      console.log('[PixSim7] Intercepting XHR upload, returning:', window.__pxs7PendingImageUrl);

      const urlToReturn = window.__pxs7PendingImageUrl;
      window.__pxs7InterceptedUrl = urlToReturn; // Save for batch_upload
      window.__pxs7PendingImageUrl = null;

      // Simulate upload progress
      setTimeout(() => {
        if (xhr.onprogress) xhr.onprogress(new ProgressEvent('progress', { loaded: 50, total: 100 }));
        xhr.dispatchEvent(new ProgressEvent('progress', { loaded: 50, total: 100 }));
      }, 20);

      setTimeout(() => {
        // OSS returns empty 200 OK on success
        Object.defineProperty(xhr, 'readyState', { value: 4, writable: true });
        Object.defineProperty(xhr, 'status', { value: 200, writable: true });
        Object.defineProperty(xhr, 'statusText', { value: 'OK', writable: true });
        Object.defineProperty(xhr, 'responseText', { value: '', writable: true });
        Object.defineProperty(xhr, 'response', { value: '', writable: true });
        Object.defineProperty(xhr, 'responseURL', { value: xhr._pxs7Url, writable: true });

        // Fire all completion events
        xhr.dispatchEvent(new ProgressEvent('progress', { loaded: 100, total: 100 }));
        xhr.dispatchEvent(new Event('readystatechange'));
        xhr.dispatchEvent(new Event('load'));
        xhr.dispatchEvent(new Event('loadend'));
        if (xhr.onprogress) xhr.onprogress(new ProgressEvent('progress', { loaded: 100, total: 100 }));
        if (xhr.onload) xhr.onload(new Event('load'));
        if (xhr.onreadystatechange) xhr.onreadystatechange();
        if (xhr.onloadend) xhr.onloadend(new Event('loadend'));

        console.log('[PixSim7] OSS upload response sent');
      }, 50);
      return;
    }

    return originalXHRSend.call(this, body);
  };

  // Listen for messages from content script to set pending URL
  window.addEventListener('__pxs7SetPendingUrl', function(e) {
    window.__pxs7PendingImageUrl = e.detail;
    // Don't clear interceptedUrl here - it might still be needed for batch_upload
    console.log('[PixSim7] Pending URL set:', e.detail);
  });

  console.log('[PixSim7] Upload interceptor (fetch + XHR) installed');
})();
