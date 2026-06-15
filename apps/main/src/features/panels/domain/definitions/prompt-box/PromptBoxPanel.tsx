import clsx from 'clsx';
import { useEffect, useRef, useState } from 'react';

import { getAssetGenerationContext } from '@lib/api/assets';
import { Icon } from '@lib/icons';

import { CAP_ASSET_SELECTION, useCapability } from '@features/contextHub';
import type { AssetSelection } from '@features/contextHub';
import { PromptModerationChip } from '@features/generation/components/PromptModerationChip';
import { PromptAnalysisLayout } from '@features/prompts/components/PromptAnalysisLayout';
import { PromptCodeMirrorViewer } from '@features/prompts/components/PromptCodeMirrorViewer';
import { PromptInlineViewer } from '@features/prompts/components/PromptInlineViewer';
import { useShadowAnalysis } from '@features/prompts/hooks/useShadowAnalysis';
import { usePromptSettingsStore } from '@features/prompts/stores/promptSettingsStore';

export function PromptBoxPanel() {
  const { value: selection } = useCapability<AssetSelection>(CAP_ASSET_SELECTION);
  const assetId = selection?.asset?.id ?? null;
  const defaultAnalyzer = usePromptSettingsStore((s) => s.defaultAnalyzer);
  const viewerEngine = usePromptSettingsStore((s) => s.viewerEngine);
  const setViewerEngine = usePromptSettingsStore((s) => s.setViewerEngine);

  const [prompt, setPrompt] = useState<string | null>(null);
  const [operationType, setOperationType] = useState<string | null>(null);
  const [model, setModel] = useState<string | null>(null);
  const [duration, setDuration] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastRequestIdRef = useRef(0);

  // Fetch the asset's stored prompt; analysis itself is delegated to
  // useShadowAnalysis so we share the cache + analyzer choice with the
  // main composer (otherwise the inspector and the editor can render
  // different highlights for the same text).
  // ViewerAsset.id is `string | number` to cover local-folder assets, but
  // the backend context endpoint only knows numeric IDs — narrow before fetching.
  const numericAssetId = typeof assetId === 'number' ? assetId : null;

  useEffect(() => {
    if (numericAssetId === null) {
      setPrompt(null);
      setError(null);
      setLoading(false);
      return;
    }

    const requestId = ++lastRequestIdRef.current;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const ctx = await getAssetGenerationContext(numericAssetId);
        if (requestId !== lastRequestIdRef.current) return;
        const c = ctx as {
          final_prompt?: string;
          operation_type?: string;
          model?: string;
          duration?: number;
          canonical_params?: { model?: string; duration?: number };
        };
        setPrompt(c.final_prompt ?? '');
        setOperationType(c.operation_type ?? null);
        setModel(c.canonical_params?.model ?? c.model ?? null);
        setDuration(c.canonical_params?.duration ?? c.duration ?? null);
      } catch {
        if (requestId === lastRequestIdRef.current) {
          setPrompt(null);
          setOperationType(null);
          setModel(null);
          setDuration(null);
          setError('No prompt metadata available for this asset.');
        }
      } finally {
        if (requestId === lastRequestIdRef.current) setLoading(false);
      }
    })();
  }, [numericAssetId]);

  const analysis = useShadowAnalysis(prompt ?? '', {
    enabled: !!prompt && prompt.trim().length > 0,
    analyzerId: defaultAnalyzer,
  });

  const tokenLines = analysis.result?.tokens?.lines;

  if (!assetId) {
    return <EmptyState icon="image">Focus an asset in the viewer to inspect its prompt.</EmptyState>;
  }
  if (loading && !prompt) {
    return <EmptyState icon="loader" spinning>Loading prompt…</EmptyState>;
  }
  if (error) {
    return <EmptyState icon="alertCircle">{error}</EmptyState>;
  }
  if (!prompt) {
    return <EmptyState icon="fileText">This asset has no prompt on record.</EmptyState>;
  }

  // PromptAnalysisLayout owns the side panel + legend + emphasis state.
  // We only need to render the editor surface; emphasizedRole is threaded
  // back to us so the chosen role pops while others dim.
  const candidates = analysis.result?.candidates ?? [];

  return (
    <div className="flex h-full flex-col">
      <PanelHeader prompt={prompt} operationType={operationType} model={model} duration={duration} engine={viewerEngine} onEngineChange={setViewerEngine} />
      <div className="flex-1 min-h-0">
        <PromptAnalysisLayout
          analysis={analysis}
          layout="side-by-side"
          surfaceId="promptBox"
          renderEditor={({ emphasizedRole }) => (
            <div className="h-full overflow-auto p-3">
              {viewerEngine === 'codemirror' ? (
                <PromptCodeMirrorViewer
                  prompt={prompt}
                  candidates={candidates}
                  tokenLines={tokenLines}
                  emphasizedRole={emphasizedRole}
                  enableVariableSave
                />
              ) : (
                <PromptInlineViewer
                  prompt={prompt}
                  candidates={candidates}
                  tokenLines={tokenLines}
                  className="h-full overflow-auto rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-2 text-neutral-900 dark:text-neutral-100"
                  emphasizedRole={emphasizedRole}
                  enableVariableSave
                />
              )}
            </div>
          )}
        />
      </div>
    </div>
  );
}

function PanelHeader({
  prompt,
  operationType,
  model,
  duration,
  engine,
  onEngineChange,
}: {
  prompt: string;
  operationType: string | null;
  model: string | null;
  duration: number | null;
  engine: 'inline' | 'codemirror';
  onEngineChange: (next: 'inline' | 'codemirror') => void;
}) {
  return (
    <div className="flex items-center gap-2 px-2 py-1 border-b border-neutral-200 dark:border-neutral-800 text-xs">
      {/* The bare "Prompt" caption is redundant next to the prompt text below, so
          pair it with this prompt's render-moderation track record (prompt-only —
          we're inspecting a stored asset, not composing with a live input image). */}
      <div className="mr-auto flex items-center gap-2">
        <span className="text-neutral-500 dark:text-neutral-400">Prompt</span>
        <PromptModerationChip prompt={prompt} imageAssetId={null} operationType={operationType} model={model} duration={duration} />
      </div>
      <EngineButton
        active={engine === 'inline'}
        onClick={() => onEngineChange('inline')}
        title="Inline view — DOM spans, lightweight"
      >
        Inline
      </EngineButton>
      <EngineButton
        active={engine === 'codemirror'}
        onClick={() => onEngineChange('codemirror')}
        title="CodeMirror view — full structural decorations"
      >
        CM
      </EngineButton>
    </div>
  );
}

function EngineButton({
  active,
  onClick,
  title,
  children,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={clsx(
        'px-2 py-0.5 rounded text-[11px] font-medium transition-colors',
        active
          ? 'bg-neutral-200 dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100'
          : 'text-neutral-500 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800',
      )}
    >
      {children}
    </button>
  );
}

function EmptyState({
  icon,
  spinning,
  children,
}: {
  icon: string;
  spinning?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-sm text-neutral-500">
      <Icon name={icon as never} size={20} className={spinning ? 'animate-spin opacity-60' : 'opacity-60'} />
      <span>{children}</span>
    </div>
  );
}
