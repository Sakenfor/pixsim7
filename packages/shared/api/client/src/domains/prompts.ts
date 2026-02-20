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

export type PromptFamilySummary = PromptFamilyResponse;
export type PromptFamilyDetail = PromptFamilyResponse;
export type PromptVersionSummary = PromptVersionResponse;
export type PromptVersionDetail = PromptVersionResponse;
export type PromptVariant = PromptVariantResponse;
export type VariantFeedback = PromptVariantResponse;
export type PromptAnalytics = unknown;
export type PromptComparison = unknown;
export type SemanticPack = SemanticPackManifest;

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

