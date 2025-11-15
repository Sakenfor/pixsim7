import { useState, useMemo } from 'react';
import type { LocalAsset } from '../../stores/localFoldersStore';

type TreeNode = {
  name: string;
  path: string;
  type: 'folder' | 'file';
  children?: TreeNode[];
  asset?: LocalAsset;
  count?: number; // file count for folders
};

function buildTree(assets: LocalAsset[], folderId?: string): TreeNode {
  const root: TreeNode = { name: 'root', path: '', type: 'folder', children: [] };

  // Filter assets by folder if specified
  const filteredAssets = folderId
    ? assets.filter(a => a.folderId === folderId)
    : assets;

  for (const asset of filteredAssets) {
    const parts = asset.relativePath.split('/');
    let current = root;

    // Navigate/create folder nodes
    for (let i = 0; i < parts.length - 1; i++) {
      const folderName = parts[i];
      const folderPath = parts.slice(0, i + 1).join('/');

      let folder = current.children?.find(
        n => n.name === folderName && n.type === 'folder'
      );

      if (!folder) {
        folder = {
          name: folderName,
          path: folderPath,
          type: 'folder',
          children: [],
          count: 0
        };
        current.children?.push(folder);
      }

      current = folder;
    }

    // Add file node
    const fileName = parts[parts.length - 1];
    current.children?.push({
      name: fileName,
      path: asset.relativePath,
      type: 'file',
      asset
    });
  }

  // Calculate file counts for folders recursively
  function countFiles(node: TreeNode): number {
    if (node.type === 'file') return 1;

    let count = 0;
    if (node.children) {
      for (const child of node.children) {
        count += countFiles(child);
      }
    }
    node.count = count;
    return count;
  }

  countFiles(root);

  // Sort: folders first, then alphabetically
  function sortNodes(nodes?: TreeNode[]): void {
    if (!nodes) return;
    nodes.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    for (const node of nodes) {
      if (node.children) sortNodes(node.children);
    }
  }

  sortNodes(root.children);

  return root;
}

type TreeNodeViewProps = {
  node: TreeNode;
  level: number;
  onFileClick?: (asset: LocalAsset) => void;
  onPreview?: (asset: LocalAsset) => void;
  previews: Record<string, string>;
  uploadStatus: Record<string, 'idle' | 'uploading' | 'success' | 'error'>;
  onUpload?: (asset: LocalAsset) => void;
  providerId?: string;
};

