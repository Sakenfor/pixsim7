/**
 * Skinnable-panel registry.
 *
 * Skins are opt-in per panel (locked decision in plan `panel-skin-theming`).
 * A panel is "skinnable" only if it consumes tokens and self-applies via
 * `usePanelSkin`. This tiny runtime set lets surfaces that *offer* a skin
 * choice (the context-menu submenu, a future generic settings picker) show
 * the option only for panels that will actually honor it — instead of
 * threading a `skinnable` flag through the panel-definition type + 3 hosts.
 *
 * Register at bootstrap (see `panelSkins.registrations`).
 */

const _skinnable = new Set<string>();

export function registerSkinnablePanel(panelId: string): void {
  _skinnable.add(panelId);
}

export function isSkinnablePanel(panelId: string | undefined | null): boolean {
  return !!panelId && _skinnable.has(panelId);
}

export function listSkinnablePanels(): string[] {
  return Array.from(_skinnable);
}
