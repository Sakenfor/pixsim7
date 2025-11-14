/**
 * Injected Script - Bearer Token Capture
 * Runs in page context to intercept fetch calls
 */
(function() {
  const originalFetch = window.fetch;
  window.fetch = function(...args) {
    const [url, options] = args;

    // Capture Authorization header
    if (options && options.headers) {
      const headers = new Headers(options.headers);
      const auth = headers.get('Authorization');
      if (auth && auth.startsWith('Bearer ')) {
        // Store in a global variable accessible to content script
        window.__pixsim7_bearer_token = auth.substring(7); // Remove "Bearer "
      }
    }

    return originalFetch.apply(this, args);
  };
})();
