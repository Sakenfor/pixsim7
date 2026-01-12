import type { PixSimApiClient } from '../client';

export interface DebugPreferences {
  generation?: boolean;
  provider?: boolean;
  worker?: boolean;
  persistence?: boolean;
  rehydration?: boolean;
  stores?: boolean;
  backend?: boolean;
  registry?: boolean;
  websocket?: boolean;
}

/**
 * Value type for dev tool settings.
 */
export type DevToolSettingValue = boolean | string | number;

/**
 * Settings for individual dev tools.
 * Structure: { [toolId]: { [settingKey]: boolean | string | number } }
 */
export interface DevToolsPreferences {
  [toolId: string]: {
    [settingKey: string]: DevToolSettingValue;
  };
}

export interface UserPreferences {
  cubes?: any;
  workspace?: any;
  theme?: string;
  notifications?: any;
  debug?: DebugPreferences;
  /** Per-tool settings from DevTools registry */
  devtools?: DevToolsPreferences;
  [key: string]: any;
}

export interface UserPreferencesResponse {
  preferences: UserPreferences;
}

export function createUserPreferencesApi(client: PixSimApiClient) {
  return {
    async getUserPreferences(): Promise<UserPreferences> {
      const response = await client.get<UserPreferencesResponse>('/users/me/preferences');
      return response.preferences || {};
    },

    async updateUserPreferences(preferences: Partial<UserPreferences>): Promise<UserPreferences> {
      const response = await client.patch<UserPreferencesResponse>('/users/me/preferences', {
        preferences,
      });
      return response.preferences || {};
    },

    async updatePreferenceKey<K extends keyof UserPreferences>(
      key: K,
      value: UserPreferences[K]
    ): Promise<UserPreferences> {
      const response = await client.patch<UserPreferencesResponse>('/users/me/preferences', {
        preferences: { [key]: value },
      });
      return response.preferences || {};
    },
  };
}

