# Generation Status Integration Guide

This guide explains how to integrate generation status tracking into media galleries.

## Overview

Task 131 adds generation status surfacing to MediaCard and provides a dedicated GenerationsPanel for tracking jobs.

## Phase 1: Gallery Badges

### MediaCard Generation Status via Overlay System

Generation status is integrated using MediaCard's overlay system. The status badge is **opt-in** - you add it via the `customWidgets` prop when needed.

### Quick Start with Hook

The easiest way is using the `useMediaCardGenerationStatus` hook:

```tsx
import { useMediaCardGenerationStatus } from '@/hooks/useMediaCardGenerationStatus';

function MyGallery({ assets }) {
  return (
    <>
      {assets.map(asset => {
        const { generationStatusProps, generationWidget } = useMediaCardGenerationStatus(asset.id);

        return (
          <MediaCard
            {...assetProps(asset)}
            {...generationStatusProps}
            customWidgets={generationWidget ? [generationWidget] : []}
          />
        );
      })}
    </>
  );
}
```

### Batch Performance Optimization

For galleries with many cards, use the batch hook:

```tsx
import { useMediaCardGenerationStatusBatch } from '@/hooks/useMediaCardGenerationStatus';

function MyGallery({ assets }) {
  const statusMap = useMediaCardGenerationStatusBatch(assets.map(a => a.id));

  return (
    <>
      {assets.map(asset => {
        const status = statusMap.get(asset.id);

        return (
          <MediaCard
            {...assetProps(asset)}
            {...status?.generationStatusProps}
            customWidgets={status?.generationWidget ? [status.generationWidget] : []}
          />
        );
      })}
    </>
  );
}
```

### Manual Widget Creation

You can also create the widget manually:

```tsx
import { createGenerationStatusWidget } from '@/components/media/mediaCardWidgets';

const widget = createGenerationStatusWidget({
  generationStatus: 'processing',
  generationError: 'Error message',
  badgeConfig: { showFooterProvider: true },
});

<MediaCard
  generationStatus="processing"
  generationId={123}
  customWidgets={[widget]}
/>
```

### Status Badge Widget

The generation status badge displays:

- **Pending**: Yellow clock icon - "Waiting to start"
- **Queued**: Blue layers icon - "In queue"
- **Processing**: Blue spinning loader icon - "Generation in progress"
- **Completed**: Green checkmark icon - "Generation complete"
- **Failed**: Red alert icon - Shows error message in tooltip
- **Cancelled**: Gray X icon - "Generation cancelled"

The badge appears in the top-right corner, below the provider badge.

### Helper Functions

The `generationAssetMapping` module provides utilities:

```tsx
import {
  mapAssetToGeneration,
  getAssetsWithActiveGenerations,
  getAssetsWithFailedGenerations,
  getGenerationStatusDisplay,
} from '@/lib/generation/generationAssetMapping';

// Map single asset
const status = mapAssetToGeneration(assetId, generations);

// Get all assets with active generations
const activeAssets = getAssetsWithActiveGenerations(generations);

// Get all assets with failed generations
const failedAssets = getAssetsWithFailedGenerations(generations);

// Get display info for status badge
const display = getGenerationStatusDisplay('processing');
// Returns: { label, icon, color, description }
```

## Phase 2: Generations Panel

### Usage

The GenerationsPanel component provides a dedicated view for tracking all generation jobs:

```tsx
import { GenerationsPanel } from '@/components/generation';

function MyApp() {
  return (
    <GenerationsPanel
      onOpenAsset={(assetId) => {
        // Navigate to asset or open in viewer
      }}
    />
  );
}
```

### Features

- **Status filtering**: All, Active, Failed, Completed
- **Provider filtering**: Filter by provider (Pixverse, etc.)
- **Search**: Search by prompt text
- **Actions**:
  - Retry failed generations
  - Cancel active generations
  - Open completed assets

### Layout

The panel shows:
- Generation status icon (with color coding)
- Prompt preview (truncated to 80 chars)
- Provider and operation type
- Time ago (e.g., "2h ago")
- Retry count (if any)
- Error message (for failed jobs)
- Action buttons (retry, cancel, open asset)

