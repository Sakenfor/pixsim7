/**
 * Console Panel
 *
 * Interactive command console for the pixsim namespace.
 * Supports command execution, history navigation, and autocomplete.
 */

import { useRef, useState, useEffect, useCallback, useMemo } from "react";
import { ThemedIcon } from "@lib/icons";
import { useConsoleStore } from "@lib/console";
import { pixsim } from "@lib/console";

/**
 * Get completions for a partial path in the pixsim namespace
 */
function getCompletions(input: string): {
  completions: string[];
  prefix: string;
  partial: string;
} {
  // Find the last expression that starts with 'pixsim'
  const match = input.match(
    /(pixsim(?:\.[a-zA-Z_][a-zA-Z0-9_]*)*)\.?([a-zA-Z_][a-zA-Z0-9_]*)?$/,
  );
  if (!match) {
    return { completions: [], prefix: "", partial: "" };
  }

  const fullPath = match[1]; // e.g., "pixsim.data"
  const partial = match[2] || ""; // e.g., "wo" (partial property name)
  const prefix = input.slice(0, input.length - partial.length); // Everything before partial

  // Navigate to the object at fullPath
  const parts = fullPath.split(".");
  let current: unknown = { pixsim };

  for (const part of parts) {
    if (current && typeof current === "object" && part in current) {
      current = (current as Record<string, unknown>)[part];
    } else {
      return { completions: [], prefix, partial };
    }
  }

  // Get available keys
  let keys: string[] = [];

  if (current && typeof current === "object") {
    // Check for __keys__ (our custom introspection)
    if ("__keys__" in current) {
      const k = (current as Record<string, unknown>).__keys__;
      if (Array.isArray(k)) {
        keys = k as string[];
      }
    } else {
      // Fall back to Object.keys
      keys = Object.keys(current).filter((k) => !k.startsWith("_"));
    }
  }

  // Filter by partial match
  const filtered = partial
    ? keys.filter((k) => k.toLowerCase().startsWith(partial.toLowerCase()))
    : keys;

  return { completions: filtered.sort(), prefix, partial };
}

