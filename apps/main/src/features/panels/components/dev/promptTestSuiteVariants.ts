/**
 * Variant position model + serializer for the Prompt Test Suite panel.
 *
 * A variant is `(token, position)`.  Given a base prompt and its detected
 * sections, serialize() produces the concrete prompt string that will be
 * fired at the generator.
 */

import type { DetectedSection } from './promptTestSuiteSections';

export type VariantPositionMode =
  | 'top'
  | 'bottom'
  | 'before'
  | 'after'
  | 'inline-prepend'
  | 'inline-append'
  | 'replace';

export interface VariantPosition {
  mode: VariantPositionMode;
  /** Label of the target section.  Required for all modes except top/bottom. */
  ref?: string;
}

export interface VariantSpec {
  id: string;
  token: string;
  position: VariantPosition;
}

export function positionLabel(pos: VariantPosition): string {
  switch (pos.mode) {
    case 'top':
      return 'Top';
    case 'bottom':
      return 'Bottom';
    case 'before':
      return `Before ${pos.ref ?? '?'}`;
    case 'after':
      return `After ${pos.ref ?? '?'}`;
    case 'inline-prepend':
      return `Inline ${pos.ref ?? '?'} start`;
    case 'inline-append':
      return `Inline ${pos.ref ?? '?'} end`;
    case 'replace':
      return `Replace ${pos.ref ?? '?'}`;
  }
}

/**
 * Serialize a variant into its final prompt string.
 * Returns the base prompt unchanged if token is empty or position is
 * missing a required ref.
 */
export function serializeVariant(
  basePrompt: string,
  sections: DetectedSection[],
  variant: VariantSpec,
): string {
  const token = variant.token.trim();
  if (!token) return basePrompt;

  const { mode, ref } = variant.position;

  if (mode === 'top') {
    return `${token}\n${basePrompt}`;
  }
  if (mode === 'bottom') {
    const sep = basePrompt.endsWith('\n') ? '' : '\n';
    return `${basePrompt}${sep}${token}`;
  }

  if (!ref) return basePrompt;
  const target = sections.find((s) => s.label === ref);
  if (!target) return basePrompt;

  const [hStart, hEnd] = target.headerRange;
  const [bStart, bEnd] = target.bodyRange;

  switch (mode) {
    case 'before':
      return `${basePrompt.slice(0, hStart)}${token}\n${basePrompt.slice(hStart)}`;
    case 'after':
      return `${basePrompt.slice(0, bEnd)}\n${token}\n${basePrompt.slice(bEnd)}`;
    case 'inline-prepend': {
      const body = basePrompt.slice(bStart, bEnd);
      const trimmed = body.replace(/^\s+/, '');
      const leading = body.slice(0, body.length - trimmed.length);
      return `${basePrompt.slice(0, bStart)}${leading}${token} ${trimmed}${basePrompt.slice(bEnd)}`;
    }
    case 'inline-append': {
      const body = basePrompt.slice(bStart, bEnd);
      const trimmed = body.replace(/\s+$/, '');
      const trailing = body.slice(trimmed.length);
      return `${basePrompt.slice(0, bStart)}${trimmed} ${token}${trailing}${basePrompt.slice(bEnd)}`;
    }
    case 'replace': {
      // Replace body (keep header intact)
      return `${basePrompt.slice(0, bStart)} ${token}\n${basePrompt.slice(bEnd)}`;
    }
  }
}

/**
 * Build an ordered list of (mode, ref?) option specs for a position picker.
 * Top/Bottom are always present; ref-dependent modes are emitted per section.
 */
export interface PositionOption {
  value: string;
  label: string;
  position: VariantPosition;
}

export function buildPositionOptions(sections: DetectedSection[]): PositionOption[] {
  const opts: PositionOption[] = [
    { value: 'top', label: 'Top (prepend)', position: { mode: 'top' } },
    { value: 'bottom', label: 'Bottom (append)', position: { mode: 'bottom' } },
  ];
  for (const s of sections) {
    opts.push(
      { value: `before:${s.label}`, label: `Before ${s.label}`, position: { mode: 'before', ref: s.label } },
      { value: `after:${s.label}`, label: `After ${s.label}`, position: { mode: 'after', ref: s.label } },
      { value: `inline-prepend:${s.label}`, label: `Inline ${s.label} · start`, position: { mode: 'inline-prepend', ref: s.label } },
      { value: `inline-append:${s.label}`, label: `Inline ${s.label} · end`, position: { mode: 'inline-append', ref: s.label } },
      { value: `replace:${s.label}`, label: `Replace ${s.label}`, position: { mode: 'replace', ref: s.label } },
    );
  }
  return opts;
}

export function positionToValue(pos: VariantPosition): string {
  if (pos.mode === 'top' || pos.mode === 'bottom') return pos.mode;
  return `${pos.mode}:${pos.ref ?? ''}`;
}

export function valueToPosition(value: string): VariantPosition {
  if (value === 'top') return { mode: 'top' };
  if (value === 'bottom') return { mode: 'bottom' };
  const idx = value.indexOf(':');
  if (idx === -1) return { mode: 'top' };
  const mode = value.slice(0, idx) as VariantPositionMode;
  const ref = value.slice(idx + 1);
  return { mode, ref };
}
