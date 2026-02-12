import type { ProjectBundleExtensionHandler } from './types';

export const PROJECT_BUNDLE_EXTENSION_KEY_PATTERN = /^[a-z][a-z0-9_-]*(\.[a-z][a-z0-9_-]*)+$/;

class ProjectBundleExtensionRegistry {
  private handlers = new Map<string, ProjectBundleExtensionHandler>();

  register(handler: ProjectBundleExtensionHandler): void {
    const key = handler.key?.trim();
    if (!key) {
      throw new Error('project_bundle_extension_key_required');
    }

    if (!PROJECT_BUNDLE_EXTENSION_KEY_PATTERN.test(key)) {
      throw new Error(`invalid_project_bundle_extension_key:${key}`);
    }

    if (this.handlers.has(key)) {
      console.warn(`[ProjectBundleExtensions] Overwriting handler for "${key}"`);
    }

    this.handlers.set(key, { ...handler, key });
  }

  unregister(key: string): boolean {
    return this.handlers.delete(key);
  }

  has(key: string): boolean {
    return this.handlers.has(key);
  }

  get(key: string): ProjectBundleExtensionHandler | undefined {
    return this.handlers.get(key);
  }

  list(): ProjectBundleExtensionHandler[] {
    return Array.from(this.handlers.values());
  }

  clear(): void {
    this.handlers.clear();
  }
}

export const projectBundleExtensionRegistry = new ProjectBundleExtensionRegistry();

export function registerProjectBundleExtension(handler: ProjectBundleExtensionHandler): void {
  projectBundleExtensionRegistry.register(handler);
}

export function unregisterProjectBundleExtension(key: string): boolean {
  return projectBundleExtensionRegistry.unregister(key);
}
