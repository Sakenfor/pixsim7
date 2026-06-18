import { act, renderHook } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

import type { AssetModel } from '../../hooks/useAssets';
import type { AssetSource } from '../assetSource';
import { useClientLoadedAssets } from '../useClientLoadedAssets';

type Listener = () => void;

/** Minimal in-memory client-loaded source for exercising the bridge hook. */
function makeClientLoadedSource(initial: AssetModel[]) {
  let snapshot = initial;
  const listeners = new Set<Listener>();
  const load = vi.fn();

  const source: AssetSource = {
    identity: { typeId: 'fake-local', instanceId: 'fake-local', label: 'Fake', kind: 'local', icon: 'folder' },
    capabilities: {
      fetchMode: 'client-loaded',
      canIngest: true,
      canHash: true,
      hasLibraryStatus: true,
      hasFolders: true,
    },
    getAll: () => snapshot,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    get: (key) => snapshot.find((a) => String(a.id) === key),
    file: async () => undefined,
    lifecycle: { load, refresh: async () => {} },
  };

  const emit = (next: AssetModel[]) => {
    snapshot = next;
    listeners.forEach((l) => l());
  };

  return { source, emit, load };
}

const asset = (id: number) => ({ id } as unknown as AssetModel);

describe('useClientLoadedAssets', () => {
  it('hydrates the source on mount and returns its snapshot', () => {
    const { source, load } = makeClientLoadedSource([asset(1), asset(2)]);
    const { result } = renderHook(() => useClientLoadedAssets(source));

    expect(load).toHaveBeenCalledTimes(1);
    expect(result.current.map((a) => a.id)).toEqual([1, 2]);
  });

  it('re-renders with the new snapshot when the source emits a change', () => {
    const { source, emit } = makeClientLoadedSource([asset(1)]);
    const { result } = renderHook(() => useClientLoadedAssets(source));

    expect(result.current.map((a) => a.id)).toEqual([1]);

    act(() => emit([asset(3), asset(4)]));
    expect(result.current.map((a) => a.id)).toEqual([3, 4]);
  });

  it('throws when given a non-client-loaded source', () => {
    const { source } = makeClientLoadedSource([]);
    const serverPaged: AssetSource = {
      ...source,
      capabilities: { ...source.capabilities, fetchMode: 'server-paged' },
      getAll: undefined,
      subscribe: undefined,
    };

    // Silence React's error-boundary console noise for the expected throw.
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => renderHook(() => useClientLoadedAssets(serverPaged))).toThrow(/client-loaded/);
    spy.mockRestore();
  });
});
