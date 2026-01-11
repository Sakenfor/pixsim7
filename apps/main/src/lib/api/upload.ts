/**
 * Asset Upload API
 *
 * Shared utility for uploading files to the assets API.
 * Used by frame capture, local folders, and other upload flows.
 */

import { authService } from '@lib/auth';

import { API_BASE_URL } from './index';

export interface UploadAssetOptions {
  /** File or Blob to upload */
  file: File | Blob;
  /** Filename for the upload */
  filename: string;
  /** Target provider ID */
  providerId: string;
  /** Upload method identifier */
  uploadMethod: string;
  /** Optional upload context metadata */
  uploadContext?: Record<string, unknown>;
  /** Optional source folder ID (for local folder uploads) */
  sourceFolderId?: string;
  /** Optional relative path within folder */
  sourceRelativePath?: string;
}

export interface UploadAssetResponse {
  provider_id: string;
  media_type: string;
  external_url?: string;
  provider_asset_id?: string;
  asset_id?: number;
  note?: string;
}

/**
 * Upload a file to the assets API.
 *
 * @param options - Upload options
 * @returns Upload response with asset_id if created
 * @throws Error if upload fails
 */
export async function uploadAsset(options: UploadAssetOptions): Promise<UploadAssetResponse> {
  const {
    file,
    filename,
    providerId,
    uploadMethod,
    uploadContext,
    sourceFolderId,
    sourceRelativePath,
  } = options;

  const form = new FormData();
  form.append('file', file, filename);
  form.append('provider_id', providerId);
  form.append('upload_method', uploadMethod);

  if (sourceFolderId) {
    form.append('source_folder_id', sourceFolderId);
  }
  if (sourceRelativePath) {
    form.append('source_relative_path', sourceRelativePath);
  }
  if (uploadContext) {
    form.append('upload_context', JSON.stringify(uploadContext));
  }

  const token = authService.getStoredToken();
  const headers: HeadersInit = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE_URL.replace(/\/$/, '')}/assets/upload`, {
    method: 'POST',
    body: form,
    headers,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `${res.status} ${res.statusText}`);
  }

  return res.json();
}
