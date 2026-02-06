import { PROMPT_ROLES, type PromptRoleId } from '@pixsim7/shared.types';

export type PromptRole = PromptRoleId | (string & {});

export const BASE_PROMPT_ROLES: PromptRole[] = [...PROMPT_ROLES];

export const DEFAULT_PROMPT_ROLE: PromptRole = (
  PROMPT_ROLES.includes('other' as PromptRoleId) ? 'other' : PROMPT_ROLES[0]
) as PromptRole;

export const DEFAULT_PROMPT_SEPARATOR = '\n\n';

export interface PromptCandidateLike {
  role?: string | null;
  text?: string | null;
}

export interface PromptBlockLike {
  role: PromptRole;
  text: string;
}

export interface PromptBlockSeedOptions {
  defaultRole?: PromptRole;
  fallbackText?: string;
  includeEmpty?: boolean;
}

export function normalizePromptRole(
  role: string | null | undefined,
  fallback: PromptRole = DEFAULT_PROMPT_ROLE
): PromptRole {
  if (!role) return fallback;
  const trimmed = role.trim().toLowerCase();
  if (!trimmed) return fallback;
  if (trimmed.startsWith('prompt_role:')) {
    const normalized = trimmed.slice('prompt_role:'.length).trim();
    return (normalized || fallback) as PromptRole;
  }
  if (trimmed.startsWith('role:')) {
    const normalized = trimmed.slice(5).trim();
    return (normalized || fallback) as PromptRole;
  }
  return trimmed as PromptRole;
}

export function composePromptFromBlocks(
  blocks: PromptBlockLike[],
  separator: string = DEFAULT_PROMPT_SEPARATOR
): string {
  return blocks
    .map((block) => block.text.trim())
    .filter(Boolean)
    .join(separator);
}

export function deriveBlocksFromCandidates(
  candidates: PromptCandidateLike[],
  options: PromptBlockSeedOptions = {}
): PromptBlockLike[] {
  const defaultRole = options.defaultRole ?? DEFAULT_PROMPT_ROLE;
  const includeEmpty = options.includeEmpty ?? false;

  const derived = candidates.map((candidate) => ({
    role: normalizePromptRole(candidate.role, defaultRole),
    text: candidate.text ?? '',
  }));

  const filtered = includeEmpty
    ? derived
    : derived.filter((block) => block.text.trim().length > 0);

  if (filtered.length > 0) {
    return filtered;
  }

  if (typeof options.fallbackText === 'string') {
    return [
      {
        role: defaultRole,
        text: options.fallbackText,
      },
    ];
  }

  return [];
}

export function ensurePromptBlocks(
  blocks: PromptBlockLike[],
  fallbackText: string = '',
  defaultRole: PromptRole = DEFAULT_PROMPT_ROLE
): PromptBlockLike[] {
  if (blocks.length > 0) return blocks;
  return [
    {
      role: defaultRole,
      text: fallbackText,
    },
  ];
}
