import { describe, expect, it } from 'vitest';

import {
  buildPauseMessage,
  formatIds,
  pauseReasonLabel,
  type PausedEntry,
} from '../pauseToastMessage';

describe('pauseReasonLabel', () => {
  it('maps the concurrent-limit quarantine code', () => {
    expect(pauseReasonLabel({ errorCode: 'provider_concurrent_limit_quarantine' }))
      .toBe('Prompt/image quarantine');
  });

  it('collapses the content-moderation family to "Content filtered"', () => {
    expect(pauseReasonLabel({ errorCode: 'content_filtered' })).toBe('Content filtered');
    expect(pauseReasonLabel({ errorCode: 'content_output_rejected' })).toBe('Content filtered');
    expect(pauseReasonLabel({ errorCode: 'content_render_moderated' })).toBe('Content filtered');
  });

  it('distinguishes prompt and image rejections', () => {
    expect(pauseReasonLabel({ errorCode: 'content_prompt_rejected' })).toBe('Prompt rejected');
    expect(pauseReasonLabel({ errorCode: 'content_image_rejected' })).toBe('Image rejected');
  });

  it('falls back to a generic label for unknown/missing codes', () => {
    expect(pauseReasonLabel({ errorCode: null })).toBe('Paused');
    expect(pauseReasonLabel({ errorCode: 'something_new' })).toBe('Paused');
  });
});

describe('formatIds', () => {
  it('lists ids verbatim under the cap', () => {
    expect(formatIds([1, 2, 3])).toBe('#1, #2, #3');
  });

  it('truncates past the cap with a +N more suffix', () => {
    expect(formatIds([1, 2, 3, 4, 5, 6, 7, 8])).toBe('#1, #2, #3, #4, #5, #6 +2 more');
  });
});

describe('buildPauseMessage', () => {
  const entry = (id: number, reason: string): PausedEntry => ({ id, reason });

  it('names the single generation and its reason', () => {
    expect(buildPauseMessage([entry(142251, 'Prompt/image quarantine')]))
      .toBe('Generation #142251 paused — Prompt/image quarantine');
  });

  it('coalesces a same-reason burst into one toast with the ids', () => {
    const msg = buildPauseMessage([
      entry(142251, 'Prompt/image quarantine'),
      entry(142252, 'Prompt/image quarantine'),
      entry(142253, 'Prompt/image quarantine'),
    ]);
    expect(msg).toBe('3 generations paused — Prompt/image quarantine · #142251, #142252, #142253');
  });

  it('breaks down a mixed-reason burst by reason', () => {
    const msg = buildPauseMessage([
      entry(1, 'Prompt/image quarantine'),
      entry(2, 'Content filtered'),
      entry(3, 'Prompt/image quarantine'),
    ]);
    expect(msg).toBe('3 generations paused · Prompt/image quarantine (2), Content filtered (1)');
  });
});
