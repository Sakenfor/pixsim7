/**
 * Injected Script - Bearer Token & Session ID Capture
 * Runs in page context to intercept fetch calls and read from storage
 *
 * Captures:
 * - Bearer token (Authorization header)
 * - ai-trace-id and ai-anonymous-id (Pixverse session identifiers)
 *
 * These IDs are crucial for session sharing - Pixverse uses them to identify
 * a "session instance". If browser and backend use different IDs with the same
 * JWT, Pixverse treats them as separate sessions → "logged in elsewhere" error.
 */
(function() {
  // Try to capture session IDs from localStorage immediately on load
  // Pixverse stores these for session tracking
  function captureFromStorage() {
    try {
      // Common storage keys Pixverse might use
      const storageKeys = [
        'ai-trace-id', 'ai_trace_id', 'traceId', 'trace_id',
        'ai-anonymous-id', 'ai_anonymous_id', 'anonymousId', 'anonymous_id'
      ];

      for (const key of storageKeys) {
        const localVal = localStorage.getItem(key);
        const sessionVal = sessionStorage.getItem(key);
        const val = localVal || sessionVal;

        if (val) {
          if (key.includes('trace')) {
            window.__pixsim7_trace_id = val;
          } else if (key.includes('anonymous')) {
            window.__pixsim7_anonymous_id = val;
          }
        }
      }

      // Also check for JWT token in storage
      const tokenKeys = ['_ai_token', 'ai_token', 'token', 'jwt_token'];
      for (const key of tokenKeys) {
        const val = localStorage.getItem(key) || sessionStorage.getItem(key);
        if (val && val.startsWith('eyJ')) {
          window.__pixsim7_jwt_token = val;
          break;
        }
      }
    } catch (e) {
      // Storage access might fail in some contexts
    }
  }

  // Capture immediately on script load
  captureFromStorage();

  // Also intercept fetch calls to capture IDs from headers (backup/update)
  const originalFetch = window.fetch;
  window.fetch = function(...args) {
    const [url, options] = args;

    // Only capture from Pixverse API calls
    if (options && options.headers && typeof url === 'string' && url.includes('pixverse')) {
      const headers = new Headers(options.headers);

      // Capture Authorization/Bearer token
      const auth = headers.get('Authorization');
      if (auth && auth.startsWith('Bearer ')) {
        window.__pixsim7_bearer_token = auth.substring(7);
      }

      // Capture token header (Pixverse uses this for JWT)
      const token = headers.get('token');
      if (token) {
        window.__pixsim7_jwt_token = token;
      }

      // Capture session identifiers for session sharing
      const traceId = headers.get('ai-trace-id');
      const anonymousId = headers.get('ai-anonymous-id');

      if (traceId) {
        window.__pixsim7_trace_id = traceId;
      }
      if (anonymousId) {
        window.__pixsim7_anonymous_id = anonymousId;
      }
    }

    return originalFetch.apply(this, args);
  };
})();
