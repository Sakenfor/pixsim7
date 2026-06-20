import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import type { ScopeDraft } from './agentScopeDraft';
import { ProfileScopeSummary, type ScopeOptionMaps } from './ProfileScopeSummary';

// cp4: the read-only effective-grants summary reused by AccountView (cp5). Verify it
// renders each field's mode and resolves ids to option labels (raw id fallback).

afterEach(cleanup);

const options: ScopeOptionMaps = {
  plans: [{ value: 'plan-a', label: 'Plan A' }],
  worlds: [{ value: 'world:42', label: 'Bananza — sakenfor (#42)' }],
  projects: [],
  contracts: [],
};

describe('ProfileScopeSummary', () => {
  it('renders each field mode and resolves ids to labels', () => {
    const draft: ScopeDraft = {
      plans: { mode: 'restricted', ids: ['plan-a'] },
      worlds: { mode: 'restricted', ids: ['world:42'] },
      projects: { mode: 'unrestricted', ids: [] },
      contracts: { mode: 'deny', ids: [] },
    };
    render(<ProfileScopeSummary draft={draft} options={options} />);
    expect(screen.getByText('Plan A')).toBeTruthy(); // resolved plan label
    expect(screen.getByText('Bananza — sakenfor (#42)')).toBeTruthy(); // resolved world label
    expect(screen.getByText('Unrestricted')).toBeTruthy(); // projects
    expect(screen.getByText('Deny all')).toBeTruthy(); // contracts
  });

  it('falls back to the raw id when no option label exists', () => {
    const draft: ScopeDraft = {
      plans: { mode: 'restricted', ids: ['plan-unknown'] },
      worlds: { mode: 'unrestricted', ids: [] },
      projects: { mode: 'unrestricted', ids: [] },
      contracts: { mode: 'unrestricted', ids: [] },
    };
    render(<ProfileScopeSummary draft={draft} options={options} />);
    expect(screen.getByText('plan-unknown')).toBeTruthy();
  });

  it('shows "none" for an empty restricted selection (effective deny)', () => {
    const draft: ScopeDraft = {
      plans: { mode: 'restricted', ids: [] },
      worlds: { mode: 'unrestricted', ids: [] },
      projects: { mode: 'unrestricted', ids: [] },
      contracts: { mode: 'unrestricted', ids: [] },
    };
    render(<ProfileScopeSummary draft={draft} options={options} />);
    expect(screen.getByText('none')).toBeTruthy();
  });
});
