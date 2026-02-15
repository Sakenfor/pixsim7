/**
 * @pixsim7/shared.media.core
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
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    try {
      parsed = new URL(url, 'http://localhost');
    } catch {
      return null;
    }
  }
  const parts = parsed.pathname.split('/').filter(Boolean);
  if (parts.length === 0) return null;
  return decodeURIComponent(parts[parts.length - 1]);
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

// ── Mask utilities ──────────────────────────────────────────────────────

/**
 * Build a filename for a drawn mask PNG.
 *
 * @param sourceAssetId  ID of the image the mask was drawn on
 * @param timestamp      Optional epoch ms (defaults to Date.now())
 */
export function buildMaskFilename(
  sourceAssetId: string | number,
  timestamp: number = Date.now(),
): string {
  return `mask_${sourceAssetId}_${timestamp}.png`;
}

export interface MaskUploadContextOptions {
  /** ID of the asset the mask was drawn on */
  sourceAssetId?: number;
  /** Mask type — currently only 'inpaint' */
  maskType?: string;
  /** Feature that created the mask (e.g. 'mask_overlay', 'mask_panel') */
  feature?: string;
  /** Source location in the UI (e.g. 'asset_viewer') */
  source?: string;
}

/**
 * Build a structured upload-context object for mask assets.
 * Keeps metadata consistent across all mask-creation surfaces.
 */
export function buildMaskUploadContext(
  options: MaskUploadContextOptions = {},
): Record<string, unknown> {
  const {
    sourceAssetId,
    maskType = 'inpaint',
    feature = 'mask_overlay',
    source = 'asset_viewer',
  } = options;

  const ctx: Record<string, unknown> = {
    client: 'web_app',
    feature,
    source,
    mask_type: maskType,
  };

  if (sourceAssetId !== undefined && Number.isFinite(sourceAssetId)) {
    ctx.source_asset_id = sourceAssetId;
  }

  return ctx;
}

export default {
  formatTime,
  getFilenameFromUrl,
  getSourceSiteFromUrl,
  getDisplayNameFromUrl,
  getLocalSourceFolder,
  getExtension,
  buildCaptureFilename,
  buildMaskFilename,
  buildMaskUploadContext,
};
