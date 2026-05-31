/**
 * CueDiagnostics
 *
 * Renders compile/validate diagnostics returned by the prompt-pack
 * compile service (see PromptPackCompileResult in
 * pixsim7/backend/main/services/prompt/packs/compile_service.py).
 *
 * Each diagnostic is a free-form record with at least { message,
 * severity, code? } and often { line, column, source }.
 */

interface Diagnostic {
  message?: string;
  severity?: string;
  code?: string;
  line?: number;
  column?: number;
  source?: string;
  [key: string]: unknown;
}

const SEVERITY_STYLES: Record<string, string> = {
  error: 'border-red-500/40 bg-red-950/30 text-red-200',
  warning: 'border-amber-500/40 bg-amber-950/30 text-amber-200',
  info: 'border-blue-500/40 bg-blue-950/30 text-blue-200',
};

export interface CueDiagnosticsProps {
  diagnostics: Array<Record<string, unknown>>;
  ok: boolean;
  status: string;
  /** Called with (line, column) when the user clicks a diagnostic. */
  onJumpTo?: (line: number, column: number) => void;
}

export function CueDiagnostics({ diagnostics, ok, status, onJumpTo }: CueDiagnosticsProps) {
  const list = diagnostics as Diagnostic[];

  if (list.length === 0) {
    return (
      <div
        className={`px-3 py-2 text-[11px] border-t ${
          ok
            ? 'border-emerald-500/30 bg-emerald-950/20 text-emerald-300'
            : 'border-neutral-800 bg-neutral-900/60 text-neutral-500'
        }`}
      >
        {ok
          ? `Compiled cleanly (${status}).`
          : `No diagnostics yet — run Validate or Compile.`}
      </div>
    );
  }

  return (
    <div className="border-t border-neutral-800 bg-neutral-950/50 max-h-48 overflow-y-auto">
      <div className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-neutral-500 border-b border-neutral-800/70">
        {list.length} diagnostic{list.length === 1 ? '' : 's'} ({status})
      </div>
      <div className="flex flex-col gap-1 p-2">
        {list.map((d, idx) => {
          const severity = (d.severity ?? 'error').toLowerCase();
          const style = SEVERITY_STYLES[severity] ?? SEVERITY_STYLES.error;
          const hasLoc = typeof d.line === 'number' && typeof d.column === 'number';
          return (
            <button
              key={idx}
              type="button"
              onClick={() => hasLoc && onJumpTo?.(d.line!, d.column!)}
              className={`text-left text-[11px] rounded border px-2 py-1.5 ${style} ${
                hasLoc ? 'cursor-pointer hover:brightness-125' : 'cursor-default'
              }`}
              disabled={!hasLoc}
            >
              <div className="flex items-baseline gap-2">
                <span className="font-mono text-[10px] uppercase opacity-70">{severity}</span>
                {d.code && <span className="font-mono text-[10px] opacity-70">{d.code}</span>}
                {hasLoc && (
                  <span className="font-mono text-[10px] opacity-70">
                    {d.line}:{d.column}
                  </span>
                )}
                {d.source && (
                  <span className="font-mono text-[10px] opacity-50 ml-auto">{d.source}</span>
                )}
              </div>
              <div className="mt-0.5 whitespace-pre-wrap">{d.message ?? '(no message)'}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
