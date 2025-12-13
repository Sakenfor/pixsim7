/**
 * Capability Reference Editor
 *
 * User-friendly editor for adding/removing capability references
 * (consumesFeatures, consumesActions, consumesState, providesFeatures).
 */

import { useState } from 'react';
import { useFeatures, useActions, useStates } from '@lib/capabilities';

interface CapabilityReferenceEditorProps {
  references: string[];
  onChange: (references: string[]) => void;
  type: 'feature' | 'action' | 'state';
  label: string;
  description: string;
}

export function CapabilityReferenceEditor({
  references,
  onChange,
  type,
  label,
  description,
}: CapabilityReferenceEditorProps) {
  const [inputValue, setInputValue] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);

  const features = useFeatures();
  const actions = useActions();
  const states = useStates();

  // Get all available IDs based on type
  const availableIds =
    type === 'feature'
      ? features.map((f) => ({ id: f.id, label: f.name, icon: f.icon }))
      : type === 'action'
      ? actions.map((a) => ({ id: a.id, label: a.name, icon: a.icon }))
      : states.map((s) => ({ id: s.id, label: s.name, icon: undefined }));

  // Filter suggestions
  const suggestions = availableIds.filter(
    (item) =>
      !references.includes(item.id) &&
      (item.id.toLowerCase().includes(inputValue.toLowerCase()) ||
        item.label.toLowerCase().includes(inputValue.toLowerCase()))
  );

  // Add reference
  function addReference(id: string) {
    if (!references.includes(id)) {
      onChange([...references, id]);
    }
    setInputValue('');
    setShowSuggestions(false);
  }

  // Remove reference
  function removeReference(id: string) {
    onChange(references.filter((r) => r !== id));
  }

  return (
    <div className="space-y-3">
      <div>
        <h4 className="text-sm font-medium text-neutral-900 dark:text-neutral-100 mb-1">
          {label}
        </h4>
        <p className="text-xs text-neutral-600 dark:text-neutral-400">{description}</p>
      </div>

      {/* Current references */}
      {references.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {references.map((ref) => {
            const item = availableIds.find((i) => i.id === ref);
            return (
              <div
                key={ref}
                className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-blue-100 dark:bg-blue-900/30 border border-blue-300 dark:border-blue-700"
              >
                {item?.icon && <span className="text-sm">{item.icon}</span>}
                <code className="text-xs text-blue-900 dark:text-blue-100">{ref}</code>
                <button
                  onClick={() => removeReference(ref)}
                  className="ml-1 text-blue-700 dark:text-blue-300 hover:text-blue-900 dark:hover:text-blue-100"
                  title="Remove"
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Add new reference */}
      <div className="relative">
        <input
          type="text"
          value={inputValue}
          onChange={(e) => {
            setInputValue(e.target.value);
            setShowSuggestions(e.target.value.length > 0);
          }}
          onFocus={() => setShowSuggestions(inputValue.length > 0)}
          onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
          placeholder={`Type to search ${type}s...`}
          className="w-full px-3 py-2 text-sm border border-neutral-300 dark:border-neutral-600 rounded-md bg-white dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100 placeholder-neutral-500 dark:placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />

        {/* Suggestions dropdown */}
        {showSuggestions && suggestions.length > 0 && (
          <div className="absolute z-10 mt-1 w-full max-h-48 overflow-y-auto bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-600 rounded-md shadow-lg">
            {suggestions.slice(0, 10).map((suggestion) => (
              <button
                key={suggestion.id}
                onClick={() => addReference(suggestion.id)}
                className="w-full text-left px-3 py-2 hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors"
              >
                <div className="flex items-center gap-2">
                  {suggestion.icon && <span>{suggestion.icon}</span>}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                      {suggestion.label}
                    </div>
                    <code className="text-xs text-neutral-600 dark:text-neutral-400">
                      {suggestion.id}
                    </code>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
