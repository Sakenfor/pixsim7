/**
 * SessionItem — agent-set tab identity render coverage (plan
 * `plan-participant-liveness`, checkpoint `agent-freeform-tab-identity`,
 * steps `render-subtitle` + `no-auto-guard`).
 *
 * Asserts the secondary-line slot: agent `subtitle` replaces the profile
 * label, falls back to it when unset, and an unknown `icon` name never
 * leaks as raw text into the badge (the documented fallback guard).
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { ChatTab } from '../assistantChatStore';
import { isAgentLimitError, type UnifiedProfile } from '../assistantTypes';
import { SessionItem } from '../SessionItem';

const PROFILE = {
  id: 'p1',
  label: 'Backend Persona',
  icon: 'cpu',
} as unknown as UnifiedProfile;

function makeTab(overrides: Partial<ChatTab> = {}): ChatTab {
  return {
    id: 't1',
    label: 'My Tab',
    icon: null,
    subtitle: null,
    sessionId: 's1',
    profileId: 'p1',
    engine: 'claude',
    modelOverride: null,
    reasoningEffortOverride: null,
    usePersona: true,
    customInstructions: '',
    focusAreas: [],
    injectToken: false,
    planId: null,
    createdAt: new Date().toISOString(),
    draft: null,
    ...overrides,
  };
}

const NOOP = () => {};

function renderItem(
  tab: ChatTab,
  profiles: readonly UnifiedProfile[] = [PROFILE],
  props: { hasLimitStop?: boolean; hasUnread?: boolean; hasPendingQuestion?: boolean } = {},
) {
  return render(
    <SessionItem
      tab={tab}
      isActive={false}
      profiles={profiles}
      tabCount={2}
      isSending={false}
      {...props}
      renamingTabId={null}
      renameValue=""
      onSetActive={NOOP}
      onStartRename={NOOP}
      onCommitRename={NOOP}
      onCancelRename={NOOP}
      onSetRenameValue={NOOP}
      onClose={NOOP}
    />,
  );
}

describe('SessionItem agent-set identity', () => {
  it('renders the agent subtitle in place of the profile label', () => {
    renderItem(makeTab({ subtitle: 'refactoring auth' }));
    expect(screen.getByText('refactoring auth')).toBeTruthy();
    expect(screen.queryByText('Backend Persona')).toBeNull();
  });

  it('falls back to the profile label when no subtitle is set', () => {
    renderItem(makeTab({ subtitle: null }));
    expect(screen.getByText('Backend Persona')).toBeTruthy();
  });

  it('shows no secondary line when there is neither subtitle nor profile', () => {
    renderItem(makeTab({ subtitle: null, profileId: null }), []);
    expect(screen.queryByText('Backend Persona')).toBeNull();
    expect(screen.getByText('My Tab')).toBeTruthy();
  });

  it('blank/whitespace subtitle is treated as unset (profile label wins)', () => {
    renderItem(makeTab({ subtitle: '   ' }));
    expect(screen.getByText('Backend Persona')).toBeTruthy();
  });

  it('an unknown icon name never leaks as raw text into the badge', () => {
    renderItem(makeTab({ icon: 'definitely-not-a-real-icon-xyz', subtitle: 'work' }));
    // The validity guard falls back to the profile/engine glyph rather than
    // rendering the raw string (Icon's raw-text fallback) inside the circle.
    expect(screen.queryByText('definitely-not-a-real-icon-xyz')).toBeNull();
  });

  it('marks a row whose latest turn stopped on an agent limit', () => {
    renderItem(makeTab(), [PROFILE], { hasLimitStop: true, hasUnread: true });
    expect(screen.getByTitle('Stopped: agent session or rate limit hit')).toBeTruthy();
  });
});

describe('assistant limit error detection', () => {
  it('matches Claude session-limit text and the bridge rate-limit code', () => {
    expect(isAgentLimitError("You've hit your session limit · resets 5:20am (Europe/Belgrade)")).toBe(true);
    expect(isAgentLimitError({ error_code: 'agent_rate_limited', error: 'Rate limited' })).toBe(true);
    expect(isAgentLimitError({ response: "You've hit your session limit - resets 5:20am" })).toBe(true);
    expect(isAgentLimitError('Request timed out - no response from agent.')).toBe(false);
  });
});
