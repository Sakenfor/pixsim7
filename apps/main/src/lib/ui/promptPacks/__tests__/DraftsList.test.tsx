import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { PromptPackDraft } from '@lib/api/promptPacks';

import { DraftsList } from '../DraftsList';

function makeDraft(overrides: Partial<PromptPackDraft> = {}): PromptPackDraft {
  return {
    id: 'd1',
    owner_user_id: 1,
    namespace: 'user.1',
    pack_slug: 'my_pack',
    status: 'draft',
    cue_source: '',
    last_compile_errors: [],
    created_at: '2020-01-01T00:00:00Z',
    updated_at: '2020-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('DraftsList', () => {
  it('renders the empty state with a custom message', () => {
    render(
      <DraftsList
        drafts={[]}
        selectedId={null}
        onSelect={() => {}}
        emptyMessage="Nothing here yet."
      />,
    );
    expect(screen.getByText('Nothing here yet.')).toBeDefined();
  });

  it('renders loading and error states without listing drafts', () => {
    const { rerender } = render(
      <DraftsList drafts={[makeDraft()]} selectedId={null} onSelect={() => {}} loading />,
    );
    expect(screen.getByText('Loading drafts...')).toBeDefined();
    expect(screen.queryByText('my_pack')).toBeNull();

    rerender(
      <DraftsList
        drafts={[makeDraft()]}
        selectedId={null}
        onSelect={() => {}}
        error="boom"
      />,
    );
    expect(screen.getByText('boom')).toBeDefined();
    expect(screen.queryByText('my_pack')).toBeNull();
  });

  it('renders drafts and fires onSelect with the clicked id', () => {
    const onSelect = vi.fn();
    render(
      <DraftsList
        drafts={[
          makeDraft({ id: 'a', pack_slug: 'first' }),
          makeDraft({ id: 'b', pack_slug: 'second' }),
        ]}
        selectedId="a"
        onSelect={onSelect}
      />,
    );
    expect(screen.getByText('first')).toBeDefined();
    expect(screen.getByText('second')).toBeDefined();
    fireEvent.click(screen.getByText('second'));
    expect(onSelect).toHaveBeenCalledWith('b');
  });

  it('shows compile_status badge alongside status', () => {
    render(
      <DraftsList
        drafts={[makeDraft({ last_compile_status: 'compile_ok' })]}
        selectedId={null}
        onSelect={() => {}}
      />,
    );
    expect(screen.getByText('compile_ok')).toBeDefined();
    expect(screen.getByText('draft')).toBeDefined();
  });

  it('renders a secondary highlight when highlightId matches a non-selected draft', () => {
    render(
      <DraftsList
        drafts={[makeDraft({ id: 'a' }), makeDraft({ id: 'b' })]}
        selectedId="a"
        highlightId="b"
        onSelect={() => {}}
      />,
    );
    // The highlighted (non-selected) button gets an amber border class.
    const buttons = screen.getAllByRole('button');
    expect(buttons[1].className).toMatch(/amber/);
    // The selected one stays blue.
    expect(buttons[0].className).toMatch(/blue/);
  });
});