export function ConsolePanel() {
  const inputRef = useRef<HTMLInputElement>(null);
  const outputRef = useRef<HTMLDivElement>(null);
  const [input, setInput] = useState("");
  const [showCompletions, setShowCompletions] = useState(false);
  const [selectedCompletion, setSelectedCompletion] = useState(0);

  const { history, execute, clear, historyUp, historyDown, resetHistoryNav } =
    useConsoleStore();

  // Compute completions when input changes
  const { completions, prefix } = useMemo(() => getCompletions(input), [input]);

  // Auto-scroll to bottom on new entries
  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [history]);

  // Reset completion selection when completions change
  useEffect(() => {
    setSelectedCompletion(0);
  }, [completions.length]);

  // Apply selected completion
  const applyCompletion = useCallback(
    (completion: string) => {
      setInput(prefix + completion);
      setShowCompletions(false);
      inputRef.current?.focus();
    },
    [prefix],
  );

  // Execute command
  const handleExecute = useCallback(() => {
    if (!input.trim()) return;

    execute(input, (cmd) => {
      // Create execution context with pixsim namespace
      const evalContext = { pixsim };

      // Try to evaluate as expression or statement
      try {
        // First try as expression
        const fn = new Function("pixsim", `return (${cmd})`);
        return fn(evalContext.pixsim);
      } catch {
        // Try as statement
        const fn = new Function("pixsim", cmd);
        return fn(evalContext.pixsim);
      }
    });

    setInput("");
    setShowCompletions(false);
    resetHistoryNav();
  }, [input, execute, resetHistoryNav]);

  // Handle keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      // Tab: autocomplete
      if (e.key === "Tab") {
        e.preventDefault();
        if (completions.length > 0) {
          if (showCompletions) {
            // Apply selected completion
            applyCompletion(completions[selectedCompletion]);
          } else if (completions.length === 1) {
            // Single completion - apply directly
            applyCompletion(completions[0]);
          } else {
            // Multiple completions - show dropdown
            setShowCompletions(true);
          }
        }
        return;
      }

      // Escape: hide completions
      if (e.key === "Escape") {
        setShowCompletions(false);
        return;
      }

      // When completions are shown, arrow keys navigate them
      if (showCompletions && completions.length > 0) {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setSelectedCompletion((prev) => (prev + 1) % completions.length);
          return;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          setSelectedCompletion(
            (prev) => (prev - 1 + completions.length) % completions.length,
          );
          return;
        }
        if (e.key === "Enter") {
          e.preventDefault();
          applyCompletion(completions[selectedCompletion]);
          return;
        }
      }

      // Enter: execute
      if (e.key === "Enter") {
        e.preventDefault();
        handleExecute();
        return;
      }

      // Arrow up/down: history navigation (when completions not shown)
      if (e.key === "ArrowUp") {
        e.preventDefault();
        const prev = historyUp();
        if (prev !== null) setInput(prev);
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        const next = historyDown();
        if (next !== null) setInput(next);
        return;
      }

      // Ctrl+L: clear
      if (e.key === "l" && e.ctrlKey) {
        e.preventDefault();
        clear();
        return;
      }

      // Period: show completions after typing a dot
      if (e.key === ".") {
        // Will show after state updates
        setTimeout(() => setShowCompletions(true), 0);
      }
    },
    [
      handleExecute,
      historyUp,
      historyDown,
      clear,
      completions,
      showCompletions,
      selectedCompletion,
      applyCompletion,
    ],
  );

  // Hide completions when clicking outside
  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setInput(e.target.value);
      // Auto-show completions when typing after a dot
      if (e.target.value.endsWith(".")) {
        setShowCompletions(true);
      }
    },
    [],
  );

  // Format entry for display
  const formatEntry = (entry: (typeof history)[0]) => {
    switch (entry.type) {
      case "input":
        return (
          <div className="flex gap-2">
            <span className="text-purple-400 select-none">&gt;</span>
            <span className="text-neutral-100 font-mono">{entry.content}</span>
          </div>
        );
      case "output":
        return (
          <div className="pl-4 text-green-400 font-mono whitespace-pre-wrap break-all">
            {entry.content}
          </div>
        );
      case "error":
        return (
          <div className="pl-4 text-red-400 font-mono">
            <span className="text-red-500">Error:</span> {entry.content}
          </div>
        );
      case "info":
        return (
          <div className="pl-4 text-neutral-500 italic font-mono">
            {entry.content}
          </div>
        );
      default:
        return (
          <div className="pl-4 text-neutral-400 font-mono">{entry.content}</div>
        );
    }
  };

  return (
    <div className="flex flex-col h-full bg-neutral-900 text-xs">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-neutral-800 bg-neutral-900/80">
        <div className="flex items-center gap-2">
          <ThemedIcon name="code" size={14} variant="muted" />
          <span className="text-[11px] font-medium text-neutral-300">
            Console
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={clear}
            className="p-1 rounded hover:bg-neutral-800 text-neutral-500 hover:text-neutral-300 transition-colors"
            title="Clear (Ctrl+L)"
          >
            <ThemedIcon name="trash" size={12} variant="muted" />
          </button>
          <button
            onClick={() => pixsim.help()}
            className="p-1 rounded hover:bg-neutral-800 text-neutral-500 hover:text-neutral-300 transition-colors"
            title="Help"
          >
            <ThemedIcon name="info" size={12} variant="muted" />
          </button>
        </div>
      </div>

      {/* Output area */}
      <div
        ref={outputRef}
        className="flex-1 overflow-auto p-2 space-y-1 font-mono text-[11px]"
        onClick={() => inputRef.current?.focus()}
      >
        {history.length === 0 && (
          <div className="text-neutral-600 italic">
            Type <span className="text-purple-400">pixsim.help()</span> for
            usage, press <span className="text-purple-400">Tab</span> for
            autocomplete
          </div>
        )}
        {history.map((entry) => (
          <div key={entry.id}>{formatEntry(entry)}</div>
        ))}
      </div>

      {/* Input area with autocomplete */}
      <div className="relative">
        {/* Autocomplete dropdown */}
        {showCompletions && completions.length > 0 && (
          <div className="absolute bottom-full left-0 right-0 mb-1 mx-2 bg-neutral-800 border border-neutral-700 rounded shadow-lg max-h-40 overflow-auto z-10">
            {completions.map((completion, idx) => (
              <button
                key={completion}
                className={`w-full text-left px-2 py-1 text-[11px] font-mono ${
                  idx === selectedCompletion
                    ? "bg-purple-600 text-white"
                    : "text-neutral-300 hover:bg-neutral-700"
                }`}
                onClick={() => applyCompletion(completion)}
                onMouseEnter={() => setSelectedCompletion(idx)}
              >
                {completion}
              </button>
            ))}
          </div>
        )}

        <div className="flex items-center gap-2 px-2 py-1.5 border-t border-neutral-800 bg-neutral-950">
          <span className="text-purple-400 select-none font-mono">&gt;</span>
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            onBlur={() => setTimeout(() => setShowCompletions(false), 150)}
            placeholder="pixsim.data.__keys__"
            className="flex-1 bg-transparent border-none outline-none text-neutral-100 font-mono text-[11px] placeholder:text-neutral-600"
            spellCheck={false}
            autoComplete="off"
          />
          <button
            onClick={handleExecute}
            disabled={!input.trim()}
            className="px-2 py-0.5 rounded bg-purple-600 hover:bg-purple-500 disabled:bg-neutral-800 disabled:text-neutral-600 text-white text-[10px] font-medium transition-colors"
          >
            Run
          </button>
        </div>
      </div>
    </div>
  );
}
