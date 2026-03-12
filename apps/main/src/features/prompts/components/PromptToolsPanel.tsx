import { DEFAULT_PROMPT_ROLE } from '@pixsim7/core.prompt';
import clsx from 'clsx';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';

import { Icon } from '@lib/icons';

import {
  executePromptTool,
  listPromptToolCatalog,
  type PromptToolCatalogScope,
  type PromptToolExecuteResponse,
  type PromptToolPreset,
} from '@/lib/api/promptTools';

import { diffPrompt, diffSummary } from '../lib/promptDiff';

type PromptToolApplyMode = 'replace_text' | 'append_text' | 'apply_overlay_only' | 'apply_all';

interface BlockOverlayItem {
  id: string;
  role: string;
  text: string;
}

export interface PromptToolsApplyPayload {
  mode: PromptToolApplyMode;
  promptText: string;
  blockOverlay: BlockOverlayItem[] | null;
}

export interface PromptToolsPanelProps {
  promptText: string;
  disabled?: boolean;
  onApply: (payload: PromptToolsApplyPayload) => void;
}

function parseJsonObject(raw: string, label: string): Record<string, unknown> {
  const trimmed = raw.trim();
  if (!trimmed) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    throw new Error(`${label} must be valid JSON`);
  }
  if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
    throw new Error(`${label} must be a JSON object`);
  }
  return parsed as Record<string, unknown>;
}

function parseBlockOverlay(overlay: Array<Record<string, unknown>> | undefined | null): BlockOverlayItem[] | null {
  if (!overlay || overlay.length === 0) return null;
  const idCounter = { current: 0 };
  const items: BlockOverlayItem[] = [];
  for (const item of overlay) {
    const textCandidate =
      (typeof item.text === 'string' && item.text.trim()) ||
      (typeof item.prompt_text === 'string' && item.prompt_text.trim()) ||
      (typeof item.content === 'string' && item.content.trim()) ||
      (typeof item.value === 'string' && item.value.trim()) ||
      '';
    if (!textCandidate) continue;
    const roleCandidate =
      (typeof item.role === 'string' && item.role.trim()) || DEFAULT_PROMPT_ROLE;
    items.push({
      id: `overlay-block-${idCounter.current++}`,
      role: roleCandidate,
      text: textCandidate,
    });
  }
  return items.length > 0 ? items : null;
}

