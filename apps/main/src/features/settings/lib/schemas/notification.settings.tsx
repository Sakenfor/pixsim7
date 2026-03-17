 
/**
 * Notification Settings Schema
 *
 * Fetches notification categories from the backend and builds a select field
 * per category using each category's granularity options. Persists selections
 * to user preferences via PATCH /users/me/preferences.
 */

import { useEffect, useRef, useState } from 'react';

import { pixsimClient } from '@lib/api';
import { updatePreferenceKey } from '@lib/api/userPreferences';

import { settingsSchemaRegistry, type SettingGroup, type SettingStoreAdapter } from '../core';

// ── API types ────────────────────────────────────────────────────

interface GranularityOption {
  id: string;
  label: string;
  description: string;
}

interface NotificationCategory {
  id: string;
  label: string;
  description: string;
  icon: string;
  defaultGranularity: string;
  granularityOptions: GranularityOption[];
  sortOrder: number;
  currentGranularity: string;
}

interface CategoriesResponse {
  categories: NotificationCategory[];
}

async function fetchCategories(): Promise<CategoriesResponse> {
  return pixsimClient.get<CategoriesResponse>('/notifications/categories');
}

// ── Store adapter ────────────────────────────────────────────────

function useNotificationSettingsStore(): SettingStoreAdapter {
  const [selections, setSelections] = useState<Record<string, string>>({});
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    fetchCategories()
      .then((data) => {
        const initial: Record<string, string> = {};
        for (const cat of data.categories) {
          initial[cat.id] = cat.currentGranularity;
        }
        setSelections(initial);
      })
      .catch((err) => console.error('Failed to fetch notification categories:', err));
  }, []);

  return {
    get: (fieldId: string) => {
      // Field IDs are `cat_<categoryId>` e.g. `cat_generation`
      const catId = fieldId.replace(/^cat_/, '');
      return selections[catId];
    },
    set: (fieldId: string, value: any) => {
      const catId = fieldId.replace(/^cat_/, '');
      const prev = { ...selections };
      const next = { ...selections, [catId]: String(value) };
      setSelections(next);

      // Persist to backend as user preferences
      const prefsPayload: Record<string, { granularity: string }> = {};
      for (const [k, v] of Object.entries(next)) {
        prefsPayload[k] = { granularity: v };
      }
      updatePreferenceKey('notifications', prefsPayload as any).catch((err) => {
        console.error('Failed to save notification preferences:', err);
        setSelections(prev);
      });
    },
    getAll: () => {
      const all: Record<string, any> = {};
      for (const [catId, granularity] of Object.entries(selections)) {
        all[`cat_${catId}`] = granularity;
      }
      return all;
    },
  };
}

// ── Schema builder ───────────────────────────────────────────────

/**
 * Build setting groups dynamically from fetched categories.
 * We use a single group with one select field per category.
 * Since the schema is static at registration time but categories are
 * fetched async, we define a comprehensive static group that covers
 * all 9 built-in categories with their known granularity options.
 */

const notificationGroups: SettingGroup[] = [
  {
    id: 'notification-categories',
    title: 'Categories',
    description: 'Choose which notification categories to receive and at what detail level.',
    fields: [
      {
        id: 'cat_system',
        type: 'select',
        label: 'System',
        description: 'System announcements and maintenance notices',
        defaultValue: 'all',
        options: [
          { value: 'all', label: 'All' },
          { value: 'off', label: 'Off' },
        ],
      },
      {
        id: 'cat_plan',
        type: 'select',
        label: 'Plans',
        description: 'Plan status changes and updates',
        defaultValue: 'all_changes',
        options: [
          { value: 'all_changes', label: 'All changes' },
          { value: 'status_only', label: 'Status changes only' },
          { value: 'off', label: 'Off' },
        ],
      },
      {
        id: 'cat_document',
        type: 'select',
        label: 'Documents',
        description: 'Document creation and modification',
        defaultValue: 'all',
        options: [
          { value: 'all', label: 'All' },
          { value: 'off', label: 'Off' },
        ],
      },
      {
        id: 'cat_feature',
        type: 'select',
        label: 'Features',
        description: 'Feature announcements and releases',
        defaultValue: 'all',
        options: [
          { value: 'all', label: 'All' },
          { value: 'off', label: 'Off' },
        ],
      },
      {
        id: 'cat_agent_session',
        type: 'select',
        label: 'Agent Sessions',
        description: 'AI agent session activity and results',
        defaultValue: 'all',
        options: [
          { value: 'all', label: 'All' },
          { value: 'errors_only', label: 'Errors only' },
          { value: 'off', label: 'Off' },
        ],
      },
      {
        id: 'cat_review_workflow',
        type: 'select',
        label: 'Reviews',
        description: 'Review workflow status and approvals',
        defaultValue: 'all',
        options: [
          { value: 'all_changes', label: 'All changes' },
          { value: 'status_only', label: 'Status changes only' },
          { value: 'off', label: 'Off' },
        ],
      },
      {
        id: 'cat_generation',
        type: 'select',
        label: 'Generations',
        description: 'Image and video generation results',
        defaultValue: 'off',
        options: [
          { value: 'all', label: 'All' },
          { value: 'failures_only', label: 'Failures only' },
          { value: 'off', label: 'Off' },
        ],
      },
      {
        id: 'cat_asset_analysis',
        type: 'select',
        label: 'Asset Analysis',
        description: 'Asset enrichment and analysis results',
        defaultValue: 'off',
        options: [
          { value: 'all', label: 'All' },
          { value: 'off', label: 'Off' },
        ],
      },
      {
        id: 'cat_character',
        type: 'select',
        label: 'Characters',
        description: 'Character creation and updates',
        defaultValue: 'off',
        options: [
          { value: 'all', label: 'All' },
          { value: 'off', label: 'Off' },
        ],
      },
    ],
  },
];

export function registerNotificationSettings(): () => void {
  return settingsSchemaRegistry.register({
    categoryId: 'notifications',
    category: {
      label: 'Notifications',
      icon: 'bell',
      order: 55,
    },
    groups: notificationGroups,
    useStore: useNotificationSettingsStore,
  });
}
