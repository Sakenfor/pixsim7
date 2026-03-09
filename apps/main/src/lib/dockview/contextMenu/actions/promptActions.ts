/**
 * Prompt Text Context Menu Actions
 *
 * Actions shown when right-clicking inside the prompt composer textarea.
 * Data is resolved via contextDataRegistry from PromptComposer's useRegisterContextData.
 */

import type { MenuAction } from '../types';

/** Shape of context data registered by PromptComposer */
export interface PromptTextContextData {
  prompt: string;
  setPrompt: (value: string) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

function getData(ctx: { data?: any }): PromptTextContextData | null {
  return ctx.data as PromptTextContextData | null;
}

const undoAction: MenuAction = {
  id: 'prompt-text:undo',
  label: 'Undo',
  icon: 'undo-2',
  shortcut: 'Ctrl+Z',
  category: 'edit',
  availableIn: ['prompt-text'],
  disabled: (ctx) => !getData(ctx)?.canUndo,
  execute: (ctx) => getData(ctx)?.undo(),
};

const redoAction: MenuAction = {
  id: 'prompt-text:redo',
  label: 'Redo',
  icon: 'redo-2',
  shortcut: 'Ctrl+Shift+Z',
  category: 'edit',
  availableIn: ['prompt-text'],
  disabled: (ctx) => !getData(ctx)?.canRedo,
  execute: (ctx) => getData(ctx)?.redo(),
};

const copyAction: MenuAction = {
  id: 'prompt-text:copy',
  label: 'Copy prompt',
  icon: 'copy',
  shortcut: 'Ctrl+C',
  category: 'clipboard',
  availableIn: ['prompt-text'],
  disabled: (ctx) => !getData(ctx)?.prompt,
  execute: (ctx) => {
    const prompt = getData(ctx)?.prompt;
    if (prompt) void navigator.clipboard.writeText(prompt);
  },
};

const pasteAction: MenuAction = {
  id: 'prompt-text:paste',
  label: 'Paste',
  icon: 'clipboard-paste',
  shortcut: 'Ctrl+V',
  category: 'clipboard',
  availableIn: ['prompt-text'],
  execute: async (ctx) => {
    const d = getData(ctx);
    if (!d) return;
    try {
      const text = await navigator.clipboard.readText();
      if (text) d.setPrompt(text);
    } catch {
      // Clipboard access denied
    }
  },
};

const clearAction: MenuAction = {
  id: 'prompt-text:clear',
  label: 'Clear prompt',
  icon: 'x',
  category: 'edit',
  variant: 'danger',
  availableIn: ['prompt-text'],
  disabled: (ctx) => !getData(ctx)?.prompt,
  divider: true,
  execute: (ctx) => {
    const d = getData(ctx);
    if (d?.prompt) d.setPrompt('');
  },
};

export const promptActions: MenuAction[] = [
  undoAction,
  redoAction,
  copyAction,
  pasteAction,
  clearAction,
];
