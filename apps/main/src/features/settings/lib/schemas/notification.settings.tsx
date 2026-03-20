/**
 * Notification Settings Schema
 *
 * Renders notification categories from /notifications/categories instead of
 * hard-coding category IDs in the frontend.
 */

import { useEffect, useRef, useState } from 'react';

import { pixsimClient } from '@lib/api';
import { updatePreferenceKey } from '@lib/api/userPreferences';

import { settingsSchemaRegistry, type SettingGroup, type SettingStoreAdapter } from '../core';

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
  systemId?: string | null;
  systemLabel?: string | null;
  parentCategoryId?: string | null;
}

interface CategoriesResponse {
  categories: NotificationCategory[];
}

const GENERIC_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'off', label: 'Off' },
];

let cachedCategories: NotificationCategory[] | null = null;
let categoriesPromise: Promise<NotificationCategory[]> | null = null;

async function fetchCategories(): Promise<CategoriesResponse> {
  return pixsimClient.get<CategoriesResponse>('/notifications/categories');
}

function stableSortCategories(categories: NotificationCategory[]): NotificationCategory[] {
  return [...categories].sort((a, b) => {
    const orderA = Number.isFinite(a.sortOrder) ? a.sortOrder : 100;
    const orderB = Number.isFinite(b.sortOrder) ? b.sortOrder : 100;
    if (orderA !== orderB) {
      return orderA - orderB;
    }
    return a.label.localeCompare(b.label);
  });
}

function loadCategories(forceRefresh = false): Promise<NotificationCategory[]> {
  if (cachedCategories && !forceRefresh) {
    return Promise.resolve(cachedCategories);
  }
  if (categoriesPromise && !forceRefresh) {
    return categoriesPromise;
  }

  categoriesPromise = fetchCategories()
    .then((data) => {
      const sorted = stableSortCategories(data.categories);
      cachedCategories = sorted;
      return sorted;
    })
    .finally(() => {
      categoriesPromise = null;
    });

  return categoriesPromise;
}

function titleCase(value: string): string {
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function sanitizeId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, '-');
}

function inferSystem(category: NotificationCategory): { id: string; label: string } {
  const explicitId = (category.systemId ?? '').trim();
  if (explicitId) {
    const explicitLabel = (category.systemLabel ?? '').trim();
    return { id: explicitId, label: explicitLabel || titleCase(explicitId) };
  }

  const match = category.id.match(/^([^:/.]+)[:/.].+$/);
  if (match) {
    return { id: match[1], label: titleCase(match[1]) };
  }

  return { id: 'core', label: 'Core' };
}

function categoryOptions(category: NotificationCategory): Array<{ value: string; label: string }> {
  if (!Array.isArray(category.granularityOptions) || category.granularityOptions.length === 0) {
    return GENERIC_OPTIONS;
  }
  return category.granularityOptions.map((opt) => ({
    value: opt.id,
    label: opt.label,
  }));
}

function categoryDefaultValue(category: NotificationCategory): string {
  if (category.currentGranularity) {
    return category.currentGranularity;
  }
  if (category.defaultGranularity) {
    return category.defaultGranularity;
  }
  const first = category.granularityOptions?.[0]?.id;
  return first || 'all';
}

function categoryFieldLabel(category: NotificationCategory, depth: number): string {
  if (depth <= 0) {
    return category.label;
  }
  return `${'-> '.repeat(depth)}${category.label}`;
}

function collectNestedCategories(
  roots: NotificationCategory[],
  childrenByParent: Map<string, NotificationCategory[]>,
  categoriesById: Map<string, NotificationCategory>,
): Array<{ category: NotificationCategory; depth: number }> {
  const output: Array<{ category: NotificationCategory; depth: number }> = [];
  const visited = new Set<string>();

  const walk = (category: NotificationCategory, depth: number) => {
    if (visited.has(category.id)) {
      return;
    }
    visited.add(category.id);
    output.push({ category, depth });

    const children = childrenByParent.get(category.id) ?? [];
    for (const child of children) {
      walk(child, depth + 1);
    }
  };

  for (const root of roots) {
    walk(root, 0);
  }

  for (const category of categoriesById.values()) {
    if (!visited.has(category.id)) {
      walk(category, 0);
    }
  }

  return output;
}

