/**
 * Prompts API Domain Client
 *
 * Strict OpenAPI-backed client for prompt families, versions, variants,
 * and semantic packs.
 */
import type { PixSimApiClient } from '../client';
import type {
  CompareVersionsApiV1PromptsVersionsCompareGetParams,
  CreatePromptFamilyRequest,
  CreatePromptVariantRequest,
  CreatePromptVersionRequest,
  ListFamiliesApiV1PromptsFamiliesGetParams,
  ListPromptVariantsForVersionApiV1PromptsVersionsVersionIdVariantsGetParams,
  ListSemanticPacksApiV1SemanticPacksGetParams,
  ListVersionsApiV1PromptsFamiliesFamilyIdVersionsGetParams,
  PromptFamilyResponse,
  PromptVariantResponse,
  PromptVersionResponse,
  RatePromptVariantRequest,
  SemanticPackCreateRequest,
  SemanticPackManifest,
} from '@pixsim7/shared.api.model';

// ===== Prompt Types =====

// Extend with fields added after last Orval codegen (tags branch: authoring_mode_id, primary_character_id)
export type PromptFamilySummary = PromptFamilyResponse & {
  authoring_mode_id?: string | null;
  primary_character_id?: string | null;
};
export type PromptFamilyDetail = PromptFamilyResponse & {
  authoring_mode_id?: string | null;
  primary_character_id?: string | null;
};
export type PromptVersionSummary = PromptVersionResponse & {
  parent_version_id?: string | null;
  branch_name?: string | null;
};
export type PromptVersionDetail = PromptVersionResponse & {
  parent_version_id?: string | null;
  branch_name?: string | null;
};
export type PromptVariant = PromptVariantResponse;
export type VariantFeedback = PromptVariantResponse;
export interface BranchSummary {
  name: string;
  head_version_id: string | null;
  latest_version_number: number | null;
  commit_count: number;
  last_commit: string | null;
  author: string | null;
  is_main: boolean;
}
export type PromptAnalytics = unknown;
export type PromptComparison = unknown;
export type SemanticPack = SemanticPackManifest;

// ===== Similarity search (/prompts/search/similar) =====

export interface SearchSimilarPromptsQuery {
  prompt: string;
  /** "text" (lexical, default) or "vector" (pgvector semantic search). */
  mode?: 'text' | 'vector';
  limit?: number;
  /** Minimum similarity score 0-1. */
  threshold?: number;
  family_id?: string;
}

export interface SimilarPromptMatch {
  version_id: string;
  family_id: string | null;
  version_number: number | null;
  prompt_text: string;
  similarity_score: number;
  commit_message: string | null;
}

export interface SimilarPromptsResponse {
  query: string;
  limit: number;
  threshold: number;
  family_id: string | null;
  mode: string;
  results: SimilarPromptMatch[];
  result_count: number;
}

type ListFamiliesQuery = ListFamiliesApiV1PromptsFamiliesGetParams;
type ListVersionsQuery = ListVersionsApiV1PromptsFamiliesFamilyIdVersionsGetParams;
type CreatePromptFamilyRequestSchema = CreatePromptFamilyRequest;
type CreatePromptVersionRequestSchema = CreatePromptVersionRequest;
type ListPromptVariantsQuery = ListPromptVariantsForVersionApiV1PromptsVersionsVersionIdVariantsGetParams;
type CreatePromptVariantRequestSchema = CreatePromptVariantRequest;
type RatePromptVariantRequestSchema = RatePromptVariantRequest;
type CompareVersionsQuery = CompareVersionsApiV1PromptsVersionsCompareGetParams;
type ListSemanticPacksQuery = ListSemanticPacksApiV1SemanticPacksGetParams;
type SemanticPackCreateRequestSchema = SemanticPackCreateRequest;
type DeleteSemanticPackResponse = unknown;

// ===== Prompts API Factory =====

