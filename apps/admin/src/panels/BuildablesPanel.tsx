import { useMemo, useState } from 'react';

import { useAdminContext } from '../adminContext';

export function BuildablesPanel() {
  const { buildables, buildablesState, buildablesError, refreshBuildables, copyCommand } = useAdminContext();
  const [buildableQuery, setBuildableQuery] = useState('');
  const [buildableCategory, setBuildableCategory] = useState('all');

  const buildableCategories = useMemo(() => {
    const categories = new Set<string>();
    buildables.forEach((buildable) => {
      if (buildable.category) {
        categories.add(buildable.category);
      }
    });
    return ['all', ...Array.from(categories).sort((a, b) => a.localeCompare(b))];
  }, [buildables]);

  const filteredBuildables = useMemo(() => {
    let list = [...buildables];
    if (buildableCategory !== 'all') {
      list = list.filter((buildable) => buildable.category === buildableCategory);
    }
    if (buildableQuery.trim()) {
      const query = buildableQuery.trim().toLowerCase();
      list = list.filter(
        (buildable) =>
          buildable.title.toLowerCase().includes(query) ||
          buildable.package.toLowerCase().includes(query) ||
          buildable.directory.toLowerCase().includes(query),
      );
    }
    return list;
  }, [buildableCategory, buildableQuery, buildables]);

  return (
    <div className="panel-card h-full flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="section-title">Buildables</p>
          <h2 className="text-2xl font-semibold">PNPM targets</h2>
        </div>
        <div className="flex flex-wrap gap-3">
          <select
            className="select-field"
            value={buildableCategory}
            onChange={(event) => setBuildableCategory(event.target.value)}
          >
            {buildableCategories.map((category) => (
              <option key={category} value={category}>
                {category === 'all' ? 'All categories' : category}
              </option>
            ))}
          </select>
          <button className="ghost-button" onClick={refreshBuildables}>
            Refresh
          </button>
        </div>
      </div>
      <div>
        <input
          className="input-field"
          value={buildableQuery}
          onChange={(event) => setBuildableQuery(event.target.value)}
          placeholder="Search buildables by package or directory"
        />
      </div>
      {buildablesError && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {buildablesError}
        </div>
      )}
      <div className="stagger grid gap-4 md:grid-cols-2">
        {buildablesState === 'loading' && buildables.length === 0 ? (
          <div className="text-sm text-[var(--ink-muted)]">Loading buildables...</div>
        ) : filteredBuildables.length === 0 ? (
          <div className="text-sm text-[var(--ink-muted)]">No buildables discovered.</div>
        ) : (
          filteredBuildables.map((buildable) => (
            <div key={buildable.id} className="rounded-2xl border border-slate-200 bg-white/80 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold">{buildable.title}</h3>
                  <p className="text-xs text-[var(--ink-muted)]">{buildable.package}</p>
                </div>
                {buildable.category ? <span className="status-pill">{buildable.category}</span> : null}
              </div>
              {buildable.description ? (
                <p className="mt-2 text-sm text-[var(--ink-muted)]">{buildable.description}</p>
              ) : null}
              <div className="mt-3 mono-chip">
                {buildable.command} {buildable.args.join(' ')}
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <button className="ghost-button" onClick={() => copyCommand(buildable.command, buildable.args)}>
                  Copy command
                </button>
                <span className="text-xs text-[var(--ink-muted)]">dir: {buildable.directory}</span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
