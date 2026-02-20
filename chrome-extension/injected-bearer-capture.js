/**
 * Injected Script - Bearer Token & Session ID Capture
 * Runs in page context to intercept fetch calls and read from storage
 *
 * Captures:
 * - Bearer token (Authorization header)
 * - ai-trace-id and ai-anonymous-id (Pixverse session identifiers)
 * - Remaker JWT + product-serial/product-code headers (from localStorage.userInfo + fetch)
 *
 * These IDs are crucial for session sharing - Pixverse uses them to identify
 * a "session instance". If browser and backend use different IDs with the same
 * JWT, Pixverse treats them as separate sessions → "logged in elsewhere" error.
 *
 * Communication: Uses CustomEvents to bridge data to content script context.
 * Content scripts can't access page window directly due to isolation.
 */
(function() {
  // Notify content script of captured session data via CustomEvent
  function notifyContentScript() {
    const data = {
      traceId: window.__pixsim7_trace_id || null,
      anonymousId: window.__pixsim7_anonymous_id || null,
      jwtToken: window.__pixsim7_jwt_token || null,
      bearerToken: window.__pixsim7_bearer_token || null,
      // Remaker-specific captures
      remarkerToken: window.__pixsim7_remaker_token || null,
      remarkerProductSerial: window.__pixsim7_remaker_product_serial || null,
      remarkerProductCode: window.__pixsim7_remaker_product_code || null,
      remarkerCredits: window.__pixsim7_remaker_credits ?? null,
      remarkerUserId: window.__pixsim7_remaker_user_id ?? null,
      remarkerEmail: window.__pixsim7_remaker_email ?? null,
      timestamp: Date.now(),
    };
    document.dispatchEvent(new CustomEvent('pixsim7-session-data', { detail: data }));
  }

  // Try to capture session IDs from localStorage immediately on load
  // Pixverse stores these for session tracking
  function captureFromStorage() {
    try {
      // Common storage keys Pixverse might use (explicit patterns)
      const tracePatterns = ['ai-trace-id', 'ai_trace_id', 'traceId', 'trace_id', 'trace-id'];
      const anonPatterns = ['ai-anonymous-id', 'ai_anonymous_id', 'anonymousId', 'anonymous_id', 'anonymous-id'];

      // Check explicit patterns first
      for (const key of tracePatterns) {
        const val = localStorage.getItem(key) || sessionStorage.getItem(key);
        if (val) {
          window.__pixsim7_trace_id = val;
          break;
        }
      }

      for (const key of anonPatterns) {
        const val = localStorage.getItem(key) || sessionStorage.getItem(key);
        if (val) {
          window.__pixsim7_anonymous_id = val;
          break;
        }
      }

      // Fallback: scan all storage keys for trace/anonymous patterns
      if (!window.__pixsim7_trace_id || !window.__pixsim7_anonymous_id) {
        const scanStorage = (storage) => {
          for (let i = 0; i < storage.length; i++) {
            const key = storage.key(i);
            if (!key) continue;
            const keyLower = key.toLowerCase();
            const val = storage.getItem(key);
            if (!val) continue;

            if (!window.__pixsim7_trace_id && keyLower.includes('trace') && !keyLower.includes('stack')) {
              window.__pixsim7_trace_id = val;
              console.debug('[PixSim7] Found trace ID from key:', key);
            }
            if (!window.__pixsim7_anonymous_id && keyLower.includes('anonymous')) {
              window.__pixsim7_anonymous_id = val;
              console.debug('[PixSim7] Found anonymous ID from key:', key);
            }
          }
        };
        scanStorage(localStorage);
        scanStorage(sessionStorage);
      }

      // Remaker: JWT + account data lives in localStorage.userInfo as JSON
      try {
        const userInfoRaw = localStorage.getItem('userInfo');
        if (userInfoRaw && userInfoRaw.startsWith('{')) {
          const userInfo = JSON.parse(userInfoRaw);
          if (userInfo.token && userInfo.token.startsWith('eyJ')) {
            window.__pixsim7_remaker_token = userInfo.token;
            console.debug('[PixSim7] Found Remaker JWT from userInfo');
          }
        }
      } catch (e) {
        // userInfo not present or not valid JSON - not on Remaker or not logged in
      }

      // Also check for JWT token in storage
      const tokenKeys = ['_ai_token', 'ai_token', 'token', 'jwt_token', 'jwtToken'];
      for (const key of tokenKeys) {
        const val = localStorage.getItem(key) || sessionStorage.getItem(key);
        if (val && val.startsWith('eyJ')) {
          window.__pixsim7_jwt_token = val;
          break;
        }
      }

      // Fallback: scan for any JWT-looking token
      if (!window.__pixsim7_jwt_token) {
        const scanForJwt = (storage) => {
          for (let i = 0; i < storage.length; i++) {
            const key = storage.key(i);
            if (!key) continue;
            const val = storage.getItem(key);
            if (val && val.startsWith('eyJ') && val.includes('.')) {
              window.__pixsim7_jwt_token = val;
              console.debug('[PixSim7] Found JWT from key:', key);
              break;
            }
          }
        };
        scanForJwt(localStorage);
        if (!window.__pixsim7_jwt_token) scanForJwt(sessionStorage);
      }
      // Notify content script of captured data
      notifyContentScript();
    } catch (e) {
      console.warn('[PixSim7] Storage capture failed:', e);
    }
  }

  // Capture immediately on script load
  captureFromStorage();

  // Retry capture after a short delay (page may set values after initial load)
  setTimeout(captureFromStorage, 500);
  setTimeout(captureFromStorage, 2000);

  // Also respond to explicit requests from content script
  document.addEventListener('pixsim7-request-session', () => {
    notifyContentScript();
  });

  // Also intercept fetch calls to capture IDs from headers (backup/update)
  const originalFetch = window.fetch;
  window.fetch = function(...args) {
    const [url, options] = args;

    if (options && options.headers && typeof url === 'string') {
      const headers = options.headers instanceof Headers
        ? options.headers
        : new Headers(options.headers);

      // Pixverse API calls
      if (url.includes('pixverse')) {
        // Capture Authorization/Bearer token
        const auth = headers.get('Authorization') || headers.get('authorization');
        if (auth && auth.startsWith('Bearer ')) {
          window.__pixsim7_bearer_token = auth.substring(7);
        }

        // Capture token header (Pixverse uses this for JWT)
        const token = headers.get('token') || headers.get('Token');
        if (token) {
          window.__pixsim7_jwt_token = token;
        }

        // Capture session identifiers for session sharing
        // Check multiple header name variations
        const traceHeaders = ['ai-trace-id', 'ai_trace_id', 'x-trace-id', 'trace-id'];
        const anonHeaders = ['ai-anonymous-id', 'ai_anonymous_id', 'x-anonymous-id', 'anonymous-id'];

        for (const h of traceHeaders) {
          const val = headers.get(h);
          if (val) {
            window.__pixsim7_trace_id = val;
            break;
          }
        }

        for (const h of anonHeaders) {
          const val = headers.get(h);
          if (val) {
            window.__pixsim7_anonymous_id = val;
            break;
          }
        }

        notifyContentScript();
      }

      // Remaker API calls — capture raw JWT + product headers
      if (url.includes('remaker')) {
        const auth = headers.get('Authorization') || headers.get('authorization');
        if (auth) {
          // Remaker uses raw JWT (no "Bearer " prefix)
          window.__pixsim7_remaker_token = auth;
        }

        const productSerial = headers.get('product-serial');
        if (productSerial) {
          window.__pixsim7_remaker_product_serial = productSerial;
        }

        const productCode = headers.get('product-code');
        if (productCode) {
          window.__pixsim7_remaker_product_code = productCode;
        }

        notifyContentScript();

        // Capture fresh credits from get-userinfo response
        if (url.includes('/user/get-userinfo')) {
          const result = originalFetch.apply(this, args);
          result.then(resp => {
            resp.clone().json().then(body => {
              if (body && body.code === 100000 && body.result) {
                const r = body.result;
                window.__pixsim7_remaker_credits = r.credits ?? null;
                window.__pixsim7_remaker_user_id = r.user_id ?? null;
                window.__pixsim7_remaker_email = r.email ?? null;
                notifyContentScript();
              }
            }).catch(() => {});
          }).catch(() => {});
          return result;
        }
      }
    }

    return originalFetch.apply(this, args);
  };

  // Also intercept XMLHttpRequest for older API patterns
  const originalXhrOpen = XMLHttpRequest.prototype.open;
  const originalXhrSetHeader = XMLHttpRequest.prototype.setRequestHeader;

  XMLHttpRequest.prototype.setRequestHeader = function(name, value) {
    const nameLower = name.toLowerCase();
    let captured = false;
    if (nameLower.includes('trace')) {
      window.__pixsim7_trace_id = value;
      captured = true;
    } else if (nameLower.includes('anonymous')) {
      window.__pixsim7_anonymous_id = value;
      captured = true;
    } else if (nameLower === 'token' && value) {
      window.__pixsim7_jwt_token = value;
      captured = true;
    } else if (nameLower === 'authorization' && value && value.startsWith('Bearer ')) {
      window.__pixsim7_bearer_token = value.substring(7);
      captured = true;
    }
    // Remaker-specific headers (raw JWT auth + product headers)
    if (nameLower === 'authorization' && value && !value.startsWith('Bearer ') && value.startsWith('eyJ')) {
      window.__pixsim7_remaker_token = value;
      captured = true;
    } else if (nameLower === 'product-serial' && value) {
      window.__pixsim7_remaker_product_serial = value;
      captured = true;
    } else if (nameLower === 'product-code' && value) {
      window.__pixsim7_remaker_product_code = value;
      captured = true;
    }
    if (captured) {
      notifyContentScript();
    }
    return originalXhrSetHeader.apply(this, arguments);
  };
})();
