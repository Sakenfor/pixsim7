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
  /** Validate composition vocab fields (role, pose_id, etc.) against registry */
  validateCompositionVocabs?: boolean;
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

/**
 * Tag display and behavior preferences.
 */
export interface TagDisplayPreferences {
  /** Default namespace when creating tags without specifying one */
  default_namespace?: string;
  /** Namespaces to show first in tag lists */
  favorite_namespaces?: string[];
  /** Namespaces to hide from the UI */
  hidden_namespaces?: string[];
  /** What happens when clicking a tag */
  click_action?: 'filter' | 'add_to_search' | 'copy';
  /** Show tag usage counts in lists */
  show_usage_counts?: boolean;
  /** Group tags by namespace in displays */
  group_by_namespace?: boolean;
}

/**
 * Auto-tagging preferences for assets based on source type.
 */
export interface AutoTagsPreferences {
  /** Tags for generated assets */
  generated?: string[];
  /** Tags for synced assets (from provider) */
  synced?: string[];
  /** Tags for assets from chrome extension */
  extension?: string[];
  /** Tags for frame captures */
  capture?: string[];
  /** Tags for uploaded assets */
  uploaded?: string[];
  /** Tags for local folder assets */
  local_folder?: string[];
  /** Include provider tag (e.g., "provider:pixverse") */
  include_provider?: boolean;
  /** Include operation type tag (e.g., "operation:image-to-video") */
  include_operation?: boolean;
  /** Include source site tag (e.g., "site:pinterest") */
  include_site?: boolean;
}

/**
 * Analyzer preferences for prompt analysis.
 */
export interface AnalyzerPreferences {
  /** Default analyzer ID (e.g., "prompt:simple", "prompt:claude") */
  default_id?: string;
  /** Apply analysis tags to generated assets */
  auto_apply_tags?: boolean;
  /** Prefix for analysis tags (e.g., "prompt:" -> "prompt:has:character") */
  tag_prefix?: string;
}

export interface UserPreferences {
  cubes?: any;
  workspace?: any;
  theme?: string;
  notifications?: any;
  debug?: DebugPreferences;
  /** Per-tool settings from DevTools registry */
  devtools?: DevToolsPreferences;
  /** Tag display and behavior settings */
  tags?: TagDisplayPreferences;
  /** Auto-tagging settings for assets */
  auto_tags?: AutoTagsPreferences;
  /** Analyzer settings for prompt analysis */
  analyzer?: AnalyzerPreferences;
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

