/**
 * Capability Autocomplete for Code Editor
 *
 * Provides intelligent autocomplete suggestions for capability IDs
 * when editing plugin code and manifests.
 */

import { useState, useRef, useEffect } from 'react';

import { useFeatures, useActions, useStates } from '@lib/capabilities';

interface CapabilityAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  placeholder?: string;
}

interface Suggestion {
  id: string;
  label: string;
  description?: string;
  icon?: string;
  type: 'feature' | 'action' | 'state' | 'permission';
}

const PERMISSIONS = [
  { id: 'read:session', label: 'Read Session', description: 'Access game session data' },
  { id: 'read:world', label: 'Read World', description: 'Access world state' },
  { id: 'read:npcs', label: 'Read NPCs', description: 'Access NPC data' },
  { id: 'read:locations', label: 'Read Locations', description: 'Access location data' },
  { id: 'ui:overlay', label: 'UI Overlay', description: 'Add UI overlays' },
  { id: 'ui:theme', label: 'UI Theme', description: 'Modify theme/CSS' },
  { id: 'storage', label: 'Storage', description: 'Local storage access' },
  { id: 'notifications', label: 'Notifications', description: 'Show notifications' },
];

export function CapabilityAutocomplete({
  value,
  onChange,
  rows = 20,
  placeholder,
}: CapabilityAutocompleteProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const features = useFeatures();
  const actions = useActions();
  const states = useStates();

  // Detect context and show relevant suggestions
  useEffect(() => {
    if (!textareaRef.current) return;

    const textarea = textareaRef.current;
    const cursorPos = textarea.selectionStart;
    const textBeforeCursor = value.substring(0, cursorPos);

    // Find what context we're in
    const context = detectContext(textBeforeCursor);

    if (context) {
      const { type, query } = context;
      const filteredSuggestions = getSuggestions(type, query);

      if (filteredSuggestions.length > 0) {
        setSuggestions(filteredSuggestions);
        setShowSuggestions(true);
        setSelectedIndex(0);
      } else {
        setShowSuggestions(false);
      }
    } else {
      setShowSuggestions(false);
    }
  }, [value, features, actions, states]);

  // Detect context based on text before cursor
  function detectContext(textBeforeCursor: string): {
    type: 'feature' | 'action' | 'state' | 'permission';
    query: string;
  } | null {
    // Match patterns like:
    // consumesFeatures: ['work|
    // consumesActions: ['asset|
    // permissions: ['read:|

    // Try to find if we're inside a string in an array
    const inStringMatch = textBeforeCursor.match(/['"]([^'"]*?)$/);
    if (!inStringMatch) return null;

    const query = inStringMatch[1];
    const beforeString = textBeforeCursor.substring(0, inStringMatch.index);

    // Check what array we're in
    if (/consumesFeatures\s*:\s*\[[^\]]*$/.test(beforeString)) {
      return { type: 'feature', query };
    }
    if (/providesFeatures\s*:\s*\[[^\]]*$/.test(beforeString)) {
      return { type: 'feature', query };
    }
    if (/consumesActions\s*:\s*\[[^\]]*$/.test(beforeString)) {
      return { type: 'action', query };
    }
    if (/consumesState\s*:\s*\[[^\]]*$/.test(beforeString)) {
      return { type: 'state', query };
    }
    if (/permissions\s*:\s*\[[^\]]*$/.test(beforeString)) {
      return { type: 'permission', query };
    }

    return null;
  }

  // Get suggestions based on type and query
  function getSuggestions(
    type: 'feature' | 'action' | 'state' | 'permission',
    query: string
  ): Suggestion[] {
    const lowerQuery = query.toLowerCase();

    if (type === 'feature') {
      return features
        .filter(
          (f) =>
            f.id.toLowerCase().includes(lowerQuery) ||
            f.name.toLowerCase().includes(lowerQuery)
        )
        .map((f) => ({
          id: f.id,
          label: f.name,
          description: f.description,
          icon: f.icon,
          type: 'feature' as const,
        }))
        .slice(0, 10);
    }

    if (type === 'action') {
      return actions
        .filter(
          (a) =>
            a.id.toLowerCase().includes(lowerQuery) ||
            a.name.toLowerCase().includes(lowerQuery)
        )
        .map((a) => ({
          id: a.id,
          label: a.name,
          description: a.description,
          icon: a.icon,
          type: 'action' as const,
        }))
        .slice(0, 10);
    }

    if (type === 'state') {
      return states
        .filter((s) => s.id.toLowerCase().includes(lowerQuery))
        .map((s) => ({
          id: s.id,
          label: s.name,
          description: undefined,
          icon: undefined,
          type: 'state' as const,
        }))
        .slice(0, 10);
    }

    if (type === 'permission') {
      return PERMISSIONS.filter(
        (p) =>
          p.id.toLowerCase().includes(lowerQuery) ||
          p.label.toLowerCase().includes(lowerQuery)
      ).map((p) => ({
        id: p.id,
        label: p.label,
        description: p.description,
        icon: undefined,
        type: 'permission' as const,
      }));
    }

    return [];
  }

  // Insert suggestion at cursor
  function insertSuggestion(suggestion: Suggestion) {
    if (!textareaRef.current) return;

    const textarea = textareaRef.current;
    const cursorPos = textarea.selectionStart;
    const textBeforeCursor = value.substring(0, cursorPos);
    const textAfterCursor = value.substring(cursorPos);

    // Find the start of the current string
    const stringStartMatch = textBeforeCursor.match(/['"]([^'"]*?)$/);
    if (!stringStartMatch) return;

    const stringStart = stringStartMatch.index! + 1; // +1 to skip the quote
    const beforeString = value.substring(0, stringStart);
    const newValue = beforeString + suggestion.id + textAfterCursor;

    onChange(newValue);
    setShowSuggestions(false);

    // Move cursor after the inserted text
    setTimeout(() => {
      const newCursorPos = stringStart + suggestion.id.length;
      textarea.setSelectionRange(newCursorPos, newCursorPos);
      textarea.focus();
    }, 0);
  }

  // Handle keyboard navigation
  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (!showSuggestions) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % suggestions.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + suggestions.length) % suggestions.length);
    } else if (e.key === 'Enter' && suggestions.length > 0) {
      e.preventDefault();
      insertSuggestion(suggestions[selectedIndex]);
    } else if (e.key === 'Escape') {
      setShowSuggestions(false);
    }
  }

  return (
    <div className="relative">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        rows={rows}
        placeholder={placeholder}
        className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-600 rounded-md bg-white dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
        spellCheck={false}
      />

      {/* Suggestions dropdown */}
      {showSuggestions && suggestions.length > 0 && (
        <div className="absolute z-50 mt-1 w-96 max-h-64 overflow-y-auto bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-600 rounded-lg shadow-lg">
          <div className="p-2 text-xs font-medium text-neutral-600 dark:text-neutral-400 border-b border-neutral-200 dark:border-neutral-700">
            Suggestions (↑↓ to navigate, Enter to insert, Esc to close)
          </div>
          {suggestions.map((suggestion, index) => (
            <button
              key={suggestion.id}
              onClick={() => insertSuggestion(suggestion)}
              className={`w-full text-left px-3 py-2 hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors ${
                index === selectedIndex
                  ? 'bg-blue-50 dark:bg-blue-900/20'
                  : ''
              }`}
            >
              <div className="flex items-start gap-2">
                {suggestion.icon && <span className="text-lg">{suggestion.icon}</span>}
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm text-neutral-900 dark:text-neutral-100">
                    {suggestion.label}
                  </div>
                  <code className="text-xs text-neutral-600 dark:text-neutral-400 block">
                    {suggestion.id}
                  </code>
                  {suggestion.description && (
                    <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
                      {suggestion.description}
                    </p>
                  )}
                </div>
                <span className="text-xs px-2 py-0.5 rounded bg-neutral-200 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-300">
                  {suggestion.type}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
