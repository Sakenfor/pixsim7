/**
 * Dev Context Actions
 *
 * Context menu action that builds a context snapshot from the current panel
 * and sends it to the AI Assistant panel. DEV-only.
 */

import { useToastStore } from '@pixsim7/shared.ui';

import { devContextRegistry, type DevContextSnapshot } from '../devContext';
import type { MenuAction, MenuActionContext } from '../types';

const INJECT_PROMPT_EVENT = 'ai-assistant:inject-prompt';

function formatContextAsPrompt(snapshot: DevContextSnapshot): string {
  const lines: string[] = [];

  lines.push(`I'm looking at the **${snapshot.panelTitle}** panel.`);
  lines.push('');
  lines.push(`> ${snapshot.summary}`);

  if (snapshot.state) {
    lines.push('');
    lines.push('Current state:');
    for (const [key, value] of Object.entries(snapshot.state)) {
      if (value == null) continue;
      lines.push(`- **${key}**: ${value}`);
    }
  }

  if (snapshot.keyFiles?.length) {
    lines.push('');
    lines.push('Key source files:');
    for (const file of snapshot.keyFiles) {
      lines.push(`- \`${file}\``);
    }
  }

  if (snapshot.notes?.length) {
    lines.push('');
    lines.push('Notes:');
    for (const note of snapshot.notes) {
      lines.push(`- ${note}`);
    }
  }

  lines.push('');
  lines.push('Help me understand or debug this.');

  return lines.join('\n');
}

function resolveContextForPanel(ctx: MenuActionContext): DevContextSnapshot | null {
  const panelId = ctx.panelId;
  if (!panelId) return null;

  // Strip instance suffix (e.g. "prompt-authoring-editor_1" → "prompt-authoring-editor")
  const basePanelId = panelId.replace(/_\d+$/, '');

  const provider = devContextRegistry.get(basePanelId) ?? devContextRegistry.get(panelId);
  if (!provider) return null;

  try {
    return provider();
  } catch {
    return null;
  }
}

function buildFallbackContext(ctx: MenuActionContext): DevContextSnapshot {
  const panelId = ctx.panelId ?? 'unknown';
  return {
    panelId,
    panelTitle: panelId.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
    summary: `Panel "${panelId}" is open (no dev context registered).`,
    notes: ['This panel has no dev context provider — register one with useRegisterDevContext().'],
  };
}

const sendToAssistantAction: MenuAction = {
  id: 'dev:send-to-ai-assistant',
  label: 'Send Context to AI Assistant',
  icon: 'messageSquare',
  availableIn: ['panel-content', 'tab'],
  visible: () => import.meta.env.DEV,
  execute: (ctx) => {
    const snapshot = resolveContextForPanel(ctx) ?? buildFallbackContext(ctx);
    const prompt = formatContextAsPrompt(snapshot);

    window.dispatchEvent(
      new CustomEvent(INJECT_PROMPT_EVENT, {
        detail: { prompt, mode: 'replace' },
      }),
    );

    useToastStore.getState().addToast({
      type: 'info',
      message: `Context from "${snapshot.panelTitle}" sent to AI Assistant`,
      duration: 3000,
    });
  },
};

const copyContextAction: MenuAction = {
  id: 'dev:copy-panel-context',
  label: 'Copy Panel Context',
  icon: 'copy',
  availableIn: ['panel-content', 'tab'],
  visible: () => import.meta.env.DEV,
  execute: async (ctx) => {
    const snapshot = resolveContextForPanel(ctx) ?? buildFallbackContext(ctx);
    const text = JSON.stringify(snapshot, null, 2);

    try {
      await navigator.clipboard.writeText(text);
      useToastStore.getState().addToast({
        type: 'success',
        message: 'Panel context copied to clipboard',
        duration: 2500,
      });
    } catch {
      console.log('[DevContext]', snapshot);
      useToastStore.getState().addToast({
        type: 'info',
        message: 'Panel context logged to console',
        duration: 2500,
      });
    }
  },
};

const devContextSubmenuAction: MenuAction = {
  id: 'dev:context',
  label: 'AI Context',
  icon: 'brain',
  category: 'debug',
  hideWhenEmpty: true,
  availableIn: ['panel-content', 'tab'],
  visible: () => import.meta.env.DEV,
  children: [
    { ...sendToAssistantAction, category: undefined },
    { ...copyContextAction, category: undefined },
  ],
  execute: () => {},
};

export const devContextActions: MenuAction[] = [devContextSubmenuAction];
