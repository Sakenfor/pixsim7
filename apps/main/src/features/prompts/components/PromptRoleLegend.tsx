/**
 * PromptRoleLegend
 *
 * Reusable legend chip-row showing the unique roles present in a set of
 * candidates, with their badge colour + label. Optionally interactive:
 *   - hover a chip → emit `onRoleHover(role)` so the consumer can dim
 *     non-matching candidate spans, plus show a small role-summary
 *     tooltip (count + sample matches).
 *   - click a chip → emit `onRoleClick(role)`. The caller decides whether
 *     to pin emphasis; the active chip renders with a ring.
 */
import clsx from 'clsx';
import { useMemo, useRef, useState } from 'react';

import { getPromptRoleBadgeClass, getPromptRoleLabel } from '@/lib/promptRoleUi';

import { usePromptSettingsStore } from '../stores/promptSettingsStore';
import type { PromptBlockCandidate } from '../types';

export interface PromptRoleLegendProps {
  candidates: PromptBlockCandidate[];
  /** Optional class on the outer container — useful for sticky/border variants. */
  className?: string;
  /** When set, the chip for this role gets the active ring style. */
  pinnedRole?: string | null;
  /** Fired with the role on mouseenter, null on mouseleave. */
  onRoleHover?: (role: string | null) => void;
  /** Fired with the role on click. Toggle pinning is a caller decision. */
  onRoleClick?: (role: string) => void;
}

interface RoleSummary {
  role: string;
  count: number;
  samples: string[]; // up to 3 candidate texts
}

const SAMPLE_LIMIT = 3;
const SAMPLE_TRUNCATE_AT = 60;

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trimEnd()}…`;
}

export function PromptRoleLegend({
  candidates,
  className,
  pinnedRole = null,
  onRoleHover,
  onRoleClick,
}: PromptRoleLegendProps) {
  const promptRoleColors = usePromptSettingsStore((s) => s.promptRoleColors);
  const [hoverRole, setHoverRole] = useState<string | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);
  const interactive = !!(onRoleHover || onRoleClick);

  const summaries = useMemo<RoleSummary[]>(() => {
    const byRole = new Map<string, RoleSummary>();
    for (const c of candidates) {
      if (!c.role) continue;
      const existing = byRole.get(c.role);
      if (existing) {
        existing.count += 1;
        if (existing.samples.length < SAMPLE_LIMIT && c.text) {
          existing.samples.push(c.text);
        }
      } else {
        byRole.set(c.role, {
          role: c.role,
          count: 1,
          samples: c.text ? [c.text] : [],
        });
      }
    }
    return Array.from(byRole.values());
  }, [candidates]);

  if (summaries.length === 0) return null;

  const handleEnter = (role: string, target: HTMLElement) => {
    if (!interactive) return;
    setHoverRole(role);
    const rect = target.getBoundingClientRect();
    setTooltipPos({ x: rect.left, y: rect.bottom + 4 });
    onRoleHover?.(role);
  };

  const handleLeave = () => {
    if (!interactive) return;
    setHoverRole(null);
    setTooltipPos(null);
    onRoleHover?.(null);
  };

  const hoveredSummary = hoverRole
    ? summaries.find((s) => s.role === hoverRole) ?? null
    : null;

  return (
    <div className={className}>
      <div className="flex flex-wrap gap-1.5 text-xs">
        {summaries.map(({ role }) => (
          <RoleChip
            key={role}
            role={role}
            badgeClass={getPromptRoleBadgeClass(role, promptRoleColors)}
            label={getPromptRoleLabel(role)}
            active={pinnedRole === role}
            interactive={interactive}
            onEnter={handleEnter}
            onLeave={handleLeave}
            onClick={onRoleClick}
          />
        ))}
      </div>

      {interactive && hoveredSummary && tooltipPos && (
        <div
          className={clsx(
            'fixed z-[100] px-2.5 py-1.5 rounded-lg shadow-lg border text-xs',
            'bg-neutral-900/95 dark:bg-neutral-100/95',
            'text-white dark:text-neutral-900',
            'border-neutral-700 dark:border-neutral-300',
            'pointer-events-none max-w-[280px]',
          )}
          style={{ left: tooltipPos.x, top: tooltipPos.y }}
        >
          <div className="flex items-center gap-1.5">
            <span
              className={clsx(
                'w-2 h-2 rounded-full flex-shrink-0',
                getPromptRoleBadgeClass(hoveredSummary.role, promptRoleColors),
              )}
            />
            <span className="font-medium">{getPromptRoleLabel(hoveredSummary.role)}</span>
            <span className="text-neutral-400 dark:text-neutral-500">
              · {hoveredSummary.count} match{hoveredSummary.count === 1 ? '' : 'es'}
            </span>
          </div>
          {hoveredSummary.samples.length > 0 && (
            <ul className="mt-1 space-y-0.5 text-neutral-300 dark:text-neutral-600">
              {hoveredSummary.samples.map((s, i) => (
                <li key={i} className="truncate">
                  • {truncate(s, SAMPLE_TRUNCATE_AT)}
                </li>
              ))}
              {hoveredSummary.count > hoveredSummary.samples.length && (
                <li className="text-neutral-400 dark:text-neutral-500 italic">
                  +{hoveredSummary.count - hoveredSummary.samples.length} more…
                </li>
              )}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

interface RoleChipProps {
  role: string;
  badgeClass: string;
  label: string;
  active: boolean;
  interactive: boolean;
  onEnter: (role: string, target: HTMLElement) => void;
  onLeave: () => void;
  onClick?: (role: string) => void;
}

function RoleChip({
  role,
  badgeClass,
  label,
  active,
  interactive,
  onEnter,
  onLeave,
  onClick,
}: RoleChipProps) {
  const ref = useRef<HTMLButtonElement | null>(null);

  const content = (
    <>
      <span className={clsx('w-2.5 h-2.5 rounded-full flex-shrink-0', badgeClass)} />
      <span className="text-neutral-700 dark:text-neutral-300">{label}</span>
    </>
  );

  if (!interactive) {
    return (
      <span className="inline-flex items-center gap-1.5 px-1.5 py-0.5">
        {content}
      </span>
    );
  }

  return (
    <button
      ref={ref}
      type="button"
      onMouseEnter={() => ref.current && onEnter(role, ref.current)}
      onMouseLeave={onLeave}
      onClick={() => onClick?.(role)}
      className={clsx(
        'inline-flex items-center gap-1.5 px-1.5 py-0.5 rounded transition-colors cursor-pointer',
        active
          ? 'ring-1 ring-neutral-400 dark:ring-neutral-500 bg-neutral-100 dark:bg-neutral-800'
          : 'hover:bg-neutral-100 dark:hover:bg-neutral-800',
      )}
      title={`Click to ${active ? 'unpin' : 'pin'} ${label}`}
    >
      {content}
    </button>
  );
}
