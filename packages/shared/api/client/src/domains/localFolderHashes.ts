import type { PixSimApiClient } from '../client';

export interface HashManifestEntry {
  relativePath: string;
  sha256: string;
  fileSize?: number;
  lastModified?: number;
}

export interface HashManifestResponse {
  folder_id: string;
  manifest: HashManifestEntry[];
  updated_at: string | null;
}

export function createLocalFolderHashesApi(client: PixSimApiClient) {
  return {
    async getManifest(folderId: string): Promise<HashManifestResponse> {
      return client.get<HashManifestResponse>(
        `/users/me/local-folder-hashes/${encodeURIComponent(folderId)}`,
      );
    },

    async putManifest(
      folderId: string,
      manifest: HashManifestEntry[],
    ): Promise<HashManifestResponse> {
      return client.put<HashManifestResponse>(
        `/users/me/local-folder-hashes/${encodeURIComponent(folderId)}`,
        manifest,
      );
    },

    async deleteManifest(folderId: string): Promise<void> {
      await client.delete(
        `/users/me/local-folder-hashes/${encodeURIComponent(folderId)}`,
      );
    },
  };
}
