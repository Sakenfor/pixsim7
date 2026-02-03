import { useState, useMemo } from 'react';

import { useLocalAssetPreview } from '../hooks/useLocalAssetPreview';
import type { LocalAsset } from '../stores/localFoldersStore';

type TreeNode = {
  name: string;
  path: string;
  type: 'folder' | 'file';
  children?: TreeNode[];
  asset?: LocalAsset;
  count?: number; // file count for folders
};

// Build tree grouped by folder ID first
function buildTree(
  assets: LocalAsset[],
  folderNames: Record<string, string>,
  folderOrder?: string[]
): TreeNode {
  const root: TreeNode = { name: 'root', path: '', type: 'folder', children: [] };

  // Group assets by folderId
  const assetsByFolder = assets.reduce((acc, asset) => {
    if (!acc[asset.folderId]) acc[asset.folderId] = [];
    acc[asset.folderId].push(asset);
    return acc;
  }, {} as Record<string, LocalAsset[]>);

  // Helper to sort: folders first, then alphabetically by name
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

  // Determine folder root order: prefer explicit folderOrder from store, fall back to map keys
  const folderIds = folderOrder && folderOrder.length
    ? folderOrder
    : Object.keys(assetsByFolder);

  // Create folder root nodes
  for (const folderId of folderIds) {
    const folderAssets = assetsByFolder[folderId];
    if (!folderAssets) continue;

    const folderRoot: TreeNode = {
      name: folderNames[folderId] || folderId,
      path: folderId,
      type: 'folder',
      children: [],
      count: 0
    };

    // Build tree structure within this folder
    for (const asset of folderAssets) {
      const parts = asset.relativePath.split('/');
      let current = folderRoot;

      // Navigate/create folder nodes
      for (let i = 0; i < parts.length - 1; i++) {
        const folderName = parts[i];
        const folderPath = `${folderId}/${parts.slice(0, i + 1).join('/')}`;

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

    // Sort within this folder subtree (folders first, then alphabetically)
    sortNodes(folderRoot.children);
    root.children?.push(folderRoot);
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

  return root;
}

type TreeNodeViewProps = {
  node: TreeNode;
  level: number;
  onFileClick?: (asset: LocalAsset, previewUrl?: string) => void;
  onPreview?: (asset: LocalAsset) => void;
  previews: Record<string, string>;
  uploadStatus: Record<string, 'idle' | 'uploading' | 'success' | 'error'>;
  onUpload?: (asset: LocalAsset) => void;
  providerId?: string;
  compactMode?: boolean;
  selectedFolderPath?: string;
  onFolderSelect?: (path: string) => void;
};

function TreeNodeView({
  node,
  level,
  onFileClick,
  onPreview,
  previews,
  uploadStatus,
  onUpload,
  providerId,
  compactMode,
  selectedFolderPath,
  onFolderSelect
}: TreeNodeViewProps) {
  const [expanded, setExpanded] = useState(false); // Start collapsed
  const resolvedPreview = useLocalAssetPreview(node.asset, previews);

  if (node.type === 'folder') {
    const hasChildren = node.children && node.children.length > 0;
    const isSelected = compactMode && selectedFolderPath === node.path;

    const handleClick = () => {
      if (compactMode && onFolderSelect) {
        onFolderSelect(node.path);
      }
      setExpanded(!expanded);
    };

    return (
      <div className="select-none">
        <div
          className={`flex items-center gap-2 py-1 px-2 rounded cursor-pointer transition-colors ${
            isSelected
              ? 'bg-blue-100 dark:bg-blue-900/30 border-l-2 border-blue-500'
              : 'hover:bg-neutral-100 dark:hover:bg-neutral-800'
          }`}
          style={{ paddingLeft: `${level * 12 + 8}px` }}
          onClick={handleClick}
        >
          <span className="text-neutral-500 w-4 text-center">
            {hasChildren ? (expanded ? '▼' : '▶') : ''}
          </span>
          <span className={compactMode ? 'text-base' : 'text-lg'}>📁</span>
          <span className={`font-medium ${compactMode ? 'text-xs' : 'text-sm'} truncate`}>
            {node.name}
          </span>
          <span className="text-xs text-neutral-500 ml-auto flex-shrink-0">
            {node.count}
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
                compactMode={compactMode}
                selectedFolderPath={selectedFolderPath}
                onFolderSelect={onFolderSelect}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  // File node - don't render in compact mode (files shown in thumbnail grid instead)
  if (compactMode) {
    return null;
  }

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
        onClick={() => onFileClick?.(asset, resolvedPreview)}
      >
        {resolvedPreview ? (
          asset.kind === 'image' ? (
            <img src={resolvedPreview} className="w-full h-full object-cover" alt={asset.name} />
          ) : asset.kind === 'video' ? (
            <video src={resolvedPreview} className="w-full h-full object-cover" muted />
          ) : null
        ) : (
          <div className="text-xs">
            {asset.kind === 'image' ? '🖼️' : asset.kind === 'video' ? '🎬' : '📄'}
          </div>
        )}
      </div>

      {/* File info */}
      <div className="flex-1 min-w-0 cursor-pointer" onClick={() => onFileClick?.(asset, resolvedPreview)}>
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
  folderNames: Record<string, string>; // folderId -> folder name
  onFileClick?: (asset: LocalAsset, previewUrl?: string) => void;
  onPreview?: (asset: LocalAsset) => void;
  previews: Record<string, string>;
  uploadStatus: Record<string, 'idle' | 'uploading' | 'success' | 'error'>;
  onUpload?: (asset: LocalAsset) => void;
  providerId?: string;
  // New props for folder selection mode
  compactMode?: boolean; // If true, show compact tree without file previews
  selectedFolderPath?: string; // Currently selected folder path
  onFolderSelect?: (path: string) => void; // Callback when folder is clicked
  // Optional explicit folder order (folderId list) to keep roots aligned with LocalFolders store
  folderOrder?: string[];
};

export function TreeFolderView({
  assets,
  folderNames,
  onFileClick,
  onPreview,
  previews,
  uploadStatus,
  onUpload,
  providerId,
  compactMode,
  selectedFolderPath,
  onFolderSelect,
  folderOrder
}: TreeFolderViewProps) {
  const tree = useMemo(
    () => buildTree(assets, folderNames, folderOrder),
    [assets, folderNames, folderOrder]
  );

  if (!tree.children || tree.children.length === 0) {
    return (
      <div className="text-center py-12 text-neutral-500">
        <p>No files found in this folder</p>
      </div>
    );
  }

  return (
    <div className={`border rounded-lg bg-white dark:bg-neutral-900 overflow-hidden ${compactMode ? '' : ''}`}>
      <div className={`${compactMode ? 'max-h-full' : 'max-h-[70vh]'} overflow-y-auto`}>
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
            compactMode={compactMode}
            selectedFolderPath={selectedFolderPath}
            onFolderSelect={onFolderSelect}
          />
        ))}
      </div>
    </div>
  );
}
