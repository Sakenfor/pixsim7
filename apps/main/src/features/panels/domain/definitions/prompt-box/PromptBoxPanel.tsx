import { useEffect, useRef, useState } from 'react';

import { getAssetGenerationContext } from '@lib/api/assets';
import { Icon } from '@lib/icons';

import { CAP_ASSET_SELECTION, useCapability } from '@features/contextHub';
import type { AssetSelection } from '@features/contextHub';
import { PromptInlineViewer } from '@features/prompts/components/PromptInlineViewer';
import type { PromptBlockCandidate } from '@features/prompts/types';

import { useApi } from '@/hooks/useApi';

interface AnalyzeResponse {
  analysis?: { candidates?: PromptBlockCandidate[] };
}

export function PromptBoxPanel() {
  const { value: selection } = useCapability<AssetSelection>(CAP_ASSET_SELECTION);
  const assetId = selection?.asset?.id ?? null;
  const api = useApi();

  const [prompt, setPrompt] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<PromptBlockCandidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastRequestIdRef = useRef(0);

  useEffect(() => {
    if (!assetId) {
      setPrompt(null);
      setCandidates([]);
      setError(null);
      setLoading(false);
      return;
    }

    const requestId = ++lastRequestIdRef.current;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const ctx = await getAssetGenerationContext(assetId);
        if (requestId !== lastRequestIdRef.current) return;

        const text = (ctx as { final_prompt?: string }).final_prompt ?? '';
        setPrompt(text);

        if (text.trim()) {
          try {
            const analysis = await api.post<AnalyzeResponse>('/prompts/analyze', { text });
            if (requestId !== lastRequestIdRef.current) return;
            setCandidates(analysis?.analysis?.candidates ?? []);
          } catch {
            if (requestId === lastRequestIdRef.current) setCandidates([]);
          }
        } else {
          setCandidates([]);
        }
      } catch {
        if (requestId === lastRequestIdRef.current) {
          setPrompt(null);
          setCandidates([]);
          setError('No prompt metadata available for this asset.');
        }
      } finally {
        if (requestId === lastRequestIdRef.current) setLoading(false);
      }
    })();
  }, [assetId, api]);

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

  return (
    <div className="h-full overflow-auto p-3">
      <PromptInlineViewer prompt={prompt} candidates={candidates} showLegend />
    </div>
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