function buildSystemGroups(categories: NotificationCategory[]): SettingGroup[] {
  if (categories.length === 0) {
    return [
      {
        id: 'notification-categories',
        title: 'Categories',
        description: 'No notification categories are currently registered.',
        fields: [],
      },
    ];
  }

  const systemBuckets = new Map<string, { id: string; label: string; categories: NotificationCategory[] }>();

  for (const category of categories) {
    const system = inferSystem(category);
    const bucket = systemBuckets.get(system.id);
    if (bucket) {
      bucket.categories.push(category);
    } else {
      systemBuckets.set(system.id, { id: system.id, label: system.label, categories: [category] });
    }
  }

  const sortedBuckets = [...systemBuckets.values()].sort((a, b) => {
    const firstA = stableSortCategories(a.categories)[0]?.sortOrder ?? 100;
    const firstB = stableSortCategories(b.categories)[0]?.sortOrder ?? 100;
    if (firstA !== firstB) {
      return firstA - firstB;
    }
    return a.label.localeCompare(b.label);
  });

  return sortedBuckets.map((bucket) => {
    const sortedCategories = stableSortCategories(bucket.categories);
    const categoriesById = new Map(sortedCategories.map((category) => [category.id, category]));
    const childrenByParent = new Map<string, NotificationCategory[]>();
    const roots: NotificationCategory[] = [];

    for (const category of sortedCategories) {
      const parentId = category.parentCategoryId?.trim();
      if (!parentId || !categoriesById.has(parentId)) {
        roots.push(category);
        continue;
      }
      const children = childrenByParent.get(parentId) ?? [];
      children.push(category);
      childrenByParent.set(parentId, stableSortCategories(children));
    }

    const nested = collectNestedCategories(roots, childrenByParent, categoriesById);
    const fields: SettingGroup['fields'] = nested.map(({ category, depth }) => {
      const parentDescription =
        depth > 0 && category.parentCategoryId && categoriesById.has(category.parentCategoryId)
          ? `Subcategory of ${categoriesById.get(category.parentCategoryId)?.label}.`
          : '';
      const description = [category.description, parentDescription]
        .filter((part) => typeof part === 'string' && part.trim().length > 0)
        .join(' ');

      return {
        id: `cat_${category.id}`,
        type: 'select',
        label: categoryFieldLabel(category, depth),
        description,
        defaultValue: categoryDefaultValue(category),
        options: categoryOptions(category),
      };
    });

    return {
      id: `notification-system-${sanitizeId(bucket.id)}`,
      title: sortedBuckets.length === 1 ? 'Categories' : bucket.label,
      description:
        sortedBuckets.length === 1
          ? 'Choose which notification categories to receive and at what detail level.'
          : `Notification categories provided by ${bucket.label}.`,
      fields,
    };
  });
}

function buildLoadingGroups(): SettingGroup[] {
  return [
    {
      id: 'notification-categories',
      title: 'Categories',
      description: 'Loading notification categories...',
      fields: [],
    },
  ];
}

function buildErrorGroups(): SettingGroup[] {
  return [
    {
      id: 'notification-categories',
      title: 'Categories',
      description: 'Failed to load notification categories.',
      fields: [],
    },
  ];
}

function useNotificationSettingsStore(): SettingStoreAdapter {
  const [selections, setSelections] = useState<Record<string, string>>({});
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (fetchedRef.current) {
      return;
    }
    fetchedRef.current = true;

    loadCategories()
      .then((categories) => {
        setSelections((prev) => {
          const next = { ...prev };
          for (const category of categories) {
            if (!next[category.id]) {
              next[category.id] = category.currentGranularity || categoryDefaultValue(category);
            }
          }
          return next;
        });
      })
      .catch((err) => {
        console.error('Failed to fetch notification categories:', err);
      });
  }, []);

  const persistSelections = (next: Record<string, string>, prev: Record<string, string>) => {
    const prefsPayload: Record<string, { granularity: string }> = {};
    for (const [categoryId, granularity] of Object.entries(next)) {
      prefsPayload[categoryId] = { granularity };
    }

    updatePreferenceKey('notifications', prefsPayload as unknown).catch((err) => {
      console.error('Failed to save notification preferences:', err);
      setSelections(prev);
    });
  };

  return {
    get: (fieldId: string) => {
      const categoryId = fieldId.replace(/^cat_/, '');
      return selections[categoryId];
    },
    set: (fieldId: string, value: unknown) => {
      const categoryId = fieldId.replace(/^cat_/, '');
      const prev = { ...selections };
      const next = { ...selections, [categoryId]: String(value) };
      setSelections(next);
      persistSelections(next, prev);
    },
    getAll: () => {
      const all: Record<string, string> = {};
      for (const [categoryId, granularity] of Object.entries(selections)) {
        all[`cat_${categoryId}`] = granularity;
      }
      return all;
    },
  };
}

function registerWithGroups(groups: SettingGroup[]): () => void {
  return settingsSchemaRegistry.register({
    categoryId: 'notifications',
    category: {
      label: 'Notifications',
      icon: 'bell',
      order: 55,
    },
    groups,
    useStore: useNotificationSettingsStore,
  });
}

export function registerNotificationSettings(): () => void {
  const unregisterLoading = registerWithGroups(buildLoadingGroups());

  let unregisterResolved: (() => void) | null = null;
  let disposed = false;

  loadCategories()
    .then((categories) => {
      if (disposed) {
        return;
      }
      unregisterLoading();
      unregisterResolved = registerWithGroups(buildSystemGroups(categories));
    })
    .catch((err) => {
      console.error('Failed to build notification settings schema:', err);
      if (disposed) {
        return;
      }
      unregisterLoading();
      unregisterResolved = registerWithGroups(buildErrorGroups());
    });

  return () => {
    disposed = true;
    unregisterResolved?.();
    unregisterLoading();
  };
}
