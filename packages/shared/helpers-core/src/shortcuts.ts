/**
 * Keyboard Shortcut Parsing Utilities
 *
 * Pure TypeScript utilities for parsing keyboard shortcut strings
 * into structured shortcut definitions.
 *
 * @module @pixsim7/shared.helpers-core/shortcuts
 */

export type ParsedShortcut = {
  key: string;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  meta?: boolean;
};

export const MODIFIER_ALIASES: Record<string, keyof Omit<ParsedShortcut, 'key'>> = {
  ctrl: 'ctrl',
  control: 'ctrl',
  ctl: 'ctrl',
  shift: 'shift',
  alt: 'alt',
  option: 'alt',
  opt: 'alt',
  meta: 'meta',
  cmd: 'meta',
  command: 'meta',
};

export const KEY_ALIASES: Record<string, string> = {
  esc: 'escape',
  escape: 'escape',
  del: 'delete',
  delete: 'delete',
  return: 'enter',
  enter: 'enter',
  space: ' ',
  spacebar: ' ',
  left: 'arrowleft',
  right: 'arrowright',
  up: 'arrowup',
  down: 'arrowdown',
};

function normalizeToken(token: string): string {
  return token.trim().toLowerCase();
}

/**
 * Parse a keyboard shortcut string into a structured shortcut definition.
 *
 * @param input - Shortcut string (e.g., 'Ctrl+Shift+A', 'Cmd+K')
 * @returns ParsedShortcut or null if invalid
 *
 * @example
 * ```typescript
 * parseShortcutString('Ctrl+Shift+A')
 * // => { key: 'a', ctrl: true, shift: true }
 *
 * parseShortcutString('Cmd+K')
 * // => { key: 'k', meta: true }
 * ```
 */
export function parseShortcutString(input: string): ParsedShortcut | null {
  const rawTokens = input
    .split('+')
    .map((token) => token.trim())
    .filter(Boolean);

  let key: string | null = null;
  const modifiers: ParsedShortcut = { key: '' };

  for (const token of rawTokens) {
    const normalized = normalizeToken(token);
    const modifier = MODIFIER_ALIASES[normalized];
    if (modifier) {
      modifiers[modifier] = true;
      continue;
    }

    key = KEY_ALIASES[normalized] ?? normalized;
  }

  if (!key) {
    return null;
  }

  return { ...modifiers, key };
}

/**
 * Generate a unique signature string for a shortcut.
 * Used for deduplication and conflict detection.
 *
 * @param shortcut - Parsed shortcut
 * @returns Signature string
 *
 * @example
 * ```typescript
 * getShortcutSignature({ key: 'a', ctrl: true, shift: true })
 * // => 'a|1|1|0|0'
 * ```
 */
export function getShortcutSignature(shortcut: ParsedShortcut): string {
  return [
    shortcut.key,
    shortcut.ctrl ? '1' : '0',
    shortcut.shift ? '1' : '0',
    shortcut.alt ? '1' : '0',
    shortcut.meta ? '1' : '0',
  ].join('|');
}
