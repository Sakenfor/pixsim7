/**
 * Concepts API Client (web wrapper)
 *
 * Delegates to environment-neutral domain client in @pixsim7/api-client.
 * Provides runtime access to ontology concepts including composition roles.
 */
import { pixsimClient } from './client';
import { createConceptsApi } from '@pixsim7/api-client/domains';

export type { RoleConceptResponse, RolesListResponse } from '@pixsim7/api-client/domains';

const conceptsApi = createConceptsApi(pixsimClient);

export const getConceptRoles = conceptsApi.getRoles;