## Best Practices

1. **Performance**: Use the helper functions to batch-process generation status instead of calling per-asset
2. **Real-time updates**: The generationsStore is updated via WebSocket, so badges update automatically
3. **Terminal states**: Completed/failed/cancelled generations won't change status anymore
4. **Badge visibility**: The generation status badge shows for all non-completed states by default. Set `badgeConfig.showGenerationBadge` to control visibility.

## Example: AssetGallery with Filtering

```tsx
import { useState, useMemo } from 'react';
import { useGenerationsStore, generationsSelectors } from '@/stores/generationsStore';
import { useMediaCardGenerationStatusBatch } from '@/hooks/useMediaCardGenerationStatus';
import { getAssetsWithActiveGenerations, getAssetsWithFailedGenerations } from '@/lib/generation/generationAssetMapping';

function AssetGalleryWithGenerationStatus({ assets }) {
  const allGenerations = useGenerationsStore(generationsSelectors.all());
  const activeAssetIds = getAssetsWithActiveGenerations(allGenerations);
  const failedAssetIds = getAssetsWithFailedGenerations(allGenerations);

  const [statusFilter, setStatusFilter] = useState('all');

  // Filter assets by generation status
  const filteredAssets = useMemo(() => {
    if (statusFilter === 'active') {
      return assets.filter(a => activeAssetIds.has(a.id));
    }
    if (statusFilter === 'failed') {
      return assets.filter(a => failedAssetIds.has(a.id));
    }
    return assets;
  }, [assets, statusFilter, activeAssetIds, failedAssetIds]);

  // Get generation status for all visible assets
  const statusMap = useMediaCardGenerationStatusBatch(filteredAssets.map(a => a.id));

  return (
    <>
      <FilterDropdown value={statusFilter} onChange={setStatusFilter} />

      <div className="gallery">
        {filteredAssets.map(asset => {
          const genStatus = statusMap.get(asset.id);

          return (
            <MediaCard
              key={asset.id}
              {...assetProps(asset)}
              {...genStatus?.generationStatusProps}
              customWidgets={genStatus?.generationWidget ? [genStatus.generationWidget] : []}
            />
          );
        })}
      </div>
    </>
  );
}
```

## API Reference

### Hooks

#### `useMediaCardGenerationStatus(assetId: number)`

Returns generation status for a single asset, ready for MediaCard.

**Returns:**
```tsx
{
  generationStatusProps: { generationStatus?, generationId?, generationError? },
  generationWidget: OverlayWidget | null,
  isGenerating: boolean,
  hasFailed: boolean
}
```

#### `useMediaCardGenerationStatusBatch(assetIds: number[])`

Batch version for multiple assets (more efficient).

**Returns:** `Map<number, GenerationStatusResult>`

### MediaCard Props

- `generationStatus?: 'pending' | 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled'`
- `generationId?: number`
- `generationError?: string`
- `customWidgets?: OverlayWidget[]` - Include generation status widget here

### Widget Factories

#### `createGenerationStatusWidget(props: MediaCardProps)`

Creates the generation status badge widget. Pass to `customWidgets` prop.

### GenerationsPanel Props

- `onOpenAsset?: (assetId: number) => void` - Callback when user clicks to open an asset

### generationAssetMapping Functions

- `mapAssetToGeneration(assetId, generations)` - Get generation status for an asset
- `getAssetsWithActiveGenerations(generations)` - Get set of asset IDs with active generations
- `getAssetsWithFailedGenerations(generations)` - Get set of asset IDs with failed generations
- `getGenerationStatusDisplay(status)` - Get UI display config for a status
- `isGenerationStatusTerminal(status)` - Check if status is terminal (won't change)

## Next Steps

- Phase 1 ✅: Gallery badges implemented
- Phase 2 ✅: Generations panel implemented
- TODO: Integrate generation status into existing galleries (ReviewGallery, AssetBrowser, etc.)
- TODO: Add retry action to MediaCard context menu for failed generations