function TreeNodeView({
  node,
  level,
  onFileClick,
  onPreview,
  previews,
  uploadStatus,
  onUpload,
  providerId
}: TreeNodeViewProps) {
  const [expanded, setExpanded] = useState(level < 2); // Auto-expand first 2 levels

  if (node.type === 'folder') {
    const hasChildren = node.children && node.children.length > 0;

    return (
      <div className="select-none">
        <div
          className="flex items-center gap-2 py-1 px-2 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded cursor-pointer"
          style={{ paddingLeft: `${level * 12 + 8}px` }}
          onClick={() => setExpanded(!expanded)}
        >
          <span className="text-neutral-500 w-4 text-center">
            {hasChildren ? (expanded ? '▼' : '▶') : ''}
          </span>
          <span className="text-lg">📁</span>
          <span className="font-medium text-sm">{node.name}</span>
          <span className="text-xs text-neutral-500 ml-auto">
            {node.count} {node.count === 1 ? 'file' : 'files'}
          </span>
        </div>

        {expanded && hasChildren && (
          <div>
            {node.children?.map((child, idx) => (
              <TreeNodeView
                key={child.path || idx}
                node={child}
                level={level + 1}
                onFileClick={onFileClick}
                onPreview={onPreview}
                previews={previews}
                uploadStatus={uploadStatus}
                onUpload={onUpload}
                providerId={providerId}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  // File node
  const asset = node.asset!;
  const status = uploadStatus[asset.key] || 'idle';
  const previewUrl = previews[asset.key];

  return (
    <div
      className="flex items-center gap-2 py-1 px-2 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded group"
      style={{ paddingLeft: `${level * 12 + 8}px` }}
    >
      <span className="w-4"></span>

      {/* Preview thumbnail or icon */}
      <div
        className="w-10 h-10 bg-neutral-200 dark:bg-neutral-700 rounded flex items-center justify-center overflow-hidden flex-shrink-0 cursor-pointer"
        onClick={() => onFileClick?.(asset)}
      >
        {previewUrl ? (
          asset.kind === 'image' ? (
            <img src={previewUrl} className="w-full h-full object-cover" alt={asset.name} />
          ) : asset.kind === 'video' ? (
            <video src={previewUrl} className="w-full h-full object-cover" muted />
          ) : null
        ) : (
          <div className="text-xs">
            {asset.kind === 'image' ? '🖼️' : asset.kind === 'video' ? '🎬' : '📄'}
          </div>
        )}
      </div>

      {/* File info */}
      <div className="flex-1 min-w-0 cursor-pointer" onClick={() => onFileClick?.(asset)}>
        <div className="text-sm truncate hover:text-blue-600 transition-colors" title={asset.name}>
          {asset.name}
        </div>
        <div className="text-xs text-neutral-500">
          {asset.kind}
          {asset.size ? ` • ${(asset.size / 1024 / 1024).toFixed(1)} MB` : ''}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        {!previewUrl && (
          <button
            onClick={() => onPreview?.(asset)}
            className="px-2 py-1 text-xs border rounded hover:bg-neutral-200 dark:hover:bg-neutral-700"
          >
            Preview
          </button>
        )}
        <button
          onClick={() => onUpload?.(asset)}
          disabled={!providerId || status === 'uploading'}
          className={`px-2 py-1 text-xs rounded ${
            status === 'success' ? 'bg-green-600 text-white' :
            status === 'error' ? 'bg-red-600 text-white' :
            status === 'uploading' ? 'bg-neutral-400 text-white' :
            'bg-blue-600 text-white hover:bg-blue-700'
          }`}
          title={
            status === 'success' ? 'Uploaded successfully' :
            status === 'error' ? 'Upload failed' :
            status === 'uploading' ? 'Uploading...' :
            'Upload to provider'
          }
        >
          {status === 'uploading' ? '...' : status === 'success' ? '✓' : status === 'error' ? '✗' : '↑'}
        </button>
      </div>
    </div>
  );
}

type TreeFolderViewProps = {
  assets: LocalAsset[];
  folderId?: string;
  onFileClick?: (asset: LocalAsset) => void;
  onPreview?: (asset: LocalAsset) => void;
  previews: Record<string, string>;
  uploadStatus: Record<string, 'idle' | 'uploading' | 'success' | 'error'>;
  onUpload?: (asset: LocalAsset) => void;
  providerId?: string;
};

export function TreeFolderView({
  assets,
  folderId,
  onFileClick,
  onPreview,
  previews,
  uploadStatus,
  onUpload,
  providerId
}: TreeFolderViewProps) {
  const tree = useMemo(() => buildTree(assets, folderId), [assets, folderId]);

  if (!tree.children || tree.children.length === 0) {
    return (
      <div className="text-center py-12 text-neutral-500">
        <p>No files found in this folder</p>
      </div>
    );
  }

  return (
    <div className="border rounded-lg bg-white dark:bg-neutral-900 overflow-hidden">
      <div className="max-h-[70vh] overflow-y-auto">
        {tree.children.map((child, idx) => (
          <TreeNodeView
            key={child.path || idx}
            node={child}
            level={0}
            onFileClick={onFileClick}
            onPreview={onPreview}
            previews={previews}
            uploadStatus={uploadStatus}
            onUpload={onUpload}
            providerId={providerId}
          />
        ))}
      </div>
    </div>
  );
}
