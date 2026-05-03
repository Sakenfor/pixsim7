import type { NavFlyoutInfo } from './SubNavFlyout';

interface ShortcutFlyoutInfoInput {
  kind: 'panel' | 'page';
  id: string;
  title: string;
  icon?: string;
  description?: string;
  route?: string;
}

export function buildShortcutFlyoutInfo(input: ShortcutFlyoutInfoInput): NavFlyoutInfo {
  const description = input.description?.trim();
  return {
    title: input.title,
    icon: input.icon,
    kind: input.kind === 'panel' ? 'PANEL' : 'PAGE',
    meta: input.kind === 'panel' ? input.id : input.route ?? input.id,
    description: description && description.length > 0 ? description : undefined,
  };
}
