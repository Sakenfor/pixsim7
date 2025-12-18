/**
 * Panel Settings Helpers
 *
 * Centralized helpers for panel settings updates with debouncing and deep merge support.
 * Part of Task 50 Phase 50.4 - Decentralized Panel Settings System
 */

import { useMemo, useCallback, useRef, useEffect } from 'react';
import type { PanelSettingsUpdateHelpers } from './panelRegistry';
import type { PanelId } from '@features/workspace';

/**
 * Deep set a value in an object using dot notation path
 */
function deepSet<T extends Record<string, any>>(
  obj: T,
  path: string | (string | number)[],
  value: any
): T {
  const pathArray = Array.isArray(path) ? path : path.split('.');
  const result = { ...obj };

  let current: any = result;
  for (let i = 0; i < pathArray.length - 1; i++) {
    const key = pathArray[i];
    if (!(key in current) || typeof current[key] !== 'object') {
      current[key] = {};
    } else {
      current[key] = { ...current[key] };
    }
    current = current[key];
  }

  const lastKey = pathArray[pathArray.length - 1];
  current[lastKey] = value;

  return result;
}

/**
 * Deep merge two objects
 */
function deepMerge<T extends Record<string, any>>(target: T, source: Partial<T>): T {
  const result = { ...target };

  for (const key in source) {
    const sourceValue = source[key];
    const targetValue = result[key];

    if (
      sourceValue !== null &&
      typeof sourceValue === 'object' &&
      !Array.isArray(sourceValue) &&
      targetValue !== null &&
      typeof targetValue === 'object' &&
      !Array.isArray(targetValue)
    ) {
      result[key] = deepMerge(targetValue, sourceValue);
    } else {
      result[key] = sourceValue as any;
    }
  }

  return result;
}

interface DebouncedUpdateOptions {
  /** Debounce delay in milliseconds */
  delay?: number;
  /** Whether to call on leading edge */
  leading?: boolean;
  /** Whether to call on trailing edge */
  trailing?: boolean;
}

/**
 * Hook to create panel settings update helpers with debouncing
 */
export function usePanelSettingsHelpers<TSettings extends Record<string, any>>(
  panelId: PanelId,
  currentSettings: TSettings,
  onUpdateSettings: (settings: Partial<TSettings>) => void,
  options: DebouncedUpdateOptions = {}
): PanelSettingsUpdateHelpers<TSettings> {
  const {
    delay = 300,
    leading = false,
    trailing = true,
  } = options;

  const pendingUpdatesRef = useRef<Partial<TSettings>>({});
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastCallTimeRef = useRef<number>(0);

  // Flush pending updates
  const flush = useCallback(() => {
    if (Object.keys(pendingUpdatesRef.current).length > 0) {
      onUpdateSettings(pendingUpdatesRef.current);
      pendingUpdatesRef.current = {};
    }
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, [onUpdateSettings]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      flush();
    };
  }, [flush]);

  // Debounced update function
  const debouncedUpdate = useCallback(
    (updates: Partial<TSettings>) => {
      const now = Date.now();
      const timeSinceLastCall = now - lastCallTimeRef.current;

      // Merge with pending updates
      pendingUpdatesRef.current = deepMerge(pendingUpdatesRef.current as any, updates);

      // Clear existing timeout
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      // Leading edge call
      if (leading && timeSinceLastCall >= delay) {
        flush();
        lastCallTimeRef.current = now;
        return;
      }

      // Trailing edge call
      if (trailing) {
        timeoutRef.current = setTimeout(() => {
          flush();
          lastCallTimeRef.current = Date.now();
        }, delay);
      }
    },
    [delay, leading, trailing, flush]
  );

  // Create helpers object
  const helpers = useMemo<PanelSettingsUpdateHelpers<TSettings>>(
    () => ({
      update: (patch: Partial<TSettings>) => {
        debouncedUpdate(patch);
      },
      set: <K extends keyof TSettings>(key: K, value: TSettings[K]) => {
        debouncedUpdate({ [key]: value } as Partial<TSettings>);
      },
      replace: (settings: TSettings) => {
        // Replace doesn't debounce - it's immediate
        flush();
        onUpdateSettings(settings);
      },
    }),
    [debouncedUpdate, flush, onUpdateSettings]
  );

  return helpers;
}

/**
 * Validate and migrate panel settings
 */
export function validateAndMigrateSettings<TSettings>(
  storedSettings: any,
  storedVersion: number | undefined,
  panelDefinition: {
    defaultSettings?: TSettings;
    settingsSchema?: any; // z.ZodSchema<TSettings>
    settingsVersion?: number;
    migrateSettings?: (old: unknown, oldVersion: number) => TSettings;
  }
): TSettings {
  const currentVersion = panelDefinition.settingsVersion ?? 0;
  const settingsVersion = storedVersion ?? 0;

  let settings = storedSettings;

  // Run migrations if needed
  if (settingsVersion < currentVersion && panelDefinition.migrateSettings) {
    try {
      settings = panelDefinition.migrateSettings(storedSettings, settingsVersion);
      console.log(
        `Migrated settings from version ${settingsVersion} to ${currentVersion}`
      );
    } catch (error) {
      console.error('Settings migration failed:', error);
      settings = panelDefinition.defaultSettings ?? {};
    }
  }

  // Validate with schema if provided
  if (panelDefinition.settingsSchema) {
    try {
      const result = panelDefinition.settingsSchema.safeParse(settings);
      if (result.success) {
        return result.data;
      } else {
        console.warn('Settings validation failed, using defaults:', result.error);
        return panelDefinition.defaultSettings ?? ({} as TSettings);
      }
    } catch (error) {
      console.error('Settings validation error:', error);
      return panelDefinition.defaultSettings ?? ({} as TSettings);
    }
  }

  // Merge with defaults
  if (panelDefinition.defaultSettings) {
    return deepMerge(panelDefinition.defaultSettings, settings ?? {});
  }

  return settings ?? ({} as TSettings);
}
