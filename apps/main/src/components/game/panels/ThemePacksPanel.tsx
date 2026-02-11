/**
 * Theme Packs Panel
 *
 * UI for browsing, importing, and exporting theme packs.
 * Allows users to share collections of themes easily.
 */

import { useState, useRef } from 'react';
import type { ThemePack } from '@pixsim7/game.engine';
import {
  getAllThemePacks,
  getThemePackById,
  saveThemePack,
  deleteThemePack,
  downloadThemePack,
  importThemePack,
  saveThemePreset,
} from '@pixsim7/game.engine';
import { Button, Select, Badge } from '@pixsim7/shared.ui';

interface ThemePacksPanelProps {
  onThemeImported?: () => void;
}

export function ThemePacksPanel({ onThemeImported }: ThemePacksPanelProps) {
  const [themePacks, setThemePacks] = useState<ThemePack[]>(getAllThemePacks());
  const [selectedPackId, setSelectedPackId] = useState<string>('');
  const [expandedPackId, setExpandedPackId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const selectedPack = selectedPackId ? getThemePackById(selectedPackId) : null;

  const refreshPacks = () => {
    setThemePacks(getAllThemePacks());
  };

  const handleExportPack = (pack: ThemePack) => {
    downloadThemePack(pack, (filename, json) => {
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });
  };

  const handleImportPack = () => {
    fileInputRef.current?.click();
  };

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const pack = importThemePack(text);

      if (!pack) {
        alert('Failed to import theme pack. Invalid format.');
        return;
      }

      const success = saveThemePack(pack);
      if (success) {
        refreshPacks();
        alert(`Successfully imported theme pack: ${pack.name}`);
      } else {
        alert(`Failed to import: Pack with ID "${pack.id}" already exists.`);
      }
    } catch (err) {
      console.error('Failed to import theme pack', err);
      alert('Failed to import theme pack. Please check the file format.');
    }

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleDeletePack = (packId: string) => {
    if (!confirm('Are you sure you want to delete this theme pack?')) {
      return;
    }

    const success = deleteThemePack(packId);
    if (success) {
      refreshPacks();
      if (selectedPackId === packId) {
        setSelectedPackId('');
      }
    } else {
      alert('Cannot delete built-in theme packs.');
    }
  };

  const handleInstallThemesFromPack = (pack: ThemePack) => {
    let installed = 0;
    let skipped = 0;

    for (const theme of pack.themes) {
      const preset = {
        ...theme,
        name: theme.id
          .split('-')
          .map(word => word.charAt(0).toUpperCase() + word.slice(1))
          .join(' '),
        description: `From ${pack.name} pack`,
        isBuiltIn: false,
      };

      const success = saveThemePreset(preset);
      if (success) {
        installed++;
      } else {
        skipped++;
      }
    }

    if (installed > 0) {
      onThemeImported?.();
    }

    alert(
      `Installed ${installed} theme(s) from ${pack.name}.\n${
        skipped > 0 ? `Skipped ${skipped} theme(s) (already exist).` : ''
      }`
    );
  };

  const togglePackExpansion = (packId: string) => {
    setExpandedPackId(expandedPackId === packId ? null : packId);
  };

  return (
    <div className="space-y-4">
      <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded border border-blue-200 dark:border-blue-800">
        <div className="font-semibold text-sm mb-1">Theme Packs</div>
        <div className="text-xs text-neutral-600 dark:text-neutral-400">
          Browse and install curated theme collections, or import/export custom packs.
        </div>
      </div>

      {/* Import/Export Actions */}
      <div className="flex gap-2">
        <Button onClick={handleImportPack} variant="secondary" size="sm">
          📥 Import Pack
        </Button>
        {selectedPack && (
          <Button
            onClick={() => handleExportPack(selectedPack)}
            variant="secondary"
            size="sm"
          >
            📤 Export Selected
          </Button>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        onChange={handleFileSelected}
        className="hidden"
      />

      {/* Pack List */}
      <div className="space-y-2">
        {themePacks.map((pack) => {
          const isExpanded = expandedPackId === pack.id;

          return (
            <div
              key={pack.id}
              className="border border-neutral-200 dark:border-neutral-700 rounded-lg overflow-hidden"
            >
              {/* Pack Header */}
              <div
                className="p-3 bg-neutral-50 dark:bg-neutral-900 cursor-pointer hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
                onClick={() => togglePackExpansion(pack.id)}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold text-sm">{pack.name}</span>
                      {pack.isBuiltIn && (
                        <Badge color="blue">Built-in</Badge>
                      )}
                      <span className="text-xs text-neutral-500">
                        {pack.themes.length} theme{pack.themes.length !== 1 ? 's' : ''}
                      </span>
                    </div>
                    {pack.description && (
                      <div className="text-xs text-neutral-600 dark:text-neutral-400">
                        {pack.description}
                      </div>
                    )}
                    {pack.tags && pack.tags.length > 0 && (
                      <div className="flex gap-1 mt-1">
                        {pack.tags.map((tag) => (
                          <span
                            key={tag}
                            className="text-xs px-1.5 py-0.5 rounded bg-neutral-200 dark:bg-neutral-700 text-neutral-600 dark:text-neutral-300"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <span className="text-neutral-400">
                    {isExpanded ? '▼' : '▶'}
                  </span>
                </div>
              </div>

              {/* Pack Details (when expanded) */}
              {isExpanded && (
                <div className="p-3 bg-white dark:bg-neutral-950 border-t border-neutral-200 dark:border-neutral-700">
                  {/* Pack Metadata */}
                  {(pack.author || pack.version) && (
                    <div className="text-xs text-neutral-500 mb-3">
                      {pack.author && <div>Author: {pack.author}</div>}
                      {pack.version && <div>Version: {pack.version}</div>}
                    </div>
                  )}

                  {/* Theme List */}
                  <div className="space-y-2 mb-3">
                    <div className="text-xs font-semibold text-neutral-600 dark:text-neutral-400">
                      Themes in this pack:
                    </div>
                    {pack.themes.map((theme) => (
                      <div
                        key={theme.id}
                        className="text-xs p-2 rounded bg-neutral-50 dark:bg-neutral-900"
                      >
                        <div className="font-medium mb-1">{theme.id}</div>
                        {theme.colors && Object.keys(theme.colors).length > 0 && (
                          <div className="flex gap-1">
                            {Object.entries(theme.colors).slice(0, 4).map(([key, value]) => (
                              <div
                                key={key}
                                className="w-4 h-4 rounded border border-neutral-300 dark:border-neutral-600"
                                style={{ backgroundColor: value }}
                                title={`${key}: ${value}`}
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2">
                    <Button
                      onClick={() => handleInstallThemesFromPack(pack)}
                      variant="primary"
                      size="sm"
                    >
                      Install All Themes
                    </Button>
                    <Button
                      onClick={() => handleExportPack(pack)}
                      variant="secondary"
                      size="sm"
                    >
                      Export
                    </Button>
                    {!pack.isBuiltIn && (
                      <Button
                        onClick={() => handleDeletePack(pack.id)}
                        variant="secondary"
                        size="sm"
                      >
                        Delete
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {themePacks.length === 0 && (
        <div className="text-center text-neutral-500 text-sm py-8">
          No theme packs available. Import a pack to get started.
        </div>
      )}
    </div>
  );
}
