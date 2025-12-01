/**
 * Action Builder Constants
 *
 * Static metadata and styling configuration for automation actions.
 */

import { ActionType } from '@/types/automation';

/** Empty params placeholder */
export const EMPTY_PARAMS = {};

/** Action types that support nested actions */
export const NESTED_ACTION_TYPES = [
  ActionType.IF_ELEMENT_EXISTS,
  ActionType.IF_ELEMENT_NOT_EXISTS,
  ActionType.REPEAT,
] as const;

/** Action category for styling purposes */
export type ActionCategory = 'timing' | 'app' | 'input' | 'navigation' | 'element' | 'control' | 'utility';

/** Metadata for an action type */
export interface ActionMeta {
  icon: string;
  label: string;
  category: ActionCategory;
}

/** Action type metadata mapping */
export const ACTION_META: Record<ActionType, ActionMeta> = {
  [ActionType.WAIT]: { icon: '⏱️', label: 'Wait', category: 'timing' },
  [ActionType.LAUNCH_APP]: { icon: '🚀', label: 'Launch App', category: 'app' },
  [ActionType.EXIT_APP]: { icon: '🚪', label: 'Exit App', category: 'app' },
  [ActionType.CLICK_COORDS]: { icon: '👆', label: 'Click Coords', category: 'input' },
  [ActionType.TYPE_TEXT]: { icon: '⌨️', label: 'Type Text', category: 'input' },
  [ActionType.PRESS_BACK]: { icon: '◀️', label: 'Press Back', category: 'navigation' },
  [ActionType.EMULATOR_BACK]: { icon: '◀️', label: 'Emulator Back', category: 'navigation' },
  [ActionType.PRESS_HOME]: { icon: '🏠', label: 'Press Home', category: 'navigation' },
  [ActionType.SWIPE]: { icon: '👋', label: 'Swipe', category: 'input' },
  [ActionType.SCREENSHOT]: { icon: '📸', label: 'Screenshot', category: 'utility' },
  [ActionType.WAIT_FOR_ELEMENT]: { icon: '👁️', label: 'Wait for Element', category: 'element' },
  [ActionType.CLICK_ELEMENT]: { icon: '🎯', label: 'Click Element', category: 'element' },
  [ActionType.IF_ELEMENT_EXISTS]: { icon: '❓', label: 'If Element Exists', category: 'control' },
  [ActionType.IF_ELEMENT_NOT_EXISTS]: { icon: '❓', label: 'If Element Not Exists', category: 'control' },
  [ActionType.REPEAT]: { icon: '🔁', label: 'Repeat', category: 'control' },
};

/** Category color styling */
export interface CategoryColors {
  bg: string;
  border: string;
  text: string;
}

/** Category color mapping */
export const CATEGORY_COLORS: Record<ActionCategory, CategoryColors> = {
  timing: {
    bg: 'bg-blue-50 dark:bg-blue-900/20',
    border: 'border-blue-300 dark:border-blue-700',
    text: 'text-blue-700 dark:text-blue-300',
  },
  app: {
    bg: 'bg-purple-50 dark:bg-purple-900/20',
    border: 'border-purple-300 dark:border-purple-700',
    text: 'text-purple-700 dark:text-purple-300',
  },
  input: {
    bg: 'bg-green-50 dark:bg-green-900/20',
    border: 'border-green-300 dark:border-green-700',
    text: 'text-green-700 dark:text-green-300',
  },
  navigation: {
    bg: 'bg-orange-50 dark:bg-orange-900/20',
    border: 'border-orange-300 dark:border-orange-700',
    text: 'text-orange-700 dark:text-orange-300',
  },
  element: {
    bg: 'bg-cyan-50 dark:bg-cyan-900/20',
    border: 'border-cyan-300 dark:border-cyan-700',
    text: 'text-cyan-700 dark:text-cyan-300',
  },
  control: {
    bg: 'bg-indigo-50 dark:bg-indigo-900/20',
    border: 'border-indigo-300 dark:border-indigo-700',
    text: 'text-indigo-700 dark:text-indigo-300',
  },
  utility: {
    bg: 'bg-gray-50 dark:bg-gray-800/50',
    border: 'border-gray-300 dark:border-gray-600',
    text: 'text-gray-700 dark:text-gray-300',
  },
};
