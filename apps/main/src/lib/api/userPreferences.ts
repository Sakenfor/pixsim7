/**
 * User Preferences API Client (web wrapper)
 *
 * Delegates to environment-neutral domain client in @pixsim7/shared.api.client.
 */
import { createUserPreferencesApi } from '@pixsim7/shared.api.client/domains';

import { pixsimClient } from './client';

export type {
  DebugPreferences,
  DevToolsPreferences,
  DevToolSettingValue,
  UserPreferences,
  UserPreferencesResponse,
} from '@pixsim7/shared.api.client/domains';

const userPreferencesApi = createUserPreferencesApi(pixsimClient);

export const getUserPreferences = userPreferencesApi.getUserPreferences;
export const updateUserPreferences = userPreferencesApi.updateUserPreferences;
export const updatePreferenceKey = userPreferencesApi.updatePreferenceKey;

