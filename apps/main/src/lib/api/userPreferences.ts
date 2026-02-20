/**
 * User Preferences API Client (web wrapper)
 *
 * Delegates to environment-neutral domain client in @pixsim7/shared.api.client.
 */
import { createUserPreferencesApi } from '@pixsim7/shared.api.client/domains';
import type {
  UserPreferences,
  UserPreferencesResponse,
} from '@pixsim7/shared.api.client/domains';

import { pixsimClient } from './client';

export type { UserPreferences, UserPreferencesResponse };
export type DebugPreferences = NonNullable<UserPreferences['debug']>;
export type DevToolsPreferences = NonNullable<UserPreferences['devtools']>;
export type DevToolSettingValue = DevToolsPreferences[string][string];
export type TagDisplayPreferences = NonNullable<UserPreferences['tags']>;
export type AutoTagsPreferences = NonNullable<UserPreferences['auto_tags']>;
export type AnalyzerPreferences = NonNullable<UserPreferences['analyzer']>;

const userPreferencesApi = createUserPreferencesApi(pixsimClient);

export const getUserPreferences = userPreferencesApi.getUserPreferences;
export const updateUserPreferences = userPreferencesApi.updateUserPreferences;
export async function updatePreferenceKey<K extends keyof UserPreferences>(
  key: K,
  value: UserPreferences[K]
): Promise<UserPreferences> {
  return userPreferencesApi.updatePreferenceKey(String(key), value as unknown);
}
