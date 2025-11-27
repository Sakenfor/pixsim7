/**
 * Prompt Lab Dev Page
 *
 * Unified development surface for prompt analysis, import, and library browsing.
 * Brings together prompt inspection, import tools, and family/version browsing.
 */

import { useState, useEffect } from 'react';
import { Panel, Button, Input } from '@pixsim7/shared.ui';
import { Icon } from '../lib/icons';
import { DevPromptImporter } from './DevPromptImporter';
import { PromptBlocksViewer } from '../components/prompts/PromptBlocksViewer';
import { PromptBlockGraphSurface } from '../components/graph/PromptBlockGraphSurface';
import { useApi } from '../hooks/useApi';

// ===== Types =====

interface PromptBlock {
  role: string;
  text: string;
  component_type?: string;
}

interface PromptAnalysis {
  prompt: string;
  blocks: PromptBlock[];
  tags: string[];
}

interface DevPromptFamilySummary {
  id: string;
  slug: string;
  title: string;
  prompt_type: string;
  category?: string;
  tags: string[];
  is_active: boolean;
  version_count: number;
}

interface DevPromptVersionSummary {
  id: string;
  family_id: string;
  version_number: number;
  author?: string;
  tags: string[];
  created_at: string;
}

interface DevPromptVersionDetail {
  version: DevPromptVersionSummary;
  prompt_text: string;
  provider_hints: Record<string, any>;
  prompt_analysis?: {
    prompt: string;
    blocks: PromptBlock[];
    tags: string[];
  };
}

interface AiModel {
  id: string;
  label: string;
  provider_id?: string;
  kind: 'llm' | 'parser' | 'both';
  capabilities: string[];
  default_for?: string[];
  description?: string;
}

// ===== Main Component =====

export function PromptLabDev() {
  const [activeTab, setActiveTab] = useState<'analyze' | 'import' | 'library' | 'models' | 'categories'>('analyze');

  // Shared state for Analyze -> Import flow
  const [importFamilyTitle, setImportFamilyTitle] = useState<string | undefined>();
  const [importPromptText, setImportPromptText] = useState<string | undefined>();

  // Shared state for Analyze -> Categories flow
  const [categoriesPromptText, setCategoriesPromptText] = useState<string | undefined>();

  const handleSendToImport = (familyTitle: string, promptText: string) => {
    setImportFamilyTitle(familyTitle);
    setImportPromptText(promptText);
    setActiveTab('import');
  };

  const handleSendToCategories = (promptText: string) => {
    setCategoriesPromptText(promptText);
    setActiveTab('categories');
  };

  return (
    <div className="mx-auto max-w-7xl p-6 space-y-6 content-with-dock min-h-screen">
      {/* Header */}
      <header className="border-b border-neutral-200 dark:border-neutral-800 pb-6">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold flex items-center gap-2">
              <Icon name="zap" className="h-6 w-6" />
              Prompt Lab
            </h1>
            <p className="text-neutral-600 dark:text-neutral-400">
              Analyze, import, and browse prompts in one unified dev tool
            </p>
          </div>
        </div>
      </header>

      {/* Tab Navigation */}
      <div className="flex gap-2 border-b border-neutral-200 dark:border-neutral-800">
        <button
          onClick={() => setActiveTab('analyze')}
          className={`px-4 py-2 font-medium text-sm border-b-2 transition-colors ${
            activeTab === 'analyze'
              ? 'border-blue-500 text-blue-600 dark:text-blue-400'
              : 'border-transparent text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100'
          }`}
        >
          Analyze
        </button>
        <button
          onClick={() => setActiveTab('import')}
          className={`px-4 py-2 font-medium text-sm border-b-2 transition-colors ${
            activeTab === 'import'
              ? 'border-blue-500 text-blue-600 dark:text-blue-400'
              : 'border-transparent text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100'
          }`}
        >
          Import
        </button>
        <button
          onClick={() => setActiveTab('library')}
          className={`px-4 py-2 font-medium text-sm border-b-2 transition-colors ${
            activeTab === 'library'
              ? 'border-blue-500 text-blue-600 dark:text-blue-400'
              : 'border-transparent text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100'
          }`}
        >
          Library
        </button>
        <button
          onClick={() => setActiveTab('models')}
          className={`px-4 py-2 font-medium text-sm border-b-2 transition-colors ${
            activeTab === 'models'
              ? 'border-blue-500 text-blue-600 dark:text-blue-400'
              : 'border-transparent text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100'
          }`}
        >
          Models
        </button>
        <button
          onClick={() => setActiveTab('categories')}
          className={`px-4 py-2 font-medium text-sm border-b-2 transition-colors ${
            activeTab === 'categories'
              ? 'border-blue-500 text-blue-600 dark:text-blue-400'
              : 'border-transparent text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100'
          }`}
        >
          Categories
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === 'analyze' && (
        <AnalyzeTab onSendToImport={handleSendToImport} onSendToCategories={handleSendToCategories} />
      )}
      {activeTab === 'import' && (
        <ImportTab
          initialFamilyTitle={importFamilyTitle}
          initialPromptText={importPromptText}
          onClearInitial={() => {
            setImportFamilyTitle(undefined);
            setImportPromptText(undefined);
          }}
        />
      )}
      {activeTab === 'library' && <LibraryTab />}
      {activeTab === 'models' && <ModelsTab />}
      {activeTab === 'categories' && (
        <CategoriesTab
          initialPromptText={categoriesPromptText}
          onClearInitial={() => setCategoriesPromptText(undefined)}
        />
      )}
    </div>
  );
}