export function PromptToolsPanel({ promptText, disabled = false, onApply }: PromptToolsPanelProps) {
  const panelId = useId();

  const [scope, setScope] = useState<PromptToolCatalogScope>('builtin');
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [catalog, setCatalog] = useState<PromptToolPreset[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [paramsText, setParamsText] = useState('{}');
  const [contextText, setContextText] = useState('{}');
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [result, setResult] = useState<PromptToolExecuteResponse | null>(null);
  const [applyMode, setApplyMode] = useState<PromptToolApplyMode>('replace_text');

  const promptTextRef = useRef(promptText);
  promptTextRef.current = promptText;

  const loadCatalog = useCallback(async () => {
    setCatalogLoading(true);
    setCatalogError(null);
    try {
      const response = await listPromptToolCatalog(scope);
      const presets = response.presets ?? [];
      setCatalog(presets);
      setSelectedId((prev) => {
        if (prev && presets.some((item) => item.id === prev)) return prev;
        return presets[0]?.id ?? '';
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load prompt tools catalog';
      setCatalog([]);
      setSelectedId('');
      setCatalogError(message);
    } finally {
      setCatalogLoading(false);
    }
  }, [scope]);

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

  const handleRun = useCallback(async () => {
    if (disabled || !selectedId) {
      setRunError(!selectedId ? 'Select a tool preset first' : '');
      return;
    }
    setRunning(true);
    setRunError(null);
    try {
      const params = parseJsonObject(paramsText, 'Params');
      const runContext = parseJsonObject(contextText, 'Run context');
      const res = await executePromptTool({
        preset_id: selectedId,
        prompt_text: promptTextRef.current,
        params,
        run_context: runContext,
      });
      setResult(res);
      setApplyMode(res.block_overlay && res.block_overlay.length > 0 ? 'apply_all' : 'replace_text');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to execute prompt tool';
      setRunError(message);
    } finally {
      setRunning(false);
    }
  }, [disabled, selectedId, paramsText, contextText]);

  const handleApply = useCallback(() => {
    if (!result || disabled) return;
    const overlay = parseBlockOverlay(result.block_overlay);
    onApply({
      mode: applyMode,
      promptText: result.prompt_text ?? '',
      blockOverlay: overlay,
    });
  }, [result, disabled, applyMode, onApply]);

  const selectedTool = useMemo(
    () => catalog.find((preset) => preset.id === selectedId) ?? null,
    [catalog, selectedId],
  );

  const diffSegments = useMemo(() => {
    if (!result) return [];
    return diffPrompt(promptText, result.prompt_text);
  }, [result, promptText]);

  return (
    <div className="w-[420px] max-h-[480px] overflow-y-auto p-2 space-y-2">
      <div className="flex items-center gap-1.5 text-[11px] font-medium text-neutral-600 dark:text-neutral-300">
        <Icon name="wand" size={12} />
        Prompt Tools
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label className="text-[11px] text-neutral-600 dark:text-neutral-300" htmlFor={`${panelId}-scope`}>
          Scope
        </label>
        <select
          id={`${panelId}-scope`}
          value={scope}
          disabled={disabled || catalogLoading || running}
          onChange={(e) => setScope(e.target.value as PromptToolCatalogScope)}
          className="text-xs rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1"
        >
          <option value="builtin">builtin</option>
          <option value="all">all</option>
          <option value="self">self</option>
          <option value="shared">shared</option>
        </select>

        <label className="text-[11px] text-neutral-600 dark:text-neutral-300" htmlFor={`${panelId}-preset`}>
          Preset
        </label>
        <select
          id={`${panelId}-preset`}
          value={selectedId}
          disabled={disabled || catalogLoading || running || catalog.length === 0}
          onChange={(e) => setSelectedId(e.target.value)}
          className="min-w-[160px] max-w-full text-xs rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1"
        >
          {catalog.length === 0 ? (
            <option value="">No presets</option>
          ) : (
            catalog.map((preset) => (
              <option key={preset.id} value={preset.id}>{preset.id}</option>
            ))
          )}
        </select>

        <button
          type="button"
          disabled={disabled || running || catalogLoading || !selectedId}
          onClick={handleRun}
          className={clsx(
            'ml-auto text-xs px-2 py-1 rounded border',
            'border-neutral-200 dark:border-neutral-700',
            'text-neutral-700 dark:text-neutral-200',
            'hover:bg-neutral-100 dark:hover:bg-neutral-800',
            'disabled:opacity-50 disabled:cursor-not-allowed',
          )}
        >
          {running ? 'Running...' : 'Run tool'}
        </button>
      </div>

      {selectedTool && (
        <div className="text-[11px] text-neutral-500 dark:text-neutral-400">
          {selectedTool.label}: {selectedTool.description}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        <label className="text-[11px] text-neutral-600 dark:text-neutral-300">
          Params (JSON)
          <textarea
            value={paramsText}
            disabled={disabled || running}
            onChange={(e) => setParamsText(e.target.value)}
            spellCheck={false}
            className="mt-1 w-full rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1 text-xs font-mono min-h-[56px]"
          />
        </label>
        <label className="text-[11px] text-neutral-600 dark:text-neutral-300">
          Run context (JSON)
          <textarea
            value={contextText}
            disabled={disabled || running}
            onChange={(e) => setContextText(e.target.value)}
            spellCheck={false}
            className="mt-1 w-full rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1 text-xs font-mono min-h-[56px]"
          />
        </label>
      </div>

      {catalogError && (
        <div className="text-xs text-red-600 dark:text-red-400">{catalogError}</div>
      )}
      {runError && (
        <div className="text-xs text-red-600 dark:text-red-400">{runError}</div>
      )}

      {result && (
        <div className="rounded border border-neutral-200 dark:border-neutral-700 bg-white/70 dark:bg-neutral-950/40 p-2 space-y-2">
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-neutral-600 dark:text-neutral-300">
            <span>
              Result from <strong>{result.provenance.preset_id}</strong>
            </span>
            <span className="ml-auto">{diffSummary(promptText, result.prompt_text)}</span>
          </div>

          <div className="rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1.5 text-xs leading-relaxed max-h-32 overflow-y-auto">
            {diffSegments.length === 0 ? (
              <span className="text-neutral-500 dark:text-neutral-400">No diff</span>
            ) : (
              diffSegments.map((segment, index) => (
                <span
                  key={`${segment.type}-${index}`}
                  className={clsx(
                    segment.type === 'add' && 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300',
                    segment.type === 'remove' && 'line-through bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300',
                    segment.type === 'keep' && 'text-neutral-700 dark:text-neutral-200',
                  )}
                >
                  {segment.text}{' '}
                </span>
              ))
            )}
          </div>

          {result.warnings && result.warnings.length > 0 && (
            <div className="text-xs text-amber-700 dark:text-amber-400">
              Warnings: {result.warnings.join(' | ')}
            </div>
          )}
          {result.block_overlay && result.block_overlay.length > 0 && (
            <div className="text-xs text-neutral-600 dark:text-neutral-300">
              Block overlay entries: {result.block_overlay.length}
            </div>
          )}
          {result.guidance_patch && (
            <details className="text-xs">
              <summary className="cursor-pointer text-neutral-600 dark:text-neutral-300">Guidance patch</summary>
              <pre className="mt-1 max-h-28 overflow-y-auto rounded border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-900 p-2 text-[11px] whitespace-pre-wrap break-words">
                {JSON.stringify(result.guidance_patch, null, 2)}
              </pre>
            </details>
          )}
          {result.composition_assets_patch && result.composition_assets_patch.length > 0 && (
            <details className="text-xs">
              <summary className="cursor-pointer text-neutral-600 dark:text-neutral-300">Composition assets patch</summary>
              <pre className="mt-1 max-h-28 overflow-y-auto rounded border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-900 p-2 text-[11px] whitespace-pre-wrap break-words">
                {JSON.stringify(result.composition_assets_patch, null, 2)}
              </pre>
            </details>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <label className="text-[11px] text-neutral-600 dark:text-neutral-300" htmlFor={`${panelId}-apply`}>
              Apply mode
            </label>
            <select
              id={`${panelId}-apply`}
              value={applyMode}
              disabled={disabled || running}
              onChange={(e) => setApplyMode(e.target.value as PromptToolApplyMode)}
              className="text-xs rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1"
            >
              <option value="replace_text">replace_text</option>
              <option value="append_text">append_text</option>
              <option value="apply_overlay_only">apply_overlay_only</option>
              <option value="apply_all">apply_all</option>
            </select>
            <button
              type="button"
              disabled={disabled || running}
              onClick={handleApply}
              className={clsx(
                'text-xs px-2 py-1 rounded border',
                'border-neutral-200 dark:border-neutral-700',
                'text-neutral-700 dark:text-neutral-200',
                'hover:bg-neutral-100 dark:hover:bg-neutral-800',
                'disabled:opacity-50 disabled:cursor-not-allowed',
              )}
            >
              Apply
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
