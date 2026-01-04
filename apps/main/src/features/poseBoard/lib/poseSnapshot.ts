/**
 * Pose Snapshot helpers
 *
 * Upload pose board snapshots and apply tagging.
 */

import { API_BASE_URL } from '@lib/api';
import { authService } from '@lib/auth/authService';

export const POSE_SNAPSHOT_TAG = 'poseboard:snapshot';

export interface PoseSnapshotUploadOptions {
  blob: Blob;
  providerId: string;
  filename?: string;
  tags?: string[];
}

export interface PoseSnapshotUploadResult {
  assetId?: number;
  response: Record<string, unknown>;
}

export async function uploadPoseSnapshot({
  blob,
  providerId,
  filename = 'poseboard_snapshot.png',
  tags = [POSE_SNAPSHOT_TAG],
}: PoseSnapshotUploadOptions): Promise<PoseSnapshotUploadResult> {
  if (!providerId) {
    throw new Error('Select a provider before saving a pose snapshot.');
  }

  const form = new FormData();
  form.append('file', blob, filename);
  form.append('provider_id', providerId);
  form.append('upload_method', 'web');
  form.append(
    'upload_context',
    JSON.stringify({ client: 'web_app', feature: 'poseboard' })
  );

  const token = authService.getStoredToken();
  const headers: HeadersInit = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const uploadUrl = `${API_BASE_URL.replace(/\/$/, '')}/assets/upload`;
  const res = await fetch(uploadUrl, {
    method: 'POST',
    body: form,
    headers,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `${res.status} ${res.statusText}`);
  }

  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  const assetId = coerceAssetId(data);

  if (assetId && tags.length > 0) {
    await assignAssetTags(assetId, tags, token);
  }

  return { assetId, response: data };
}

function coerceAssetId(data: Record<string, unknown>): number | undefined {
  const raw =
    data.asset_id ??
    data.assetId ??
    data.id ??
    (typeof data.asset === 'object' && data.asset && (data.asset as any).id);

  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : undefined;
  if (typeof raw === 'string') {
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
}

async function assignAssetTags(assetId: number, tags: string[], token: string | null) {
  const tagUrl = `${API_BASE_URL.replace(/\/$/, '')}/assets/${assetId}/tags/assign`;
  const headers: HeadersInit = { 'Content-Type': 'application/json' };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(tagUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify({ add: tags }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `${res.status} ${res.statusText}`);
  }
}
