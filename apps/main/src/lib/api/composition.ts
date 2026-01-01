/**
 * Composition Packages API Client (web wrapper)
 *
 * Delegates to environment-neutral domain client in @pixsim7/api-client.
 */
import { pixsimClient } from './client';
import { createCompositionApi } from '@pixsim7/api-client/domains';

export type { CompositionPackagesResponse } from '@pixsim7/api-client/domains';

const compositionApi = createCompositionApi(pixsimClient);

export const getCompositionPackages = compositionApi.getPackages;
export const getCompositionRoles = compositionApi.getRoles;
