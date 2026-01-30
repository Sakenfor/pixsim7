/**
 * Prompts API Domain Client
 *
 * Provides typed access to prompt management endpoints including
 * families, versions, variants, analytics, and semantic packs.
 */
import type { PixSimApiClient } from '../client';

// ===== Prompt Family Types =====

export interface PromptFamilySummary {
  id: number;
  family_id: string;
  name: string;
  description?: string;
  category?: string;
  tags?: string[];
  active_version_id?: number;
  version_count: number;
  created_at: string;
  updated_at: string;
}

export interface PromptFamilyDetail extends PromptFamilySummary {
  versions: PromptVersionSummary[];
}

export interface PromptVersionSummary {
  id: number;
  version: number;
  is_active: boolean;
  created_at: string;
  performance_score?: number;
}

export interface PromptVersionDetail extends PromptVersionSummary {
  family_id: string;
  template: string;
  variables: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

// ===== Prompt Variant Types =====

export interface PromptVariant {
  id: number;
  version_id: number;
  variant_key: string;
  template: string;
  variables?: Record<string, unknown>;
  weight: number;
  is_enabled: boolean;
  created_at: string;
}

export interface VariantFeedback {
  id: number;
  variant_id: number;
  rating: number;
  feedback_type: string;
  context?: Record<string, unknown>;
  created_at: string;
}

// ===== Analytics Types =====

export interface PromptAnalytics {
  family_id: string;
  total_executions: number;
  avg_latency_ms: number;
  success_rate: number;
  by_version: Record<string, {
    executions: number;
    avg_latency_ms: number;
    success_rate: number;
  }>;
}

export interface PromptComparison {
  version_a: number;
  version_b: number;
  diff: {
    template_changes: string[];
    variable_changes: string[];
    performance_delta: number;
  };
}

// ===== Semantic Pack Types =====

export interface SemanticPack {
  id: number;
  pack_id: string;
  name: string;
  description?: string;
  category?: string;
  prompts: Record<string, string>;
  variables?: Record<string, unknown>;
  is_enabled: boolean;
  priority: number;
  created_at: string;
  updated_at: string;
}

// ===== Category Types =====

export interface PromptCategory {
  id: string;
  name: string;
  description?: string;
  parent_id?: string;
  families_count: number;
}

// ===== Prompts API Factory =====

export function createPromptsApi(client: PixSimApiClient) {
  return {
    // ===== Families =====

    async listFamilies(options?: {
      category?: string;
      search?: string;
      limit?: number;
      offset?: number;
    }): Promise<PromptFamilySummary[]> {
      const response = await client.get<{ families: PromptFamilySummary[] }>('/prompts/families', {
        params: options,
      });
      return response.families;
    },

    async getFamily(familyId: string): Promise<PromptFamilyDetail> {
      return client.get<PromptFamilyDetail>(`/prompts/families/${encodeURIComponent(familyId)}`);
    },

    async createFamily(data: {
      family_id: string;
      name: string;
      description?: string;
      category?: string;
      tags?: string[];
      initial_template?: string;
    }): Promise<PromptFamilyDetail> {
      return client.post<PromptFamilyDetail>('/prompts/families', data);
    },

    async updateFamily(familyId: string, data: {
      name?: string;
      description?: string;
      category?: string;
      tags?: string[];
    }): Promise<PromptFamilyDetail> {
      return client.patch<PromptFamilyDetail>(
        `/prompts/families/${encodeURIComponent(familyId)}`,
        data
      );
    },

    // ===== Versions =====

    async getVersion(versionId: number): Promise<PromptVersionDetail> {
      return client.get<PromptVersionDetail>(`/prompts/versions/${versionId}`);
    },

    async createVersion(familyId: string, data: {
      template: string;
      variables?: Record<string, unknown>;
      metadata?: Record<string, unknown>;
      set_active?: boolean;
    }): Promise<PromptVersionDetail> {
      return client.post<PromptVersionDetail>(
        `/prompts/families/${encodeURIComponent(familyId)}/versions`,
        data
      );
    },

    async setActiveVersion(familyId: string, versionId: number): Promise<PromptFamilyDetail> {
      return client.post<PromptFamilyDetail>(
        `/prompts/families/${encodeURIComponent(familyId)}/versions/${versionId}/activate`
      );
    },

    // ===== Variants =====

    async listVariants(versionId: number): Promise<PromptVariant[]> {
      const response = await client.get<{ variants: PromptVariant[] }>(
        `/prompts/versions/${versionId}/variants`
      );
      return response.variants;
    },

    async createVariant(versionId: number, data: {
      variant_key: string;
      template: string;
      variables?: Record<string, unknown>;
      weight?: number;
    }): Promise<PromptVariant> {
      return client.post<PromptVariant>(`/prompts/versions/${versionId}/variants`, data);
    },

    async submitVariantFeedback(variantId: number, feedback: {
      rating: number;
      feedback_type: string;
      context?: Record<string, unknown>;
    }): Promise<VariantFeedback> {
      return client.post<VariantFeedback>(`/prompts/variants/${variantId}/feedback`, feedback);
    },

    // ===== Analytics =====

    async getAnalytics(familyId: string, options?: {
      start_date?: string;
      end_date?: string;
    }): Promise<PromptAnalytics> {
      return client.get<PromptAnalytics>(
        `/prompts/families/${encodeURIComponent(familyId)}/analytics`,
        { params: options }
      );
    },

    async compareVersions(
      familyId: string,
      versionA: number,
      versionB: number
    ): Promise<PromptComparison> {
      return client.get<PromptComparison>(
        `/prompts/families/${encodeURIComponent(familyId)}/compare`,
        { params: { version_a: versionA, version_b: versionB } }
      );
    },

    // ===== Semantic Packs =====

    async listSemanticPacks(options?: {
      category?: string;
      enabled_only?: boolean;
    }): Promise<SemanticPack[]> {
      const response = await client.get<{ packs: SemanticPack[] }>('/semantic-packs', {
        params: options,
      });
      return response.packs;
    },

    async getSemanticPack(packId: string): Promise<SemanticPack> {
      return client.get<SemanticPack>(`/semantic-packs/${encodeURIComponent(packId)}`);
    },

    async updateSemanticPack(packId: string, data: {
      name?: string;
      description?: string;
      prompts?: Record<string, string>;
      variables?: Record<string, unknown>;
      is_enabled?: boolean;
      priority?: number;
    }): Promise<SemanticPack> {
      return client.patch<SemanticPack>(`/semantic-packs/${encodeURIComponent(packId)}`, data);
    },

    // ===== Categories =====

    async listCategories(): Promise<PromptCategory[]> {
      const response = await client.get<{ categories: PromptCategory[] }>(
        '/dev/prompts/categories'
      );
      return response.categories;
    },
  };
}
