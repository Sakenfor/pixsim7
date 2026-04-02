import { generateUUID } from '@lib/utils/uuid';

const CLIENT_TRACE_ID = generateUUID();

function asHeaders(input?: HeadersInit): Headers {
  return new Headers(input);
}

export function withCorrelationHeaders(
  headers?: HeadersInit,
  clientSurface?: string,
): Record<string, string> {
  const merged = asHeaders(headers);
  if (!merged.has('X-Trace-ID')) merged.set('X-Trace-ID', CLIENT_TRACE_ID);
  if (!merged.has('X-Request-ID')) merged.set('X-Request-ID', generateUUID());
  if (clientSurface && !merged.has('X-Client-Surface')) {
    merged.set('X-Client-Surface', clientSurface);
  }
  return Object.fromEntries(merged.entries());
}
