import { pixsimClient } from './client';

export interface PromptPackDraft {
  id: string;
  owner_user_id: number;
  owner_ref?: string | null;
  owner_username?: string | null;
  namespace: string;
  pack_slug: string;
  status: string;
  cue_source: string;
  last_compile_status?: string | null;
  last_compile_errors: Array<Record<string, unknown>>;
  last_compiled_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface PromptPackVersion {
  id: string;
  draft_id: string;
  owner_user_id: number;
  owner_ref?: string | null;
  owner_username?: string | null;
  version: number;
  cue_source: string;
  compiled_schema_yaml: string;
  compiled_manifest_yaml: string;
  compiled_blocks_json: Array<Record<string, unknown>>;
  checksum: string;
  created_at: string;
  publication?: PromptPackPublication | null;
}

export interface PromptPackPublication {
  id: string;
  version_id: string;
  draft_id: string;
  owner_user_id: number;
  owner_ref?: string | null;
  owner_username?: string | null;
  visibility: 'private' | 'approved' | 'shared' | string;
  review_status: 'draft' | 'submitted' | 'approved' | 'rejected' | string;
  reviewed_by_user_id?: number | null;
  reviewed_at?: string | null;
  review_notes?: string | null;
  created_at: string;
  updated_at: string;
}

export interface PromptPackCompileResponse {
  draft_id: string;
  ok: boolean;
  status: string;
  diagnostics: Array<Record<string, unknown>>;
  pack_yaml?: string | null;
  manifest_yaml?: string | null;
  pack_json?: Record<string, unknown> | null;
  blocks_json: Array<Record<string, unknown>>;
  compiled_at?: string | null;
}

export interface PromptPackCatalogRow {
  catalog_source: 'self' | 'shared' | 'system';
  source_pack: string;
  version_id?: string | null;
  draft_id?: string | null;
  namespace?: string | null;
  pack_slug?: string | null;
  version?: number | null;
  checksum?: string | null;
  status?: string | null;
  review_status?: string | null;
  publication_visibility?: string | null;
  created_at?: string | null;
  owner_user_id?: number | null;
  is_active: boolean;
  block_count: number;
}

export interface PromptPackActivationResponse {
  version_id: string;
  draft_id: string;
  source_pack: string;
  active_version_ids: string[];
  blocks_created: number;
  blocks_updated: number;
  blocks_pruned: number;
}

export interface ListPromptPackDraftsQuery {
  owner_user_id?: number;
  mine?: boolean;
  limit?: number;
  offset?: number;
}

export interface PromptPackDraftCreateRequest {
  namespace?: string | null;
  pack_slug: string;
  cue_source?: string;
  status?: string | null;
}

export interface PromptPackDraftUpdateRequest {
  namespace?: string | null;
  pack_slug?: string | null;
  status?: string | null;
}

function toQueryString(params: Record<string, string | number | boolean | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    search.set(key, String(value));
  }
  const serialized = search.toString();
  return serialized ? `?${serialized}` : '';
}

export function listPromptPackDrafts(query: ListPromptPackDraftsQuery = {}): Promise<PromptPackDraft[]> {
  return pixsimClient.get<PromptPackDraft[]>(
    `/prompt-packs/drafts${toQueryString({
      owner_user_id: query.owner_user_id,
      mine: query.mine,
      limit: query.limit,
      offset: query.offset,
    })}`,
  );
}

export function getPromptPackDraft(draftId: string): Promise<PromptPackDraft> {
  return pixsimClient.get<PromptPackDraft>(`/prompt-packs/drafts/${draftId}`);
}

export function createPromptPackDraft(payload: PromptPackDraftCreateRequest): Promise<PromptPackDraft> {
  return pixsimClient.post<PromptPackDraft>('/prompt-packs/drafts', payload);
}

export function updatePromptPackDraft(
  draftId: string,
  payload: PromptPackDraftUpdateRequest,
): Promise<PromptPackDraft> {
  return pixsimClient.patch<PromptPackDraft>(`/prompt-packs/drafts/${draftId}`, payload);
}

export function replacePromptPackDraftSource(draftId: string, cueSource: string): Promise<PromptPackDraft> {
  return pixsimClient.put<PromptPackDraft>(`/prompt-packs/drafts/${draftId}/source`, { cue_source: cueSource });
}

export function validatePromptPackDraft(draftId: string): Promise<PromptPackCompileResponse> {
  return pixsimClient.post<PromptPackCompileResponse>(`/prompt-packs/drafts/${draftId}/validate`, {});
}

export function compilePromptPackDraft(draftId: string): Promise<PromptPackCompileResponse> {
  return pixsimClient.post<PromptPackCompileResponse>(`/prompt-packs/drafts/${draftId}/compile`, {});
}

export function createPromptPackVersion(draftId: string): Promise<PromptPackVersion> {
  return pixsimClient.post<PromptPackVersion>(`/prompt-packs/drafts/${draftId}/versions`, {});
}

export function listPromptPackVersions(
  draftId: string,
  query: { limit?: number; offset?: number } = {},
): Promise<PromptPackVersion[]> {
  return pixsimClient.get<PromptPackVersion[]>(
    `/prompt-packs/drafts/${draftId}/versions${toQueryString({
      limit: query.limit,
      offset: query.offset,
    })}`,
  );
}

export function getPromptPackVersion(versionId: string): Promise<PromptPackVersion> {
  return pixsimClient.get<PromptPackVersion>(`/prompt-packs/versions/${versionId}`);
}

export function submitPromptPackVersion(versionId: string): Promise<PromptPackPublication> {
  return pixsimClient.post<PromptPackPublication>(`/prompt-packs/versions/${versionId}/submit`, {});
}

export function approvePromptPackVersion(versionId: string): Promise<PromptPackPublication> {
  return pixsimClient.post<PromptPackPublication>(`/prompt-packs/versions/${versionId}/approve`, {});
}

export function rejectPromptPackVersion(
  versionId: string,
  reviewNotes?: string | null,
): Promise<PromptPackPublication> {
  return pixsimClient.post<PromptPackPublication>(
    `/prompt-packs/versions/${versionId}/reject`,
    { review_notes: reviewNotes ?? null },
  );
}

export function publishPromptPackVersionPrivate(versionId: string): Promise<PromptPackPublication> {
  return pixsimClient.post<PromptPackPublication>(`/prompt-packs/versions/${versionId}/publish-private`, {});
}

export function publishPromptPackVersionShared(versionId: string): Promise<PromptPackPublication> {
  return pixsimClient.post<PromptPackPublication>(`/prompt-packs/versions/${versionId}/publish-shared`, {});
}

export function listPromptPackCatalog(
  scope: 'self' | 'shared' | 'system' | 'all' = 'self',
): Promise<PromptPackCatalogRow[]> {
  return pixsimClient.get<PromptPackCatalogRow[]>(
    `/prompt-packs/catalog${toQueryString({ scope })}`,
  );
}

export function activatePromptPackVersion(versionId: string): Promise<PromptPackActivationResponse> {
  return pixsimClient.post<PromptPackActivationResponse>(`/prompt-packs/catalog/${versionId}/activate`, {});
}

export function deactivatePromptPackVersion(versionId: string): Promise<PromptPackActivationResponse> {
  return pixsimClient.post<PromptPackActivationResponse>(`/prompt-packs/catalog/${versionId}/deactivate`, {});
}
