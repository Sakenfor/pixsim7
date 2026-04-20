export const DRAG_MIME = 'application/x-pixsim7-panel-shortcut';

export type ShortcutKind = 'panel' | 'page' | 'group';

export interface ParsedShortcut {
  kind: ShortcutKind;
  id: string;
}

/** Build a shortcut key string stored in pinnedShortcuts + dragged via DRAG_MIME. */
export function shortcutKey(kind: ShortcutKind, id: string): string {
  return `${kind}:${id}`;
}

/** Parse 'panel:id' / 'page:id' — returns null for malformed input. */
export function parseShortcutKey(key: string): ParsedShortcut | null {
  const sep = key.indexOf(':');
  if (sep === -1) return null;
  const kind = key.slice(0, sep);
  const id = key.slice(sep + 1);
  if ((kind !== 'panel' && kind !== 'page' && kind !== 'group') || !id) return null;
  return { kind, id };
}

/** Filter a shortcut-key list to panel IDs only (for consumers that only handle panels). */
export function pinnedPanelIdsFrom(shortcuts: readonly string[]): string[] {
  const out: string[] = [];
  for (const key of shortcuts) {
    const parsed = parseShortcutKey(key);
    if (parsed?.kind === 'panel') out.push(parsed.id);
  }
  return out;
}
