/**
 * Prompt Importer Dev Page
 *
 * Development tool for importing arbitrary prompts into PixSim7.
 * Accepts prompt text + metadata and creates PromptFamily + PromptVersion records.
 */

import { useState } from 'react';
import { Panel, Button, Input } from '@pixsim7/shared.ui';
import { Icon } from '../lib/icons';
import { useApi } from '../hooks/useApi';
import { PromptBlocksViewer } from '../components/prompts/PromptBlocksViewer';

// Response types matching backend
interface PromptFamilyResponse {
  id: string;
  slug: string;
  title: string;
  description?: string;
  prompt_type: string;
  category?: string;
  tags: string[];
  is_active: boolean;
  version_count?: number;
}

interface PromptVersionResponse {
  id: string;
  family_id: string;
  version_number: number;
  prompt_text: string;
  commit_message?: string;
  author?: string;
  generation_count: number;
  successful_assets: number;
  tags: string[];
  created_at: string;
}

interface PromptImportResponse {
  family: PromptFamilyResponse;
  version: PromptVersionResponse;
}

export function DevPromptImporter() {
  const api = useApi();

  // Form fields
  const [familyTitle, setFamilyTitle] = useState('');
  const [promptText, setPromptText] = useState('');
  const [familySlug, setFamilySlug] = useState('');
  const [promptType, setPromptType] = useState('visual');
  const [category, setCategory] = useState('');
  const [familyTags, setFamilyTags] = useState('');
  const [versionTags, setVersionTags] = useState('');
  const [source, setSource] = useState('manual');
  const [sourceReference, setSourceReference] = useState('');

  // State
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PromptImportResponse | null>(null);

  const handleImport = async () => {
    // Validation
    if (!familyTitle.trim()) {
      setError('Family title is required');
      return;
    }

    if (!promptText.trim()) {
      setError('Prompt text is required');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Parse tags (comma-separated)
      const parseFamilyTags = familyTags
        .split(',')
        .map((t) => t.trim())
        .filter((t) => t.length > 0);
      const parseVersionTags = versionTags
        .split(',')
        .map((t) => t.trim())
        .filter((t) => t.length > 0);

      // Build request
      const requestBody = {
        family_title: familyTitle,
        prompt_text: promptText,
        family_slug: familySlug || undefined,
        prompt_type: promptType,
        category: category || undefined,
        explicit_family_tags: parseFamilyTags.length > 0 ? parseFamilyTags : undefined,
        explicit_version_tags: parseVersionTags.length > 0 ? parseVersionTags : undefined,
        source,
        source_reference: sourceReference || undefined,
      };

      // Call API
      const response = await api.post<PromptImportResponse>(
        '/dev/prompt-import',
        requestBody
      );

      setResult(response);
      setError(null);
    } catch (err: any) {
      console.error('Import error:', err);
      setError(err.message || 'Failed to import prompt');
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setFamilyTitle('');
    setPromptText('');
    setFamilySlug('');
    setPromptType('visual');
    setCategory('');
    setFamilyTags('');
    setVersionTags('');
    setSource('manual');
    setSourceReference('');
    setResult(null);
    setError(null);
  };

  return (
    <div className="mx-auto max-w-7xl p-6 space-y-6 content-with-dock min-h-screen">
      {/* Header */}
      <header className="border-b border-neutral-200 dark:border-neutral-800 pb-6">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold flex items-center gap-2">
              <Icon name="upload" className="h-6 w-6" />
              Prompt Importer
            </h1>
            <p className="text-neutral-600 dark:text-neutral-400">
              Import prompts from any source into PixSim7
            </p>
          </div>
        </div>
      </header>

      {/* Import Form */}
      <Panel className="p-6">
        <h2 className="text-lg font-semibold mb-4">Import Prompt</h2>
        <div className="space-y-4">
          {/* Required Fields */}
          <div className="grid grid-cols-1 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">
                Family Title <span className="text-red-500">*</span>
              </label>
              <Input
                type="text"
                placeholder="Enter family title"
                value={familyTitle}
                onChange={(e) => setFamilyTitle(e.target.value)}
                disabled={loading}
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">
                Prompt Text <span className="text-red-500">*</span>
              </label>
              <textarea
                className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-700 rounded-md bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[200px] font-mono text-sm"
                placeholder="Enter prompt text to import"
                value={promptText}
                onChange={(e) => setPromptText(e.target.value)}
                disabled={loading}
              />
            </div>
          </div>

          {/* Optional Fields */}
          <details className="border border-neutral-300 dark:border-neutral-700 rounded-md p-4">
            <summary className="cursor-pointer font-medium text-sm">
              Optional Fields
            </summary>
            <div className="mt-4 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Family Slug
                  </label>
                  <Input
                    type="text"
                    placeholder="Auto-generated if empty"
                    value={familySlug}
                    onChange={(e) => setFamilySlug(e.target.value)}
                    disabled={loading}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">
                    Prompt Type
                  </label>
                  <select
                    className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-700 rounded-md bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100"
                    value={promptType}
                    onChange={(e) => setPromptType(e.target.value)}
                    disabled={loading}
                  >
                    <option value="visual">Visual</option>
                    <option value="narrative">Narrative</option>
                    <option value="hybrid">Hybrid</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Category
                  </label>
                  <Input
                    type="text"
                    placeholder="Optional category"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    disabled={loading}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">
                    Source
                  </label>
                  <select
                    className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-700 rounded-md bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100"
                    value={source}
                    onChange={(e) => setSource(e.target.value)}
                    disabled={loading}
                  >
                    <option value="manual">Manual</option>
                    <option value="file_import">File Import</option>
                    <option value="external">External</option>
                    <option value="other">Other</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">
                  Source Reference
                </label>
                <Input
                  type="text"
                  placeholder="e.g., file path or external ID"
                  value={sourceReference}
                  onChange={(e) => setSourceReference(e.target.value)}
                  disabled={loading}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Family Tags (comma-separated)
                  </label>
                  <Input
                    type="text"
                    placeholder="tag1, tag2, tag3"
                    value={familyTags}
                    onChange={(e) => setFamilyTags(e.target.value)}
                    disabled={loading}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">
                    Version Tags (comma-separated)
                  </label>
                  <Input
                    type="text"
                    placeholder="tag1, tag2, tag3"
                    value={versionTags}
                    onChange={(e) => setVersionTags(e.target.value)}
                    disabled={loading}
                  />
                </div>
              </div>
            </div>
          </details>

          {/* Error Display */}
          {error && (
            <div className="p-3 bg-red-100 dark:bg-red-900 border border-red-300 dark:border-red-700 rounded text-red-800 dark:text-red-200">
              {error}
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-2">
            <Button
              onClick={handleImport}
              disabled={loading || !familyTitle.trim() || !promptText.trim()}
              className="flex-1"
            >
              {loading ? 'Importing...' : 'Import Prompt'}
            </Button>
            <Button
              onClick={handleReset}
              disabled={loading}
              variant="outline"
            >
              Reset
            </Button>
          </div>
        </div>
      </Panel>

      {/* Results Section */}
      {result && (
        <div className="space-y-4">
          {/* Family Info */}
          <Panel className="p-6">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Icon name="check" className="h-5 w-5 text-green-500" />
              Import Successful
            </h2>
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-neutral-600 dark:text-neutral-400 mb-2">
                  Prompt Family
                </h3>
                <div className="bg-neutral-100 dark:bg-neutral-800 rounded-md p-4 space-y-2 text-sm">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <span className="font-medium">ID:</span> {result.family.id}
                    </div>
                    <div>
                      <span className="font-medium">Slug:</span> {result.family.slug}
                    </div>
                    <div>
                      <span className="font-medium">Title:</span> {result.family.title}
                    </div>
                    <div>
                      <span className="font-medium">Type:</span> {result.family.prompt_type}
                    </div>
                    {result.family.category && (
                      <div>
                        <span className="font-medium">Category:</span> {result.family.category}
                      </div>
                    )}
                    <div>
                      <span className="font-medium">Active:</span>{' '}
                      {result.family.is_active ? 'Yes' : 'No'}
                    </div>
                  </div>
                  {result.family.tags.length > 0 && (
                    <div>
                      <span className="font-medium">Tags:</span>{' '}
                      {result.family.tags.map((tag) => (
                        <span
                          key={tag}
                          className="inline-block bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 px-2 py-1 rounded text-xs mr-1"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-neutral-600 dark:text-neutral-400 mb-2">
                  Prompt Version
                </h3>
                <div className="bg-neutral-100 dark:bg-neutral-800 rounded-md p-4 space-y-2 text-sm">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <span className="font-medium">ID:</span> {result.version.id}
                    </div>
                    <div>
                      <span className="font-medium">Version:</span> #{result.version.version_number}
                    </div>
                    {result.version.author && (
                      <div>
                        <span className="font-medium">Author:</span> {result.version.author}
                      </div>
                    )}
                    <div>
                      <span className="font-medium">Created:</span>{' '}
                      {new Date(result.version.created_at).toLocaleString()}
                    </div>
                  </div>
                  {result.version.tags.length > 0 && (
                    <div>
                      <span className="font-medium">Tags:</span>{' '}
                      {result.version.tags.map((tag) => (
                        <span
                          key={tag}
                          className="inline-block bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 px-2 py-1 rounded text-xs mr-1"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </Panel>

          {/* Prompt Preview */}
          <Panel className="p-6">
            <h3 className="text-sm font-semibold text-neutral-600 dark:text-neutral-400 mb-2">
              Imported Prompt Text
            </h3>
            <div className="bg-neutral-100 dark:bg-neutral-800 rounded-md p-4 font-mono text-sm whitespace-pre-wrap">
              {result.version.prompt_text}
            </div>
          </Panel>
        </div>
      )}

      {/* Empty State */}
      {!result && !error && (
        <Panel className="p-12 text-center">
          <Icon name="upload" className="h-12 w-12 mx-auto mb-4 text-neutral-400" />
          <h3 className="text-lg font-semibold mb-2">No Prompt Imported Yet</h3>
          <p className="text-neutral-600 dark:text-neutral-400">
            Fill in the form above to import a prompt
          </p>
        </Panel>
      )}
    </div>
  );
}
