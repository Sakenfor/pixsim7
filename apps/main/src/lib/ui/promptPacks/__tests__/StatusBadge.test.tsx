import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { StatusBadge } from '../StatusBadge';
import {
  compileStatusVariant,
  reviewStatusVariant,
  visibilityVariant,
} from '../statusVariants';

describe('StatusBadge', () => {
  it('renders children and a title attribute', () => {
    render(
      <StatusBadge variant="success" title="explainer text">
        active
      </StatusBadge>,
    );
    const el = screen.getByText('active');
    expect(el).toBeDefined();
    expect(el.getAttribute('title')).toBe('explainer text');
    // emerald = the success variant token
    expect(el.className).toMatch(/emerald/);
  });

  it('falls back to neutral variant', () => {
    render(<StatusBadge>idle</StatusBadge>);
    const el = screen.getByText('idle');
    expect(el.className).toMatch(/neutral/);
  });
});

describe('compileStatusVariant', () => {
  it('maps compile_ok to success', () => {
    expect(compileStatusVariant('compile_ok')).toBe('success');
  });
  it('flags fail/error strings as danger', () => {
    expect(compileStatusVariant('parse_failed')).toBe('danger');
    expect(compileStatusVariant('cue_error')).toBe('danger');
  });
  it('falls back to warning for in-flight states', () => {
    expect(compileStatusVariant('compiling')).toBe('warning');
  });
  it('treats null / empty as neutral', () => {
    expect(compileStatusVariant(null)).toBe('neutral');
    expect(compileStatusVariant(undefined)).toBe('neutral');
  });
});

describe('reviewStatusVariant', () => {
  it('maps each review state to a distinct variant', () => {
    expect(reviewStatusVariant('approved')).toBe('success');
    expect(reviewStatusVariant('rejected')).toBe('danger');
    expect(reviewStatusVariant('submitted')).toBe('warning');
    expect(reviewStatusVariant('draft')).toBe('neutral');
    expect(reviewStatusVariant(null)).toBe('neutral');
  });
});

describe('visibilityVariant', () => {
  it('maps each visibility to a distinct variant', () => {
    expect(visibilityVariant('shared')).toBe('success');
    expect(visibilityVariant('approved')).toBe('info');
    expect(visibilityVariant('private')).toBe('neutral');
    expect(visibilityVariant(null)).toBe('neutral');
  });
});
