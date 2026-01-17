/**
 * @pixsim7/shared.media-core
 *
 * Shared media utilities for players and capture workflows.
 * Pure TypeScript, no DOM dependencies.
 */

export function formatTime(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const hrs = Math.floor(total / 3600);
  const mins = Math.floor((total % 3600) / 60);
  const secs = total % 60;

  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function getFilenameFromUrl(url?: string): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    const parts = parsed.pathname.split('/').filter(Boolean);
    if (parts.length === 0) return null;
    return decodeURIComponent(parts[parts.length - 1]);
  } catch {
    return null;
  }
}

export function getSourceSiteFromUrl(url?: string): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }
    return parsed.hostname || null;
  } catch {
    return null;
  }
}

export function getDisplayNameFromUrl(url?: string, fallback: string = 'Video'): string {
  if (!url) return fallback;
  const filename = getFilenameFromUrl(url);
  if (filename) return filename;
  try {
    const parsed = new URL(url);
    return parsed.hostname || fallback;
  } catch {
    return fallback;
  }
}

export function getLocalSourceFolder(relativePath?: string): string | null {
  if (!relativePath) return null;
  const normalized = relativePath.replace(/\\/g, '/');
  const parts = normalized.split('/').filter(Boolean);
  return parts.length > 1 ? parts[0] : null;
}

export function getExtension(filename: string): string {
  return filename.split('.').pop()?.toLowerCase() || '';
}

export function buildCaptureFilename(sourceName: string | null, timeSec: number): string {
  const base = sourceName?.replace(/\.[^/.]+$/, '') || 'capture';
  const safeBase = base.replace(/[^a-zA-Z0-9-_]+/g, '_').replace(/^_+|_+$/g, '') || 'capture';
  const timeTag = Math.max(0, Math.floor(timeSec * 1000));
  return `${safeBase}_frame_${timeTag}.jpg`;
}

export default {
  formatTime,
  getFilenameFromUrl,
  getSourceSiteFromUrl,
  getDisplayNameFromUrl,
  getLocalSourceFolder,
  getExtension,
  buildCaptureFilename,
};
