import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { PromptPackVersion } from '@lib/api/promptPacks';

import { VersionsList } from '../VersionsList';

function makeVersion(overrides: Partial<PromptPackVersion> = {}): PromptPackVersion {
  return {
    id: 'v1',
    draft_id: 'd1',
    owner_user_id: 1,
    version: 1,
    cue_source: '',
    compiled_schema_yaml: '',
    compiled_manifest_yaml: '',
    compiled_blocks_json: [],
    checksum: 'abc',
    created_at: '2020-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('VersionsList', () => {
  it('renders v-prefixed numbers and an active pill', () => {
    render(
      <VersionsList
        versions={[
          makeVersion({ id: 'a', version: 1 }),
          makeVersion({ id: 'b', version: 2 }),
        ]}
        selectedId="b"
        onSelect={() => {}}
        activeVersionIds={new Set(['b'])}
      />,
    );
    expect(screen.getByText('v1')).toBeDefined();
    expect(screen.getByText('v2')).toBeDefined();
    expect(screen.getByText('active')).toBeDefined();
  });

  it('fires onSelect when a version is clicked', () => {
    const onSelect = vi.fn();
    render(
      <VersionsList
        versions={[makeVersion({ id: 'a' })]}
        selectedId={null}
        onSelect={onSelect}
        activeVersionIds={new Set()}
      />,
    );
    fireEvent.click(screen.getByText('v1'));
    expect(onSelect).toHaveBeenCalledWith('a');
  });

  it('renders empty state when there are no versions', () => {
    render(
      <VersionsList
        versions={[]}
        selectedId={null}
        onSelect={() => {}}
        activeVersionIds={new Set()}
      />,
    );
    expect(screen.getByText('No versions yet.')).toBeDefined();
  });

  it('shows loading/error states without listing versions', () => {
    const { rerender } = render(
      <VersionsList
        versions={[makeVersion()]}
        selectedId={null}
        onSelect={() => {}}
        activeVersionIds={new Set()}
        loading
      />,
    );
    expect(screen.getByText('Loading versions...')).toBeDefined();
    expect(screen.queryByText('v1')).toBeNull();

    rerender(
      <VersionsList
        versions={[makeVersion()]}
        selectedId={null}
        onSelect={() => {}}
        activeVersionIds={new Set()}
        error="boom"
      />,
    );
    expect(screen.getByText('boom')).toBeDefined();
  });
});
