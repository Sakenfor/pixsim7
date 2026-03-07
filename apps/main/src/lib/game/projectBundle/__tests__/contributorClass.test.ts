import { beforeEach, describe, expect, it } from 'vitest';

import {
  BaseAuthoringProjectBundleContributor,
  normalizeAuthoringProjectBundleContributor,
} from '../contributorClass';
import {
  listAuthoringProjectBundleContributors,
  registerAuthoringProjectBundleContributor,
  unregisterAuthoringProjectBundleContributor,
} from '../contributors';
import { projectBundleExtensionRegistry } from '../registry';

const TEST_ADAPTER_KEY = 'authoring.test.adapter';
const TEST_REGISTER_KEY = 'authoring.test.register';

class TestAdapterContributor extends BaseAuthoringProjectBundleContributor<{ version: number }> {
  key = TEST_ADAPTER_KEY;
  version = 3;
  private dirty = false;
  private listeners = new Set<(dirty: boolean) => void>();

  setDirty(nextDirty: boolean): void {
    this.dirty = nextDirty;
    for (const listener of this.listeners) {
      listener(nextDirty);
    }
  }

  protected onExport() {
    return { version: this.version };
  }

  protected onImport(payload: { version: number }) {
    this.dirty = payload.version > 0;
    return {};
  }

  protected onGetDirtyState() {
    return this.dirty;
  }

  protected onClearDirtyState() {
    this.setDirty(false);
  }

  protected onSubscribeDirtyState(listener: (dirty: boolean) => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}

class TestRegisterContributor extends BaseAuthoringProjectBundleContributor {
  key = TEST_REGISTER_KEY;
  version = 1;
}

describe('contributorClass', () => {
  beforeEach(() => {
    unregisterAuthoringProjectBundleContributor(TEST_ADAPTER_KEY);
    unregisterAuthoringProjectBundleContributor(TEST_REGISTER_KEY);
    projectBundleExtensionRegistry.clear();
  });

  it('normalizes class-based contributors into plain contributor objects', async () => {
    const adapter = new TestAdapterContributor();
    const contributor = normalizeAuthoringProjectBundleContributor(adapter);

    expect(contributor.key).toBe(TEST_ADAPTER_KEY);
    expect(contributor.version).toBe(3);
    expect(await contributor.export?.({} as never)).toEqual({ version: 3 });

    const dirtyEvents: boolean[] = [];
    const unsubscribe = contributor.subscribeDirtyState?.((dirty) => {
      dirtyEvents.push(dirty);
    });

    adapter.setDirty(true);
    expect(contributor.getDirtyState?.()).toBe(true);
    contributor.clearDirtyState?.();
    expect(contributor.getDirtyState?.()).toBe(false);

    expect(dirtyEvents).toEqual([true, false]);
    unsubscribe?.();
  });

  it('registers class-based contributors through the existing contributor registry', () => {
    registerAuthoringProjectBundleContributor(new TestRegisterContributor());

    expect(listAuthoringProjectBundleContributors()).toContain(TEST_REGISTER_KEY);
    expect(projectBundleExtensionRegistry.has(TEST_REGISTER_KEY)).toBe(true);
  });
});
