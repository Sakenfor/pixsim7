import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getFilterMetadata: vi.fn(),
}));

vi.mock('../../lib/api', () => ({
  getFilterMetadata: mocks.getFilterMetadata,
}));

const metadata = {
  filters: [{ key: 'media_type', type: 'enum', label: 'Media Type' }],
  options: {
    media_type: [{ value: 'image', label: 'Image' }],
  },
};

describe('useFilterMetadata', () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.getFilterMetadata.mockReset();
  });

  it('deduplicates concurrent requests with equivalent options', async () => {
    let resolveRequest!: (value: typeof metadata) => void;
    mocks.getFilterMetadata.mockReturnValue(
      new Promise<typeof metadata>((resolve) => {
        resolveRequest = resolve;
      }),
    );
    const { useFilterMetadata } = await import('../useFilterMetadata');

    const first = renderHook(() =>
      useFilterMetadata({ include: ['media_type', 'upload_method'], limit: 150 }),
    );
    const second = renderHook(() =>
      useFilterMetadata({ include: ['upload_method', 'media_type'], limit: 150 }),
    );

    expect(mocks.getFilterMetadata).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveRequest(metadata);
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(first.result.current.metadata).toEqual(metadata);
      expect(second.result.current.metadata).toEqual(metadata);
      expect(first.result.current.loading).toBe(false);
      expect(second.result.current.loading).toBe(false);
    });
  });

  it('serves recent metadata immediately when the hook remounts', async () => {
    mocks.getFilterMetadata.mockResolvedValue(metadata);
    const { useFilterMetadata } = await import('../useFilterMetadata');

    const first = renderHook(() => useFilterMetadata({ limit: 150 }));
    await waitFor(() => expect(first.result.current.metadata).toEqual(metadata));
    first.unmount();

    const second = renderHook(() => useFilterMetadata({ limit: 150 }));

    expect(second.result.current.metadata).toEqual(metadata);
    expect(second.result.current.loading).toBe(false);
    expect(mocks.getFilterMetadata).toHaveBeenCalledTimes(1);
  });
});
