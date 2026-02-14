/**
 * Dev-only guard for Chrome/React profiling user-timing DataCloneError crashes.
 *
 * React dev builds pass rich `detail` payloads into `performance.measure()`.
 * Very large payloads can throw DataCloneError in some browser versions.
 */

declare global {
  // eslint-disable-next-line no-var
  var __pixsimPerfMeasureGuardInstalled: boolean | undefined;
}

if (import.meta.env.DEV && typeof performance !== 'undefined') {
  if (!globalThis.__pixsimPerfMeasureGuardInstalled) {
    const originalMeasure = performance.measure.bind(performance);

    performance.measure = ((...args: Parameters<Performance['measure']>) => {
      try {
        return originalMeasure(...args);
      } catch (error) {
        if (error instanceof DOMException && error.name === 'DataCloneError') {
          const markName = typeof args[0] === 'string' ? args[0] : '(unnamed)';
          console.warn(`[PerfGuard] Suppressed performance.measure DataCloneError for "${markName}"`);
          return undefined as ReturnType<Performance['measure']>;
        }
        throw error;
      }
    }) as Performance['measure'];

    globalThis.__pixsimPerfMeasureGuardInstalled = true;
  }
}