export function createPromptsApi(client: PixSimApiClient) {
  return {
    // ===== Families =====

    async listFamilies(options?: ListFamiliesQuery): Promise<PromptFamilySummary[]> {
      const response = await client.get<readonly PromptFamilySummary[]>('/prompts/families', {
        params: options,
      });
      return [...response];
    },

    async getFamily(familyId: string): Promise<PromptFamilyDetail> {
      return client.get<PromptFamilyDetail>(`/prompts/families/${encodeURIComponent(familyId)}`);
    },

    async createFamily(data: CreatePromptFamilyRequestSchema): Promise<PromptFamilyDetail> {
      return client.post<PromptFamilyDetail>('/prompts/families', data);
    },

    async updateFamily(
      familyId: string,
      data: { title?: string; description?: string; category?: string; tags?: string[]; is_active?: boolean },
    ): Promise<PromptFamilyDetail> {
      return client.patch<PromptFamilyDetail>(
        `/prompts/families/${encodeURIComponent(familyId)}`,
        data,
      );
    },

    // ===== Branches =====

    async listBranches(familyId: string): Promise<BranchSummary[]> {
      const response = await client.get<readonly BranchSummary[]>(
        `/prompts/families/${encodeURIComponent(familyId)}/branches`,
      );
      return [...response];
    },

    async createBranch(
      familyId: string,
      data: { branch_name: string; from_version_id?: string; author?: string },
    ): Promise<PromptVersionDetail> {
      return client.post<PromptVersionDetail>(
        `/prompts/families/${encodeURIComponent(familyId)}/branches`,
        data,
      );
    },

    // ===== Versions =====

    async listVersions(
      familyId: string,
      options?: ListVersionsQuery
    ): Promise<PromptVersionSummary[]> {
      const response = await client.get<readonly PromptVersionSummary[]>(
        `/prompts/families/${encodeURIComponent(familyId)}/versions`,
        { params: options }
      );
      return [...response];
    },

    async getVersion(versionId: number | string): Promise<PromptVersionDetail> {
      return client.get<PromptVersionDetail>(
        `/prompts/versions/${encodeURIComponent(String(versionId))}`
      );
    },

    // ===== Similarity search =====

    async searchSimilar(query: SearchSimilarPromptsQuery): Promise<SimilarPromptsResponse> {
      // Vector mode embeds the query text on demand. The default text embedder
      // (cmd:embedding-default) spawns a one-shot subprocess that reloads the
      // model each call (~15-25s cold), which blows past the client's 30s
      // default and surfaces as "timeout of 30000ms exceeded". Mirror the
      // /assets/search semantic-search budget (120s) so the cold query can
      // complete; the result + query-vector caches make repeats instant.
      return client.get<SimilarPromptsResponse>('/prompts/search/similar', {
        params: query,
        timeout: 120_000,
      });
    },

    async createVersion(
      familyId: string,
      data: CreatePromptVersionRequestSchema
    ): Promise<PromptVersionDetail> {
      return client.post<PromptVersionDetail>(
        `/prompts/families/${encodeURIComponent(familyId)}/versions`,
        data
      );
    },

    // ===== Variants =====

    async listVariants(
      versionId: number | string,
      options?: ListPromptVariantsQuery
    ): Promise<PromptVariant[]> {
      const response = await client.get<readonly PromptVariant[]>(
        `/prompts/versions/${encodeURIComponent(String(versionId))}/variants`,
        { params: options }
      );
      return [...response];
    },

    async createVariant(data: CreatePromptVariantRequestSchema): Promise<PromptVariant> {
      return client.post<PromptVariant>('/prompts/variants', data);
    },

    async submitVariantFeedback(
      variantId: number,
      feedback: RatePromptVariantRequestSchema
    ): Promise<VariantFeedback> {
      return client.patch<VariantFeedback>(`/prompts/variants/${variantId}`, feedback);
    },

    // ===== Analytics =====

    async getAnalytics(familyId: string): Promise<PromptAnalytics> {
      return client.get<PromptAnalytics>(
        `/prompts/families/${encodeURIComponent(familyId)}/analytics`
      );
    },

    async compareVersions(query: CompareVersionsQuery): Promise<PromptComparison> {
      return client.get<PromptComparison>('/prompts/versions/compare', {
        params: query,
      });
    },

    // ===== Semantic Packs =====

    async listSemanticPacks(options?: ListSemanticPacksQuery): Promise<SemanticPack[]> {
      const response = await client.get<readonly SemanticPack[]>('/semantic-packs', {
        params: options,
      });
      return [...response];
    },

    async getSemanticPack(packId: string): Promise<SemanticPack> {
      return client.get<SemanticPack>(`/semantic-packs/${encodeURIComponent(packId)}`);
    },

    async createOrUpdateSemanticPack(
      data: SemanticPackCreateRequestSchema
    ): Promise<SemanticPack> {
      return client.post<SemanticPack>('/semantic-packs', data);
    },

    async updateSemanticPack(
      packId: string,
      data: SemanticPackCreateRequestSchema
    ): Promise<SemanticPack> {
      if (data.id !== packId) {
        throw new Error(
          `Semantic pack ID mismatch: path "${packId}" does not match payload "${data.id}"`
        );
      }
      return client.post<SemanticPack>('/semantic-packs', data);
    },

    async deleteSemanticPack(packId: string): Promise<DeleteSemanticPackResponse> {
      return client.delete<DeleteSemanticPackResponse>(
        `/semantic-packs/${encodeURIComponent(packId)}`
      );
    },

    async deprecateSemanticPack(packId: string): Promise<SemanticPack> {
      return client.post<SemanticPack>(`/semantic-packs/${encodeURIComponent(packId)}/deprecate`);
    },
  };
}

