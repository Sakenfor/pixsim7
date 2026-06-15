/* eslint-disable react-refresh/only-export-components */
/**
 * Session Theme Override World Tool Plugin
 *
 * Session-scoped tool for applying a temporary theme override (dream
 * sequences, flashbacks, dramatic moments) without changing the world's base
 * theme. Formerly the "Session Override" tab of the dissolved GameThemingPanel;
 * now backed by `useSessionThemeOverrideStore`, which `useWorldTheme` reads, so
 * applying an override actually takes effect.
 */

import { useSessionThemeOverrideStore } from '@lib/theming';

import { SessionOverridePanel } from '@/components/game/panels/SessionOverridePanel';

import type { WorldToolPlugin } from '../lib/types';

function SessionThemeOverrideToolBody() {
  const currentOverride = useSessionThemeOverrideStore((s) => s.currentOverride);
  const applyOverride = useSessionThemeOverrideStore((s) => s.applyOverride);
  const clearOverride = useSessionThemeOverrideStore((s) => s.clearOverride);

  return (
    <SessionOverridePanel
      currentOverride={currentOverride ?? undefined}
      onApplyOverride={applyOverride}
      onClearOverride={clearOverride}
    />
  );
}

export const sessionThemeOverrideTool: WorldToolPlugin = {
  id: 'session-theme-override',
  name: 'Session Theme Override',
  description: 'Apply a temporary theme override for the current session',
  icon: '✨',
  category: 'utility',

  whenVisible: (context) => context.session !== null,

  render: () => <SessionThemeOverrideToolBody />,
};
