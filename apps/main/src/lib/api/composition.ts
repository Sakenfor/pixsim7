/**
 * Composition Packages API Client (web wrapper)
 *
 * Delegates to environment-neutral domain client in @pixsim7/shared.api-client.
 */
import { createCompositionApi } from '@pixsim7/shared.api-client/domains';

import { pixsimClient } from './client';

export type { CompositionPackagesResponse } from '@pixsim7/shared.api-client/domains';

const compositionApi = createCompositionApi(pixsimClient);

export const getCompositionPackages = compositionApi.getPackages;
export const getCompositionRoles = compositionApi.getRoles;
