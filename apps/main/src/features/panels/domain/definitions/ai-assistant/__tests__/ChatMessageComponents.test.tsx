/**
 * MessageBubble copy-action visibility tests.
 */
export const TEST_SUITE = {
  id: 'assistant-chat-message-bubble-copy',
  label: 'AI Assistant Message Bubble Copy Action',
  kind: 'unit',
  category: 'frontend/ai-assistant',
  subcategory: 'rendering',
  covers: ['apps/main/src/features/panels/domain/definitions/ai-assistant/ChatMessageComponents.tsx'],
  order: 40.4,
};

import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ChatMessage } from '../assistantChatStore';
import { MessageBubble } from '../ChatMessageComponents';

function makeMessage(role: ChatMessage['role']): ChatMessage {
  return {
    role,
    text: role === 'assistant' ? 'Assistant response' : 'User text',
    timestamp: new Date('2026-05-25T10:00:00Z'),
  };
}

function setMatchMedia(matches: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation(() => ({
      matches,
      media: '(hover: hover) and (pointer: fine)',
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('MessageBubble copy action', () => {
  it('shows copy action for assistant messages', () => {
    setMatchMedia(true);
    render(<MessageBubble msg={makeMessage('assistant')} engine="claude" profileIcon="cpu" />);
    expect(screen.getByLabelText('Copy message')).toBeTruthy();
  });

  it('shows copy action for user messages', () => {
    setMatchMedia(true);
    render(<MessageBubble msg={makeMessage('user')} engine="claude" profileIcon="cpu" />);
    expect(screen.getByLabelText('Copy message')).toBeTruthy();
  });

  it('uses hover-only action visibility on hover-capable devices', () => {
    setMatchMedia(true);
    render(<MessageBubble msg={makeMessage('assistant')} engine="claude" profileIcon="cpu" />);
    const actions = screen.getByLabelText('Copy message').parentElement;
    expect(actions?.className).toContain('opacity-0');
    expect(actions?.className).toContain('group-hover:opacity-100');
  });

  it('keeps action visible on touch/coarse-pointer devices', () => {
    setMatchMedia(false);
    render(<MessageBubble msg={makeMessage('assistant')} engine="claude" profileIcon="cpu" />);
    const actions = screen.getByLabelText('Copy message').parentElement;
    expect(actions?.className).toContain('opacity-100');
  });

  it('shows text label on touch/coarse-pointer devices for easier tapping', () => {
    setMatchMedia(false);
    render(<MessageBubble msg={makeMessage('assistant')} engine="claude" profileIcon="cpu" />);
    expect(screen.getByText('Copy')).toBeTruthy();
  });
});
