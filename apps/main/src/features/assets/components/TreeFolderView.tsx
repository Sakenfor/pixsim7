import { useEffect, useMemo, useState, type RefObject } from 'react';

import { Icons } from '@lib/icons';
import { useVideoActivationSlot } from '@lib/media/videoActivationPool';

import { useLocalAssetPreview } from '../hooks/useLocalAssetPreview';
import type { LocalAssetModel } from '../types/localFolderMeta';

type TreeNode = {
  name: string;
  path: string;
  type: 'folder' | 'file';
  children?: TreeNode[];
  asset?: LocalAssetModel;
  count?: number; // file count for folders
};

// Build tree grouped by folder ID first
function buildTree(
  assets: LocalAssetModel[],
  folderNames: Record<string, string>,
  folderOrder?: string[]
): TreeNode {
  const root: TreeNode = { name: 'root', path: '', type: 'folder', children: [] };

  // Group assets by folderId
  const assetsByFolder = assets.reduce((acc, asset) => {
    if (!acc[asset.folderId]) acc[asset.folderId] = [];
    acc[asset.folderId].push(asset);
    return acc;
  }, {} as Record<string, LocalAssetModel[]>);

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
  onFileClick?: (asset: LocalAssetModel, previewUrl?: string) => void;
  onPreview?: (asset: LocalAssetModel) => void;
  previews: Record<string, string>;
  uploadStatus: Record<string, 'idle' | 'uploading' | 'success' | 'error'>;
  onUpload?: (asset: LocalAssetModel) => void;
  providerId?: string;
  compactMode?: boolean;
  selectedFolderPath?: string;
  onFolderSelect?: (path: string) => void;
  onRemoveFolder?: (folderId: string) => void;
  onRefreshFolder?: (folderId: string) => void;
  onHashFolder?: (path: string) => void;
  favoriteFolders?: Set<string>;
  onToggleFavorite?: (path: string) => void;
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
  onFolderSelect,
  onRemoveFolder,
  onRefreshFolder,
  onHashFolder,
  favoriteFolders,
  onToggleFavorite,
}: TreeNodeViewProps) {
  const shouldAutoExpandForSelection = !!(
    compactMode &&
    selectedFolderPath &&
    (selectedFolderPath === node.path || selectedFolderPath.startsWith(node.path + '/'))
  );
  const [expanded, setExpanded] = useState(shouldAutoExpandForSelection);
  const resolvedPreview = useLocalAssetPreview(node.asset, previews);
  // Tree rows are tiny (40×40) but get rendered for every video asset
  // expanded into the tree.  Without slot gating, browsing a folder
  // with N video assets mounts N <video> decoders simultaneously.
  const isVideoRow = node.type === 'file' && node.asset?.kind === 'video' && !!resolvedPreview;
  const hasVideoSlot = useVideoActivationSlot(isVideoRow);

  useEffect(() => {
    if (shouldAutoExpandForSelection) {
      setExpanded(true);
    }
  }, [shouldAutoExpandForSelection]);

  if (node.type === 'folder') {
    const hasChildren = node.children && node.children.length > 0;
    const isSelected = compactMode && selectedFolderPath === node.path;
    const isRootFolder = level === 0;
    const isFavorite = favoriteFolders?.has(node.path) ?? false;

    const handleClick = () => {
      if (compactMode && onFolderSelect) {
        onFolderSelect(node.path);
      }
      setExpanded(!expanded);
    };

    return (
      <div className="select-none">
        <div
          className={`flex items-center gap-2 py-1 px-2 rounded cursor-pointer transition-colors group/folder ${
            isSelected
              ? 'bg-accent-subtle border-l-2 border-accent'
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
          <button
            onClick={(e) => { e.stopPropagation(); onHashFolder?.(node.path); }}
            className="p-0.5 rounded transition-colors flex-shrink-0 text-neutral-300 dark:text-neutral-600 opacity-0 group-hover/folder:opacity-100 hover:text-blue-500"
            title="Hash this folder"
          >
            <Icons.hash size={12} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onToggleFavorite?.(node.path); }}
            className={`p-0.5 rounded transition-colors flex-shrink-0 ${
              isFavorite
                ? 'text-amber-400 hover:text-amber-500'
                : 'text-neutral-300 dark:text-neutral-600 opacity-0 group-hover/folder:opacity-100 hover:text-amber-400'
            }`}
            title={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
          >
            <Icons.star size={12} className={isFavorite ? 'fill-current' : ''} />
          </button>
          {isRootFolder && (
            <span className="flex items-center gap-0.5 opacity-0 group-hover/folder:opacity-100 transition-opacity flex-shrink-0">
              <button
                onClick={(e) => { e.stopPropagation(); onRefreshFolder?.(node.path); }}
                className="p-0.5 rounded hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 transition-colors"
                title="Refresh folder"
              >
                <Icons.refreshCw size={12} />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onRemoveFolder?.(node.path); }}
                className="p-0.5 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-neutral-400 hover:text-red-500 transition-colors"
                title="Remove folder"
              >
                <Icons.x size={12} />
              </button>
            </span>
          )}
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
                onRemoveFolder={onRemoveFolder}
                onRefreshFolder={onRefreshFolder}
                onHashFolder={onHashFolder}
                favoriteFolders={favoriteFolders}
                onToggleFavorite={onToggleFavorite}
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
            hasVideoSlot ? (
              <video src={resolvedPreview} className="w-full h-full object-cover" muted />
            ) : (
              <div className="text-xs">{'\u{1F3AC}'}</div>
            )
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
          disabled={status === 'uploading'}
          className={`px-2 py-1 text-xs rounded ${
            status === 'success' ? 'bg-green-600 text-white' :
            status === 'error' ? 'bg-red-600 text-white' :
            status === 'uploading' ? 'bg-neutral-400 text-white' :
            'bg-accent text-accent-text hover:bg-accent-hover'
          }`}
          title={
            status === 'success' ? 'Uploaded successfully' :
            status === 'error' ? 'Upload failed' :
            status === 'uploading' ? 'Uploading...' :
            (providerId ? 'Upload to provider' : 'Add to library')
          }
        >
          {status === 'uploading' ? '...' : status === 'success' ? '✓' : status === 'error' ? '✗' : '↑'}
        </button>
      </div>
    </div>
  );
}

type TreeFolderViewProps = {
  assets: LocalAssetModel[];
  folderNames: Record<string, string>; // folderId -> folder name
  onFileClick?: (asset: LocalAssetModel, previewUrl?: string) => void;
  onPreview?: (asset: LocalAssetModel) => void;
  previews: Record<string, string>;
  uploadStatus: Record<string, 'idle' | 'uploading' | 'success' | 'error'>;
  onUpload?: (asset: LocalAssetModel) => void;
  providerId?: string;
  // New props for folder selection mode
  compactMode?: boolean; // If true, show compact tree without file previews
  selectedFolderPath?: string; // Currently selected folder path
  onFolderSelect?: (path: string) => void; // Callback when folder is clicked
  // Optional explicit folder order (folderId list) to keep roots aligned with LocalFolders store
  folderOrder?: string[];
  onRemoveFolder?: (folderId: string) => void;
  onRefreshFolder?: (folderId: string) => void;
  onHashFolder?: (path: string) => void;
  favoriteFolders?: Set<string>;
  onToggleFavorite?: (path: string) => void;
  scrollContainerRef?: RefObject<HTMLDivElement | null>;
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
  folderOrder,
  onRemoveFolder,
  onRefreshFolder,
  onHashFolder,
  favoriteFolders,
  onToggleFavorite,
  scrollContainerRef,
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
      <div
        ref={scrollContainerRef}
        className={`${compactMode ? 'max-h-full' : 'max-h-[70vh]'} overflow-y-auto`}
      >
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
            onRemoveFolder={onRemoveFolder}
            onRefreshFolder={onRefreshFolder}
            onHashFolder={onHashFolder}
            favoriteFolders={favoriteFolders}
            onToggleFavorite={onToggleFavorite}
          />
        ))}
      </div>
    </div>
  );
}
