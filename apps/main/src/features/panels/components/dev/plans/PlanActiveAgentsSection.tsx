import { Badge, Button, DisclosureSection } from '@pixsim7/shared.ui';

import { Icon } from '@lib/icons';

import { ageLabel, type ActiveAgentsRoster } from './useActiveAgentsRoster';

export function PlanActiveAgentsSection({
  roster,
  onOpenPlan,
}: {
  roster: ActiveAgentsRoster;
  onOpenPlan?: (planId: string) => void;
}) {
  const { data, loading, error, totalActive, refresh } = roster;

  return (
    <div className="p-3 w-full max-w-2xl mx-auto">
      <DisclosureSection
        label={
          <span className="flex items-center gap-1.5">
            <Icon name="activity" size={13} />
            Active agents
          </span>
        }
        badge={
          <Badge
            color={totalActive > 0 ? 'green' : 'gray'}
            className="text-[10px]"
          >
            {totalActive}
          </Badge>
        }
        defaultOpen
        persistKey="plans:activeAgents"
        className="rounded-md border border-neutral-200 dark:border-neutral-700 p-3"
        contentClassName="space-y-3 mt-2"
        actions={
          <Button
            size="xs"
            variant="ghost"
            onClick={() => void refresh()}
            disabled={loading}
          >
            {loading ? 'Refreshing…' : 'Refresh'}
          </Button>
        }
      >
        {error && (
          <div className="text-xs text-red-600 dark:text-red-400">{error}</div>
        )}
        {!error && totalActive === 0 && (
          <div className="text-xs text-neutral-500 dark:text-neutral-400">
            No agents are currently working on any plan.
          </div>
        )}
        {data?.plans.map((g) => (
          <div
            key={g.plan_id}
            className="rounded-md border border-neutral-200 dark:border-neutral-700 p-2"
          >
            <div className="flex items-center justify-between gap-2 mb-1">
              <button
                type="button"
                className="text-xs font-medium text-left hover:underline truncate"
                onClick={() => onOpenPlan?.(g.plan_id)}
                title={g.plan_id}
              >
                {g.plan_title || g.plan_id}
              </button>
              <Badge color="green" className="text-[10px] shrink-0">
                {g.active_count}
              </Badge>
            </div>
            <ul className="space-y-1">
              {g.agents.map((a) => (
                <li
                  key={a.participant_id}
                  className="flex items-center gap-2 text-[11px] p-1 rounded border border-neutral-100 dark:border-neutral-800"
                >
                  <Badge
                    color={a.role === 'reviewer' ? 'purple' : 'blue'}
                    className="text-[9px] shrink-0"
                  >
                    {a.role}
                  </Badge>
                  <span className="font-mono truncate">
                    {a.agent_id || a.session_id || 'unknown'}
                  </span>
                  {a.agent_type && (
                    <span className="text-neutral-400 shrink-0">
                      {a.agent_type}
                    </span>
                  )}
                  {a.claimed && a.checkpoint_id && (
                    <Badge color="orange" className="text-[9px] shrink-0">
                      ▶ {a.checkpoint_id}
                    </Badge>
                  )}
                  <span
                    className="ml-auto text-neutral-400 shrink-0"
                    title={a.last_heartbeat_at || ''}
                  >
                    {ageLabel(a.heartbeat_age_seconds)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </DisclosureSection>
    </div>
  );
}
