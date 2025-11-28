# Overlay Widget Data Binding

## How Widgets Get Their Data

All widgets support **reactive data binding** through function-based configuration values. This allows widgets to respond to changing data without manual wiring.

## Architecture

```
Component Props → overlayData → Widget Render Function → Display
      ↓                ↓                    ↓
  uploadProgress      {uploadProgress: 75}   (data) => data.uploadProgress
```

## The Pattern

### Static Values (Simple)
```typescript
createProgressWidget({
  id: 'progress',
  value: 50,  // ← Fixed value, never changes
})
```

### Reactive Values (Dynamic)
```typescript
createProgressWidget({
  id: 'progress',
  value: (data) => data.uploadProgress,  // ← Function! Gets fresh data on every render
})
```

## Complete Example: MediaCard Upload

### 1. Component receives reactive props
```typescript
<MediaCard
  id={123}
  uploadState="uploading"   // ← Changes: idle → uploading → success
  uploadProgress={75}        // ← Changes: 0 → 100
  onUploadClick={handleUpload}
/>
```

### 2. MediaCard passes data to overlay
```typescript
const overlayData = {
  id,
  uploadState: props.uploadState || 'idle',
  uploadProgress: props.uploadProgress || 0,
  // ... other data
};

<OverlayContainer configuration={config} data={overlayData}>
```

### 3. Widget factory uses function-based values
```typescript
createUploadWidget({
  id: 'upload-button',
  // ✨ REACTIVE: Function gets fresh data on every render
  state: (data) => data.uploadState,       // Gets: "uploading"
  progress: (data) => data.uploadProgress, // Gets: 75
  onUpload: () => handleUpload(id),
})
```

### 4. Widget renders with current data
```typescript
// Inside UploadWidget.tsx
render: (data: any) => {
  const state = typeof stateProp === 'function'
    ? stateProp(data)    // ← Calls function with fresh data
    : stateProp;         // ← Or uses static value

  // Now 'state' is always current!
  return <Button>{state === 'uploading' ? 'Uploading...' : 'Upload'}</Button>
}
```

## Supported Widget Configs

### ProgressWidget
```typescript
createProgressWidget({
  value: (data) => data.uploadProgress,  // 0-100
  state: (data) => data.uploadState,     // 'normal' | 'success' | 'error'
  label: (value, data) => `${value}% of ${data.totalSize}MB`,
})
```

### UploadWidget
```typescript
createUploadWidget({
  state: (data) => data.uploadState,      // 'idle' | 'uploading' | 'success' | 'error'
  progress: (data) => data.uploadProgress, // 0-100
})
```

### VideoScrubWidget
```typescript
createVideoScrubWidget({
  videoUrl: (data) => data.remoteUrl,     // Dynamic URL
  duration: (data) => data.durationSec,   // Dynamic duration
})
```

### TooltipWidget
```typescript
createTooltipWidget({
  content: (data) => ({
    title: 'Tags',
    description: data.tags,  // Dynamic tags list
  }),
})
```

### MenuWidget
```typescript
createMenuWidget({
  items: (data) => [
    // Dynamic menu items based on state
    { id: 'action1', label: 'Action', onClick: () => data.actions.doSomething() },
  ],
})
```

## Custom Widgets with Reactive Data

You can also create completely custom widgets with reactive data:

```typescript
<MediaCard
  {...props}
  customWidgets={[
    {
      id: 'custom-progress',
      type: 'custom',
      position: { anchor: 'bottom-center', offset: { x: 0, y: -8 } },
      visibility: { trigger: 'always' },
      render: (data) => {
        // 'data' contains all the overlay data from MediaCard
        const progress = data.uploadProgress || 0;
        const state = data.uploadState || 'idle';

        return (
          <div className="px-2 py-1 bg-black/80 text-white text-xs rounded">
            {state === 'uploading' ? `Uploading ${progress}%` : 'Ready'}
          </div>
        );
      }
    }
  ]}
/>
```

## Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│ Parent Component                                              │
│                                                               │
│  const [uploadProgress, setUploadProgress] = useState(0);    │
│  const [uploadState, setUploadState] = useState('idle');     │
│                                                               │
│  <MediaCard                                                   │
│    uploadProgress={uploadProgress}  ← Reactive prop           │
│    uploadState={uploadState}        ← Reactive prop           │
│  />                                                           │
└───────────────────────────────┬───────────────────────────────┘
                                │
                                ↓
┌─────────────────────────────────────────────────────────────┐
│ MediaCard Component                                           │
│                                                               │
│  const overlayData = {                                        │
│    uploadProgress: props.uploadProgress || 0,                 │
│    uploadState: props.uploadState || 'idle',                  │
│  };                                                           │
│                                                               │
│  <OverlayContainer data={overlayData} />                      │
└───────────────────────────────┬───────────────────────────────┘
                                │
                                ↓
┌─────────────────────────────────────────────────────────────┐
│ Widget Factory (mediaCardWidgets.ts)                         │
│                                                               │
│  createUploadWidget({                                         │
│    state: (data) => data.uploadState,     ← Function          │
│    progress: (data) => data.uploadProgress ← Function         │
│  })                                                           │
└───────────────────────────────┬───────────────────────────────┘
                                │
                                ↓
┌─────────────────────────────────────────────────────────────┐
│ OverlayWidget Renderer                                        │
│                                                               │
│  widgets.map(widget => {                                      │
│    const element = widget.render(overlayData);  ← Passes data │
│    return <div key={widget.id}>{element}</div>;               │
│  })                                                           │
└───────────────────────────────┬───────────────────────────────┘
                                │
                                ↓
┌─────────────────────────────────────────────────────────────┐
│ UploadWidget.tsx                                              │
│                                                               │
│  render: (data) => {                                          │
│    const state = typeof stateProp === 'function'              │
│      ? stateProp(data)         ← Calls function with data     │
│      : stateProp;                                             │
│                                                               │
│    return <Button state={state} />  ← Renders with current    │
│  }                                                            │
└─────────────────────────────────────────────────────────────┘
```

## Best Practices

### 1. Always use functions for reactive values
```typescript
// ❌ Bad - won't update
state: props.uploadState

// ✅ Good - updates on every render
state: (data) => data.uploadState
```

### 2. Pass all reactive data through overlayData
```typescript
// In MediaCard
const overlayData = {
  // Include ANY data that widgets might need
  uploadState: props.uploadState,
  uploadProgress: props.uploadProgress,
  customField: props.customField,
};
```

### 3. Keep widget factories pure
```typescript
// ✅ Good - factory just creates config
export function createUploadButton(props: MediaCardProps) {
  return createUploadWidget({
    state: (data) => data.uploadState,  // Function
    progress: (data) => data.uploadProgress,
  });
}

// ❌ Bad - capturing props directly
export function createUploadButton(props: MediaCardProps) {
  const { uploadState } = props;  // This won't update!
  return createUploadWidget({
    state: uploadState,  // Static value
  });
}
```

### 4. Type your overlay data
```typescript
interface MediaCardOverlayData {
  id: number;
  uploadState: 'idle' | 'uploading' | 'success' | 'error';
  uploadProgress: number;
  // ... other fields
}

// Then in widget render:
render: (data: MediaCardOverlayData) => {
  // Full TypeScript support!
  const progress = data.uploadProgress;
}
```

## Summary

- **Static values**: Use when data never changes
- **Function values**: Use when data updates reactively
- **overlayData**: Central data object passed to all widgets
- **Widget render**: Receives fresh data on every render

This pattern allows completely decoupled, reusable widgets that work anywhere!
