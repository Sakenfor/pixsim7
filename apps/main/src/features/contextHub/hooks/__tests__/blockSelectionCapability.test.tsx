import {
  getCapabilityDescriptor,
} from '@pixsim7/shared.capabilities.core/descriptor';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';

import { ContextHubHost } from '../../components/ContextHubHost';
// Side-effect import: registers CAP_BLOCK_SELECTION's descriptor. The type
// imports below would be elided at compile time, so we need an explicit
// non-type import to keep the module in the runtime graph.
import '../../domain/capabilities';
import type { BlockSelection, BlockSummary } from '../../domain/capabilities';
import { CAP_BLOCK_SELECTION } from '../../domain/capabilityKeys';
import { useCapability, useProvideCapability } from '../useCapability';

const wrapper = ({ children }: { children: ReactNode }) => (
  <ContextHubHost hostId="test-host">{children}</ContextHubHost>
);

describe('CAP_BLOCK_SELECTION', () => {
  it('registers a descriptor on module load', () => {
    const descriptor = getCapabilityDescriptor(CAP_BLOCK_SELECTION);
    expect(descriptor).toBeDefined();
    expect(descriptor?.label).toBe('Block Selection');
    expect(descriptor?.kind).toBe('context');
  });

  it('returns a null block when no provider is available', () => {
    const { result } = renderHook(
      () => useCapability<BlockSelection>(CAP_BLOCK_SELECTION),
      { wrapper },
    );
    expect(result.current.provider).toBeNull();
    expect(result.current.value).toBeNull();
  });

  it('propagates the selected block from provider to consumer', () => {
    let externalBlock: BlockSummary | null = null;

    function useTestProvider() {
      useProvideCapability<BlockSelection>(
        CAP_BLOCK_SELECTION,
        {
          id: 'test-explorer',
          isAvailable: () => externalBlock !== null,
          getValue: () => ({ block: externalBlock }),
        },
        [externalBlock],
        { scope: 'root' },
      );
    }

    function useBoth() {
      useTestProvider();
      return useCapability<BlockSelection>(CAP_BLOCK_SELECTION);
    }

    const { result, rerender } = renderHook(() => useBoth(), { wrapper });

    // No provider available at first.
    expect(result.current.value).toBeNull();

    // Flip the provider to available with a concrete block.
    act(() => {
      externalBlock = {
        blockId: 'core.camera.angle.eye_level',
        role: 'camera',
        category: 'angle',
        packageName: 'core_angle',
      };
      rerender();
    });

    expect(result.current.value?.block?.blockId).toBe('core.camera.angle.eye_level');
    expect(result.current.value?.block?.role).toBe('camera');
    expect(result.current.provider?.id).toBe('test-explorer');

    // Clearing returns the consumer to a null value.
    act(() => {
      externalBlock = null;
      rerender();
    });

    expect(result.current.value).toBeNull();
  });
});
