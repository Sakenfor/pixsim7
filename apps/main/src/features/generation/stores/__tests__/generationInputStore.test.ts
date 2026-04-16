/**
 * Tests for the scoped generationInputStore, focused on per-provider input
 * preservation (`switchProviderInputs`) and scope/storage boundaries.
 *
 * These tests target the long-standing bug where assets appear to "reset"
 * when switching providers with the "per provider inputs" flag enabled.
 * They lock down the store-level contract so UI-layer fixes can be made
 * without regressing the core state machine.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { OperationType } from '@/types/operations';

import type { AssetModel } from '../../../assets/models/asset';

// Stub barrel side-effects so importing the store doesn't pull in dockview,
// notification schema bootstrap, etc.  Matches the pattern already used by
// generationVideoReadiness.test.ts.
vi.mock('@features/assets', () => ({
  assetEvents: {
    emitAssetCreated: vi.fn(),
    emitAssetUpdated: vi.fn(),
    emitAssetDeleted: vi.fn(),
    subscribeToUpdates: vi.fn(() => () => {}),
  },
  fromAssetResponse: vi.fn((r: unknown) => r),
  getAssetDisplayUrls: vi.fn(() => ({ mainUrl: '', thumbnailUrl: '', previewUrl: '' })),
  useMediaSettingsStore: { getState: () => ({ serverSettings: null }) },
}));

vi.mock('@lib/utils', () => ({
  debugFlags: { log: vi.fn() },
  hmrSingleton: (_key: string, factory: () => unknown) => factory(),
  // settingsStore uses this to pick its persist backend — in tests we just
  // route it through localStorage so rehydration still works.
  createBackendStorage: () => ({
    getItem: (k: string) => localStorage.getItem(k),
    setItem: (k: string, v: string) => localStorage.setItem(k, v),
    removeItem: (k: string) => localStorage.removeItem(k),
  }),
}));

import { createGenerationInputStore } from '../generationInputStore';

let storeCounter = 0;
function freshStore() {
  storeCounter += 1;
  return createGenerationInputStore(`test_generation_inputs_${storeCounter}_${Date.now()}`);
}

function makeAsset(id: number, overrides: Partial<AssetModel> = {}): AssetModel {
  return {
    id,
    createdAt: new Date().toISOString(),
    isArchived: false,
    mediaType: 'image' as AssetModel['mediaType'],
    providerAssetId: `pa_${id}`,
    providerId: 'pixverse',
    syncStatus: 'synced' as AssetModel['syncStatus'],
    userId: 1,
    ...overrides,
  };
}

const OP: OperationType = 'image_to_video';

beforeEach(() => {
  try {
    localStorage.clear();
  } catch {
    // jsdom should always have localStorage, but guard anyway
  }
});

describe('generationInputStore.switchProviderInputs', () => {
  it('round-trips assets A→B→A', () => {
    const store = freshStore();
    store.getState().setCurrentProviderForOp(OP, 'pixverse');
    store.getState().addInputs({
      assets: [makeAsset(1), makeAsset(2)],
      operationType: OP,
    });

    // A (pixverse) → B (runway)
    store.getState().switchProviderInputs(OP, 'runway');
    expect(store.getState().getInputs(OP)).toHaveLength(0);

    // Add B-side assets
    store.getState().addInputs({
      assets: [makeAsset(10), makeAsset(11)],
      operationType: OP,
    });

    // B → A: saves B's [10,11] under 'runway::op', restores A's [1,2]
    store.getState().switchProviderInputs(OP, 'pixverse');
    expect(store.getState().getInputs(OP).map((i) => i.asset.id)).toEqual([1, 2]);

    // A → B again: should restore [10, 11]
    store.getState().switchProviderInputs(OP, 'runway');
    expect(store.getState().getInputs(OP).map((i) => i.asset.id)).toEqual([10, 11]);
  });

  it('persists currentProviderByOp + inputsByProviderOp across store rehydration', () => {
    const storageKey = `test_rehydrate_${Date.now()}`;
    const first = createGenerationInputStore(storageKey);
    first.getState().setCurrentProviderForOp(OP, 'pixverse');
    first.getState().addInputs({ assets: [makeAsset(1)], operationType: OP });
    first.getState().switchProviderInputs(OP, 'runway');

    // Recreate store with the same key — simulates reload or scope revival.
    // The second store should know it's currently on 'runway' from the
    // rehydrated currentProviderByOp.
    const second = createGenerationInputStore(storageKey);
    expect(second.getState().currentProviderByOp[OP]).toBe('runway');
    second.getState().switchProviderInputs(OP, 'pixverse');
    expect(second.getState().getInputs(OP).map((i) => i.asset.id)).toEqual([1]);
  });

  it('operation-switch within same provider does not clobber other-provider entries', () => {
    const store = freshStore();
    store.getState().setCurrentProviderForOp('image_to_video', 'pixverse');
    store.getState().addInputs({ assets: [makeAsset(1)], operationType: 'image_to_video' });

    // Save under pixverse::image_to_video by switching away and back
    store.getState().switchProviderInputs('image_to_video', 'runway');
    store.getState().switchProviderInputs('image_to_video', 'pixverse');
    expect(store.getState().getInputs('image_to_video').map((i) => i.asset.id)).toEqual([1]);

    // Work on a different operation on the same provider (no switch fires)
    store.getState().setCurrentProviderForOp('image_to_image', 'pixverse');
    store.getState().addInputs({ assets: [makeAsset(99)], operationType: 'image_to_image' });

    // Now switch providers on the active op — prior op's entries must survive
    store.getState().switchProviderInputs('image_to_image', 'runway');
    store.getState().switchProviderInputs('image_to_image', 'pixverse');
    expect(store.getState().getInputs('image_to_video').map((i) => i.asset.id)).toEqual([1]);
    expect(store.getState().getInputs('image_to_image').map((i) => i.asset.id)).toEqual([99]);
  });

  it('treats undefined provider id as the "_auto" bucket', () => {
    const store = freshStore();
    // Intentionally do NOT seed — starting provider is undefined (auto).
    store.getState().addInputs({ assets: [makeAsset(1)], operationType: OP });

    // _auto → pixverse saves [1] under _auto, restores empty
    store.getState().switchProviderInputs(OP, 'pixverse');
    expect(store.getState().getInputs(OP)).toHaveLength(0);

    // pixverse → undefined restores [1] from the _auto bucket
    store.getState().switchProviderInputs(OP, undefined);
    expect(store.getState().getInputs(OP).map((i) => i.asset.id)).toEqual([1]);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Regression guard: the store owns `currentProviderByOp` so
  // `switchProviderInputs` cannot be corrupted by caller-side drift (e.g.
  // model-triggered changes to `inferredProviderId`).  This was the
  // long-standing "assets reset when switching providers" bug.
  // ─────────────────────────────────────────────────────────────────────────
  it('regression: silent inferredProviderId drift on caller side cannot lose assets', () => {
    const store = freshStore();

    // Step 1: user is on pika, adds X1
    store.getState().setCurrentProviderForOp(OP, 'pika');
    store.getState().addInputs({ assets: [makeAsset(1)], operationType: OP });

    // Step 2: model change would have silently flipped pika→runway in the
    // panel's inferredProviderId, but the panel no longer passes that value
    // to the store.  User clicks provider button → pixverse.
    store.getState().switchProviderInputs(OP, 'pixverse');

    // Step 3: user goes back to pika — X1 must come back
    store.getState().switchProviderInputs(OP, 'pika');
    expect(store.getState().getInputs(OP).map((i) => i.asset.id)).toEqual([1]);
  });

  it('first switch into a new provider saves current items under the seeded bucket and round-trips', () => {
    const store = freshStore();
    store.getState().setCurrentProviderForOp(OP, 'pixverse');
    store.getState().addInputs({ assets: [makeAsset(1)], operationType: OP });

    store.getState().switchProviderInputs(OP, 'runway');
    expect(store.getState().getInputs(OP)).toEqual([]);

    store.getState().switchProviderInputs(OP, 'pixverse');
    expect(store.getState().getInputs(OP).map((i) => i.asset.id)).toEqual([1]);
  });

  it('setCurrentProviderForOp updates the tag without swapping buckets', () => {
    const store = freshStore();
    store.getState().addInputs({ assets: [makeAsset(1), makeAsset(2)], operationType: OP });
    expect(store.getState().currentProviderByOp[OP]).toBeUndefined();

    store.getState().setCurrentProviderForOp(OP, 'pixverse');
    expect(store.getState().currentProviderByOp[OP]).toBe('pixverse');
    // Current items stay put — no swap happened.
    expect(store.getState().getInputs(OP).map((i) => i.asset.id)).toEqual([1, 2]);
  });
});

describe('generationInputStore.addInputs', () => {
  it('adds assets into the correct operation bucket', () => {
    const store = freshStore();
    store.getState().addInputs({
      assets: [makeAsset(1), makeAsset(2)],
      operationType: OP,
    });
    expect(store.getState().getInputs(OP)).toHaveLength(2);
    expect(store.getState().getInputs('image_to_image')).toHaveLength(0);
  });
});

describe('generationInputStore.switchProviderInputs (extended)', () => {
  it('preserves originals across a multi-provider chain A→B→C→A', () => {
    const store = freshStore();
    store.getState().setCurrentProviderForOp(OP, 'pixverse');
    store.getState().addInputs({ assets: [makeAsset(1), makeAsset(2)], operationType: OP });

    // A → B
    store.getState().switchProviderInputs(OP, 'runway');
    store.getState().addInputs({ assets: [makeAsset(10)], operationType: OP });

    // B → C
    store.getState().switchProviderInputs(OP, 'pika');
    store.getState().addInputs({ assets: [makeAsset(20), makeAsset(21)], operationType: OP });

    // C → A: should restore A's originals [1,2], untouched by the chain
    store.getState().switchProviderInputs(OP, 'pixverse');
    expect(store.getState().getInputs(OP).map((i) => i.asset.id)).toEqual([1, 2]);

    // A → B: B's side should still be [10]
    store.getState().switchProviderInputs(OP, 'runway');
    expect(store.getState().getInputs(OP).map((i) => i.asset.id)).toEqual([10]);

    // B → C: C's side should still be [20, 21]
    store.getState().switchProviderInputs(OP, 'pika');
    expect(store.getState().getInputs(OP).map((i) => i.asset.id)).toEqual([20, 21]);
  });

  it('adding items after switch does not leak into the previously-saved provider bucket', () => {
    const store = freshStore();
    store.getState().setCurrentProviderForOp(OP, 'pixverse');
    store.getState().addInputs({ assets: [makeAsset(1), makeAsset(2)], operationType: OP });

    // Switch A → B.  A's items [1,2] get saved under 'pixverse::op'.
    store.getState().switchProviderInputs(OP, 'runway');

    // Add a new item while on B.  If the save was aliased (shallow copy of the
    // items array), this push could mutate A's saved snapshot — this guards
    // against that regression.
    store.getState().addInputs({ assets: [makeAsset(99)], operationType: OP });

    // Back to A: should be exactly [1, 2], no leak from B.
    store.getState().switchProviderInputs(OP, 'pixverse');
    expect(store.getState().getInputs(OP).map((i) => i.asset.id)).toEqual([1, 2]);
  });

  it('clearInputs on current op does not wipe other providers\' saved items', () => {
    const store = freshStore();
    store.getState().setCurrentProviderForOp(OP, 'pixverse');
    store.getState().addInputs({ assets: [makeAsset(1)], operationType: OP });
    store.getState().switchProviderInputs(OP, 'runway');
    store.getState().addInputs({ assets: [makeAsset(10)], operationType: OP });

    // Clear current (runway) items — A's bucket must not be affected.
    store.getState().clearInputs(OP);
    expect(store.getState().getInputs(OP)).toEqual([]);

    store.getState().switchProviderInputs(OP, 'pixverse');
    expect(store.getState().getInputs(OP).map((i) => i.asset.id)).toEqual([1]);
  });

  it('removeInput on current op does not affect other providers\' saved items', () => {
    const store = freshStore();
    store.getState().setCurrentProviderForOp(OP, 'pixverse');
    store.getState().addInputs({ assets: [makeAsset(1), makeAsset(2)], operationType: OP });
    store.getState().switchProviderInputs(OP, 'runway');
    store.getState().addInputs({ assets: [makeAsset(10), makeAsset(11)], operationType: OP });

    // Remove one of runway's items.
    const runwayFirstId = store.getState().getInputs(OP)[0]!.id;
    store.getState().removeInput(OP, runwayFirstId);
    expect(store.getState().getInputs(OP).map((i) => i.asset.id)).toEqual([11]);

    // A's saved bucket still has both [1, 2].
    store.getState().switchProviderInputs(OP, 'pixverse');
    expect(store.getState().getInputs(OP).map((i) => i.asset.id)).toEqual([1, 2]);
  });

  it('self-switch (A→A) is a safe round-trip', () => {
    const store = freshStore();
    store.getState().setCurrentProviderForOp(OP, 'pixverse');
    store.getState().addInputs({ assets: [makeAsset(1), makeAsset(2)], operationType: OP });
    store.getState().switchProviderInputs(OP, 'pixverse');
    expect(store.getState().getInputs(OP).map((i) => i.asset.id)).toEqual([1, 2]);
  });

  it('saved bucket is a snapshot — later mutations of current items do not bleed in', () => {
    const store = freshStore();
    store.getState().setCurrentProviderForOp(OP, 'pixverse');
    store.getState().addInputs({ assets: [makeAsset(1), makeAsset(2)], operationType: OP });
    store.getState().switchProviderInputs(OP, 'runway');

    // Back on A, mutate aggressively: clear, re-add different items, remove, etc.
    store.getState().switchProviderInputs(OP, 'pixverse');
    store.getState().clearInputs(OP);
    store.getState().addInputs({ assets: [makeAsset(77)], operationType: OP });

    // Now go A→B→A again.  B's saved bucket was empty; round-trip into A
    // should give the *most recent* A state, i.e. [77].
    store.getState().switchProviderInputs(OP, 'runway');
    expect(store.getState().getInputs(OP)).toEqual([]);
    store.getState().switchProviderInputs(OP, 'pixverse');
    expect(store.getState().getInputs(OP).map((i) => i.asset.id)).toEqual([77]);
  });

  it('maintains independent buckets across operation types for the same provider', () => {
    const store = freshStore();
    store.getState().setCurrentProviderForOp('image_to_video', 'pixverse');
    store.getState().setCurrentProviderForOp('image_to_image', 'pixverse');
    store.getState().addInputs({ assets: [makeAsset(1)], operationType: 'image_to_video' });
    store.getState().addInputs({ assets: [makeAsset(50)], operationType: 'image_to_image' });

    // Switch providers on image_to_video only
    store.getState().switchProviderInputs('image_to_video', 'runway');
    // image_to_image bucket is untouched (no switch was called for it)
    expect(store.getState().getInputs('image_to_image').map((i) => i.asset.id)).toEqual([50]);

    // i2v on runway: empty; switch back, i2v restored, i2i still holds [50]
    store.getState().switchProviderInputs('image_to_video', 'pixverse');
    expect(store.getState().getInputs('image_to_video').map((i) => i.asset.id)).toEqual([1]);
    expect(store.getState().getInputs('image_to_image').map((i) => i.asset.id)).toEqual([50]);
  });
});

describe('generationScopeStores — scope isolation', () => {
  it('returns the same store instance for the same scopeId', async () => {
    const { getGenerationInputStore } = await import('../generationScopeStores');
    const a = getGenerationInputStore('scope_test_same');
    const b = getGenerationInputStore('scope_test_same');
    expect(a).toBe(b);
  });

  it('returns independent stores for different scopeIds and they do not share state', async () => {
    const { getGenerationInputStore } = await import('../generationScopeStores');
    const scopeA = getGenerationInputStore(`scope_iso_A_${Date.now()}`);
    const scopeB = getGenerationInputStore(`scope_iso_B_${Date.now()}`);
    expect(scopeA).not.toBe(scopeB);

    scopeA.getState().addInputs({ assets: [makeAsset(1)], operationType: OP });
    expect(scopeA.getState().getInputs(OP)).toHaveLength(1);
    expect(scopeB.getState().getInputs(OP)).toHaveLength(0);
  });

  it('normalizes duplicate-form scope ids (x:x → x) to the same store', async () => {
    const { getGenerationInputStore } = await import('../generationScopeStores');
    const canonical = getGenerationInputStore('dup_test');
    const duplicated = getGenerationInputStore('dup_test:dup_test');
    expect(canonical).toBe(duplicated);
  });
});
