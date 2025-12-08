/**
 * Prompts Settings Module
 *
 * Configure prompt analysis, block extraction, and curation workflows.
 */
import { Select, Switch } from '@pixsim7/shared.ui';
import { settingsRegistry } from '@/lib/settingsRegistry';
import { usePromptSettingsStore } from '@/stores/promptSettingsStore';

export function PromptsSettings() {
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

  return (
    <div className="flex-1 overflow-auto p-4 space-y-4 text-xs text-neutral-800 dark:text-neutral-100">
      {/* Prompt Analysis */}
      <section className="space-y-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
          Prompt Analysis
        </h2>
        <p className="text-[11px] text-neutral-600 dark:text-neutral-400">
          Control how prompts are analyzed and stored when creating generations.
        </p>

        <div className="mt-2 space-y-3 border border-neutral-200 dark:border-neutral-800 rounded-md p-3 bg-neutral-50/60 dark:bg-neutral-900/40">
          {/* Auto-analyze toggle */}
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[11px] font-semibold">Auto-analyze prompts</div>
              <div className="text-[10px] text-neutral-500 dark:text-neutral-400">
                Automatically analyze prompts when creating generations
              </div>
            </div>
            <Switch
              checked={autoAnalyze}
              onCheckedChange={setAutoAnalyze}
              size="sm"
            />
          </div>

          {/* Analyzer selection */}
          <div>
            <div className="text-[11px] font-semibold mb-1">Default Analyzer</div>
            <div className="text-[10px] text-neutral-500 dark:text-neutral-400 mb-1">
              Which analyzer to use for prompt parsing
            </div>
            <Select
              value={defaultAnalyzer}
              onChange={(e) =>
                setDefaultAnalyzer(e.target.value as 'parser:simple' | 'llm:claude')
              }
              size="sm"
              className="text-[11px]"
            >
              <option value="parser:simple">Simple Parser (fast, keyword-based)</option>
              <option value="llm:claude">LLM (Claude) - deeper semantic analysis</option>
            </Select>
          </div>
        </div>
      </section>

      {/* Block Extraction */}
      <section className="space-y-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
          Block Extraction
        </h2>
        <p className="text-[11px] text-neutral-600 dark:text-neutral-400">
          Configure how meaningful blocks are extracted from prompts and stored in ActionBlockDB.
        </p>

        <div className="mt-2 space-y-3 border border-neutral-200 dark:border-neutral-800 rounded-md p-3 bg-neutral-50/60 dark:bg-neutral-900/40">
          {/* Auto-extract toggle */}
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[11px] font-semibold">Auto-extract blocks</div>
              <div className="text-[10px] text-neutral-500 dark:text-neutral-400">
                Automatically create ActionBlockDB entries for meaningful blocks
              </div>
            </div>
            <Switch
              checked={autoExtractBlocks}
              onCheckedChange={setAutoExtractBlocks}
              size="sm"
            />
          </div>

          {/* Extraction threshold */}
          <div>
            <div className="text-[11px] font-semibold mb-1">Extraction Threshold</div>
            <div className="text-[10px] text-neutral-500 dark:text-neutral-400 mb-1">
              Minimum ontology tags required to consider a block "meaningful"
            </div>
            <Select
              value={extractionThreshold.toString()}
              onChange={(e) => setExtractionThreshold(parseInt(e.target.value, 10))}
              size="sm"
              className="text-[11px]"
              disabled={!autoExtractBlocks}
            >
              <option value="1">1 tag (extract more blocks)</option>
              <option value="2">2 tags (balanced)</option>
              <option value="3">3+ tags (extract fewer, high-quality)</option>
            </Select>
          </div>

          {/* Default curation status */}
          <div>
            <div className="text-[11px] font-semibold mb-1">Default Curation Status</div>
            <div className="text-[10px] text-neutral-500 dark:text-neutral-400 mb-1">
              Initial status for auto-extracted blocks
            </div>
            <Select
              value={defaultCurationStatus}
              onChange={(e) =>
                setDefaultCurationStatus(e.target.value as 'raw' | 'reviewed' | 'curated')
              }
              size="sm"
              className="text-[11px]"
              disabled={!autoExtractBlocks}
            >
              <option value="raw">Raw (needs review)</option>
              <option value="reviewed">Reviewed (vetted but not curated)</option>
              <option value="curated">Curated (production-ready)</option>
            </Select>
          </div>
        </div>

        <div className="text-[10px] text-neutral-500 dark:text-neutral-400 bg-neutral-50 dark:bg-neutral-800/50 p-2 rounded">
          <strong>Note:</strong> Auto-extraction is currently disabled by default. Enable it to
          automatically populate your block library from generation prompts.
        </div>
      </section>

      {/* Info Section */}
      <section className="space-y-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
          How It Works
        </h2>
        <div className="text-[11px] text-neutral-600 dark:text-neutral-400 space-y-2">
          <div className="border border-neutral-200 dark:border-neutral-700 rounded p-2 bg-white dark:bg-neutral-800/50">
            <div className="font-semibold mb-1">Two-Tier Storage</div>
            <ul className="list-disc list-inside text-[10px] space-y-0.5">
              <li>
                <strong>PromptVersion.prompt_analysis</strong> — All parsed blocks (JSON)
              </li>
              <li>
                <strong>ActionBlockDB</strong> — Only meaningful blocks (indexed)
              </li>
            </ul>
          </div>
          <div className="border border-neutral-200 dark:border-neutral-700 rounded p-2 bg-white dark:bg-neutral-800/50">
            <div className="font-semibold mb-1">Block Lifecycle</div>
            <div className="text-[10px] flex items-center gap-2">
              <span className="px-1.5 py-0.5 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300 rounded">
                raw
              </span>
              <span>→</span>
              <span className="px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded">
                reviewed
              </span>
              <span>→</span>
              <span className="px-1.5 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded">
                curated
              </span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

// Register this module
settingsRegistry.register({
  id: 'prompts',
  label: 'Prompts',
  icon: '📝',
  component: PromptsSettings,
  order: 35, // After General (10), UI (20), Panels (30)
});
