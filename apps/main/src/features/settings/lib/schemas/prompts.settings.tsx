/**
 * Prompts Settings Schema
 *
 * Configure prompt analysis, block extraction, and curation workflows.
 */

import { useEffect, useState } from 'react';
import { settingsSchemaRegistry, type SettingTab, type SettingStoreAdapter } from '@features/settings';
import { usePromptSettingsStore } from '@/stores/promptSettingsStore';
import { listPromptAnalyzers, type AnalyzerInfo } from '@lib/api/analyzers';
import { FALLBACK_PROMPT_ANALYZERS } from '@lib/analyzers/constants';

/**
 * Custom component for analyzer selection (needs async data)
 */
function AnalyzerSelector({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const [analyzers, setAnalyzers] = useState<AnalyzerInfo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listPromptAnalyzers()
      .then((res) => {
        setAnalyzers(res.analyzers);
        setLoading(false);
      })
      .catch((err) => {
        console.error('Failed to fetch analyzers:', err);
        setAnalyzers(FALLBACK_PROMPT_ANALYZERS);
        setLoading(false);
      });
  }, []);

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled || loading}
      className="px-2 py-1 text-xs border border-neutral-300 dark:border-neutral-600 rounded bg-white dark:bg-neutral-800 disabled:opacity-50 disabled:cursor-not-allowed max-w-[200px]"
    >
      {loading ? (
        <option>Loading...</option>
      ) : (
        analyzers.map((analyzer) => (
          <option key={analyzer.id} value={analyzer.id}>
            {analyzer.name}
          </option>
        ))
      )}
    </select>
  );
}

const analysisTab: SettingTab = {
  id: 'analysis',
  label: 'Analysis',
  icon: '🔍',
  groups: [
    {
      id: 'prompt-analysis',
      title: 'Prompt Analysis',
      description: 'Control how prompts are analyzed and stored when creating generations.',
      fields: [
        {
          id: 'autoAnalyze',
          type: 'toggle',
          label: 'Auto-analyze prompts',
          description: 'Automatically analyze prompts when creating generations',
          defaultValue: true,
        },
        {
          id: 'defaultAnalyzer',
          type: 'custom',
          label: 'Default Analyzer',
          description: 'Which analyzer to use for prompt parsing',
          component: AnalyzerSelector,
          defaultValue: 'simple',
        },
      ],
    },
  ],
};

const extractionTab: SettingTab = {
  id: 'extraction',
  label: 'Block Extraction',
  icon: '📦',
  groups: [
    {
      id: 'block-extraction',
      description: 'Configure how meaningful blocks are extracted from prompts and stored in ActionBlockDB.',
      fields: [
        {
          id: 'autoExtractBlocks',
          type: 'toggle',
          label: 'Auto-extract blocks',
          description: 'Automatically create ActionBlockDB entries for meaningful blocks',
          defaultValue: false,
        },
        {
          id: 'extractionThreshold',
          type: 'select',
          label: 'Extraction Threshold',
          description: 'Minimum ontology tags required to consider a block "meaningful"',
          options: [
            { value: '1', label: '1 tag (extract more blocks)' },
            { value: '2', label: '2 tags (balanced)' },
            { value: '3', label: '3+ tags (extract fewer, high-quality)' },
          ],
          defaultValue: '2',
          disabled: (values) => !values.autoExtractBlocks,
        },
        {
          id: 'defaultCurationStatus',
          type: 'select',
          label: 'Default Curation Status',
          description: 'Initial status for auto-extracted blocks',
          options: [
            { value: 'raw', label: 'Raw (needs review)' },
            { value: 'reviewed', label: 'Reviewed (vetted but not curated)' },
            { value: 'curated', label: 'Curated (production-ready)' },
          ],
          defaultValue: 'raw',
          disabled: (values) => !values.autoExtractBlocks,
        },
      ],
    },
  ],
  footer: (
    <div className="bg-neutral-50 dark:bg-neutral-800/50 p-2 rounded">
      <strong>Note:</strong> Auto-extraction is currently disabled by default. Enable it to
      automatically populate your block library from generation prompts.
    </div>
  ),
};

function usePromptSettingsStoreAdapter(): SettingStoreAdapter {
  const {
    autoAnalyze,
    defaultAnalyzer,
    autoExtractBlocks,
    extractionThreshold,
    defaultCurationStatus,
    setAutoAnalyze,
    setDefaultAnalyzer,
    setAutoExtractBlocks,
    setExtractionThreshold,
    setDefaultCurationStatus,
  } = usePromptSettingsStore();

  return {
    get: (fieldId: string) => {
      switch (fieldId) {
        case 'autoAnalyze': return autoAnalyze;
        case 'defaultAnalyzer': return defaultAnalyzer;
        case 'autoExtractBlocks': return autoExtractBlocks;
        case 'extractionThreshold': return extractionThreshold.toString();
        case 'defaultCurationStatus': return defaultCurationStatus;
        default: return undefined;
      }
    },
    set: (fieldId: string, value: any) => {
      switch (fieldId) {
        case 'autoAnalyze': setAutoAnalyze(value); break;
        case 'defaultAnalyzer': setDefaultAnalyzer(value); break;
        case 'autoExtractBlocks': setAutoExtractBlocks(value); break;
        case 'extractionThreshold': setExtractionThreshold(parseInt(value, 10)); break;
        case 'defaultCurationStatus': setDefaultCurationStatus(value); break;
      }
    },
    getAll: () => ({
      autoAnalyze,
      defaultAnalyzer,
      autoExtractBlocks,
      extractionThreshold: extractionThreshold.toString(),
      defaultCurationStatus,
    }),
  };
}

export function registerPromptSettings(): () => void {
  const unregister1 = settingsSchemaRegistry.register({
    categoryId: 'prompts',
    category: {
      label: 'Prompts',
      icon: '📝',
      order: 35,
    },
    tab: analysisTab,
    useStore: usePromptSettingsStoreAdapter,
  });

  const unregister2 = settingsSchemaRegistry.register({
    categoryId: 'prompts',
    tab: extractionTab,
    useStore: usePromptSettingsStoreAdapter,
  });

  return () => {
    unregister1();
    unregister2();
  };
}
