/**
 * Automatic Context Menu Registration System
 */

import { useMemo } from 'react';
import { useContextMenuItem, type ContextMenuAttrs } from './contextDataResolver';

export interface AutoContextConfig<T = any> {
  idField?: keyof T | ((obj: T) => string | number);
  labelField?: keyof T | ((obj: T) => string);
  fields?: 'default' | (keyof T)[] | ((obj: T) => Record<string, unknown>);
  includeFullObject?: boolean;
  computeFields?: (obj: T) => Record<string, unknown>;
  computeLabel?: (obj: T) => string;
}

class AutoContextConfigRegistry {
  private configs = new Map<string, AutoContextConfig>();
  private warnOnOverwrite = true;

  register<T = any>(
    type: string,
    config: AutoContextConfig<T>,
    options?: { silent?: boolean }
  ): void {
    if (this.warnOnOverwrite && this.configs.has(type) && !options?.silent) {
      console.warn(
        `[AutoContextConfig] Overwriting existing config for '${type}'. ` +
        `Use unregister() first or pass { silent: true } to suppress this warning.`
      );
    }
    this.configs.set(type, config);
  }

  unregister(type: string): boolean {
    return this.configs.delete(type);
  }

  get<T = any>(type: string): AutoContextConfig<T> | undefined {
    return this.configs.get(type) as AutoContextConfig<T> | undefined;
  }

  getWithOverrides<T = any>(
    type: string,
    overrides?: AutoContextConfig<T>
  ): AutoContextConfig<T> {
    const preset = this.configs.get(type) as AutoContextConfig<T> | undefined;
    if (!overrides) return preset ?? ({} as AutoContextConfig<T>);
    if (!preset) return overrides;
    return { ...preset, ...overrides };
  }

  has(type: string): boolean {
    return this.configs.has(type);
  }

  getTypes(): string[] {
    return Array.from(this.configs.keys());
  }

  clear(): void {
    this.configs.clear();
  }

  setWarnOnOverwrite(warn: boolean): void {
    this.warnOnOverwrite = warn;
  }
}

export const autoContextConfigRegistry = new AutoContextConfigRegistry();

export function useAutoContextMenu<T extends Record<string, any>>(
  type: string,
  obj: T | null | undefined,
  config?: AutoContextConfig<T>,
): ContextMenuAttrs | Record<string, never> {
  const mergedConfig = useMemo(() => {
    return autoContextConfigRegistry.getWithOverrides<T>(type, config);
  }, [type, config]);

  const {
    idField = 'id',
    labelField,
    fields = 'default',
    includeFullObject = false,
    computeFields,
    computeLabel,
  } = mergedConfig;

  const id = useMemo(() => {
    if (!obj) return undefined;
    if (typeof idField === 'function') {
      return idField(obj);
    }
    return obj[idField as string] as string | number | undefined;
  }, [obj, idField]);

  const label = useMemo(() => {
    if (!obj) return undefined;

    if (computeLabel) {
      return computeLabel(obj);
    }

    if (labelField) {
      if (typeof labelField === 'function') {
        return labelField(obj);
      }
      return String(obj[labelField as string] || '');
    }

    const fallbacks = ['name', 'title', 'label', 'description'] as const;
    for (const field of fallbacks) {
      if (obj[field]) return String(obj[field]);
    }

    return `${type} ${id}`;
  }, [obj, labelField, computeLabel, type, id]);

  const contextData = useMemo(() => {
    if (!obj) return { name: undefined };

    let data: Record<string, unknown> = { id, name: label };

    if (typeof fields === 'function') {
      data = { ...data, ...fields(obj) };
    } else if (Array.isArray(fields)) {
      fields.forEach(field => {
        data[field as string] = obj[field as string];
      });
    }

    if (includeFullObject) {
      data[type] = obj;
    }

    if (computeFields) {
      data = { ...data, ...computeFields(obj) };
    }

    return data;
  }, [obj, id, label, fields, includeFullObject, computeFields, type]);

  const deps = useMemo(() => {
    if (!obj) return [];

    const values: unknown[] = [];

    const extractValues = (data: Record<string, unknown>) => {
      Object.values(data).forEach(value => {
        if (value === null || value === undefined) {
          values.push(value);
        } else if (typeof value === 'object' && !Array.isArray(value)) {
          values.push(value);
        } else {
          values.push(value);
        }
      });
    };

    extractValues(contextData);
    return values;
  }, [contextData, obj]);

  return useContextMenuItem(type, id, contextData, deps);
}

export function useAssetAutoContextMenu<T extends { id: number | string }>(
  asset: T | null | undefined,
  config?: AutoContextConfig<T>,
): ContextMenuAttrs | Record<string, never> {
  return useAutoContextMenu('asset', asset, config);
}

export function usePromptAutoContextMenu<T extends { id: number | string }>(
  prompt: T | null | undefined,
  config?: AutoContextConfig<T>,
): ContextMenuAttrs | Record<string, never> {
  return useAutoContextMenu('prompt', prompt, config);
}
