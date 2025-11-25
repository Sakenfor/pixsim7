// Minimal Google Identity Services helper for obtaining an ID token.
// Expects VITE_GOOGLE_CLIENT_ID to be set in the environment.

declare global {
  interface Window {
    google?: any;
  }
}

export {};

const GIS_SCRIPT_SRC = 'https://accounts.google.com/gsi/client';

let gisLoadingPromise: Promise<void> | null = null;

function loadGoogleIdentityScript(): Promise<void> {
  if (gisLoadingPromise) return gisLoadingPromise;

  gisLoadingPromise = new Promise<void>((resolve, reject) => {
    if (typeof window === 'undefined') {
      resolve();
      return;
    }

    const existing = document.querySelector(`script[src="${GIS_SCRIPT_SRC}"]`) as HTMLScriptElement | null;
    if (existing && (window as any).google?.accounts?.id) {
      resolve();
      return;
    }

    const script = document.createElement('script');
    script.src = GIS_SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Google Identity Services script'));
    document.head.appendChild(script);
  });

  return gisLoadingPromise;
}

/**
 * Trigger Google One Tap / popup sign-in and resolve with an ID token.
 *
 * Returns:
 *   - idToken string on success
 *   - null if user closes / cancels
 */
export async function getGoogleIdTokenViaGIS(): Promise<string | null> {
  const clientId = (import.meta as any).env?.VITE_GOOGLE_CLIENT_ID as string | undefined;
  if (!clientId) {
    console.warn('VITE_GOOGLE_CLIENT_ID is not set; cannot use Google connect.');
    return null;
  }

  if (typeof window === 'undefined') return null;

  await loadGoogleIdentityScript().catch((err) => {
    console.error('Failed to load Google Identity Services:', err);
  });

  if (!window.google?.accounts?.id) {
    console.warn('Google Identity Services not available on window.');
    return null;
  }

  return new Promise<string | null>((resolve) => {
    let resolved = false;

    window.google.accounts.id.initialize({
      client_id: clientId,
      callback: (response: any) => {
        if (resolved) return;
        resolved = true;
        const token = response?.credential as string | undefined;
        resolve(token || null);
      },
      cancel_on_tap_outside: true,
      auto_select: false,
    });

    window.google.accounts.id.prompt((notification: any) => {
      if (resolved) return;
      const dismissed = notification?.isDismissedMoment?.();
      const notDisplayed = notification?.isNotDisplayed?.();
      if (dismissed || notDisplayed) {
        resolved = true;
        resolve(null);
      }
    });
  });
}

