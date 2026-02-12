import { Button, useToast } from '@pixsim7/shared.ui';
import { useMemo, useRef, useState, type ChangeEvent } from 'react';

import type { GameProjectBundle } from '@lib/api';
import {
  exportWorldProjectWithExtensions,
  importWorldProjectWithExtensions,
  projectBundleExtensionRegistry,
  type ImportWorldProjectWithExtensionsResult,
  type ProjectBundleExtensionExportReport,
  type ProjectBundleExtensionImportReport,
} from '@lib/game';

import { useProjectSessionStore, useWorldContextStore } from '@features/scene';

import { WorldContextSelector } from '@/components/game/WorldContextSelector';

import { PanelHeader } from '../shared/PanelHeader';

type LastProjectAction =
  | {
      kind: 'export';
      worldName: string;
      counts: {
        locations: number;
        npcs: number;
        scenes: number;
        items: number;
      };
      extensionReport: ProjectBundleExtensionExportReport;
    }
  | {
      kind: 'import';
      worldId: number;
      worldName: string;
      counts: ImportWorldProjectWithExtensionsResult['response']['counts'];
      coreWarnings: string[];
      extensionReport: ProjectBundleExtensionImportReport;
    };

function downloadJson(filename: string, payload: unknown): void {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function formatTimestamp(value: number | null): string {
  if (!value) return 'Never';
  return new Date(value).toLocaleString();
}

export function ProjectPanel() {
  const toast = useToast();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [worldNameOverride, setWorldNameOverride] = useState('');
  const [lastAction, setLastAction] = useState<LastProjectAction | null>(null);

  const { worldId, setWorldId, setLocationId } = useWorldContextStore();
  const sourceFileName = useProjectSessionStore((state) => state.sourceFileName);
  const schemaVersion = useProjectSessionStore((state) => state.schemaVersion);
  const dirty = useProjectSessionStore((state) => state.dirty);
  const lastImportedAt = useProjectSessionStore((state) => state.lastImportedAt);
  const lastExportedAt = useProjectSessionStore((state) => state.lastExportedAt);
  const lastOperation = useProjectSessionStore((state) => state.lastOperation);
  const sessionCoreWarnings = useProjectSessionStore((state) => state.coreWarnings);
  const sessionExtensionWarnings = useProjectSessionStore((state) => state.extensionWarnings);
  const recordImport = useProjectSessionStore((state) => state.recordImport);
  const recordExport = useProjectSessionStore((state) => state.recordExport);
  const registeredExtensions = useMemo(
    () => projectBundleExtensionRegistry.list().map((handler) => handler.key),
    [],
  );

  const handleExport = async () => {
    if (!worldId) {
      toast.warning('Select a world before exporting a project');
      return;
    }

    setBusy(true);
    try {
      const { bundle, extensionReport } = await exportWorldProjectWithExtensions(worldId);
      const filenameBase = String(bundle.core.world.name || `world_${worldId}`)
        .replace(/[^a-z0-9]/gi, '_')
        .toLowerCase();
      const filename = `${filenameBase}_project_${Date.now()}.json`;

      downloadJson(filename, bundle);

      setLastAction({
        kind: 'export',
        worldName: bundle.core.world.name,
        counts: {
          locations: bundle.core.locations.length,
          npcs: bundle.core.npcs.length,
          scenes: bundle.core.scenes.length,
          items: bundle.core.items.length,
        },
        extensionReport,
      });
      recordExport({
        sourceFileName: filename,
        schemaVersion: bundle.schema_version ?? null,
        extensionKeys: Object.keys(bundle.extensions || {}),
        extensionWarnings: extensionReport.warnings,
      });

      toast.success(`Project exported: ${filename}`);
    } catch (error) {
      toast.error(`Project export failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setBusy(false);
    }
  };

  const handleImportFile = async (file: File) => {
    setBusy(true);
    try {
      const text = await file.text();
      const bundle = JSON.parse(text) as GameProjectBundle;
      const { response, extensionReport } = await importWorldProjectWithExtensions(
        bundle,
        worldNameOverride.trim() ? { world_name_override: worldNameOverride.trim() } : undefined,
      );

      // Move authoring context to the imported world for immediate continuity.
      setWorldId(response.world_id);
      const firstLocationId = Object.values(response.id_maps.locations)[0];
      setLocationId(firstLocationId ?? null);

      setLastAction({
        kind: 'import',
        worldId: response.world_id,
        worldName: response.world_name,
        counts: response.counts,
        coreWarnings: response.warnings,
        extensionReport,
      });
      recordImport({
        sourceFileName: file.name,
        schemaVersion: bundle.schema_version ?? null,
        extensionKeys: Object.keys(bundle.extensions || {}),
        extensionWarnings: extensionReport.warnings,
        coreWarnings: response.warnings,
      });

      const warningCount = response.warnings.length + extensionReport.warnings.length;
      if (warningCount > 0) {
        toast.warning(`Project imported with ${warningCount} warning(s)`);
      } else {
        toast.success(`Project imported as "${response.world_name}"`);
      }
    } catch (error) {
      toast.error(`Project import failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setBusy(false);
    }
  };

  const onPickImportFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    void handleImportFile(file);
    // Allow selecting the same file again on subsequent imports.
    event.target.value = '';
  };

  return (
    <div className="h-full w-full flex flex-col bg-neutral-50 dark:bg-neutral-950">
      <PanelHeader
        title="Project"
        category="workspace"
        contextLabel={worldId ? `World #${worldId}` : 'No world selected'}
      />

      <div className="p-3 border-b border-neutral-200 dark:border-neutral-800">
        <WorldContextSelector />
      </div>

      <div className="p-3 space-y-3 border-b border-neutral-200 dark:border-neutral-800">
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-neutral-600 dark:text-neutral-300">Import world name override (optional)</span>
          <input
            value={worldNameOverride}
            onChange={(event) => setWorldNameOverride(event.target.value)}
            placeholder="Use bundle world name when empty"
            className="px-2 py-1 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900"
          />
        </label>

        <div className="flex gap-2">
          <Button size="sm" variant="secondary" onClick={handleExport} disabled={busy || !worldId}>
            Export Project
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => fileInputRef.current?.click()}
            disabled={busy}
          >
            Import Project
          </Button>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept=".json,application/json"
          onChange={onPickImportFile}
          className="hidden"
        />
      </div>

      <div className="p-3 border-b border-neutral-200 dark:border-neutral-800 text-xs">
        <div className="font-semibold mb-1">Registered Extensions</div>
        {registeredExtensions.length > 0 ? (
          <div className="text-neutral-600 dark:text-neutral-300">
            {registeredExtensions.join(', ')}
          </div>
        ) : (
          <div className="text-neutral-500 dark:text-neutral-400">None</div>
        )}
      </div>

      <div className="p-3 border-b border-neutral-200 dark:border-neutral-800 text-xs space-y-1">
        <div className="font-semibold mb-1">Project Session</div>
        <div>Status: {dirty ? 'Dirty' : 'Clean'}</div>
        <div>Last operation: {lastOperation ?? 'none'}</div>
        <div>Bundle schema: {schemaVersion ?? 'Unknown'}</div>
        <div>Source file: {sourceFileName || 'N/A'}</div>
        <div>Last import: {formatTimestamp(lastImportedAt)}</div>
        <div>Last export: {formatTimestamp(lastExportedAt)}</div>
        <div>
          Session warnings: core {sessionCoreWarnings.length}, extensions {sessionExtensionWarnings.length}
        </div>
      </div>

      <div className="p-3 text-xs overflow-y-auto">
        <div className="font-semibold mb-2">Last Operation</div>
        {!lastAction && <div className="text-neutral-500 dark:text-neutral-400">No project operation yet.</div>}

        {lastAction?.kind === 'export' && (
          <div className="space-y-1">
            <div>Exported world: <b>{lastAction.worldName}</b></div>
            <div>
              Core counts: locations {lastAction.counts.locations}, npcs {lastAction.counts.npcs}, scenes {lastAction.counts.scenes}, items {lastAction.counts.items}
            </div>
            <div>
              Extensions: included {lastAction.extensionReport.included.length}, skipped {lastAction.extensionReport.skipped.length}, warnings {lastAction.extensionReport.warnings.length}
            </div>
          </div>
        )}

        {lastAction?.kind === 'import' && (
          <div className="space-y-1">
            <div>
              Imported world: <b>{lastAction.worldName}</b> (#{lastAction.worldId})
            </div>
            <div>
              Core counts: locations {lastAction.counts.locations}, hotspots {lastAction.counts.hotspots}, npcs {lastAction.counts.npcs}, scenes {lastAction.counts.scenes}, nodes {lastAction.counts.nodes}, edges {lastAction.counts.edges}, items {lastAction.counts.items}
            </div>
            <div>
              Extensions: applied {lastAction.extensionReport.applied.length}, skipped {lastAction.extensionReport.skipped.length}, unknown {lastAction.extensionReport.unknown.length}, warnings {lastAction.extensionReport.warnings.length}
            </div>
            {(lastAction.coreWarnings.length > 0 || lastAction.extensionReport.warnings.length > 0) && (
              <div className="pt-2">
                <div className="font-semibold mb-1">Warnings</div>
                <ul className="list-disc ml-4 space-y-1 text-neutral-600 dark:text-neutral-300">
                  {lastAction.coreWarnings.map((warning, index) => (
                    <li key={`core-${index}`}>{warning}</li>
                  ))}
                  {lastAction.extensionReport.warnings.map((warning, index) => (
                    <li key={`ext-${index}`}>{warning}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
