import { useState } from 'react';
import clsx from 'clsx';
import { useControlCenterStore } from '../../../stores/controlCenterStore';
import { PromptInput } from '../../primitives/PromptInput';
import { resolvePromptLimit } from '../../../utils/prompt/limits';
import { useProviders } from '../../../hooks/useProviders';
import { generateAsset } from '../../../lib/api/controlCenter';

const PRESET_OPTIONS = [
  { id: 'default', name: 'Default' },
  { id: 'fast', name: 'Fast' },
  { id: 'quality', name: 'High Quality' },
];

export function QuickGenerateModule() {
  const {
    providerId,
    presetId,
    setProvider,
    setPreset,
    generating,
    setGenerating,
    pushPrompt,
    recentPrompts,
  } = useControlCenterStore(s => ({
    providerId: s.providerId,
    presetId: s.presetId,
    setProvider: s.setProvider,
    setPreset: s.setPreset,
    generating: s.generating,
    setGenerating: s.setGenerating,
    pushPrompt: s.pushPrompt,
    recentPrompts: s.recentPrompts,
  }));

  const { providers } = useProviders();
  const [prompt, setPrompt] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function onGenerate() {
    const p = prompt.trim();
    if (!p) return;

    setError(null);
    pushPrompt(p);
    setGenerating(true);

    try {
      const result = await generateAsset({
        prompt: p,
        providerId,
        presetId,
      });

      // Clear prompt on success
      setPrompt('');

      // We don't get asset_id immediately from /jobs create; just log and optionally
      // redirect users later when job completes (WS/notifications to be wired).
      // eslint-disable-next-line no-console
      console.log('Generation job created:', result);
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || 'Failed to generate asset');
    } finally {
      setGenerating(false);
    }
  }

  function restorePrompt(p: string) {
    setPrompt(p);
  }

  const maxChars = resolvePromptLimit(providerId);

  return (
    <div className="flex flex-col gap-3 h-full">
      {/* Main content area */}
      <div className="flex gap-3 items-start flex-1">
        <div className="flex-1 flex flex-col gap-2">
          <PromptInput
            value={prompt}
            onChange={setPrompt}
            maxChars={maxChars}
            disabled={generating}
            variant="compact"
          />
          {error && (
            <div className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 p-2 rounded">
              {error}
            </div>
          )}
        </div>

        <div className="w-64 flex flex-col gap-2">
          <label className="text-xs text-neutral-500">Provider</label>
          <select
            value={providerId ?? ''}
            onChange={(e) => setProvider(e.target.value || undefined)}
            disabled={generating}
            className="p-2 text-sm border rounded bg-white dark:bg-neutral-900 disabled:opacity-50"
          >
            <option value="">Auto</option>
            {providers.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>

          <label className="text-xs text-neutral-500">Preset</label>
          <select
            value={presetId ?? 'default'}
            onChange={(e) => setPreset(e.target.value || undefined)}
            disabled={generating}
            className="p-2 text-sm border rounded bg-white dark:bg-neutral-900 disabled:opacity-50"
          >
            {PRESET_OPTIONS.map(opt => (
              <option key={opt.id} value={opt.id}>{opt.name}</option>
            ))}
          </select>

          <button
            onClick={onGenerate}
            disabled={generating || !prompt.trim()}
            className={clsx(
              'mt-2 py-2 px-4 rounded text-sm font-medium text-white transition-colors',
              'disabled:opacity-50 disabled:cursor-not-allowed',
              generating || !prompt.trim()
                ? 'bg-neutral-400'
                : 'bg-blue-600 hover:bg-blue-700'
            )}
          >
            {generating ? 'Generating…' : 'Generate'}
          </button>
        </div>
      </div>

      {/* Recent prompts */}
      {recentPrompts.length > 0 && (
        <div className="border-t pt-2">
          <div className="text-xs text-neutral-500 mb-1">Recent prompts:</div>
          <div className="flex gap-1 flex-wrap max-h-12 overflow-y-auto">
            {recentPrompts.slice(0, 5).map((p, i) => (
              <button
                key={i}
                onClick={() => restorePrompt(p)}
                disabled={generating}
                className="text-xs px-2 py-1 rounded bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 truncate max-w-xs disabled:opacity-50"
                title={p}
              >
                {p.length > 50 ? `${p.slice(0, 50)}…` : p}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
