export function normalizeBackendBase(base: string): string {
  return base.replace(/\/$/, '');
}

export function isBackendUrl(url: string, backendBase: string): boolean {
  if (!url) return false;
  if (url.startsWith('blob:') || url.startsWith('data:') || url.startsWith('file://')) {
    return false;
  }

  const normalizedBase = normalizeBackendBase(backendBase);

  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url === normalizedBase || url.startsWith(`${normalizedBase}/`);
  }

  return true;
}

export function resolveBackendUrl(
  url: string,
  backendBase: string,
): { fullUrl: string; isBackend: boolean } {
  const normalizedBase = normalizeBackendBase(backendBase);

  if (url.startsWith('blob:') || url.startsWith('data:') || url.startsWith('file://')) {
    return { fullUrl: url, isBackend: false };
  }

  if (url.startsWith('http://') || url.startsWith('https://')) {
    return { fullUrl: url, isBackend: isBackendUrl(url, backendBase) };
  }

  const fullUrl = url.startsWith('/')
    ? `${normalizedBase}${url}`
    : `${normalizedBase}/${url}`;
  return { fullUrl, isBackend: true };
}

export function ensureBackendAbsolute(
  url: string | null | undefined,
  backendBase: string,
): string | undefined {
  if (!url) return undefined;
  if (url.startsWith('blob:') || url.startsWith('data:') || url.startsWith('file://')) {
    return url;
  }
  const { fullUrl, isBackend } = resolveBackendUrl(url, backendBase);
  return isBackend ? fullUrl : url;
}
