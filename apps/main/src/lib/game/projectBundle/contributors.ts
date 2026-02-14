import { registerProjectBundleExtension, unregisterProjectBundleExtension } from './registry';
import type {
  AuthoringProjectBundleContributor,
  ProjectBundleExtensionHandler,
} from './types';

interface RegisteredAuthoringContributor {
  contributor: AuthoringProjectBundleContributor<unknown>;
  dirtyHint: boolean;
  unsubscribeDirty?: () => void;
}

const authoringContributors = new Map<string, RegisteredAuthoringContributor>();
const dirtyListeners = new Set<(dirty: boolean) => void>();
let lastDirtyState = false;

function toExtensionHandler(
  contributor: AuthoringProjectBundleContributor<unknown>,
): ProjectBundleExtensionHandler<unknown> {
  return {
    key: contributor.key,
    version: contributor.version,
    migrate: contributor.migrate,
    export: contributor.export,
    import: contributor.import,
  };
}

function getContributorDirtyState(entry: RegisteredAuthoringContributor): boolean {
  if (!entry.contributor.getDirtyState) {
    return entry.dirtyHint;
  }

  try {
    return entry.contributor.getDirtyState();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(
      `[ProjectBundleContributors] getDirtyState failed for "${entry.contributor.key}": ${message}`,
    );
    return entry.dirtyHint;
  }
}

function computeDirtyState(): boolean {
  for (const entry of authoringContributors.values()) {
    if (getContributorDirtyState(entry)) {
      return true;
    }
  }
  return false;
}

function emitDirtyStateIfChanged(force = false): void {
  const nextDirtyState = computeDirtyState();
  if (!force && nextDirtyState === lastDirtyState) {
    return;
  }

  lastDirtyState = nextDirtyState;
  for (const listener of dirtyListeners) {
    listener(nextDirtyState);
  }
}

function updateContributorDirtyHint(key: string, dirty: boolean): void {
  const entry = authoringContributors.get(key);
  if (!entry) {
    return;
  }
  entry.dirtyHint = dirty;
  emitDirtyStateIfChanged();
}

export function hasAuthoringProjectBundleContributor(key: string): boolean {
  return authoringContributors.has(key);
}

export function listAuthoringProjectBundleContributors(): string[] {
  return Array.from(authoringContributors.keys());
}

export function registerAuthoringProjectBundleContributor(
  contributor: AuthoringProjectBundleContributor<unknown>,
): void {
  const key = contributor.key?.trim();
  if (!key) {
    throw new Error('authoring_project_bundle_contributor_key_required');
  }

  unregisterAuthoringProjectBundleContributor(key);
  const normalizedContributor = { ...contributor, key };

  const entry: RegisteredAuthoringContributor = {
    contributor: normalizedContributor,
    dirtyHint: false,
  };

  if (normalizedContributor.getDirtyState) {
    entry.dirtyHint = getContributorDirtyState(entry);
  }

  registerProjectBundleExtension(toExtensionHandler(normalizedContributor));
  authoringContributors.set(key, entry);

  if (normalizedContributor.subscribeDirtyState) {
    const unsubscribe = normalizedContributor.subscribeDirtyState((dirty) => {
      updateContributorDirtyHint(key, Boolean(dirty));
    });
    if (typeof unsubscribe === 'function') {
      entry.unsubscribeDirty = unsubscribe;
    }
  }

  emitDirtyStateIfChanged(true);
}

export function unregisterAuthoringProjectBundleContributor(key: string): boolean {
  const entry = authoringContributors.get(key);
  if (entry?.unsubscribeDirty) {
    entry.unsubscribeDirty();
  }

  const removedContributor = authoringContributors.delete(key);
  const removedExtension = unregisterProjectBundleExtension(key);
  if (removedContributor) {
    emitDirtyStateIfChanged(true);
  }

  return removedContributor || removedExtension;
}

export function isAnyAuthoringProjectBundleContributorDirty(): boolean {
  return computeDirtyState();
}

export function listDirtyAuthoringProjectBundleContributors(): string[] {
  const dirtyKeys: string[] = [];
  for (const [key, entry] of authoringContributors.entries()) {
    if (getContributorDirtyState(entry)) {
      dirtyKeys.push(key);
    }
  }
  return dirtyKeys;
}

export function clearAuthoringProjectBundleDirtyState(keys?: string[]): void {
  const targetKeys =
    keys && keys.length > 0 ? keys : Array.from(authoringContributors.keys());

  for (const key of targetKeys) {
    const entry = authoringContributors.get(key);
    if (!entry) {
      continue;
    }

    if (entry.contributor.clearDirtyState) {
      try {
        entry.contributor.clearDirtyState();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(
          `[ProjectBundleContributors] clearDirtyState failed for "${key}": ${message}`,
        );
      }
    }

    entry.dirtyHint = false;
    if (entry.contributor.getDirtyState) {
      entry.dirtyHint = getContributorDirtyState(entry);
    }
  }

  emitDirtyStateIfChanged(true);
}

export function subscribeAuthoringProjectBundleDirtyState(
  listener: (dirty: boolean) => void,
): () => void {
  dirtyListeners.add(listener);
  listener(computeDirtyState());

  return () => {
    dirtyListeners.delete(listener);
  };
}
