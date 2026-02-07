import {
  PROMPT_ROLE_COLORS,
  PROMPT_ROLE_LABELS,
  type PromptRoleId,
} from '@pixsim7/shared.types';

type ColorToken = {
  badge: string;
  panel: string;
  inlineBg: string;
  inlineHover: string;
  hex: string;
};

const COLOR_TOKENS: Record<string, ColorToken> = {
  blue: {
    badge: 'bg-blue-500',
    panel: 'bg-blue-100 dark:bg-blue-900/40 border-blue-300 dark:border-blue-700 text-blue-800 dark:text-blue-200',
    inlineBg: 'bg-blue-100/60 dark:bg-blue-900/40',
    inlineHover: 'hover:bg-blue-200/80 dark:hover:bg-blue-800/60',
    hex: '#3b82f6',
  },
  green: {
    badge: 'bg-green-500',
    panel: 'bg-green-100 dark:bg-green-900/40 border-green-300 dark:border-green-700 text-green-800 dark:text-green-200',
    inlineBg: 'bg-green-100/60 dark:bg-green-900/40',
    inlineHover: 'hover:bg-green-200/80 dark:hover:bg-green-800/60',
    hex: '#22c55e',
  },
  purple: {
    badge: 'bg-purple-500',
    panel: 'bg-purple-100 dark:bg-purple-900/40 border-purple-300 dark:border-purple-700 text-purple-800 dark:text-purple-200',
    inlineBg: 'bg-purple-100/60 dark:bg-purple-900/40',
    inlineHover: 'hover:bg-purple-200/80 dark:hover:bg-purple-800/60',
    hex: '#a855f7',
  },
  yellow: {
    badge: 'bg-yellow-500',
    panel: 'bg-yellow-100 dark:bg-yellow-900/40 border-yellow-300 dark:border-yellow-700 text-yellow-800 dark:text-yellow-200',
    inlineBg: 'bg-yellow-100/60 dark:bg-yellow-900/40',
    inlineHover: 'hover:bg-yellow-200/80 dark:hover:bg-yellow-800/60',
    hex: '#eab308',
  },
  pink: {
    badge: 'bg-pink-500',
    panel: 'bg-pink-100 dark:bg-pink-900/40 border-pink-300 dark:border-pink-700 text-pink-800 dark:text-pink-200',
    inlineBg: 'bg-pink-100/60 dark:bg-pink-900/40',
    inlineHover: 'hover:bg-pink-200/80 dark:hover:bg-pink-800/60',
    hex: '#ec4899',
  },
  cyan: {
    badge: 'bg-cyan-500',
    panel: 'bg-cyan-100 dark:bg-cyan-900/40 border-cyan-300 dark:border-cyan-700 text-cyan-800 dark:text-cyan-200',
    inlineBg: 'bg-cyan-100/60 dark:bg-cyan-900/40',
    inlineHover: 'hover:bg-cyan-200/80 dark:hover:bg-cyan-800/60',
    hex: '#06b6d4',
  },
  orange: {
    badge: 'bg-orange-500',
    panel: 'bg-orange-100 dark:bg-orange-900/40 border-orange-300 dark:border-orange-700 text-orange-800 dark:text-orange-200',
    inlineBg: 'bg-orange-100/60 dark:bg-orange-900/40',
    inlineHover: 'hover:bg-orange-200/80 dark:hover:bg-orange-800/60',
    hex: '#f97316',
  },
  gray: {
    badge: 'bg-neutral-500',
    panel: 'bg-neutral-100 dark:bg-neutral-800 border-neutral-300 dark:border-neutral-600 text-neutral-700 dark:text-neutral-300',
    inlineBg: 'bg-neutral-100/60 dark:bg-neutral-800/40',
    inlineHover: 'hover:bg-neutral-200/80 dark:hover:bg-neutral-700/60',
    hex: '#64748b',
  },
};

const DEFAULT_COLOR = 'gray';

function normalizeRole(role?: string): string {
  let key = (role ?? '').trim().toLowerCase();
  if (key.startsWith('prompt_role:')) {
    key = key.slice('prompt_role:'.length);
  } else if (key.startsWith('role:')) {
    key = key.slice('role:'.length);
  }
  return key;
}

function toTitle(value: string): string {
  if (!value) return 'Other';
  return value.replace(/_/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());
}

export function getPromptRoleLabel(role?: string): string {
  const key = normalizeRole(role);
  if (!key) return PROMPT_ROLE_LABELS.other ?? 'Other';
  return PROMPT_ROLE_LABELS[key as PromptRoleId] ?? toTitle(key);
}

export function getPromptRoleColorName(
  role?: string,
  overrides?: Record<string, string>
): string {
  const key = normalizeRole(role);
  const override = key ? overrides?.[key] : undefined;
  if (override && override in COLOR_TOKENS) {
    return override;
  }
  if (key && key in PROMPT_ROLE_COLORS) {
    const color = PROMPT_ROLE_COLORS[key as PromptRoleId] ?? DEFAULT_COLOR;
    return color in COLOR_TOKENS ? color : DEFAULT_COLOR;
  }
  const fallback = PROMPT_ROLE_COLORS.other ?? DEFAULT_COLOR;
  return fallback in COLOR_TOKENS ? fallback : DEFAULT_COLOR;
}

function getColorTokens(role?: string, overrides?: Record<string, string>): ColorToken {
  const color = getPromptRoleColorName(role, overrides);
  return COLOR_TOKENS[color] ?? COLOR_TOKENS[DEFAULT_COLOR];
}

export function getPromptRoleBadgeClass(
  role?: string,
  overrides?: Record<string, string>
): string {
  return getColorTokens(role, overrides).badge;
}

export function getPromptRolePanelClass(
  role?: string,
  overrides?: Record<string, string>
): string {
  return getColorTokens(role, overrides).panel;
}

export function getPromptRoleInlineClasses(
  role?: string,
  overrides?: Record<string, string>
): { bg: string; hover: string } {
  const tokens = getColorTokens(role, overrides);
  return { bg: tokens.inlineBg, hover: tokens.inlineHover };
}

export function getPromptRoleHex(
  role?: string,
  overrides?: Record<string, string>
): string {
  return getColorTokens(role, overrides).hex;
}
