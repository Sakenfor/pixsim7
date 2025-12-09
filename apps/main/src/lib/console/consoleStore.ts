/**
 * Console Store
 *
 * Manages console history, output, and state for the console panel.
 */

import { create } from 'zustand';

export interface ConsoleEntry {
  id: string;
  timestamp: number;
  type: 'input' | 'output' | 'error' | 'info';
  content: string;
  /** For input entries, the evaluated result */
  result?: unknown;
}

export interface ConsoleState {
  /** Command history */
  history: ConsoleEntry[];
  /** Current command history index for up/down navigation */
  historyIndex: number;
  /** Input command history (just the commands, for up/down navigation) */
  commandHistory: string[];
  /** Whether the console is expanded */
  isExpanded: boolean;
  /** Maximum history entries */
  maxHistory: number;
}

export interface ConsoleActions {
  /** Add an entry to history */
  addEntry: (entry: Omit<ConsoleEntry, 'id' | 'timestamp'>) => void;
  /** Execute a command and add input/output to history */
  execute: (command: string, executor: (cmd: string) => unknown) => void;
  /** Clear history */
  clear: () => void;
  /** Navigate history up */
  historyUp: () => string | null;
  /** Navigate history down */
  historyDown: () => string | null;
  /** Reset history navigation */
  resetHistoryNav: () => void;
  /** Toggle expanded state */
  toggleExpanded: () => void;
}

let entryIdCounter = 0;

export const useConsoleStore = create<ConsoleState & ConsoleActions>((set, get) => ({
  history: [],
  historyIndex: -1,
  commandHistory: [],
  isExpanded: true,
  maxHistory: 1000,

  addEntry: (entry) => {
    const newEntry: ConsoleEntry = {
      ...entry,
      id: `entry_${++entryIdCounter}`,
      timestamp: Date.now(),
    };
    set((state) => {
      const history = [...state.history, newEntry];
      // Trim if over max
      if (history.length > state.maxHistory) {
        return { history: history.slice(-state.maxHistory) };
      }
      return { history };
    });
  },

  execute: (command, executor) => {
    const trimmed = command.trim();
    if (!trimmed) return;

    // Add input entry
    get().addEntry({ type: 'input', content: trimmed });

    // Add to command history for up/down navigation
    set((state) => ({
      commandHistory: [...state.commandHistory.filter((c) => c !== trimmed), trimmed],
      historyIndex: -1,
    }));

    // Execute and capture result
    try {
      const result = executor(trimmed);
      if (result !== undefined) {
        const resultStr = typeof result === 'object' ? JSON.stringify(result, null, 2) : String(result);
        get().addEntry({ type: 'output', content: resultStr, result });
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      get().addEntry({ type: 'error', content: errMsg });
    }
  },

  clear: () => {
    set({ history: [], historyIndex: -1 });
    get().addEntry({ type: 'info', content: 'Console cleared' });
  },

  historyUp: () => {
    const { commandHistory, historyIndex } = get();
    if (commandHistory.length === 0) return null;

    const newIndex = historyIndex < 0 ? commandHistory.length - 1 : Math.max(0, historyIndex - 1);
    set({ historyIndex: newIndex });
    return commandHistory[newIndex] ?? null;
  },

  historyDown: () => {
    const { commandHistory, historyIndex } = get();
    if (historyIndex < 0) return null;

    const newIndex = historyIndex + 1;
    if (newIndex >= commandHistory.length) {
      set({ historyIndex: -1 });
      return '';
    }
    set({ historyIndex: newIndex });
    return commandHistory[newIndex] ?? null;
  },

  resetHistoryNav: () => {
    set({ historyIndex: -1 });
  },

  toggleExpanded: () => {
    set((state) => ({ isExpanded: !state.isExpanded }));
  },
}));
