import type { PromptBlockLike } from '@pixsim7/core.prompt';
import {
  BASE_PROMPT_ROLES,
  DEFAULT_PROMPT_ROLE,
  composePromptFromBlocks,
  deriveBlocksFromCandidates,
  ensurePromptBlocks,
} from '@pixsim7/core.prompt';
import type { PromptBlockCandidate } from '@pixsim7/shared.types/prompt';
import { DropdownItem, DropdownDivider, FoldGroup, GroupedFold, Popover, PromptInput } from '@pixsim7/shared.ui';
import clsx from 'clsx';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';

import { contextMenuAttrs, useRegisterContextData } from '@lib/dockview/contextMenu';
import { Icon } from '@lib/icons';

import { openWorkspacePanel } from '@features/workspace';
import { useWorkspaceStore } from '@features/workspace';

import { useApi } from '@/hooks/useApi';
import {
  executePromptTool,
  listPromptToolCatalog,
  type PromptToolCatalogScope,
  type PromptToolExecuteResponse,
  type PromptToolPreset,
} from '@/lib/api/promptTools';
import { getPromptRoleBadgeClass, getPromptRoleLabel } from '@/lib/promptRoleUi';
import {
  BlockBreakdownDrawer,
  BlockBuilderModal,
  PackHintsDrawer,
  VariantSuggestionsDrawer,
} from '@/plugins/ui/prompt-companion/components';


import { usePromptHistory } from '../hooks/usePromptHistory';
import { useSemanticActionBlocks } from '../hooks/useSemanticActionBlocks';
import { useShadowAnalysis } from '../hooks/useShadowAnalysis';
import { getCachedAnalysis, setCachedAnalysis, type AnalysisResult } from '../lib/promptAnalysisCache';
import { diffPrompt, diffSummary } from '../lib/promptDiff';
import { useBlockTemplateStore } from '../stores/blockTemplateStore';
import { usePromptSettingsStore } from '../stores/promptSettingsStore';
import type { PromptTag } from '../types';


import { InlineBlocksEditor } from './InlineBlocksEditor';
import { PromptHistoryPopover } from './PromptHistoryPopover';
import { ShadowSidePanel } from './ShadowSidePanel';
import { ShadowTextarea } from './ShadowTextarea';
import { RoleBadge } from './shared/RoleBadge';

type PromptComposerMode = 'text' | 'blocks';
type PromptToolApplyMode = 'replace_text' | 'append_text' | 'apply_overlay_only' | 'apply_all';

interface PromptBlockItem extends PromptBlockLike {
  id: string;
}

interface AnalyzePromptResponse {
  analysis?: {
    prompt?: string;
    candidates?: PromptBlockCandidate[];
    tags?: PromptTag[];
  };
}

interface PromptAnalysis {
  prompt: string;
  candidates: PromptBlockCandidate[];
  tags: PromptTag[];
}

interface CategoryDiscoveryResponse {
  prompt_text: string;
  candidates: PromptBlockCandidate[];
  existing_ontology_ids: string[];
  suggestions?: Record<string, unknown>;
  suggested_ontology_ids: Array<{
    id: string;
    label: string;
    description?: string;
    kind: string;
    confidence: number;
  }>;
  suggested_packs: Array<{
    pack_id: string;
    pack_label: string;
    parser_hints: Record<string, string[]>;
    notes?: string;
  }>;
  suggested_candidates: PromptBlockCandidate[];
}

export interface PromptComposerProps {
  value: string;
  onChange: (val: string) => void;
  maxChars?: number;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  variant?: 'default' | 'compact';
  showCounter?: boolean;
  resizable?: boolean;
  minHeight?: number;
}

function truncate(text: string, maxLen: number) {
  if (text.length <= maxLen) return text;
  return `${text.slice(0, Math.max(0, maxLen - 1))}\u2026`;
}

function composePrompt(blocks: PromptBlockItem[]) {
  return composePromptFromBlocks(blocks);
}

