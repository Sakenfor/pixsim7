/**
 * Local Folder Hash Cache API Client (web wrapper)
 *
 * Delegates to environment-neutral domain client in @pixsim7/shared.api.client.
 */
import { createLocalFolderHashesApi } from '@pixsim7/shared.api.client/domains';
import type { HashManifestEntry, HashManifestResponse } from '@pixsim7/shared.api.client/domains';

import { pixsimClient } from './client';

export type { HashManifestEntry, HashManifestResponse };

const api = createLocalFolderHashesApi(pixsimClient);

export const getHashManifest = api.getManifest;
export const putHashManifest = api.putManifest;
export const deleteHashManifest = api.deleteManifest;
