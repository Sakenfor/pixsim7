import { useEffect, useMemo, useState } from 'react';
import { useLocalFolders } from '../../stores/localFoldersStore';
import { useProviders } from '../../hooks/useProviders';

async function fileToObjectURL(fh: FileSystemFileHandle): Promise<string | undefined> {
  try { const f = await fh.getFile(); return URL.createObjectURL(f); } catch { return undefined; }
}

export function LocalFoldersPanel() {
  const { supported, folders, assets, loadPersisted, addFolder, removeFolder, refreshFolder, adding, error } = useLocalFolders();
  const { providers } = useProviders();
  const [providerId, setProviderId] = useState<string | undefined>(undefined);
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [uploadNotes, setUploadNotes] = useState<Record<string, string | undefined>>({});

  useEffect(() => { loadPersisted(); }, []);

  const assetList = useMemo(() => Object.values(assets).sort((a, b) => (b.lastModified ?? 0) - (a.lastModified ?? 0)), [assets]);

  async function preview(key: string) {
    if (previews[key]) return;
    const a = assets[key]; if (!a) return;
    const url = await fileToObjectURL(a.fileHandle);
    if (url) setPreviews(p => ({ ...p, [key]: url }));
  }

  const [uploadStatus, setUploadStatus] = useState<Record<string, 'idle' | 'uploading' | 'success' | 'error'>>({});

  async function uploadOne(key: string) {
    const a = assets[key]; if (!a) return;
    if (!providerId) { alert('Select a provider'); return; }
    setUploadStatus(s => ({ ...s, [key]: 'uploading' }));
    try {
      const file = await a.fileHandle.getFile();
      const form = new FormData();
      form.append('file', file, a.name);
      form.append('provider_id', providerId);
      const base = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8001';
      const res = await fetch(`${base.replace(/\/$/, '')}/api/v1/assets/upload`, { method: 'POST', body: form });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(txt || `${res.status} ${res.statusText}`);
      }
      const data = await res.json().catch(() => ({}));
      setUploadNotes(n => ({ ...n, [key]: data?.note }));
      setUploadStatus(s => ({ ...s, [key]: 'success' }));
    } catch (e: any) {
      setUploadStatus(s => ({ ...s, [key]: 'error' }));
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <button
          className="text-sm px-3 py-1 border rounded bg-neutral-100 dark:bg-neutral-800"
          onClick={addFolder}
          disabled={adding || !supported}
        >
          + Add Folder
        </button>
        {!supported && (
          <span className="text-xs text-red-600">Your browser does not support local folder access. Use Chrome/Edge.</span>
        )}
        {error && <span className="text-xs text-red-600">{error}</span>}
        <div className="ml-auto flex items-center gap-2 text-xs">
          <span>Upload to</span>
          <select className="px-2 py-1 border rounded" value={providerId || ''} onChange={(e) => setProviderId(e.target.value || undefined)}>
            <option value="">Select provider…</option>
            {providers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
      </div>

      {!!folders.length && (
        <div className="text-xs text-neutral-600 flex flex-wrap gap-2">
          {folders.map(f => (
            <div key={f.id} className="px-2 py-1 border rounded bg-neutral-50 dark:bg-neutral-800 flex items-center gap-2">
              <span className="font-mono">{f.name}</span>
              <button className="text-blue-600" onClick={() => refreshFolder(f.id)}>Refresh</button>
              <button className="text-red-600" onClick={() => removeFolder(f.id)}>Remove</button>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        {assetList.map(a => (
          <div key={a.key} className="border rounded overflow-hidden bg-white dark:bg-neutral-900 relative">
            <div className="aspect-video bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center">
              {a.kind === 'image' && previews[a.key] && (
                <img src={previews[a.key]} className="w-full h-full object-cover" />
              )}
              {a.kind === 'video' && previews[a.key] && (
                <video src={previews[a.key]} className="w-full h-full object-cover" muted autoPlay loop />
              )}
              {!previews[a.key] && (
                <button className="text-xs text-blue-600" onClick={() => preview(a.key)}>Preview</button>
              )}
            </div>
            {/* Clickable status badge overlay */}
            <div className="absolute top-1 right-1 flex flex-col gap-1">
              <button
                onClick={() => uploadOne(a.key)}
                disabled={!providerId || uploadStatus[a.key]==='uploading'}
                className={`px-2 py-1 text-[10px] rounded shadow ${
                  uploadStatus[a.key]==='success' ? 'bg-blue-600 text-white' :
                  uploadStatus[a.key]==='error' ? 'bg-red-600 text-white' :
                  uploadStatus[a.key]==='uploading' ? 'bg-neutral-400 text-white' : 'bg-neutral-700 text-white'
                }`}
                title={uploadStatus[a.key]==='success' ? (uploadNotes[a.key] || 'Uploaded (provider accepted)') : uploadStatus[a.key]==='error' ? 'Provider rejected / upload failed' : 'Upload to provider'}
              >
                {uploadStatus[a.key]==='uploading' ? 'UP...' : uploadStatus[a.key]==='success' ? 'UP ✓' : uploadStatus[a.key]==='error' ? 'ERR' : 'UPLOAD'}
              </button>
            </div>
            <div className="p-2 text-xs space-y-1">
              <div className="font-medium truncate" title={a.relativePath}>{a.name}</div>
              <div className="text-neutral-500">{a.kind} {a.size ? `• ${(a.size/1024/1024).toFixed(1)} MB` : ''}</div>
              <div className="flex items-center gap-2 pt-1">
                <button className="px-2 py-1 border rounded" onClick={() => preview(a.key)}>Preview</button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
