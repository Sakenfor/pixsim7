import { apiClient } from './client';

export interface DebugPreferences {
  generation?: boolean; // Generation pipeline debug (dedup, cache, params)
  provider?: boolean; // Provider API calls and responses
  worker?: boolean; // Worker job processing
}

export interface UserPreferences {
  cubes?: any; // Cube state
  workspace?: any; // Workspace layout
  theme?: string;
  notifications?: any;
  debug?: DebugPreferences; // Backend debug toggles
  [key: string]: any; // Allow arbitrary preferences
}

export interface UserPreferencesResponse {
  preferences: UserPreferences;
}

/**
 * Get current user preferences
 */
export async function getUserPreferences(): Promise<UserPreferences> {
  const response = await apiClient.get<UserPreferencesResponse>('/users/me/preferences');
  return response.data.preferences || {};
}

/**
 * Update user preferences (merges with existing)
 *
 * @param preferences - Preferences to update (partial)
 */
export async function updateUserPreferences(
  preferences: Partial<UserPreferences>
): Promise<UserPreferences> {
  const response = await apiClient.patch<UserPreferencesResponse>(
    '/users/me/preferences',
    { preferences }
  );
  return response.data.preferences || {};
}

/**
 * Update a specific preference key
 *
 * @param key - Preference key (e.g., 'cubes')
 * @param value - Value to set
 */
export async function updatePreferenceKey<K extends keyof UserPreferences>(
  key: K,
  value: UserPreferences[K]
): Promise<UserPreferences> {
  return updateUserPreferences({ [key]: value });
}
