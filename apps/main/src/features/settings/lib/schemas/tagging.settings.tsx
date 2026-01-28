/**
 * Tags Settings Schema
 *
 * Comprehensive settings for tag management:
 * - General: Display, behavior, defaults
 * - Auto-Tagging: Automatic tag assignment based on asset source
 * - Analysis: Prompt analysis and extracted tags
 *
 * Synced to user.preferences on the backend.
 */

import { useCallback, useEffect, useState } from 'react';

import { getUserPreferences, updatePreferenceKey } from '@/lib/api/userPreferences';
import type { AutoTagsPreferences, AnalyzerPreferences } from '@/lib/api/userPreferences';

import { settingsSchemaRegistry, type SettingTab, type SettingStoreAdapter } from '../core';

// =============================================================================
// Types
// =============================================================================

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

// =============================================================================
// Defaults (must match backend DEFAULT_AUTO_TAGS and DEFAULT_ANALYZER_SETTINGS)
// =============================================================================

const DEFAULT_TAG_DISPLAY: TagDisplayPreferences = {
  default_namespace: 'user',
  favorite_namespaces: ['source', 'provider', 'operation'],
  hidden_namespaces: [],
  click_action: 'filter',
  show_usage_counts: true,
  group_by_namespace: true,
};

const DEFAULT_AUTO_TAGS: AutoTagsPreferences = {
  generated: ['source:generated'],
  synced: ['source:synced'],
  extension: ['source:extension'],
  capture: ['source:capture'],
  uploaded: [],
  local_folder: [],
  include_provider: true,
  include_operation: true,
  include_site: true,
};

const DEFAULT_ANALYZER: AnalyzerPreferences = {
  default_id: 'prompt:simple',
  auto_apply_tags: true,
  tag_prefix: '',
};

// =============================================================================
// Tab: General
// =============================================================================

const generalTab: SettingTab = {
  id: 'general',
  label: 'General',
  icon: '🏷️',
  groups: [
    {
      id: 'display',
      title: 'Display',
      description: 'How tags are displayed in the UI.',
      fields: [
        {
          id: 'tags.group_by_namespace',
          type: 'toggle',
          label: 'Group by Namespace',
          description: 'Group tags by their namespace (e.g., source:, provider:) in lists.',
          defaultValue: true,
        },
        {
          id: 'tags.show_usage_counts',
          type: 'toggle',
          label: 'Show Usage Counts',
          description: 'Display the number of assets using each tag.',
          defaultValue: true,
        },
      ],
    },
    {
      id: 'behavior',
      title: 'Behavior',
      description: 'How tags behave when interacted with.',
      fields: [
        {
          id: 'tags.click_action',
          type: 'select',
          label: 'Tag Click Action',
          description: 'What happens when you click a tag.',
          defaultValue: 'filter',
          options: [
            { value: 'filter', label: 'Filter assets by tag' },
            { value: 'add_to_search', label: 'Add to search query' },
            { value: 'copy', label: 'Copy tag to clipboard' },
          ],
        },
        {
          id: 'tags.default_namespace',
          type: 'select',
          label: 'Default Namespace',
          description: 'Namespace to use when creating tags without specifying one.',
          defaultValue: 'user',
          options: [
            { value: 'user', label: 'user (personal tags)' },
            { value: 'content', label: 'content (content type)' },
            { value: 'style', label: 'style (visual style)' },
            { value: 'project', label: 'project (project organization)' },
          ],
        },
      ],
    },
  ],
};

// =============================================================================
// Tab: Auto-Tagging
// =============================================================================

const autoTaggingTab: SettingTab = {
  id: 'auto-tagging',
  label: 'Auto-Tagging',
  icon: '🤖',
  groups: [
    {
      id: 'source-tags',
      title: 'Source Tags',
      description: 'Automatically tag assets based on where they came from.',
      fields: [
        {
          id: 'auto_tags.include_provider',
          type: 'toggle',
          label: 'Include Provider Tag',
          description: 'Add "provider:pixverse" etc. to generated/synced assets.',
          defaultValue: true,
        },
        {
          id: 'auto_tags.include_operation',
          type: 'toggle',
          label: 'Include Operation Tag',
          description: 'Add "operation:image-to-video" etc. to generated assets.',
          defaultValue: true,
        },
        {
          id: 'auto_tags.include_site',
          type: 'toggle',
          label: 'Include Site Tag',
          description: 'Add "site:pinterest" etc. to assets from chrome extension.',
          defaultValue: true,
        },
      ],
    },
  ],
};

// =============================================================================
// Tab: Analysis
// =============================================================================

