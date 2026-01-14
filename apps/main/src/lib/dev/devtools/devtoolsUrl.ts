const DEFAULT_DEVTOOLS_URL = 'http://localhost:5176';

function inferDevtoolsUrlFromHost(): string | undefined {
  if (typeof window === 'undefined') {
    return undefined;
  }

  const { protocol, host } = window.location;

  if (host.startsWith('app.')) {
    return `${protocol}//${host.replace(/^app\./, 'dev.')}`;
  }

  return undefined;
}

export function getDevtoolsBaseUrl(): string {
  return (
    import.meta.env.VITE_DEVTOOLS_URL as string | undefined ||
    inferDevtoolsUrlFromHost() ||
    DEFAULT_DEVTOOLS_URL
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
