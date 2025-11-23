/**
 * Persistent State Hook
 *
 * Similar to useState but persists to localStorage.
 */

import { useState, useEffect, Dispatch, SetStateAction } from 'react';

/**
 * Custom hook for state that persists to localStorage
 */
export function usePersistentState<T>(
  key: string,
  initialValue: T,
  options?: {
    serializer?: (value: T) => string;
    deserializer?: (value: string) => T;
  }
): [T, Dispatch<SetStateAction<T>>] {
  const serializer = options?.serializer || JSON.stringify;
  const deserializer = options?.deserializer || JSON.parse;

  // Initialize state from localStorage or default value
  const [state, setState] = useState<T>(() => {
    try {
      const item = localStorage.getItem(key);
      return item ? deserializer(item) : initialValue;
    } catch (error) {
      console.warn(`Error loading persisted state for key "${key}":`, error);
      return initialValue;
    }
  });

  // Sync state to localStorage when it changes
  useEffect(() => {
    try {
      localStorage.setItem(key, serializer(state));
    } catch (error) {
      console.warn(`Error persisting state for key "${key}":`, error);
    }
  }, [key, state, serializer]);

  return [state, setState];
}

/**
 * Hook for persisting Set to localStorage
 */
export function usePersistentSet(
  key: string,
  initialValue: Set<string> = new Set()
): [Set<string>, Dispatch<SetStateAction<Set<string>>>] {
  return usePersistentState(
    key,
    initialValue,
    {
      serializer: (set) => JSON.stringify(Array.from(set)),
      deserializer: (str) => new Set(JSON.parse(str)),
    }
  );
}
