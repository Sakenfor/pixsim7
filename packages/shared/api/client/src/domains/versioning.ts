/**
 * Generic Versioning API Client
 *
 * Shared types and adapter interface for git-like versioning across
 * Assets, Characters, and Prompts. Each entity has different URL shapes
 * but returns a common VersionEntry structure.
 */
import type { PixSimApiClient } from '../client';

// ===== Common Types =====

/** A single version entry (normalized from entity-specific responses). */
export interface VersionEntry {
  entityId: string | number;
  versionNumber: number;
  versionMessage: string | null;
  parentId: string | number | null;
  isHead: boolean;
  createdAt: string | null;
  /** Entity-specific metadata (thumbnail, name, etc.) */
  metadata: Record<string, unknown>;
}

/** Summary of a version family. */
export interface VersionFamilyInfo {
  familyId: string;
  name: string | null;
  headEntityId: string | number | null;
  versionCount: number;
  latestVersionNumber: number;
}

/** Adapter interface — implemented per entity type. */
export interface VersioningAdapter {
  /** Get all versions for an entity (resolves family automatically). */
  getVersions(entityId: string | number): Promise<VersionEntry[]>;
  /** Set HEAD version for a family. Null if entity doesn't support HEAD. */
  setHead?(familyId: string, entityId: string | number): Promise<void>;
  /** Retroactively link an existing asset as a version of another. */
  linkVersion?(parentId: string | number, childId: string | number, message?: string): Promise<VersionFamilyInfo>;
}

// ===== Asset Versioning =====

interface AssetVersionRaw {
  asset_id: number;
  version_number: number;
  version_message: string | null;
  parent_asset_id: number | null;
  is_head: boolean;
  created_at: string | null;
  description?: string | null;
  thumbnail_url?: string | null;
}

interface AssetFamilyRaw {
  id: string;
  name: string | null;
  head_asset_id: number | null;
  version_count: number;
  latest_version_number: number;
}

function normalizeAssetVersion(raw: AssetVersionRaw): VersionEntry {
  return {
    entityId: raw.asset_id,
    versionNumber: raw.version_number,
    versionMessage: raw.version_message,
    parentId: raw.parent_asset_id,
    isHead: raw.is_head,
    createdAt: raw.created_at,
    metadata: {
      description: raw.description,
      thumbnailUrl: raw.thumbnail_url,
    },
  };
}

export function createAssetVersioningApi(client: PixSimApiClient): VersioningAdapter {
  return {
    async getVersions(assetId: string | number): Promise<VersionEntry[]> {
      const raw = await client.get<readonly AssetVersionRaw[]>(
        `/assets/versions/${assetId}/versions`,
      );
      return raw.map(normalizeAssetVersion);
    },

    async setHead(familyId: string, assetId: string | number): Promise<void> {
      await client.post(`/assets/versions/families/${familyId}/set-head`, {
        asset_id: Number(assetId),
      });
    },

    async linkVersion(
      parentId: string | number,
      childId: string | number,
      message?: string,
    ): Promise<VersionFamilyInfo> {
      const raw = await client.post<AssetFamilyRaw>(`/assets/versions/link-version`, {
        parent_asset_id: Number(parentId),
        child_asset_id: Number(childId),
        version_message: message ?? null,
      });
      return {
        familyId: raw.id,
        name: raw.name,
        headEntityId: raw.head_asset_id,
        versionCount: raw.version_count,
        latestVersionNumber: raw.latest_version_number,
      };
    },
  };
}

// ===== Character Versioning =====

interface CharacterVersionRaw {
  entity_id: string;
  version_number: number;
  version_message: string | null;
  parent_id: string | null;
  is_head: boolean;
  created_at: string | null;
  // metadata fields inlined by backend
  name?: string | null;
  display_name?: string | null;
  category?: string | null;
  character_id?: string | null;
}

function normalizeCharacterVersion(raw: CharacterVersionRaw): VersionEntry {
  return {
    entityId: raw.entity_id,
    versionNumber: raw.version_number,
    versionMessage: raw.version_message,
    parentId: raw.parent_id,
    isHead: raw.is_head,
    createdAt: raw.created_at,
    metadata: {
      name: raw.name,
      displayName: raw.display_name,
      category: raw.category,
      characterId: raw.character_id,
    },
  };
}

export function createCharacterVersioningApi(client: PixSimApiClient): VersioningAdapter {
  return {
    async getVersions(characterId: string | number): Promise<VersionEntry[]> {
      const raw = await client.get<readonly CharacterVersionRaw[]>(
        `/characters/${encodeURIComponent(String(characterId))}/versions`,
      );
      return raw.map(normalizeCharacterVersion);
    },

    async setHead(familyId: string, versionUuid: string | number): Promise<void> {
      // Character set-head uses the character slug + version UUID
      // familyId here is used as the character slug for URL construction
      await client.post(
        `/characters/${encodeURIComponent(familyId)}/versions/${versionUuid}/set-head`,
        {},
      );
    },
  };
}

// ===== Prompt Versioning =====

interface PromptVersionRaw {
  id: string;
  version_number: number;
  commit_message: string | null;
  parent_version_id: string | null;
  created_at: string | null;
  branch_name?: string | null;
  author?: string | null;
  // metadata
  prompt_text?: string | null;
  generation_count?: number | null;
  successful_assets?: number | null;
}

function normalizePromptVersion(raw: PromptVersionRaw): VersionEntry {
  return {
    entityId: raw.id,
    versionNumber: raw.version_number,
    versionMessage: raw.commit_message,
    parentId: raw.parent_version_id,
    isHead: false, // Prompts don't have HEAD
    createdAt: raw.created_at,
    metadata: {
      branchName: raw.branch_name,
      author: raw.author,
      generationCount: raw.generation_count,
      successfulAssets: raw.successful_assets,
    },
  };
}

export function createPromptVersioningApi(client: PixSimApiClient): VersioningAdapter {
  return {
    async getVersions(familyId: string | number): Promise<VersionEntry[]> {
      const raw = await client.get<readonly PromptVersionRaw[]>(
        `/prompts/families/${familyId}/versions`,
      );
      return raw.map(normalizePromptVersion);
    },
    // Prompts don't have HEAD — no setHead
  };
}

// ===== Convenience: create all three at once =====

export interface VersioningApis {
  assets: VersioningAdapter;
  characters: VersioningAdapter;
  prompts: VersioningAdapter;
}

export function createVersioningApis(client: PixSimApiClient): VersioningApis {
  return {
    assets: createAssetVersioningApi(client),
    characters: createCharacterVersioningApi(client),
    prompts: createPromptVersioningApi(client),
  };
}
