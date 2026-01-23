import { useAdminContext } from '../adminContext';

export function CodegenPanel() {
  const { codegenTasks, codegenState, codegenError, refreshCodegenTasks, copyCommand } = useAdminContext();

  return (
    <div className="panel-card h-full flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="section-title">Codegen</p>
          <h2 className="text-2xl font-semibold">Schema + type generators</h2>
        </div>
        <button className="ghost-button" onClick={refreshCodegenTasks}>
          Refresh
        </button>
      </div>
      {codegenError && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {codegenError}
        </div>
      )}
      <div className="stagger grid gap-4 md:grid-cols-2">
        {codegenState === 'loading' && codegenTasks.length === 0 ? (
          <div className="text-sm text-[var(--ink-muted)]">Loading codegen tasks...</div>
        ) : codegenTasks.length === 0 ? (
          <div className="text-sm text-[var(--ink-muted)]">No codegen tasks discovered.</div>
        ) : (
          codegenTasks.map((task) => (
            <div key={task.id} className="rounded-2xl border border-slate-200 bg-white/80 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold">{task.id}</h3>
                  <p className="text-xs text-[var(--ink-muted)]">{task.description}</p>
                </div>
                {task.groups && task.groups.length > 0 ? (
                  <span className="status-pill">{task.groups.join(', ')}</span>
                ) : null}
              </div>
              <div className="mt-3 mono-chip">pnpm codegen -- --only {task.id}</div>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  className="ghost-button"
                  onClick={() => copyCommand('pnpm', ['codegen', '--', '--only', task.id])}
                >
                  Copy run command
                </button>
                {task.supports_check ? (
                  <button
                    className="ghost-button"
                    onClick={() => copyCommand('pnpm', ['codegen', '--', '--only', task.id, '--check'])}
                  >
                    Copy check command
                  </button>
                ) : null}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
