/**
 * Prompt Lab Dev Page
 *
 * Unified development surface for prompt analysis, import, and library browsing.
 * Brings together prompt inspection, import tools, and family/version browsing.
 */

import { useState } from 'react';
import { Panel, Button, Input } from '@pixsim7/shared.ui';
import { Icon } from '../lib/icons';
import { DevPromptImporter } from './DevPromptImporter';
import { PromptBlocksViewer } from '../components/prompts/PromptBlocksViewer';
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

// ===== Main Component =====

export function PromptLabDev() {
  const [activeTab, setActiveTab] = useState<'analyze' | 'import' | 'library'>('analyze');

  // Shared state for Analyze -> Import flow
  const [importFamilyTitle, setImportFamilyTitle] = useState<string | undefined>();
  const [importPromptText, setImportPromptText] = useState<string | undefined>();

  const handleSendToImport = (familyTitle: string, promptText: string) => {
    setImportFamilyTitle(familyTitle);
    setImportPromptText(promptText);
    setActiveTab('import');
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
      </div>

      {/* Tab Content */}
      {activeTab === 'analyze' && (
        <AnalyzeTab onSendToImport={handleSendToImport} />
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
    </div>
  );
}

// ===== Analyze Tab =====

interface AnalyzeTabProps {
  onSendToImport: (familyTitle: string, promptText: string) => void;
}

function AnalyzeTab({ onSendToImport }: AnalyzeTabProps) {
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
      </div>
    </div>
  );
}
