/**
 * Get the devtools base URL.
 *
 * In development, devtools is proxied through the main app at /devtools
 * to share the same origin (and thus localStorage for auth).
 *
 * In production, can be configured via VITE_DEVTOOLS_URL or inferred
 * from host (app.example.com -> dev.example.com).
 */
function inferDevtoolsUrlFromHost(): string | undefined {
  if (typeof window === 'undefined') {
    return undefined;
  }

  const { protocol, host } = window.location;

  // Production: app.example.com -> dev.example.com
  if (host.startsWith('app.')) {
    return `${protocol}//${host.replace(/^app\./, 'dev.')}`;
  }

  // Development: use /devtools path on same origin (shares localStorage)
  if (host.includes('localhost') || host.includes('127.0.0.1')) {
    return `${protocol}//${host}/devtools`;
  }

  return undefined;
}

export function getDevtoolsBaseUrl(): string {
  return (
    import.meta.env.VITE_DEVTOOLS_URL as string | undefined ||
    inferDevtoolsUrlFromHost() ||
    '/devtools'
  );
}

export function buildDevtoolsUrl(path: string): string {
  const base = getDevtoolsBaseUrl().replace(/\/$/, '');
  if (!path) {
    return base;
  }
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${base}${normalized}`;
}
