import { createPromptsApi } from '@pixsim7/shared.api.client/domains';
import type {
  PromptFamilyDetail,
  PromptFamilySummary,
  PromptVersionDetail,
  PromptVersionSummary,
} from '@pixsim7/shared.api.client/domains';
import type {
  CreatePromptFamilyRequest,
  CreatePromptVersionRequest,
  ListFamiliesApiV1PromptsFamiliesGetParams,
  ListVersionsApiV1PromptsFamiliesFamilyIdVersionsGetParams,
} from '@pixsim7/shared.api.model';

import { pixsimClient } from './client';

const promptsApi = createPromptsApi(pixsimClient);

export type { PromptFamilySummary, PromptFamilyDetail, PromptVersionSummary, PromptVersionDetail };

export const listPromptFamilies = (
  options?: ListFamiliesApiV1PromptsFamiliesGetParams,
): Promise<PromptFamilySummary[]> => promptsApi.listFamilies(options);

export const getPromptFamily = (familyId: string): Promise<PromptFamilyDetail> =>
  promptsApi.getFamily(familyId);

export const createPromptFamily = (request: CreatePromptFamilyRequest): Promise<PromptFamilyDetail> =>
  promptsApi.createFamily(request);

export const listPromptVersions = (
  familyId: string,
  options?: ListVersionsApiV1PromptsFamiliesFamilyIdVersionsGetParams,
): Promise<PromptVersionSummary[]> => promptsApi.listVersions(familyId, options);

export const getPromptVersion = (versionId: string): Promise<PromptVersionDetail> =>
  promptsApi.getVersion(versionId);

export const createPromptVersion = (
  familyId: string,
  request: CreatePromptVersionRequest,
): Promise<PromptVersionDetail> => promptsApi.createVersion(familyId, request);

export interface PromptEditOp {
  intent: string;
  target: string;
  direction?: string;
  value?: unknown;
  note?: string;
}

export interface ApplyPromptEditRequest {
  prompt_text: string;
  instruction?: string;
  edit_ops?: PromptEditOp[];
  commit_message?: string;
  author?: string;
  tags?: string[];
  variables?: Record<string, unknown>;
  provider_hints?: Record<string, unknown>;
  prompt_analysis?: Record<string, unknown>;
}

export interface ApplyPromptEditResponse {
  source_version_id: string;
  created_version: PromptVersionSummary;
  applied_edit: {
    instruction?: string;
    edit_ops?: PromptEditOp[];
    commit_message: string;
  };
}

export const applyPromptEdit = (
  versionId: string,
  request: ApplyPromptEditRequest,
): Promise<ApplyPromptEditResponse> =>
  pixsimClient.post<ApplyPromptEditResponse>(
    `/prompts/versions/${encodeURIComponent(versionId)}/apply-edit`,
    request,
  );

export interface PromptVersionAsset {
  id: number;
  media_type: string;
  remote_url?: string | null;
  thumbnail_url?: string | null;
  created_at: string;
}

export interface PromptVersionAssetsResponse {
  version_id: string;
  asset_count: number;
  assets: PromptVersionAsset[];
}

export const getPromptVersionAssets = (
  versionId: string,
  options?: { limit?: number },
): Promise<PromptVersionAssetsResponse> =>
  pixsimClient.get<PromptVersionAssetsResponse>(
    `/prompts/versions/${encodeURIComponent(versionId)}/assets`,
    { params: options },
  );
