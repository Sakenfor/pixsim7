import { createPromptsApi } from '@pixsim7/shared.api.client/domains';
import type {
  BranchSummary,
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

export type { BranchSummary, PromptFamilySummary, PromptFamilyDetail, PromptVersionSummary, PromptVersionDetail };

export interface GenerationHintContract {
  operation: string;
  priority: number;
  requires_input_asset?: boolean;
  auto_bind?: string | null;
  note?: string | null;
  suggested_params?: Record<string, unknown> | null;
}

export interface PromptAuthoringModeContract {
  id: string;
  label: string;
  description: string;
  sequence_role?: string | null;
  generation_hints: GenerationHintContract[];
  recommended_tags: string[];
  required_fields: string[];
}

export interface PromptAuthoringContractResponse {
  version: string;
  authoring_modes: PromptAuthoringModeContract[];
}

export const listPromptFamilies = (
  options?: ListFamiliesApiV1PromptsFamiliesGetParams,
): Promise<PromptFamilySummary[]> => promptsApi.listFamilies(options);

export const getPromptFamily = (familyId: string): Promise<PromptFamilyDetail> =>
  promptsApi.getFamily(familyId);

export const createPromptFamily = (request: CreatePromptFamilyRequest): Promise<PromptFamilyDetail> =>
  promptsApi.createFamily(request);

export const updatePromptFamily = (
  familyId: string,
  data: { title?: string; description?: string; category?: string; tags?: string[]; is_active?: boolean; primary_character_id?: string | null },
): Promise<PromptFamilyDetail> => promptsApi.updateFamily(familyId, data);

export const listBranches = (familyId: string): Promise<BranchSummary[]> =>
  promptsApi.listBranches(familyId);

export const createBranch = (
  familyId: string,
  data: { branch_name: string; from_version_id?: string; author?: string },
): Promise<PromptVersionDetail> => promptsApi.createBranch(familyId, data);

export const listPromptVersions = (
  familyId: string,
  options?: ListVersionsApiV1PromptsFamiliesFamilyIdVersionsGetParams,
): Promise<PromptVersionSummary[]> => promptsApi.listVersions(familyId, options);

export const getPromptVersion = (versionId: string): Promise<PromptVersionDetail> =>
  promptsApi.getVersion(versionId);

export const getPromptAuthoringContract = (
  audience: 'agent' | 'user' = 'user',
): Promise<PromptAuthoringContractResponse> =>
  pixsimClient.get<PromptAuthoringContractResponse>('/prompts/meta/authoring-contract', {
    params: { audience },
  });

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

export interface PromptVersionAssetsResponse {
  version_id: string;
  asset_count: number;
  assets: Record<string, unknown>[];
}

export const getPromptVersionAssets = (
  versionId: string,
  options?: { limit?: number },
): Promise<PromptVersionAssetsResponse> =>
  pixsimClient.get<PromptVersionAssetsResponse>(
    `/prompts/versions/${encodeURIComponent(versionId)}/assets`,
    { params: options },
  );
