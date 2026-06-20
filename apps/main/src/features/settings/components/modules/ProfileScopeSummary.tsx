import type { ScopeOption } from '@lib/api';

import type { FieldDraft, ScopeDraft } from './agentScopeDraft';

// Read-only "effective grants" summary of a profile's scopes (agent-scope-admin-ux
// cp4). Presentational + import-light (type-only deps) so cp5 can reuse it verbatim
// in the community AccountView (admin = editable pickers; self = this summary).

export type ScopeOptionMaps = {
  plans: ScopeOption[];
  worlds: ScopeOption[];
  projects: ScopeOption[];
  contracts: ScopeOption[];
};

function FieldSummary({
  label,
  field,
  options,
}: {
  label: string;
  field: FieldDraft;
  options: ScopeOption[];
}) {
  const labelFor = (v: string) => options.find((o) => o.value === v)?.label ?? v;
  return (
    <div className="flex items-start gap-1.5 text-[10px]">
      <span className="w-16 shrink-0 text-neutral-400">{label}</span>
      {field.mode === 'unrestricted' && <span className="text-neutral-400">Unrestricted</span>}
      {field.mode === 'deny' && <span className="font-medium text-red-500">Deny all</span>}
      {field.mode === 'restricted' &&
        (field.ids.length === 0 ? (
          <span className="font-medium text-red-500">none</span>
        ) : (
          <span className="flex flex-wrap gap-1">
            {field.ids.map((v) => (
              <span
                key={v}
                className="rounded bg-neutral-100 px-1 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300"
                title={v}
              >
                {labelFor(v)}
              </span>
            ))}
          </span>
        ))}
    </div>
  );
}

export function ProfileScopeSummary({
  draft,
  options,
}: {
  draft: ScopeDraft;
  options: ScopeOptionMaps;
}) {
  return (
    <div className="space-y-0.5">
      <FieldSummary label="Plans" field={draft.plans} options={options.plans} />
      <FieldSummary label="Worlds" field={draft.worlds} options={options.worlds} />
      <FieldSummary label="Projects" field={draft.projects} options={options.projects} />
      <FieldSummary label="Contracts" field={draft.contracts} options={options.contracts} />
    </div>
  );
}
