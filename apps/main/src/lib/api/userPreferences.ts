/**
 * User Preferences API Client (web wrapper)
 *
 * Delegates to environment-neutral domain client in @pixsim7/api-client.
 */
import { pixsimClient } from './client';
import { createUserPreferencesApi } from '@pixsim7/api-client/domains';

export type {
  DebugPreferences,
  UserPreferences,
  UserPreferencesResponse,
} from '@pixsim7/api-client/domains';

const userPreferencesApi = createUserPreferencesApi(pixsimClient);

export const getUserPreferences = userPreferencesApi.getUserPreferences;
export const updateUserPreferences = userPreferencesApi.updateUserPreferences;
export const updatePreferenceKey = userPreferencesApi.updatePreferenceKey;

