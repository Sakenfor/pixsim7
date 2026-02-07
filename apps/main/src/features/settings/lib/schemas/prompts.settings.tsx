/**
 * Prompts Settings Schema
 *
 * Configure prompt analysis, block extraction, and curation workflows.
 */
/* eslint-disable react-refresh/only-export-components */

import {
  PROMPT_ROLE_COLORS,
  PROMPT_ROLE_LABELS,
  PROMPT_ROLE_PRIORITY,
} from '@pixsim7/shared.types';
import { useEffect, useState } from 'react';

import { FALLBACK_PROMPT_ANALYZERS } from '@lib/analyzers';
import { listPromptAnalyzers, type AnalyzerInfo } from '@lib/api/analyzers';

import { usePromptSettingsStore } from '@features/prompts/stores/promptSettingsStore';

import { settingsSchemaRegistry, type SettingTab, type SettingStoreAdapter } from '../core';

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
        setAnalyzers([...res.analyzers]);
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
  icon: 'analysis',
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
  icon: 'blocks',
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

const colorOptions = [
  { value: 'blue', label: 'Blue' },
  { value: 'green', label: 'Green' },
  { value: 'purple', label: 'Purple' },
  { value: 'yellow', label: 'Yellow' },
  { value: 'pink', label: 'Pink' },
  { value: 'cyan', label: 'Cyan' },
  { value: 'orange', label: 'Orange' },
  { value: 'gray', label: 'Gray' },
];

const roleColorFields = PROMPT_ROLE_PRIORITY.map((roleId) => ({
  id: `roleColor.${roleId}`,
  type: 'select',
  label: `${PROMPT_ROLE_LABELS[roleId]} Color`,
  description: `Override ${PROMPT_ROLE_LABELS[roleId].toLowerCase()} highlight color in prompt UIs`,
  options: colorOptions,
  defaultValue: PROMPT_ROLE_COLORS[roleId] ?? 'gray',
}));

const appearanceTab: SettingTab = {
  id: 'appearance',
  label: 'Appearance',
  icon: 'palette',
  groups: [
    {
      id: 'role-colors',
      title: 'Prompt Role Colors',
      description: 'Override prompt role colors for prompt panels and analysis views.',
      fields: roleColorFields,
    },
  ],
};

function usePromptSettingsStoreAdapter(): SettingStoreAdapter {
  const {
    autoAnalyze,
    defaultAnalyzer,
    autoExtractBlocks,
    extractionThreshold,
    defaultCurationStatus,
    promptRoleColors,
    setAutoAnalyze,
    setDefaultAnalyzer,
    setAutoExtractBlocks,
    setExtractionThreshold,
    setDefaultCurationStatus,
    setPromptRoleColor,
  } = usePromptSettingsStore();

  return {
    get: (fieldId: string) => {
      if (fieldId.startsWith('roleColor.')) {
        const roleId = fieldId.slice('roleColor.'.length);
        return promptRoleColors[roleId] ?? PROMPT_ROLE_COLORS[roleId as keyof typeof PROMPT_ROLE_COLORS] ?? 'gray';
      }
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
      if (fieldId.startsWith('roleColor.')) {
        const roleId = fieldId.slice('roleColor.'.length);
        setPromptRoleColor(roleId, value);
        return;
      }
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
      promptRoleColors,
    }),
  };
}

export function registerPromptSettings(): () => void {
  const unregister1 = settingsSchemaRegistry.register({
    categoryId: 'prompts',
    category: {
      label: 'Prompts',
      icon: 'prompts',
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

  const unregister3 = settingsSchemaRegistry.register({
    categoryId: 'prompts',
    tab: appearanceTab,
    useStore: usePromptSettingsStoreAdapter,
  });

  return () => {
    unregister1();
    unregister2();
    unregister3();
  };
}