// ===== Analyze Tab =====

interface AnalyzeTabProps {
  onSendToImport: (familyTitle: string, promptText: string) => void;
  onSendToCategories: (promptText: string) => void;
}

function AnalyzeTab({ onSendToImport, onSendToCategories }: AnalyzeTabProps) {
  const api = useApi();
  const [promptText, setPromptText] = useState('');
  const [analysis, setAnalysis] = useState<PromptAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAnalyze = async () => {
    if (!promptText.trim()) {
      setError('Prompt text is required');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await api.post<PromptAnalysis>(
        '/dev/prompt-inspector/analyze-prompt',
        { prompt_text: promptText }
      );
      setAnalysis(result);
    } catch (err: any) {
      console.error('Analysis error:', err);
      setError(err.message || 'Failed to analyze prompt');
      setAnalysis(null);
    } finally {
      setLoading(false);
    }
  };

  const handleSendToImportClick = () => {
    if (promptText.trim()) {
      // Extract a title from the first line or first few words
      const firstLine = promptText.split('\n')[0];
      const title = firstLine.slice(0, 50).trim() || 'Untitled Prompt';
      onSendToImport(title, promptText);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Left: Input */}
      <Panel className="p-6">
        <h2 className="text-lg font-semibold mb-4">Analyze Prompt Text</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">
              Prompt Text
            </label>
            <textarea
              className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-700 rounded-md bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[300px] font-mono text-sm"
              placeholder="Enter prompt text to analyze..."
              value={promptText}
              onChange={(e) => setPromptText(e.target.value)}
              disabled={loading}
            />
          </div>

          {error && (
            <div className="p-3 bg-red-100 dark:bg-red-900 border border-red-300 dark:border-red-700 rounded text-red-800 dark:text-red-200">
              {error}
            </div>
          )}

          <div className="flex gap-2">
            <Button
              onClick={handleAnalyze}
              disabled={loading || !promptText.trim()}
              className="flex-1"
            >
              {loading ? 'Analyzing...' : 'Analyze'}
            </Button>
            <Button
              onClick={handleSendToImportClick}
              disabled={!promptText.trim()}
              variant="outline"
            >
              Send to Import
            </Button>
            <Button
              onClick={() => onSendToCategories(promptText)}
              disabled={!promptText.trim()}
              variant="outline"
            >
              Discover Categories
            </Button>
          </div>
        </div>
      </Panel>

      {/* Right: Results */}
      <div className="space-y-4">
        {analysis ? (
          <>
            {/* Tags */}
            {analysis.tags && analysis.tags.length > 0 && (
              <Panel className="p-6">
                <h3 className="text-sm font-semibold text-neutral-600 dark:text-neutral-400 mb-3">
                  Auto-Generated Tags
                </h3>
                <div className="flex flex-wrap gap-2">
                  {analysis.tags.map((tag) => (
                    <span
                      key={tag}
                      className="inline-block bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 px-2 py-1 rounded text-xs"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </Panel>
            )}

            {/* Blocks */}
            <PromptBlocksViewer prompt={analysis.prompt} blocks={analysis.blocks} />
          </>
        ) : (
          <Panel className="p-12 text-center">
            <Icon name="search" className="h-12 w-12 mx-auto mb-4 text-neutral-400" />
            <h3 className="text-lg font-semibold mb-2">No Analysis Yet</h3>
            <p className="text-neutral-600 dark:text-neutral-400">
              Enter prompt text and click Analyze to see the structure
            </p>
          </Panel>
        )}
      </div>
    </div>
  );
}

// ===== Import Tab =====

interface ImportTabProps {
  initialFamilyTitle?: string;
  initialPromptText?: string;
  onClearInitial: () => void;
}

function ImportTab({ initialFamilyTitle, initialPromptText, onClearInitial }: ImportTabProps) {
  // For now, we'll embed the full DevPromptImporter component
  // In a real implementation, we'd refactor DevPromptImporter to accept these props
  return (
    <div className="space-y-4">
      {initialFamilyTitle && initialPromptText && (
        <div className="p-3 bg-blue-100 dark:bg-blue-900 border border-blue-300 dark:border-blue-700 rounded text-blue-800 dark:text-blue-200 flex items-center justify-between">
          <span>Pre-filled with prompt from Analyze tab</span>
          <button
            onClick={onClearInitial}
            className="text-blue-600 dark:text-blue-400 hover:underline text-sm"
          >
            Clear
          </button>
        </div>
      )}
      <DevPromptImporter
        initialFamilyTitle={initialFamilyTitle}
        initialPromptText={initialPromptText}
      />
    </div>
  );
}

// ===== Library Tab =====

function LibraryTab() {
  const api = useApi();

  // State for families list
  const [families, setFamilies] = useState<DevPromptFamilySummary[]>([]);
  const [familiesLoading, setFamiliesLoading] = useState(false);
  const [familiesError, setFamiliesError] = useState<string | null>(null);

  // Filters
  const [promptTypeFilter, setPromptTypeFilter] = useState<string>('');
  const [categoryFilter, setCategoryFilter] = useState<string>('');
  const [tagFilter, setTagFilter] = useState<string>('');

  // Selected family
  const [selectedFamily, setSelectedFamily] = useState<DevPromptFamilySummary | null>(null);

  // State for versions list
  const [versions, setVersions] = useState<DevPromptVersionSummary[]>([]);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [versionsError, setVersionsError] = useState<string | null>(null);

  // Selected version
  const [selectedVersion, setSelectedVersion] = useState<DevPromptVersionDetail | null>(null);
  const [versionLoading, setVersionLoading] = useState(false);
  const [versionError, setVersionError] = useState<string | null>(null);

  // View mode for version detail
  const [versionViewMode, setVersionViewMode] = useState<'blocks' | 'graph'>('blocks');

  // Load families
  const loadFamilies = async () => {
    setFamiliesLoading(true);
    setFamiliesError(null);

    try {
      const params = new URLSearchParams();
      if (promptTypeFilter) params.append('prompt_type', promptTypeFilter);
      if (categoryFilter) params.append('category', categoryFilter);
      if (tagFilter) params.append('tag', tagFilter);

      const result = await api.get<DevPromptFamilySummary[]>(
        `/dev/prompt-library/families?${params.toString()}`
      );
      setFamilies(result);
    } catch (err: any) {
      console.error('Failed to load families:', err);
      setFamiliesError(err.message || 'Failed to load families');
    } finally {
      setFamiliesLoading(false);
    }
  };

  // Load versions for a family
  const loadVersions = async (familyId: string) => {
    setVersionsLoading(true);
    setVersionsError(null);
    setSelectedVersion(null);

    try {
      const result = await api.get<DevPromptVersionSummary[]>(
        `/dev/prompt-library/families/${familyId}/versions`
      );
      setVersions(result);
    } catch (err: any) {
      console.error('Failed to load versions:', err);
      setVersionsError(err.message || 'Failed to load versions');
    } finally {
      setVersionsLoading(false);
    }
  };

  // Load version detail
  const loadVersionDetail = async (versionId: string) => {
    setVersionLoading(true);
    setVersionError(null);

    try {
      const result = await api.get<DevPromptVersionDetail>(
        `/dev/prompt-library/versions/${versionId}`
      );
      setSelectedVersion(result);
    } catch (err: any) {
      console.error('Failed to load version detail:', err);
      setVersionError(err.message || 'Failed to load version detail');
    } finally {
      setVersionLoading(false);
    }
  };

  // Handle family selection
  const handleSelectFamily = (family: DevPromptFamilySummary) => {
    setSelectedFamily(family);
    loadVersions(family.id);
  };

  // Handle version selection
  const handleSelectVersion = (version: DevPromptVersionSummary) => {
    loadVersionDetail(version.id);
  };

  return (
    <div className="grid grid-cols-12 gap-6">
      {/* Left: Families List */}
      <div className="col-span-3 space-y-4">
        <Panel className="p-4">
          <h2 className="text-lg font-semibold mb-4">Filters</h2>
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium mb-1">
                Prompt Type
              </label>
              <select
                className="w-full px-2 py-1 text-sm border border-neutral-300 dark:border-neutral-700 rounded bg-white dark:bg-neutral-800"
                value={promptTypeFilter}
                onChange={(e) => setPromptTypeFilter(e.target.value)}
              >
                <option value="">All</option>
                <option value="visual">Visual</option>
                <option value="narrative">Narrative</option>
                <option value="hybrid">Hybrid</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">
                Category
              </label>
              <Input
                type="text"
                placeholder="Filter by category"
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">
                Tag
              </label>
              <Input
                type="text"
                placeholder="Filter by tag"
                value={tagFilter}
                onChange={(e) => setTagFilter(e.target.value)}
                className="text-sm"
              />
            </div>
            <Button onClick={loadFamilies} className="w-full" size="sm">
              Load Families
            </Button>
          </div>
        </Panel>

        <Panel className="p-4 max-h-[600px] overflow-y-auto">
          <h2 className="text-lg font-semibold mb-4">Families ({families.length})</h2>
          {familiesLoading ? (
            <div className="text-sm text-neutral-600 dark:text-neutral-400">Loading...</div>
          ) : familiesError ? (
            <div className="text-sm text-red-600 dark:text-red-400">{familiesError}</div>
          ) : families.length === 0 ? (
            <div className="text-sm text-neutral-600 dark:text-neutral-400">
              Click "Load Families" to see results
            </div>
          ) : (
            <div className="space-y-2">
              {families.map((family) => (
                <button
                  key={family.id}
                  onClick={() => handleSelectFamily(family)}
                  className={`w-full text-left p-3 rounded border transition-colors ${
                    selectedFamily?.id === family.id
                      ? 'bg-blue-100 dark:bg-blue-900 border-blue-300 dark:border-blue-700'
                      : 'bg-neutral-50 dark:bg-neutral-800 border-neutral-200 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-700'
                  }`}
                >
                  <div className="font-medium text-sm">{family.title}</div>
                  <div className="text-xs text-neutral-600 dark:text-neutral-400 mt-1">
                    {family.prompt_type} · {family.version_count} version{family.version_count !== 1 ? 's' : ''}
                  </div>
                </button>
              ))}
            </div>
          )}
        </Panel>
      </div>

      {/* Middle: Versions List */}
      <div className="col-span-3 space-y-4">
        <Panel className="p-4 max-h-[700px] overflow-y-auto">
          <h2 className="text-lg font-semibold mb-4">
            Versions {selectedFamily ? `(${versions.length})` : ''}
          </h2>
          {!selectedFamily ? (
            <div className="text-sm text-neutral-600 dark:text-neutral-400">
              Select a family to see versions
            </div>
          ) : versionsLoading ? (
            <div className="text-sm text-neutral-600 dark:text-neutral-400">Loading...</div>
          ) : versionsError ? (
            <div className="text-sm text-red-600 dark:text-red-400">{versionsError}</div>
          ) : versions.length === 0 ? (
            <div className="text-sm text-neutral-600 dark:text-neutral-400">
              No versions found
            </div>
          ) : (
            <div className="space-y-2">
              {versions.map((version) => (
                <button
                  key={version.id}
                  onClick={() => handleSelectVersion(version)}
                  className={`w-full text-left p-3 rounded border transition-colors ${
                    selectedVersion?.version.id === version.id
                      ? 'bg-blue-100 dark:bg-blue-900 border-blue-300 dark:border-blue-700'
                      : 'bg-neutral-50 dark:bg-neutral-800 border-neutral-200 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-700'
                  }`}
                >
                  <div className="font-medium text-sm">Version #{version.version_number}</div>
                  <div className="text-xs text-neutral-600 dark:text-neutral-400 mt-1">
                    {version.author || 'Unknown'} · {new Date(version.created_at).toLocaleDateString()}
                  </div>
                  {version.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {version.tags.slice(0, 3).map((tag) => (
                        <span
                          key={tag}
                          className="inline-block bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 px-1 py-0.5 rounded text-xs"
                        >
                          {tag}
                        </span>
                      ))}
                      {version.tags.length > 3 && (
                        <span className="text-xs text-neutral-600 dark:text-neutral-400">
                          +{version.tags.length - 3}
                        </span>
                      )}
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}
        </Panel>
      </div>

      {/* Right: Version Detail */}
      <div className="col-span-6 space-y-4">
        {!selectedVersion ? (
          <Panel className="p-12 text-center">
            <Icon name="file-text" className="h-12 w-12 mx-auto mb-4 text-neutral-400" />
            <h3 className="text-lg font-semibold mb-2">No Version Selected</h3>
            <p className="text-neutral-600 dark:text-neutral-400">
              Select a version to see details
            </p>
          </Panel>
        ) : versionLoading ? (
          <Panel className="p-12 text-center">
            <div className="text-neutral-600 dark:text-neutral-400">Loading version...</div>
          </Panel>
        ) : versionError ? (
          <Panel className="p-6">
            <div className="text-red-600 dark:text-red-400">{versionError}</div>
          </Panel>
        ) : (
          <>
            {/* View Mode Toggle */}
            <div className="flex gap-2 border-b border-neutral-200 dark:border-neutral-800 pb-2">
              <button
                onClick={() => setVersionViewMode('blocks')}
                className={`px-3 py-1.5 text-sm font-medium rounded transition-colors ${
                  versionViewMode === 'blocks'
                    ? 'bg-blue-500 text-white'
                    : 'bg-neutral-200 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-300 dark:hover:bg-neutral-600'
                }`}
              >
                Blocks View
              </button>
              <button
                onClick={() => setVersionViewMode('graph')}
                className={`px-3 py-1.5 text-sm font-medium rounded transition-colors ${
                  versionViewMode === 'graph'
                    ? 'bg-blue-500 text-white'
                    : 'bg-neutral-200 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-300 dark:hover:bg-neutral-600'
                }`}
              >
                Graph View
              </button>
            </div>

            {versionViewMode === 'graph' ? (
              /* Graph View */
              selectedVersion.prompt_analysis && selectedVersion.prompt_analysis.blocks ? (
                <Panel className="p-0 h-[700px]">
                  <PromptBlockGraphSurface
                    blocks={selectedVersion.prompt_analysis.blocks}
                    versionId={selectedVersion.version.id}
                    promptTitle={selectedFamily?.title || 'Prompt'}
                    includeRoleGroups={false}
                  />
                </Panel>
              ) : (
                <Panel className="p-12 text-center">
                  <Icon name="alert-circle" className="h-12 w-12 mx-auto mb-4 text-neutral-400" />
                  <h3 className="text-lg font-semibold mb-2">No Analysis Available</h3>
                  <p className="text-neutral-600 dark:text-neutral-400">
                    This version doesn't have prompt analysis data
                  </p>
                </Panel>
              )
            ) : (
              /* Blocks View */
              <>
            {/* Prompt Text */}
            <Panel className="p-6">
              <h3 className="text-sm font-semibold text-neutral-600 dark:text-neutral-400 mb-3">
                Prompt Text
              </h3>
              <div className="bg-neutral-100 dark:bg-neutral-800 rounded-md p-4 font-mono text-sm whitespace-pre-wrap max-h-[300px] overflow-y-auto">
                {selectedVersion.prompt_text}
              </div>
            </Panel>

            {/* Tags */}
            {selectedVersion.version.tags.length > 0 && (
              <Panel className="p-6">
                <h3 className="text-sm font-semibold text-neutral-600 dark:text-neutral-400 mb-3">
                  Version Tags
                </h3>
                <div className="flex flex-wrap gap-2">
                  {selectedVersion.version.tags.map((tag) => (
                    <span
                      key={tag}
                      className="inline-block bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 px-2 py-1 rounded text-xs"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </Panel>
            )}

            {/* Prompt Analysis */}
            {selectedVersion.prompt_analysis && (
              <>
                {selectedVersion.prompt_analysis.tags && selectedVersion.prompt_analysis.tags.length > 0 && (
                  <Panel className="p-6">
                    <h3 className="text-sm font-semibold text-neutral-600 dark:text-neutral-400 mb-3">
                      Analysis Tags
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {selectedVersion.prompt_analysis.tags.map((tag) => (
                        <span
                          key={tag}
                          className="inline-block bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 px-2 py-1 rounded text-xs"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </Panel>
                )}

                <PromptBlocksViewer
                  prompt={selectedVersion.prompt_analysis.prompt}
                  blocks={selectedVersion.prompt_analysis.blocks}
                />
              </>
            )}
            </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ===== Models Tab =====

function ModelsTab() {
  const api = useApi();

  // State for models list
  const [models, setModels] = useState<AiModel[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsError, setModelsError] = useState<string | null>(null);

  // State for defaults
  const [defaults, setDefaults] = useState<Record<string, string>>({});
  const [defaultsLoading, setDefaultsLoading] = useState(false);
  const [defaultsError, setDefaultsError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Temporary state for dropdown selections
  const [selectedDefaults, setSelectedDefaults] = useState<Record<string, string>>({});

  // Load models
  const loadModels = async () => {
    setModelsLoading(true);
    setModelsError(null);

    try {
      const result = await api.get<AiModel[]>('/dev/ai-models');
      setModels(result);
    } catch (err: any) {
      console.error('Failed to load AI models:', err);
      setModelsError(err.message || 'Failed to load AI models');
    } finally {
      setModelsLoading(false);
    }
  };

  // Load defaults
  const loadDefaults = async () => {
    setDefaultsLoading(true);
    setDefaultsError(null);

    try {
      const result = await api.get<Record<string, string>>('/dev/ai-models/defaults');
      setDefaults(result);
      setSelectedDefaults(result);
    } catch (err: any) {
      console.error('Failed to load defaults:', err);
      setDefaultsError(err.message || 'Failed to load defaults');
    } finally {
      setDefaultsLoading(false);
    }
  };

  // Save defaults
  const saveDefaults = async () => {
    setSaving(true);
    setDefaultsError(null);

    try {
      const result = await api.post<Record<string, string>>(
        '/dev/ai-models/defaults',
        { defaults: selectedDefaults }
      );
      setDefaults(result);
      alert('Defaults saved successfully!');
    } catch (err: any) {
      console.error('Failed to save defaults:', err);
      setDefaultsError(err.message || 'Failed to save defaults');
      alert(`Failed to save defaults: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  // Load on mount
  useEffect(() => {
    loadModels();
    loadDefaults();
  }, []);

  // Get models by capability
  const getModelsForCapability = (capability: string) => {
    return models.filter(m => m.capabilities.includes(capability));
  };

  // Capability display names
  const capabilityLabels: Record<string, string> = {
    'prompt_edit': 'Prompt Editing',
    'prompt_parse': 'Prompt Parsing',
    'tag_suggest': 'Tag Suggestion',
  };

  const hasChanges = JSON.stringify(defaults) !== JSON.stringify(selectedDefaults);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Left: All Models */}
      <div className="space-y-4">
        <Panel className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">All AI Models</h2>
            <Button onClick={loadModels} size="sm" variant="outline" disabled={modelsLoading}>
              {modelsLoading ? 'Loading...' : 'Refresh'}
            </Button>
          </div>

          {modelsError && (
            <div className="p-3 bg-red-100 dark:bg-red-900 border border-red-300 dark:border-red-700 rounded text-red-800 dark:text-red-200 mb-4">
              {modelsError}
            </div>
          )}

          {modelsLoading ? (
            <div className="text-neutral-600 dark:text-neutral-400">Loading models...</div>
          ) : models.length === 0 ? (
            <div className="text-neutral-600 dark:text-neutral-400">No models found</div>
          ) : (
            <div className="space-y-3 max-h-[600px] overflow-y-auto">
              {models.map((model) => (
                <div
                  key={model.id}
                  className="p-4 border border-neutral-200 dark:border-neutral-700 rounded-md bg-neutral-50 dark:bg-neutral-800"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1">
                      <div className="font-medium text-sm">{model.label}</div>
                      <div className="text-xs text-neutral-600 dark:text-neutral-400 font-mono mt-1">
                        {model.id}
                      </div>
                    </div>
                    <span className={`px-2 py-1 rounded text-xs font-medium ${
                      model.kind === 'llm'
                        ? 'bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200'
                        : model.kind === 'parser'
                        ? 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200'
                        : 'bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-200'
                    }`}>
                      {model.kind}
                    </span>
                  </div>

                  {model.description && (
                    <p className="text-xs text-neutral-600 dark:text-neutral-400 mb-2">
                      {model.description}
                    </p>
                  )}

                  <div className="flex flex-wrap gap-1 mt-2">
                    {model.capabilities.map((cap) => (
                      <span
                        key={cap}
                        className="inline-block bg-neutral-200 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-300 px-2 py-0.5 rounded text-xs"
                      >
                        {capabilityLabels[cap] || cap}
                      </span>
                    ))}
                  </div>

                  {model.provider_id && (
                    <div className="text-xs text-neutral-600 dark:text-neutral-400 mt-2">
                      Provider: <span className="font-mono">{model.provider_id}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>

      {/* Right: Default Model Selection */}
      <div className="space-y-4">
        <Panel className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Default Model Selection</h2>
            <Button onClick={loadDefaults} size="sm" variant="outline" disabled={defaultsLoading}>
              {defaultsLoading ? 'Loading...' : 'Refresh'}
            </Button>
          </div>

          {defaultsError && (
            <div className="p-3 bg-red-100 dark:bg-red-900 border border-red-300 dark:border-red-700 rounded text-red-800 dark:text-red-200 mb-4">
              {defaultsError}
            </div>
          )}

          {defaultsLoading ? (
            <div className="text-neutral-600 dark:text-neutral-400">Loading defaults...</div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-4">
                Configure which AI models are used by default for each capability.
              </p>

              {/* Prompt Edit */}
              <div>
                <label className="block text-sm font-medium mb-2">
                  Default Prompt Editor
                  <span className="text-xs text-neutral-500 dark:text-neutral-400 ml-2">
                    (prompt_edit)
                  </span>
                </label>
                <select
                  className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-700 rounded-md bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={selectedDefaults['prompt_edit'] || ''}
                  onChange={(e) => setSelectedDefaults({
                    ...selectedDefaults,
                    prompt_edit: e.target.value
                  })}
                >
                  <option value="">Select model...</option>
                  {getModelsForCapability('prompt_edit').map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.label} ({model.id})
                    </option>
                  ))}
                </select>
                <div className="text-xs text-neutral-600 dark:text-neutral-400 mt-1">
                  Current: {defaults['prompt_edit'] || 'Not set'}
                </div>
              </div>

              {/* Prompt Parse */}
              <div>
                <label className="block text-sm font-medium mb-2">
                  Default Prompt Parser
                  <span className="text-xs text-neutral-500 dark:text-neutral-400 ml-2">
                    (prompt_parse)
                  </span>
                </label>
                <select
                  className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-700 rounded-md bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={selectedDefaults['prompt_parse'] || ''}
                  onChange={(e) => setSelectedDefaults({
                    ...selectedDefaults,
                    prompt_parse: e.target.value
                  })}
                >
                  <option value="">Select model...</option>
                  {getModelsForCapability('prompt_parse').map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.label} ({model.id})
                    </option>
                  ))}
                </select>
                <div className="text-xs text-neutral-600 dark:text-neutral-400 mt-1">
                  Current: {defaults['prompt_parse'] || 'Not set'}
                </div>
              </div>

              {/* Tag Suggest */}
              <div>
                <label className="block text-sm font-medium mb-2">
                  Default Tag Suggester
                  <span className="text-xs text-neutral-500 dark:text-neutral-400 ml-2">
                    (tag_suggest)
                  </span>
                </label>
                <select
                  className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-700 rounded-md bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={selectedDefaults['tag_suggest'] || ''}
                  onChange={(e) => setSelectedDefaults({
                    ...selectedDefaults,
                    tag_suggest: e.target.value
                  })}
                >
                  <option value="">Select model...</option>
                  {getModelsForCapability('tag_suggest').map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.label} ({model.id})
                    </option>
                  ))}
                </select>
                <div className="text-xs text-neutral-600 dark:text-neutral-400 mt-1">
                  Current: {defaults['tag_suggest'] || 'Not set'}
                </div>
              </div>

              {/* Save Button */}
              <div className="pt-4 border-t border-neutral-200 dark:border-neutral-800">
                {hasChanges && (
                  <div className="p-3 bg-yellow-100 dark:bg-yellow-900 border border-yellow-300 dark:border-yellow-700 rounded text-yellow-800 dark:text-yellow-200 mb-4 text-sm">
                    You have unsaved changes
                  </div>
                )}
                <Button
                  onClick={saveDefaults}
                  disabled={saving || !hasChanges}
                  className="w-full"
                >
                  {saving ? 'Saving...' : 'Save Defaults'}
                </Button>
              </div>
            </div>
          )}
        </Panel>

        {/* Info Panel */}
        <Panel className="p-6 bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800">
          <h3 className="text-sm font-semibold text-blue-900 dark:text-blue-100 mb-2">
            About Model Selection
          </h3>
          <ul className="text-xs text-blue-800 dark:text-blue-200 space-y-1">
            <li>• <strong>Prompt Edit</strong>: Used by AI Hub for prompt refinement</li>
            <li>• <strong>Prompt Parse</strong>: Used by Prompt Lab Analyze tab to parse prompts into blocks</li>
            <li>• <strong>Tag Suggest</strong>: Used for AI-powered tag suggestions (future)</li>
          </ul>
        </Panel>
      </div>
    </div>
  );
}

// ===== Categories Tab =====

interface CategoriesTabProps {
  initialPromptText?: string;
  onClearInitial: () => void;
}

interface CategoryDiscoveryResponse {
  prompt_text: string;
  parser_roles: Array<{ role: string; text: string }>;
  existing_ontology_ids: string[];
  suggestions: any;
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
  suggested_action_blocks: Array<{
    block_id: string;
    prompt: string;
    tags: Record<string, any>;
    notes?: string;
  }>;
}

function CategoriesTab({ initialPromptText, onClearInitial }: CategoriesTabProps) {
  const api = useApi();
  const [promptText, setPromptText] = useState(initialPromptText || '');
  const [worldId, setWorldId] = useState('');
  const [packIds, setPackIds] = useState('');
  const [useCase, setUseCase] = useState('');
  const [discovery, setDiscovery] = useState<CategoryDiscoveryResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showRawJson, setShowRawJson] = useState(false);

  // Clear initial prompt after first use
  useEffect(() => {
    if (initialPromptText) {
      setPromptText(initialPromptText);
      onClearInitial();
    }
  }, [initialPromptText, onClearInitial]);

  const handleDiscover = async () => {
    if (!promptText.trim()) {
      setError('Prompt text is required');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await api.post<CategoryDiscoveryResponse>(
        '/dev/prompt-categories/discover',
        {
          prompt_text: promptText,
          world_id: worldId || null,
          pack_ids: packIds ? packIds.split(',').map((s) => s.trim()) : null,
          use_case: useCase || null,
        }
      );
      setDiscovery(result);
    } catch (err: any) {
      console.error('Category discovery error:', err);
      setError(err.message || 'Failed to discover categories');
      setDiscovery(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Left: Input */}
      <div className="space-y-4">
        <Panel className="p-6">
          <h2 className="text-lg font-semibold mb-4">Category Discovery (AI)</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">
                Prompt Text
              </label>
              <textarea
                className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-700 rounded-md bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[200px] font-mono text-sm"
                placeholder="Enter prompt text to analyze..."
                value={promptText}
                onChange={(e) => setPromptText(e.target.value)}
                disabled={loading}
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">
                World ID (optional)
              </label>
              <Input
                type="text"
                placeholder="e.g., fantasy-tavern"
                value={worldId}
                onChange={(e) => setWorldId(e.target.value)}
                disabled={loading}
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">
                Pack IDs (optional, comma-separated)
              </label>
              <Input
                type="text"
                placeholder="e.g., minotaur-romance, tavern-scenes"
                value={packIds}
                onChange={(e) => setPackIds(e.target.value)}
                disabled={loading}
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">
                Use Case (optional)
              </label>
              <select
                className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-700 rounded-md bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={useCase}
                onChange={(e) => setUseCase(e.target.value)}
                disabled={loading}
              >
                <option value="">Select use case...</option>
                <option value="family-seed">Family Seed</option>
                <option value="one-off">One-off Prompt</option>
                <option value="action-block">ActionBlock</option>
              </select>
            </div>

            {error && (
              <div className="p-3 bg-red-100 dark:bg-red-900 border border-red-300 dark:border-red-700 rounded text-red-800 dark:text-red-200">
                {error}
              </div>
            )}

            <Button
              onClick={handleDiscover}
              disabled={loading || !promptText.trim()}
              className="w-full"
            >
              {loading ? 'Analyzing...' : 'Analyze Categories (AI)'}
            </Button>
          </div>
        </Panel>
      </div>

      {/* Right: Results */}
      <div className="space-y-4">
        {discovery ? (
          <>
            {/* Parser Summary */}
            <Panel className="p-6">
              <h3 className="text-sm font-semibold text-neutral-600 dark:text-neutral-400 mb-3">
                Parser Summary
              </h3>
              <div className="space-y-2">
                {discovery.parser_roles.map((block, idx) => (
                  <div key={idx} className="text-sm">
                    <span className="inline-block bg-neutral-200 dark:bg-neutral-700 px-2 py-1 rounded text-xs font-mono mr-2">
                      {block.role}
                    </span>
                    <span className="text-neutral-700 dark:text-neutral-300">
                      {block.text}
                    </span>
                  </div>
                ))}
              </div>

              {discovery.existing_ontology_ids.length > 0 && (
                <div className="mt-4">
                  <h4 className="text-xs font-semibold text-neutral-600 dark:text-neutral-400 mb-2">
                    Existing Ontology IDs
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {discovery.existing_ontology_ids.map((id) => (
                      <span
                        key={id}
                        className="inline-block bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 px-2 py-1 rounded text-xs font-mono"
                      >
                        {id}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </Panel>

            {/* Suggested Ontology IDs */}
            {discovery.suggested_ontology_ids.length > 0 && (
              <Panel className="p-6">
                <h3 className="text-sm font-semibold text-neutral-600 dark:text-neutral-400 mb-3">
                  Suggested Ontology IDs ({discovery.suggested_ontology_ids.length})
                </h3>
                <div className="space-y-3">
                  {discovery.suggested_ontology_ids.map((suggestion) => (
                    <div
                      key={suggestion.id}
                      className="p-3 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded"
                    >
                      <div className="flex items-start justify-between mb-1">
                        <code className="text-sm font-mono text-blue-900 dark:text-blue-100">
                          {suggestion.id}
                        </code>
                        <span className="text-xs text-neutral-600 dark:text-neutral-400">
                          {Math.round(suggestion.confidence * 100)}% confidence
                        </span>
                      </div>
                      <div className="text-sm font-medium text-blue-800 dark:text-blue-200">
                        {suggestion.label}
                      </div>
                      {suggestion.description && (
                        <div className="text-xs text-blue-700 dark:text-blue-300 mt-1">
                          {suggestion.description}
                        </div>
                      )}
                      <div className="text-xs text-neutral-600 dark:text-neutral-400 mt-1">
                        Kind: {suggestion.kind}
                      </div>
                    </div>
                  ))}
                </div>
              </Panel>
            )}

            {/* Suggested Packs */}
            {discovery.suggested_packs.length > 0 && (
              <Panel className="p-6">
                <h3 className="text-sm font-semibold text-neutral-600 dark:text-neutral-400 mb-3">
                  Suggested Semantic Packs ({discovery.suggested_packs.length})
                </h3>
                <div className="space-y-3">
                  {discovery.suggested_packs.map((pack) => (
                    <div
                      key={pack.pack_id}
                      className="p-3 bg-purple-50 dark:bg-purple-950 border border-purple-200 dark:border-purple-800 rounded"
                    >
                      <div className="text-sm font-medium text-purple-900 dark:text-purple-100 mb-1">
                        {pack.pack_label}
                      </div>
                      <code className="text-xs font-mono text-purple-800 dark:text-purple-200">
                        {pack.pack_id}
                      </code>
                      {pack.notes && (
                        <div className="text-xs text-purple-700 dark:text-purple-300 mt-2">
                          {pack.notes}
                        </div>
                      )}
                      <div className="mt-2 text-xs">
                        <div className="font-semibold text-purple-800 dark:text-purple-200 mb-1">
                          Parser Hints:
                        </div>
                        <div className="space-y-1">
                          {Object.entries(pack.parser_hints).map(([key, values]) => (
                            <div key={key}>
                              <span className="text-purple-700 dark:text-purple-300">
                                {key}:
                              </span>{' '}
                              <span className="text-purple-600 dark:text-purple-400">
                                {values.join(', ')}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </Panel>
            )}

            {/* Suggested ActionBlocks */}
            {discovery.suggested_action_blocks.length > 0 && (
              <Panel className="p-6">
                <h3 className="text-sm font-semibold text-neutral-600 dark:text-neutral-400 mb-3">
                  Suggested ActionBlocks ({discovery.suggested_action_blocks.length})
                </h3>
                <div className="space-y-3">
                  {discovery.suggested_action_blocks.map((block) => (
                    <div
                      key={block.block_id}
                      className="p-3 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded"
                    >
                      <code className="text-xs font-mono text-amber-900 dark:text-amber-100">
                        {block.block_id}
                      </code>
                      <div className="text-sm text-amber-800 dark:text-amber-200 mt-2 font-mono">
                        {block.prompt}
                      </div>
                      {block.notes && (
                        <div className="text-xs text-amber-700 dark:text-amber-300 mt-2">
                          {block.notes}
                        </div>
                      )}
                      <div className="mt-2">
                        <div className="text-xs font-semibold text-amber-800 dark:text-amber-200 mb-1">
                          Tags:
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {Object.entries(block.tags).map(([key, value]) => (
                            <span
                              key={key}
                              className="inline-block bg-amber-200 dark:bg-amber-900 text-amber-900 dark:text-amber-100 px-2 py-0.5 rounded text-xs"
                            >
                              {key}: {JSON.stringify(value)}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </Panel>
            )}

            {/* Raw JSON (collapsible) */}
            <Panel className="p-6">
              <button
                onClick={() => setShowRawJson(!showRawJson)}
                className="w-full flex items-center justify-between text-sm font-semibold text-neutral-600 dark:text-neutral-400"
              >
                <span>Raw JSON Response</span>
                <Icon name={showRawJson ? 'chevron-up' : 'chevron-down'} className="h-4 w-4" />
              </button>
              {showRawJson && (
                <pre className="mt-4 p-3 bg-neutral-100 dark:bg-neutral-900 rounded text-xs overflow-auto max-h-96">
                  {JSON.stringify(discovery.suggestions, null, 2)}
                </pre>
              )}
            </Panel>
          </>
        ) : (
          <Panel className="p-12 text-center">
            <Icon name="search" className="h-12 w-12 mx-auto mb-4 text-neutral-400" />
            <h3 className="text-lg font-semibold mb-2">No Analysis Yet</h3>
            <p className="text-neutral-600 dark:text-neutral-400">
              Enter prompt text and click "Analyze Categories (AI)" to discover semantic categories and suggestions
            </p>
          </Panel>
        )}
      </div>
    </div>
  );
}
