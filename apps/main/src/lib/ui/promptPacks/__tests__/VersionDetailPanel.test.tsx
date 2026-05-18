import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type {
  PromptPackPublication,
  PromptPackVersion,
} from '@lib/api/promptPacks';

import { VersionDetailPanel, type VersionDetailPanelProps } from '../VersionDetailPanel';

function makeVersion(overrides: Partial<PromptPackVersion> = {}): PromptPackVersion {
  return {
    id: 'v1',
    draft_id: 'd1',
    owner_user_id: 1,
    owner_username: 'alice',
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

function makePublication(
  overrides: Partial<PromptPackPublication> = {},
): PromptPackPublication {
  return {
    id: 'pub1',
    version_id: 'v1',
    draft_id: 'd1',
    owner_user_id: 1,
    visibility: 'private',
    review_status: 'draft',
    created_at: '2020-01-01T00:00:00Z',
    updated_at: '2020-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeProps(
  overrides: Partial<VersionDetailPanelProps> = {},
): VersionDetailPanelProps {
  return {
    version: makeVersion(),
    publication: makePublication(),
    isActive: false,
    canManagePublication: true,
    isAdmin: false,
    isVersionOwner: true,
    workflowBusy: false,
    activationBusy: false,
    reviewNotes: '',
    onReviewNotesChange: () => {},
    onActivate: () => {},
    onDeactivate: () => {},
    onSubmit: () => {},
    onPublishPrivate: () => {},
    onPublishShared: () => {},
    ...overrides,
  };
}

describe('VersionDetailPanel', () => {
  it('shows visibility + review pills derived from publication', () => {
    render(
      <VersionDetailPanel
        {...makeProps({
          publication: makePublication({ visibility: 'shared', review_status: 'approved' }),
        })}
      />,
    );
    expect(screen.getByText('visibility: shared')).toBeDefined();
    expect(screen.getByText('review: approved')).toBeDefined();
  });

  it('falls back to draft / private when publication is null', () => {
    render(<VersionDetailPanel {...makeProps({ publication: null })} />);
    expect(screen.getByText('visibility: private')).toBeDefined();
    expect(screen.getByText('review: draft')).toBeDefined();
  });

  it('disables Activate when already active and Deactivate when not active', () => {
    const { rerender } = render(<VersionDetailPanel {...makeProps({ isActive: false })} />);
    expect((screen.getByText('Activate').closest('button')!).disabled).toBe(false);
    expect((screen.getByText('Deactivate').closest('button')!).disabled).toBe(true);
    rerender(<VersionDetailPanel {...makeProps({ isActive: true })} />);
    expect((screen.getByText('Activate').closest('button')!).disabled).toBe(true);
    expect((screen.getByText('Deactivate').closest('button')!).disabled).toBe(false);
  });

  it('disables Submit when not the version owner or already submitted', () => {
    const { rerender } = render(
      <VersionDetailPanel {...makeProps({ isVersionOwner: false })} />,
    );
    expect((screen.getByText('Submit for Review').closest('button')!).disabled).toBe(true);

    rerender(
      <VersionDetailPanel
        {...makeProps({
          publication: makePublication({ review_status: 'submitted' }),
        })}
      />,
    );
    expect((screen.getByText('Submit for Review').closest('button')!).disabled).toBe(true);
  });

  it('Publish Shared requires approved review status', () => {
    const { rerender } = render(
      <VersionDetailPanel
        {...makeProps({
          publication: makePublication({ review_status: 'draft' }),
        })}
      />,
    );
    expect((screen.getByText('Publish Shared').closest('button')!).disabled).toBe(true);

    rerender(
      <VersionDetailPanel
        {...makeProps({
          publication: makePublication({ review_status: 'approved' }),
        })}
      />,
    );
    expect((screen.getByText('Publish Shared').closest('button')!).disabled).toBe(false);
  });

  it('hides admin Approve/Reject unless isAdmin and both handlers passed', () => {
    const { rerender } = render(
      <VersionDetailPanel {...makeProps({ isAdmin: false })} />,
    );
    expect(screen.queryByText('Approve')).toBeNull();
    expect(screen.queryByText('Reject')).toBeNull();

    rerender(
      <VersionDetailPanel
        {...makeProps({ isAdmin: true, onApprove: () => {}, onReject: () => {} })}
      />,
    );
    expect(screen.getByText('Approve')).toBeDefined();
    expect(screen.getByText('Reject')).toBeDefined();
  });

  it('Approve is gated on submitted review status', () => {
    const onApprove = vi.fn();
    const { rerender } = render(
      <VersionDetailPanel
        {...makeProps({
          isAdmin: true,
          publication: makePublication({ review_status: 'draft' }),
          onApprove,
          onReject: () => {},
        })}
      />,
    );
    expect((screen.getByText('Approve').closest('button')!).disabled).toBe(true);

    rerender(
      <VersionDetailPanel
        {...makeProps({
          isAdmin: true,
          publication: makePublication({ review_status: 'submitted' }),
          onApprove,
          onReject: () => {},
        })}
      />,
    );
    const approveBtn = screen.getByText('Approve').closest('button')!;
    expect(approveBtn.disabled).toBe(false);
    fireEvent.click(approveBtn);
    expect(onApprove).toHaveBeenCalledTimes(1);
  });

  it('forwards review-notes changes to onReviewNotesChange', () => {
    const onReviewNotesChange = vi.fn();
    render(
      <VersionDetailPanel
        {...makeProps({
          isAdmin: true,
          onApprove: () => {},
          onReject: () => {},
          onReviewNotesChange,
        })}
      />,
    );
    const textarea = screen.getByPlaceholderText('review notes (optional)');
    fireEvent.change(textarea, { target: { value: 'lgtm' } });
    expect(onReviewNotesChange).toHaveBeenCalledWith('lgtm');
  });
});