export function PromptComposer({
  value,
  onChange,
  maxChars,
  placeholder,
  disabled = false,
  className,
  variant = 'default',
  showCounter = true,
  resizable = false,
  minHeight,
}: PromptComposerProps) {
  const composerId = useId();
  const api = useApi();
  const openFloatingPanel = useWorkspaceStore((s) => s.openFloatingPanel);
  const pinnedTemplateId = useBlockTemplateStore((s) => s.pinnedTemplateId);
  const promptRoleColors = usePromptSettingsStore((state) => state.promptRoleColors);
  const autoAnalyze = usePromptSettingsStore((state) => state.autoAnalyze);
  const defaultAnalyzer = usePromptSettingsStore((state) => state.defaultAnalyzer);
  const blocksLayout = usePromptSettingsStore((state) => state.blocksLayout);
  const setBlocksLayout = usePromptSettingsStore((state) => state.setBlocksLayout);
  const [mode, setMode] = useState<PromptComposerMode>('text');
  const [showLayoutMenu, setShowLayoutMenu] = useState(false);
  const layoutTriggerRef = useRef<HTMLButtonElement>(null);
  const [blocks, setBlocks] = useState<PromptBlockItem[]>([
    { id: 'block-0', role: DEFAULT_PROMPT_ROLE, text: '' },
  ]);
  const [isParsing, setIsParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [assistantError, setAssistantError] = useState<string | null>(null);

  const [showShadow, setShowShadow] = useState(false);
  const [showBlockBreakdown, setShowBlockBreakdown] = useState(false);
  const [showVariants, setShowVariants] = useState(false);
  const [showPackHints, setShowPackHints] = useState(false);
  const [showBlockBuilder, setShowBlockBuilder] = useState(false);
  const [showBlockTools, setShowBlockTools] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showPromptTools, setShowPromptTools] = useState(false);
  const historyTriggerRef = useRef<HTMLButtonElement>(null);
  const [promptToolScope, setPromptToolScope] = useState<PromptToolCatalogScope>('builtin');
  const [promptToolCatalogLoading, setPromptToolCatalogLoading] = useState(false);
  const [promptToolCatalogError, setPromptToolCatalogError] = useState<string | null>(null);
  const [promptToolCatalog, setPromptToolCatalog] = useState<PromptToolPreset[]>([]);
  const [selectedPromptToolId, setSelectedPromptToolId] = useState('');
  const [promptToolParamsText, setPromptToolParamsText] = useState('{}');
  const [promptToolContextText, setPromptToolContextText] = useState('{}');
  const [runningPromptTool, setRunningPromptTool] = useState(false);
  const [promptToolRunError, setPromptToolRunError] = useState<string | null>(null);
  const [promptToolResult, setPromptToolResult] = useState<PromptToolExecuteResponse | null>(null);
  const [promptToolApplyMode, setPromptToolApplyMode] = useState<PromptToolApplyMode>('replace_text');

  const [analyzingBlocks, setAnalyzingBlocks] = useState(false);
  const [fetchingVariants, setFetchingVariants] = useState(false);
  const [fetchingPacks, setFetchingPacks] = useState(false);

  const [blockAnalysis, setBlockAnalysis] = useState<PromptAnalysis | null>(null);
  const [variants, setVariants] = useState<string[]>([]);
  const [packHints, setPackHints] = useState<CategoryDiscoveryResponse | null>(null);

  const idCounterRef = useRef(1);
  const lastComposedRef = useRef<string | null>(null);
  const lastParsedRef = useRef<string | null>(null);
  const parseRequestIdRef = useRef(0);
  const expandAllRef = useRef<(() => void) | null>(null);
  const collapseAllRef = useRef<(() => void) | null>(null);
  const blockToolsTriggerRef = useRef<HTMLButtonElement>(null);

  // Stable refs for callbacks — prevents identity cascade
  // (onChange/value changing → updateBlocks changing → seedBlocksFromPrompt changing → effect re-firing)
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const valueRef = useRef(value);
  valueRef.current = value;

  // --- Undo/redo history ---
  const history = usePromptHistory(value, 80);
  const undoDebounceRef = useRef<ReturnType<typeof setTimeout>>();
  const undoingRef = useRef(false);

  const flushSnapshot = useCallback(() => {
    clearTimeout(undoDebounceRef.current);
    history.snapshot(valueRef.current);
  }, [history]);

  // Debounced snapshot: captures typing pauses (600ms idle)
  useEffect(() => {
    if (undoingRef.current) {
      undoingRef.current = false;
      return;
    }
    clearTimeout(undoDebounceRef.current);
    undoDebounceRef.current = setTimeout(() => {
      history.snapshot(value);
    }, 600);
    return () => clearTimeout(undoDebounceRef.current);
  }, [value, history]);

  // Capture-phase keyboard handler — intercepts before native textarea undo
  const handleUndoKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;

      if (e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        e.stopPropagation();
        flushSnapshot();
        const prev = history.undo();
        if (prev !== null) {
          undoingRef.current = true;
          onChangeRef.current(prev);
        }
      } else if ((e.key === 'z' && e.shiftKey) || e.key === 'y') {
        e.preventDefault();
        e.stopPropagation();
        const next = history.redo();
        if (next !== null) {
          undoingRef.current = true;
          onChangeRef.current(next);
        }
      }
    },
    [flushSnapshot, history],
  );

  // --- Context menu data for prompt-text right-click ---
  const promptContextAttrs = contextMenuAttrs('prompt-text', composerId, 'Prompt');
  useRegisterContextData('prompt-text', composerId, {
    prompt: value,
    setPrompt: onChange,
    undo: () => {
      flushSnapshot();
      const prev = history.undo();
      if (prev !== null) {
        undoingRef.current = true;
        onChangeRef.current(prev);
      }
    },
    redo: () => {
      const next = history.redo();
      if (next !== null) {
        undoingRef.current = true;
        onChangeRef.current(next);
      }
    },
    canUndo: history.canUndo(),
    canRedo: history.canRedo(),
  }, [value, onChange, flushSnapshot, history]);

  // --- History popover ---
  const historyTimeline = useMemo(
    () => (showHistory ? history.getTimeline() : { entries: [], currentIndex: 0 }),
    // Re-compute only when popover opens (showHistory toggle)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [showHistory],
  );
  const handleOpenHistory = useCallback(() => {
    flushSnapshot();
    setShowHistory((prev) => !prev);
  }, [flushSnapshot]);
  const handleHistoryJump = useCallback(
    (index: number) => {
      const restored = history.jumpTo(index);
      if (restored !== null) {
        undoingRef.current = true;
        onChangeRef.current(restored);
      }
      setShowHistory(false);
    },
    [history],
  );

  const roleOptions = useMemo(() => {
    const roles = new Set<string>(BASE_PROMPT_ROLES);
    blocks.forEach((block) => {
      if (block.role) roles.add(block.role);
    });
    return Array.from(roles);
  }, [blocks]);

  const shadowAnalysis = useShadowAnalysis(value, {
    enabled: mode === 'text' && showShadow && autoAnalyze,
    analyzerId: defaultAnalyzer,
  });

  const {
    results: semanticMatches,
    loading: semanticLoading,
  } = useSemanticActionBlocks(value, {
    enabled: mode === 'blocks',
    minChars: 16,
    debounceMs: 450,
  });

  const updateBlocks = useCallback(
    (nextBlocks: PromptBlockItem[]) => {
      setBlocks(nextBlocks);
      const composed = composePrompt(nextBlocks);
      lastComposedRef.current = composed;
      lastParsedRef.current = composed.trim();
      if (composed !== valueRef.current) {
        onChangeRef.current(composed);
      }
    },
    [] // stable — uses refs for onChange/value
  );

  const seedBlocksFromPrompt = useCallback(
    async (text: string, { force = false }: { force?: boolean } = {}) => {
      const normalized = text.trim();
      if (!force && normalized && lastParsedRef.current === normalized) {
        return;
      }

      if (!normalized) {
        lastParsedRef.current = '';
        updateBlocks([{ id: 'block-0', role: DEFAULT_PROMPT_ROLE, text: '' }]);
        return;
      }

      // Check shared analysis cache (may have been populated by shadow analysis)
      const cached = getCachedAnalysis(normalized);
      if (cached && !force) {
        const derivedBlocks = deriveBlocksFromCandidates(cached.candidates, {
          defaultRole: DEFAULT_PROMPT_ROLE,
          fallbackText: normalized,
        });
        const ensured = ensurePromptBlocks(derivedBlocks, normalized, DEFAULT_PROMPT_ROLE);
        const nextBlocks = ensured.map((candidate, index) => ({
          id: `block-${Date.now()}-${index}`,
          role: candidate.role,
          text: candidate.text,
        }));
        lastParsedRef.current = normalized;
        updateBlocks(nextBlocks);
        return;
      }

      const requestId = ++parseRequestIdRef.current;
      setIsParsing(true);
      setParseError(null);

      try {
        const response = await api.post<AnalyzePromptResponse>('/prompts/analyze', {
          text: normalized,
        });
        if (requestId !== parseRequestIdRef.current) return;

        const candidates = response?.analysis?.candidates ?? [];

        // Write to shared cache so shadow analysis can reuse
        setCachedAnalysis(normalized, undefined, {
          prompt: response?.analysis?.prompt || normalized,
          candidates,
          tags: (response?.analysis?.tags ?? []) as AnalysisResult['tags'],
        });

        const derivedBlocks = deriveBlocksFromCandidates(candidates, {
          defaultRole: DEFAULT_PROMPT_ROLE,
          fallbackText: normalized,
        });

        const ensured = ensurePromptBlocks(derivedBlocks, normalized, DEFAULT_PROMPT_ROLE);
        const nextBlocks = ensured.map((candidate, index) => ({
          id: `block-${Date.now()}-${index}`,
          role: candidate.role,
          text: candidate.text,
        }));

        lastParsedRef.current = normalized;
        updateBlocks(nextBlocks);
      } catch (err) {
        if (requestId !== parseRequestIdRef.current) return;
        setParseError(err instanceof Error ? err.message : 'Failed to parse prompt');
        updateBlocks([{ id: 'block-0', role: DEFAULT_PROMPT_ROLE, text: normalized }]);
      } finally {
        if (requestId === parseRequestIdRef.current) {
          setIsParsing(false);
        }
      }
    },
    [api, updateBlocks]
  );

  const handleModeChange = useCallback(
    (nextMode: PromptComposerMode) => {
      if (nextMode === mode) return;

      if (nextMode === 'blocks') {
        setMode('blocks');
        return;
      }

      const composed = composePrompt(blocks);
      lastComposedRef.current = composed;
      lastParsedRef.current = composed.trim();
      if (composed !== valueRef.current) {
        onChangeRef.current(composed);
      }
      setMode('text');
    },
    [blocks, mode]
  );

  useEffect(() => {
    if (mode !== 'blocks') return;
    if (value === lastComposedRef.current) return;
    void seedBlocksFromPrompt(value);
  }, [mode, seedBlocksFromPrompt, value]);

  const addBlock = useCallback(() => {
    const nextId = `block-${idCounterRef.current++}`;
    updateBlocks([
      ...blocks,
      { id: nextId, role: DEFAULT_PROMPT_ROLE, text: '' },
    ]);
  }, [blocks, updateBlocks]);

  const removeBlock = useCallback(
    (id: string) => {
      const nextBlocks = blocks.filter((block) => block.id !== id);
      updateBlocks(nextBlocks.length ? nextBlocks : [{ id: 'block-0', role: DEFAULT_PROMPT_ROLE, text: '' }]);
    },
    [blocks, updateBlocks]
  );

  const moveBlock = useCallback(
    (index: number, direction: 'up' | 'down') => {
      const next = [...blocks];
      const targetIndex = direction === 'up' ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= next.length) return;
      const [item] = next.splice(index, 1);
      next.splice(targetIndex, 0, item);
      updateBlocks(next);
    },
    [blocks, updateBlocks]
  );

  const insertSemanticBlock = useCallback(
    (text: string, role?: string | null) => {
      const nextId = `block-${idCounterRef.current++}`;
      updateBlocks([...blocks, { id: nextId, role: role || DEFAULT_PROMPT_ROLE, text }]);
    },
    [blocks, updateBlocks]
  );

  const handleInsertBlock = useCallback(
    (text: string) => {
      insertSemanticBlock(text, DEFAULT_PROMPT_ROLE);
    },
    [insertSemanticBlock]
  );

  const handleAnalyzeBlocks = useCallback(async () => {
    const normalized = value.trim();
    if (!normalized) {
      setAssistantError('Enter a prompt to analyze');
      return;
    }

    // Check shared cache first
    const cached = getCachedAnalysis(normalized);
    if (cached) {
      setBlockAnalysis({
        prompt: cached.prompt,
        candidates: cached.candidates,
        tags: cached.tags as PromptTag[],
      });
      setShowBlockBreakdown(true);
      return;
    }

    setAnalyzingBlocks(true);
    setAssistantError(null);

    try {
      const response = await api.post<AnalyzePromptResponse>('/prompts/analyze', {
        text: normalized,
      });
      const analysis = response.analysis;
      const next: PromptAnalysis = {
        prompt: analysis?.prompt || normalized,
        candidates: analysis?.candidates || [],
        tags: analysis?.tags || [],
      };

      // Write to shared cache
      setCachedAnalysis(normalized, undefined, {
        prompt: next.prompt,
        candidates: next.candidates,
        tags: next.tags as AnalysisResult['tags'],
      });

      setBlockAnalysis(next);
      setShowBlockBreakdown(true);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to analyze prompt';
      setAssistantError(message);
    } finally {
      setAnalyzingBlocks(false);
    }
  }, [api, value]);

  const handleSuggestVariants = useCallback(async () => {
    const normalized = value.trim();
    if (!normalized) {
      setAssistantError('Enter a prompt to get variants');
      return;
    }

    const isDevMode = import.meta.env.DEV;
    setFetchingVariants(true);
    setAssistantError(null);

    try {
      const result = await api.post<{ variants: string[] }>(
        '/dev/prompt-editor/suggest-variants',
        { prompt_text: normalized, count: 3 }
      );
      setVariants(result.variants || []);
      setShowVariants(true);
    } catch (err: unknown) {
      if (isDevMode) {
        const message = err instanceof Error ? err.message : 'Variants API unavailable';
        setAssistantError(message);
      }
      setVariants([]);
      setShowVariants(true);
    } finally {
      setFetchingVariants(false);
    }
  }, [api, value]);

  const handlePackHints = useCallback(async () => {
    const normalized = value.trim();
    if (!normalized) {
      setAssistantError('Enter a prompt to discover packs');
      return;
    }

    const isDevMode = import.meta.env.DEV;
    setFetchingPacks(true);
    setAssistantError(null);

    try {
      const result = await api.post<CategoryDiscoveryResponse>(
        '/dev/prompt-categories/discover',
        { prompt_text: normalized }
      );
      setPackHints(result);
      setShowPackHints(true);
    } catch (err: unknown) {
      if (isDevMode) {
        const message = err instanceof Error ? err.message : 'Pack hints unavailable';
        setAssistantError(message);
      }
    } finally {
      setFetchingPacks(false);
    }
  }, [api, value]);

  const handleSelectVariant = useCallback(
    (variant: string) => {
      flushSnapshot();
      onChange(variant);
      setShowVariants(false);
    },
    [onChange, flushSnapshot]
  );

  const handlePasteFromClipboard = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (!text) return;
      // Allow pasting full text even if over limit — truncation happens at generation time
      flushSnapshot();
      onChange(text);
    } catch {
      // Clipboard access denied or unavailable
    }
  }, [onChange, flushSnapshot]);

  const parseJsonObject = useCallback((raw: string, label: string): Record<string, unknown> => {
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
  }, []);

  const loadPromptToolCatalog = useCallback(async () => {
    setPromptToolCatalogLoading(true);
    setPromptToolCatalogError(null);
    try {
      const response = await listPromptToolCatalog(promptToolScope);
      const presets = response.presets ?? [];
      setPromptToolCatalog(presets);
      setSelectedPromptToolId((prev) => {
        if (prev && presets.some((item) => item.id === prev)) return prev;
        return presets[0]?.id ?? '';
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load prompt tools catalog';
      setPromptToolCatalog([]);
      setSelectedPromptToolId('');
      setPromptToolCatalogError(message);
    } finally {
      setPromptToolCatalogLoading(false);
    }
  }, [promptToolScope]);

  useEffect(() => {
    if (!showPromptTools) return;
    void loadPromptToolCatalog();
  }, [loadPromptToolCatalog, showPromptTools]);

  const appendPromptToolOverlayToBlocks = useCallback(
    (overlay: Array<Record<string, unknown>> | undefined | null): boolean => {
      if (!overlay || overlay.length === 0) return false;
      const nextOverlayBlocks: PromptBlockItem[] = [];
      for (const item of overlay) {
        const textCandidate =
          (typeof item.text === 'string' && item.text.trim()) ||
          (typeof item.prompt_text === 'string' && item.prompt_text.trim()) ||
          (typeof item.content === 'string' && item.content.trim()) ||
          (typeof item.value === 'string' && item.value.trim()) ||
          '';
        if (!textCandidate) continue;
        const roleCandidate =
          (typeof item.role === 'string' && item.role.trim()) ||
          DEFAULT_PROMPT_ROLE;
        nextOverlayBlocks.push({
          id: `block-${idCounterRef.current++}`,
          role: roleCandidate,
          text: textCandidate,
        });
      }

      if (nextOverlayBlocks.length === 0) return false;
      updateBlocks([...blocks, ...nextOverlayBlocks]);
      return true;
    },
    [blocks, updateBlocks],
  );

  const handleRunPromptTool = useCallback(async () => {
    if (disabled) return;
    if (!selectedPromptToolId) {
      setPromptToolRunError('Select a tool preset first');
      return;
    }

    setRunningPromptTool(true);
    setPromptToolRunError(null);
    try {
      const params = parseJsonObject(promptToolParamsText, 'Params');
      const runContext = parseJsonObject(promptToolContextText, 'Run context');
      const result = await executePromptTool({
        preset_id: selectedPromptToolId,
        prompt_text: value,
        params,
        run_context: runContext,
      });
      setPromptToolResult(result);
      setPromptToolApplyMode(
        result.block_overlay && result.block_overlay.length > 0 ? 'apply_all' : 'replace_text',
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to execute prompt tool';
      setPromptToolRunError(message);
    } finally {
      setRunningPromptTool(false);
    }
  }, [
    disabled,
    parseJsonObject,
    promptToolContextText,
    promptToolParamsText,
    selectedPromptToolId,
    value,
  ]);

  const handleApplyPromptToolResult = useCallback(() => {
    if (!promptToolResult || disabled) return;
    const sourceText = value;
    const outputText = promptToolResult.prompt_text ?? '';

    if (promptToolApplyMode === 'apply_overlay_only') {
      flushSnapshot();
      const applied = appendPromptToolOverlayToBlocks(promptToolResult.block_overlay);
      if (!applied) {
        setPromptToolRunError('Selected result does not include a usable block overlay');
        return;
      }
      setPromptToolRunError(null);
      setMode('blocks');
      return;
    }

    const nextText =
      promptToolApplyMode === 'append_text'
        ? sourceText.trim()
          ? `${sourceText}\n\n${outputText}`
          : outputText
        : outputText;
    flushSnapshot();
    onChangeRef.current(nextText);
    if (mode === 'blocks') {
      lastComposedRef.current = null;
      void seedBlocksFromPrompt(nextText, { force: true });
    }
    if (
      promptToolApplyMode === 'apply_all' &&
      promptToolResult.block_overlay &&
      promptToolResult.block_overlay.length > 0
    ) {
      setPromptToolRunError('Applied text output. Use overlay-only mode to apply block overlays in this build.');
      return;
    }
    setPromptToolRunError(null);
  }, [
    appendPromptToolOverlayToBlocks,
    disabled,
    flushSnapshot,
    mode,
    promptToolApplyMode,
    promptToolResult,
    seedBlocksFromPrompt,
    value,
  ]);

  const composedPrompt = useMemo(() => composePrompt(blocks), [blocks]);
  const remaining = typeof maxChars === 'number' ? maxChars - composedPrompt.length : null;
  const isOverLimit = remaining !== null && remaining < 0;
  const selectedPromptTool = useMemo(
    () => promptToolCatalog.find((preset) => preset.id === selectedPromptToolId) ?? null,
    [promptToolCatalog, selectedPromptToolId],
  );
  const promptToolDiffSegments = useMemo(() => {
    if (!promptToolResult) return [];
    return diffPrompt(value, promptToolResult.prompt_text);
  }, [promptToolResult, value]);

  return (
    <div className={clsx('flex flex-col gap-2 min-h-0', className)} onKeyDownCapture={handleUndoKeyDown} {...promptContextAttrs}>
      <div className="flex items-center gap-2 shrink-0">
        <div className="relative">
          <button
            ref={layoutTriggerRef}
            type="button"
            disabled={disabled}
            onClick={() => setShowLayoutMenu((prev) => !prev)}
            title={mode === 'text' ? 'Text mode' : `Blocks — ${blocksLayout}`}
            className="inline-flex items-center gap-1 px-1.5 py-1 rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
          >
            <Icon
              name={mode === 'text' ? 'fileText' : blocksLayout === 'stacked' ? 'rows' : 'columns'}
              size={14}
            />
            <Icon name="chevronDown" size={10} />
          </button>
          <Popover
            open={showLayoutMenu}
            onClose={() => setShowLayoutMenu(false)}
            anchor={layoutTriggerRef.current}
            placement="bottom"
            align="start"
            offset={4}
            triggerRef={layoutTriggerRef}
            className="min-w-[140px] rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 shadow-xl p-1"
          >
            <DropdownItem
              icon={<Icon name="fileText" size={14} />}
              rightSlot={mode === 'text' ? <Icon name="check" size={12} /> : undefined}
              onClick={() => {
                handleModeChange('text');
                setShowLayoutMenu(false);
              }}
            >
              Text
            </DropdownItem>
            <DropdownItem
              icon={<Icon name="rows" size={14} />}
              rightSlot={mode === 'blocks' && blocksLayout === 'stacked' ? <Icon name="check" size={12} /> : undefined}
              onClick={() => {
                setBlocksLayout('stacked');
                if (mode !== 'blocks') handleModeChange('blocks');
                setShowLayoutMenu(false);
              }}
            >
              Blocks — Stacked
            </DropdownItem>
            <DropdownItem
              icon={<Icon name="columns" size={14} />}
              rightSlot={mode === 'blocks' && blocksLayout === 'inline' ? <Icon name="check" size={12} /> : undefined}
              onClick={() => {
                setBlocksLayout('inline');
                if (mode !== 'blocks') handleModeChange('blocks');
                setShowLayoutMenu(false);
              }}
            >
              Blocks — Inline
            </DropdownItem>
            <DropdownDivider />
            <DropdownItem
              icon={<Icon name="shuffle" size={14} />}
              onClick={() => {
                openFloatingPanel('template-builder');
                setShowLayoutMenu(false);
              }}
            >
              Template Builder
            </DropdownItem>
          </Popover>
        </div>

        <button
          type="button"
          disabled={disabled}
          onClick={handlePasteFromClipboard}
          title="Paste from clipboard"
          className="p-1 rounded text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
        >
          <Icon name="clipboard-paste" size={14} />
        </button>

        <button
          ref={historyTriggerRef}
          type="button"
          disabled={disabled}
          onClick={handleOpenHistory}
          title="Prompt history"
          className={clsx(
            'p-1 rounded transition-colors',
            showHistory
              ? 'bg-neutral-200 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-200'
              : 'text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800',
          )}
        >
          <Icon name="history" size={14} />
        </button>

        <button
          type="button"
          disabled={disabled}
          onClick={() => openWorkspacePanel('template-builder')}
          title={pinnedTemplateId ? 'Template pinned — click to manage' : 'Templates'}
          className={clsx(
            'p-1 rounded transition-colors',
            pinnedTemplateId
              ? 'bg-accent/15 text-accent hover:bg-accent/25'
              : 'text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800',
          )}
        >
          <Icon name={pinnedTemplateId ? 'pin' : 'shuffle'} size={14} />
        </button>

        {mode === 'text' && autoAnalyze && (
          <button
            type="button"
            disabled={disabled}
            onClick={() => setShowShadow((prev) => !prev)}
            title={showShadow ? 'Hide shadow analysis' : 'Show shadow analysis'}
            className={clsx(
              'p-1 rounded transition-colors',
              showShadow
                ? 'bg-violet-100 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400'
                : 'text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800',
            )}
          >
            <Icon name="sparkles" size={14} />
          </button>
        )}

        <button
          type="button"
          disabled={disabled}
          onClick={() => setShowPromptTools((prev) => !prev)}
          title={showPromptTools ? 'Hide prompt tools' : 'Show prompt tools'}
          className={clsx(
            'p-1 rounded transition-colors',
            showPromptTools
              ? 'bg-neutral-200 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-200'
              : 'text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800',
          )}
        >
          <Icon name="wand" size={14} />
        </button>

        {mode === 'blocks' && (
          <>
            <button
              type="button"
              disabled={disabled || isParsing}
              onClick={() => seedBlocksFromPrompt(value, { force: true })}
              title="Re-parse blocks"
              aria-label="Re-parse blocks"
              className="p-1 rounded text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
            >
              <Icon name="refresh" size={14} className={clsx(isParsing && 'animate-spin')} />
            </button>

            {blocksLayout === 'stacked' && (
              <>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => expandAllRef.current?.()}
                  title="Expand all blocks"
                  aria-label="Expand all blocks"
                  className="p-1 rounded text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors disabled:opacity-40"
                >
                  <Icon name="chevronDown" size={12} />
                </button>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => collapseAllRef.current?.()}
                  title="Collapse all blocks"
                  aria-label="Collapse all blocks"
                  className="p-1 rounded text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors disabled:opacity-40"
                >
                  <Icon name="chevronUp" size={12} />
                </button>
              </>
            )}

            <div className="relative">
              <button
                ref={blockToolsTriggerRef}
                type="button"
                disabled={disabled}
                onClick={() => setShowBlockTools((prev) => !prev)}
                title="Block tools"
                aria-label="Block tools"
                className={clsx(
                  'p-1 rounded transition-colors',
                  showBlockTools
                    ? 'bg-neutral-200 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-200'
                    : 'text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800'
                )}
              >
                <Icon name="more-horizontal" size={14} />
              </button>
              <Popover
                open={showBlockTools}
                onClose={() => setShowBlockTools(false)}
                anchor={blockToolsTriggerRef.current}
                placement="bottom"
                align="start"
                offset={4}
                triggerRef={blockToolsTriggerRef}
                className="min-w-[180px] rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 shadow-xl p-1"
              >
                <DropdownItem
                  icon={analyzingBlocks ? <Icon name="refresh" size={12} className="animate-spin" /> : <Icon name="search" size={12} />}
                  disabled={disabled || analyzingBlocks}
                  onClick={() => { handleAnalyzeBlocks(); setShowBlockTools(false); }}
                >
                  Analyze blocks
                </DropdownItem>
                <DropdownItem
                  icon={fetchingVariants ? <Icon name="refresh" size={12} className="animate-spin" /> : <Icon name="wand" size={12} />}
                  disabled={disabled || fetchingVariants}
                  onClick={() => { handleSuggestVariants(); setShowBlockTools(false); }}
                >
                  Suggest variants
                </DropdownItem>
                <DropdownItem
                  icon={fetchingPacks ? <Icon name="refresh" size={12} className="animate-spin" /> : <Icon name="folder" size={12} />}
                  disabled={disabled || fetchingPacks}
                  onClick={() => { handlePackHints(); setShowBlockTools(false); }}
                >
                  Discover packs
                </DropdownItem>
                <DropdownDivider />
                <DropdownItem
                  icon={<Icon name="plus" size={12} />}
                  disabled={disabled || !blockAnalysis || blockAnalysis.candidates.length === 0}
                  onClick={() => { setShowBlockBuilder(true); setShowBlockTools(false); }}
                >
                  Block builder
                </DropdownItem>
              </Popover>
            </div>

            <span className="ml-auto text-[10px] text-neutral-500 dark:text-neutral-400">
              {blocks.length} block{blocks.length === 1 ? '' : 's'}
            </span>
          </>
        )}
      </div>

      {showPromptTools && (
        <div className="rounded-lg border border-neutral-200 dark:border-neutral-700 bg-neutral-50/70 dark:bg-neutral-900/60 p-2 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-[11px] text-neutral-600 dark:text-neutral-300" htmlFor={`${composerId}-tool-scope`}>
              Scope
            </label>
            <select
              id={`${composerId}-tool-scope`}
              value={promptToolScope}
              disabled={disabled || promptToolCatalogLoading || runningPromptTool}
              onChange={(event) => setPromptToolScope(event.target.value as PromptToolCatalogScope)}
              className="text-xs rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1"
            >
              <option value="builtin">builtin</option>
              <option value="all">all</option>
              <option value="self">self</option>
              <option value="shared">shared</option>
            </select>

            <label className="text-[11px] text-neutral-600 dark:text-neutral-300" htmlFor={`${composerId}-tool-preset`}>
              Preset
            </label>
            <select
              id={`${composerId}-tool-preset`}
              value={selectedPromptToolId}
              disabled={disabled || promptToolCatalogLoading || runningPromptTool || promptToolCatalog.length === 0}
              onChange={(event) => setSelectedPromptToolId(event.target.value)}
              className="min-w-[220px] max-w-full text-xs rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1"
            >
              {promptToolCatalog.length === 0 ? (
                <option value="">No presets</option>
              ) : (
                promptToolCatalog.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.id}
                  </option>
                ))
              )}
            </select>

            <button
              type="button"
              disabled={disabled || runningPromptTool || promptToolCatalogLoading || !selectedPromptToolId}
              onClick={handleRunPromptTool}
              className={clsx(
                'ml-auto text-xs px-2 py-1 rounded border',
                'border-neutral-200 dark:border-neutral-700',
                'text-neutral-700 dark:text-neutral-200',
                'hover:bg-neutral-100 dark:hover:bg-neutral-800',
                'disabled:opacity-50 disabled:cursor-not-allowed',
              )}
            >
              {runningPromptTool ? 'Running...' : 'Run tool'}
            </button>
          </div>

          {selectedPromptTool && (
            <div className="text-[11px] text-neutral-500 dark:text-neutral-400">
              {selectedPromptTool.label}: {selectedPromptTool.description}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <label className="text-[11px] text-neutral-600 dark:text-neutral-300">
              Params (JSON)
              <textarea
                value={promptToolParamsText}
                disabled={disabled || runningPromptTool}
                onChange={(event) => setPromptToolParamsText(event.target.value)}
                spellCheck={false}
                className="mt-1 w-full rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1 text-xs font-mono min-h-[56px]"
              />
            </label>
            <label className="text-[11px] text-neutral-600 dark:text-neutral-300">
              Run context (JSON)
              <textarea
                value={promptToolContextText}
                disabled={disabled || runningPromptTool}
                onChange={(event) => setPromptToolContextText(event.target.value)}
                spellCheck={false}
                className="mt-1 w-full rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1 text-xs font-mono min-h-[56px]"
              />
            </label>
          </div>

          {promptToolCatalogError && (
            <div className="text-xs text-red-600 dark:text-red-400">{promptToolCatalogError}</div>
          )}
          {promptToolRunError && (
            <div className="text-xs text-red-600 dark:text-red-400">{promptToolRunError}</div>
          )}

          {promptToolResult && (
            <div className="rounded border border-neutral-200 dark:border-neutral-700 bg-white/70 dark:bg-neutral-950/40 p-2 space-y-2">
              <div className="flex flex-wrap items-center gap-2 text-[11px] text-neutral-600 dark:text-neutral-300">
                <span>
                  Result from <strong>{promptToolResult.provenance.preset_id}</strong>
                </span>
                <span className="ml-auto">{diffSummary(value, promptToolResult.prompt_text)}</span>
              </div>

              <div className="rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1.5 text-xs leading-relaxed max-h-32 overflow-y-auto">
                {promptToolDiffSegments.length === 0 ? (
                  <span className="text-neutral-500 dark:text-neutral-400">No diff</span>
                ) : (
                  promptToolDiffSegments.map((segment, index) => (
                    <span
                      key={`${segment.type}-${index}`}
                      className={clsx(
                        segment.type === 'add' && 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300',
                        segment.type === 'remove' && 'line-through bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300',
                        segment.type === 'keep' && 'text-neutral-700 dark:text-neutral-200',
                      )}
                    >
                      {segment.text}
                      {' '}
                    </span>
                  ))
                )}
              </div>

              {promptToolResult.warnings && promptToolResult.warnings.length > 0 && (
                <div className="text-xs text-amber-700 dark:text-amber-400">
                  Warnings: {promptToolResult.warnings.join(' | ')}
                </div>
              )}
              {promptToolResult.block_overlay && promptToolResult.block_overlay.length > 0 && (
                <div className="text-xs text-neutral-600 dark:text-neutral-300">
                  Block overlay entries: {promptToolResult.block_overlay.length}
                </div>
              )}
              {promptToolResult.guidance_patch && (
                <details className="text-xs">
                  <summary className="cursor-pointer text-neutral-600 dark:text-neutral-300">Guidance patch</summary>
                  <pre className="mt-1 max-h-28 overflow-y-auto rounded border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-900 p-2 text-[11px] whitespace-pre-wrap break-words">
                    {JSON.stringify(promptToolResult.guidance_patch, null, 2)}
                  </pre>
                </details>
              )}
              {promptToolResult.composition_assets_patch && promptToolResult.composition_assets_patch.length > 0 && (
                <details className="text-xs">
                  <summary className="cursor-pointer text-neutral-600 dark:text-neutral-300">Composition assets patch</summary>
                  <pre className="mt-1 max-h-28 overflow-y-auto rounded border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-900 p-2 text-[11px] whitespace-pre-wrap break-words">
                    {JSON.stringify(promptToolResult.composition_assets_patch, null, 2)}
                  </pre>
                </details>
              )}

              <div className="flex flex-wrap items-center gap-2">
                <label className="text-[11px] text-neutral-600 dark:text-neutral-300" htmlFor={`${composerId}-tool-apply`}>
                  Apply mode
                </label>
                <select
                  id={`${composerId}-tool-apply`}
                  value={promptToolApplyMode}
                  disabled={disabled || runningPromptTool}
                  onChange={(event) => setPromptToolApplyMode(event.target.value as PromptToolApplyMode)}
                  className="text-xs rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1"
                >
                  <option value="replace_text">replace_text</option>
                  <option value="append_text">append_text</option>
                  <option value="apply_overlay_only">apply_overlay_only</option>
                  <option value="apply_all">apply_all</option>
                </select>
                <button
                  type="button"
                  disabled={disabled || runningPromptTool}
                  onClick={handleApplyPromptToolResult}
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
      )}

      {mode === 'blocks' && assistantError && (
        <div className="text-xs text-red-600 dark:text-red-400">{assistantError}</div>
      )}

      {mode === 'text' ? (
        showShadow && autoAnalyze ? (
          <div className="flex-1 min-h-0 flex">
            <div className="flex-1 min-w-0">
              <ShadowTextarea
                value={value}
                onChange={onChange}
                candidates={shadowAnalysis.result?.candidates ?? []}
                maxChars={maxChars}
                placeholder={placeholder}
                disabled={disabled}
                variant={variant}
                showCounter={showCounter}
                resizable={resizable}
                minHeight={minHeight}
              />
            </div>
            <ShadowSidePanel analysis={shadowAnalysis} />
          </div>
        ) : (
          <PromptInput
            value={value}
            onChange={onChange}
            maxChars={maxChars}
            placeholder={placeholder}
            disabled={disabled}
            variant={variant}
            showCounter={showCounter}
            resizable={resizable}
            minHeight={minHeight}
            className="h-full"
          />
        )
      ) : (
        <div className="flex flex-col gap-2 min-h-0 overflow-y-auto thin-scrollbar">
          {parseError && (
            <div className="text-xs text-red-600 dark:text-red-400">
              {parseError}
            </div>
          )}

          {(semanticLoading || semanticMatches.length > 0) && (
            <div className="flex items-center gap-1 overflow-x-auto">
              <span className="inline-flex items-center justify-center w-5 h-5 rounded border border-neutral-200 dark:border-neutral-700 text-neutral-500 dark:text-neutral-400 flex-shrink-0">
                <Icon name="sparkles" size={12} />
              </span>
              {semanticLoading && (
                <Icon
                  name="refresh"
                  size={12}
                  className="text-neutral-500 dark:text-neutral-400 animate-spin flex-shrink-0"
                />
              )}
              {semanticMatches.slice(0, 5).map((match) => (
                <button
                  key={match.id}
                  type="button"
                  onClick={() => insertSemanticBlock(match.prompt, match.role)}
                  className={clsx(
                    'text-[10px] px-2 py-1 rounded border whitespace-nowrap',
                    'border-neutral-200 dark:border-neutral-700',
                    'text-neutral-600 dark:text-neutral-300',
                    'hover:border-accent-muted hover:bg-accent-subtle'
                  )}
                  title={`${match.block_id} (${Math.round(match.similarity_score * 100)}%)`}
                >
                  {match.block_id}
                </button>
              ))}
            </div>
          )}

          {blocksLayout === 'inline' ? (
            <InlineBlocksEditor
              blocks={blocks}
              disabled={disabled}
              promptRoleColors={promptRoleColors}
              roleOptions={roleOptions}
              onUpdateBlocks={updateBlocks}
              onAddBlock={addBlock}
              onRemoveBlock={removeBlock}
            />
          ) : (
            <>
              <FoldGroup
                renderControls={({ expandAll, collapseAll }) => {
                  expandAllRef.current = expandAll;
                  collapseAllRef.current = collapseAll;
                  return null;
                }}
              >
                <div className="flex flex-col gap-2">
                  {blocks.map((block, index) => {
                    const summaryText = block.text.trim()
                      ? truncate(block.text.trim(), 60)
                      : 'Empty block';
                    const badgeColor = getPromptRoleBadgeClass(block.role, promptRoleColors);

                    return (
                      <GroupedFold
                        key={block.id}
                        id={block.id}
                        indicator="chevron"
                        showIndicatorWhenOpen
                        summaryClassName="not-italic"
                        contentClassName="block"
                        summary={
                          <span className="flex items-center gap-2">
                            <RoleBadge role={block.role} colorOverrides={promptRoleColors} />
                            <span className="text-[11px] text-neutral-500 dark:text-neutral-400 truncate">
                              {summaryText}
                            </span>
                          </span>
                        }
                      >
                        <div className="mt-1 flex items-stretch gap-2">
                          <div className={clsx('w-1 rounded-full opacity-70 shrink-0', badgeColor)} />
                          <div className="flex-1 min-w-0 pr-1 space-y-1.5">
                            <div className="flex items-center gap-2">
                              <label
                                className={clsx(
                                  'relative inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border',
                                  'border-neutral-200 dark:border-neutral-700',
                                  'text-neutral-600 dark:text-neutral-300 bg-neutral-50 dark:bg-neutral-900/60',
                                  disabled && 'opacity-60'
                                )}
                                title="Change role"
                              >
                                <span className={clsx('w-1.5 h-1.5 rounded-full', badgeColor)} />
                                <span>{getPromptRoleLabel(block.role)}</span>
                                <Icon name="chevronDown" size={11} className="text-neutral-400 dark:text-neutral-500" />
                                <select
                                  value={block.role}
                                  disabled={disabled}
                                  onChange={(e) => {
                                    const nextRole = e.target.value || DEFAULT_PROMPT_ROLE;
                                    const nextBlocks = blocks.map((item) =>
                                      item.id === block.id ? { ...item, role: nextRole } : item
                                    );
                                    updateBlocks(nextBlocks);
                                  }}
                                  aria-label="Change block role"
                                  className="absolute inset-0 opacity-0 cursor-pointer disabled:cursor-not-allowed"
                                >
                                  {roleOptions.map((role) => (
                                    <option key={role} value={role}>
                                      {getPromptRoleLabel(role)}
                                    </option>
                                  ))}
                                </select>
                              </label>

                              <div className="ml-auto flex items-center gap-1">
                                <button
                                  type="button"
                                  disabled={disabled || index === 0}
                                  onClick={() => moveBlock(index, 'up')}
                                  title="Move block up"
                                  aria-label="Move block up"
                                  className="p-1 rounded text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors disabled:opacity-40"
                                >
                                  <Icon name="arrowUp" size={12} />
                                </button>
                                <button
                                  type="button"
                                  disabled={disabled || index === blocks.length - 1}
                                  onClick={() => moveBlock(index, 'down')}
                                  title="Move block down"
                                  aria-label="Move block down"
                                  className="p-1 rounded text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors disabled:opacity-40"
                                >
                                  <Icon name="arrowDown" size={12} />
                                </button>
                                <button
                                  type="button"
                                  disabled={disabled}
                                  onClick={() => removeBlock(block.id)}
                                  title="Remove block"
                                  aria-label="Remove block"
                                  className="p-1 rounded text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors disabled:opacity-40"
                                >
                                  <Icon name="trash2" size={12} />
                                </button>
                              </div>
                            </div>

                            <textarea
                              value={block.text}
                              disabled={disabled}
                              onChange={(e) => {
                                const nextText = e.target.value;
                                const nextBlocks = blocks.map((item) =>
                                  item.id === block.id ? { ...item, text: nextText } : item
                                );
                                updateBlocks(nextBlocks);
                              }}
                              placeholder="Block text..."
                              className={clsx(
                                'w-full rounded-md border px-2 py-1.5 text-sm bg-transparent outline-none',
                                'border-neutral-200/80 dark:border-neutral-700/80',
                                'focus:ring-2 focus:ring-blue-500/35',
                                'resize-y min-h-[64px]'
                              )}
                            />
                          </div>
                        </div>
                      </GroupedFold>
                    );
                  })}
                </div>
              </FoldGroup>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={disabled}
                  onClick={addBlock}
                  className="text-xs px-2 py-1 rounded border border-neutral-200 dark:border-neutral-700 text-neutral-600 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200"
                >
                  Add block
                </button>
                <div className="ml-auto text-[10px] text-neutral-500 dark:text-neutral-400">
                  Blocks render as paragraphs
                </div>
              </div>
            </>
          )}

          {showCounter && typeof maxChars === 'number' && (
            <div className="text-xs flex justify-between items-center">
              {isOverLimit && (
                <span className="text-red-600 dark:text-red-400 font-medium">
                  Over limit by {Math.abs(remaining ?? 0)} chars
                </span>
              )}
              <span className={clsx(
                'tabular-nums ml-auto',
                isOverLimit ? 'text-red-600 dark:text-red-400 font-semibold' : 'text-neutral-500'
              )}>
                {composedPrompt.length} / {maxChars}
              </span>
            </div>
          )}
        </div>
      )}

      <BlockBreakdownDrawer
        open={showBlockBreakdown}
        onClose={() => setShowBlockBreakdown(false)}
        analysis={blockAnalysis}
        onInsertBlock={handleInsertBlock}
      />

      <VariantSuggestionsDrawer
        open={showVariants}
        onClose={() => setShowVariants(false)}
        variants={variants}
        onSelectVariant={handleSelectVariant}
        isDevMode={import.meta.env.DEV}
      />

      <PackHintsDrawer
        open={showPackHints}
        onClose={() => setShowPackHints(false)}
        packHints={packHints}
        isDevMode={import.meta.env.DEV}
      />

      <BlockBuilderModal
        open={showBlockBuilder}
        onClose={() => setShowBlockBuilder(false)}
        candidates={blockAnalysis?.candidates || []}
        onInsertBlock={handleInsertBlock}
      />

      <PromptHistoryPopover
        open={showHistory}
        onClose={() => setShowHistory(false)}
        anchor={historyTriggerRef.current}
        triggerRef={historyTriggerRef}
        timeline={historyTimeline}
        onJumpTo={handleHistoryJump}
      />
    </div>
  );
}