const analysisTab: SettingTab = {
  id: 'analysis',
  label: 'Analysis',
  icon: '🔍',
  groups: [
    {
      id: 'analyzer',
      title: 'Prompt Analysis',
      description: 'Extract tags from generation prompts automatically.',
      fields: [
        {
          id: 'analyzer.default_id',
          type: 'select',
          label: 'Default Analyzer',
          description: 'Analyzer to use for prompt analysis.',
          defaultValue: 'prompt:simple',
          options: [
            { value: 'prompt:simple', label: 'Simple (rule-based, fast)' },
            { value: 'prompt:claude', label: 'Claude (AI-powered, accurate)' },
            { value: 'prompt:openai', label: 'OpenAI (AI-powered)' },
          ],
        },
        {
          id: 'analyzer.auto_apply_tags',
          type: 'toggle',
          label: 'Apply Analysis Tags',
          description: 'Automatically tag generated assets with extracted tags (e.g., "has:character", "tone:soft").',
          defaultValue: true,
        },
        {
          id: 'analyzer.tag_prefix',
          type: 'text',
          label: 'Tag Prefix',
          description: 'Optional prefix for analysis tags (e.g., "prompt:" -> "prompt:has:character").',
          defaultValue: '',
          placeholder: 'e.g., prompt:',
        },
      ],
    },
  ],
};

// =============================================================================
// Store Adapter
// =============================================================================

interface TagsPreferencesState {
  tags: TagDisplayPreferences;
  auto_tags: AutoTagsPreferences;
  analyzer: AnalyzerPreferences;
  loaded: boolean;
}

function useTagsSettingsStoreAdapter(): SettingStoreAdapter {
  const [state, setState] = useState<TagsPreferencesState>({
    tags: DEFAULT_TAG_DISPLAY,
    auto_tags: DEFAULT_AUTO_TAGS,
    analyzer: DEFAULT_ANALYZER,
    loaded: false,
  });

  // Fetch preferences on mount
  useEffect(() => {
    getUserPreferences()
      .then((prefs) => {
        setState({
          tags: { ...DEFAULT_TAG_DISPLAY, ...(prefs.tags as TagDisplayPreferences) },
          auto_tags: { ...DEFAULT_AUTO_TAGS, ...prefs.auto_tags },
          analyzer: { ...DEFAULT_ANALYZER, ...prefs.analyzer },
          loaded: true,
        });
      })
      .catch((err) => {
        console.error('Failed to load tags preferences:', err);
        setState((s) => ({ ...s, loaded: true }));
      });
  }, []);

  const get = useCallback(
    (fieldId: string) => {
      // Parse nested field IDs like "auto_tags.include_provider" or "tags.click_action"
      const [section, key] = fieldId.split('.');
      if (section === 'tags' && key) {
        return state.tags[key as keyof TagDisplayPreferences];
      }
      if (section === 'auto_tags' && key) {
        return state.auto_tags[key as keyof AutoTagsPreferences];
      }
      if (section === 'analyzer' && key) {
        return state.analyzer[key as keyof AnalyzerPreferences];
      }
      return undefined;
    },
    [state]
  );

  const set = useCallback(
    (fieldId: string, value: any) => {
      const [section, key] = fieldId.split('.');

      if (section === 'tags' && key) {
        const newTags = { ...state.tags, [key]: value };
        setState((s) => ({ ...s, tags: newTags }));
        updatePreferenceKey('tags', newTags).catch((err) => {
          console.error('Failed to save tags:', err);
        });
      } else if (section === 'auto_tags' && key) {
        const newAutoTags = { ...state.auto_tags, [key]: value };
        setState((s) => ({ ...s, auto_tags: newAutoTags }));
        updatePreferenceKey('auto_tags', newAutoTags).catch((err) => {
          console.error('Failed to save auto_tags:', err);
        });
      } else if (section === 'analyzer' && key) {
        const newAnalyzer = { ...state.analyzer, [key]: value };
        setState((s) => ({ ...s, analyzer: newAnalyzer }));
        updatePreferenceKey('analyzer', newAnalyzer).catch((err) => {
          console.error('Failed to save analyzer:', err);
        });
      }
    },
    [state]
  );

  const getAll = useCallback(() => {
    // Flatten for showWhen conditions
    const result: Record<string, any> = {};
    for (const [k, v] of Object.entries(state.tags)) {
      result[`tags.${k}`] = v;
    }
    for (const [k, v] of Object.entries(state.auto_tags)) {
      result[`auto_tags.${k}`] = v;
    }
    for (const [k, v] of Object.entries(state.analyzer)) {
      result[`analyzer.${k}`] = v;
    }
    return result;
  }, [state]);

  return { get, set, getAll };
}

// =============================================================================
// Registration
// =============================================================================

export function registerTaggingSettings(): () => void {
  // Register category with first tab
  const unregister1 = settingsSchemaRegistry.register({
    categoryId: 'tags',
    category: {
      label: 'Tags',
      icon: '🏷️',
      order: 45,
    },
    tab: generalTab,
    useStore: useTagsSettingsStoreAdapter,
  });

  // Register additional tabs
  const unregister2 = settingsSchemaRegistry.register({
    categoryId: 'tags',
    tab: autoTaggingTab,
    useStore: useTagsSettingsStoreAdapter,
  });

  const unregister3 = settingsSchemaRegistry.register({
    categoryId: 'tags',
    tab: analysisTab,
    useStore: useTagsSettingsStoreAdapter,
  });

  return () => {
    unregister1();
    unregister2();
    unregister3();
  };
}
