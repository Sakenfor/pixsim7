# String-Based Property Paths for Visual Configuration

## Problem

Previously, linking widgets to data required writing JavaScript functions:

```typescript
createProgressWidget({
  value: (data) => data.uploadProgress  // ❌ Requires coding
})
```

This made it impossible to configure widgets through a visual UI.

## Solution

Widgets now accept **three formats** for data binding:

### 1. Static Values (No Reactivity)
```typescript
createProgressWidget({
  value: 50  // Always shows 50%
})
```

### 2. Functions (For Developers)
```typescript
createProgressWidget({
  value: (data) => data.uploadProgress  // Custom logic
})
```

### 3. **Property Path Strings (For Visual Config) ✨ NEW**
```typescript
createProgressWidget({
  value: "uploadProgress"  // 🎯 Simple string!
})
```

## How It Works

The overlay system automatically converts string paths to functions:

```typescript
"uploadProgress"          →  (data) => data.uploadProgress
"user.profile.name"       →  (data) => data.user?.profile?.name
"items[0].title"          →  (data) => data.items?.[0]?.title
```

## Supported Widgets

All new widgets support string paths:

### ProgressWidget
```typescript
createProgressWidget({
  value: "uploadProgress",     // String path
  state: "uploadState",         // String path
})

// Equivalent to:
createProgressWidget({
  value: (data) => data.uploadProgress,
  state: (data) => data.uploadState,
})
```

### UploadWidget
```typescript
createUploadWidget({
  state: "uploadState",         // "idle" | "uploading" | etc.
  progress: "uploadProgress",   // 0-100
})
```

### VideoScrubWidget
```typescript
createVideoScrubWidget({
  videoUrl: "remoteUrl",        // Video URL from data
  duration: "durationSec",      // Duration in seconds
})
```

## Visual Configuration UI

This enables building visual configuration interfaces:

```typescript
// In OverlayConfigPage.tsx
function DataFieldSelector({ widget, onChange }) {
  const availableFields = extractPropertyPaths(sampleData);
  const suggestions = suggestPathsForWidget(widget.type, availableFields);

  return (
    <select onChange={e => onChange({ value: e.target.value })}>
      <option value="">Select data field...</option>
      {suggestions.map(path => (
        <option key={path} value={path}>
          {path} ({getPathType(sampleData, path)})
        </option>
      ))}
    </select>
  );
}
```

### Example UI Flow

1. User adds ProgressWidget to MediaCard
2. UI shows dropdown: "Data Field"
3. Options include:
   - `uploadProgress` (number)
   - `uploadState` (string)
   - `durationSec` (number)
4. User selects `uploadProgress`
5. Widget config saved as: `{ value: "uploadProgress" }`
6. System automatically converts to function at runtime

## Helper Functions

### extractPropertyPaths()
Get all available data fields:
```typescript
const data = {
  uploadProgress: 75,
  uploadState: 'uploading',
  user: { name: 'Alice' }
};

extractPropertyPaths(data);
// Returns: ['uploadProgress', 'uploadState', 'user', 'user.name']
```

### suggestPathsForWidget()
Get relevant fields for a widget type:
```typescript
const fields = extractPropertyPaths(mediaCardData);

suggestPathsForWidget('progress', fields);
// Returns: ['uploadProgress', 'downloadProgress', 'percentage']

suggestPathsForWidget('upload', fields);
// Returns: ['uploadState', 'uploadProgress', 'status']
```

### getPathType()
Get the type of a field:
```typescript
getPathType(data, 'uploadProgress');  // "number"
getPathType(data, 'uploadState');     // "string"
getPathType(data, 'user');            // "object"
```

## Complete Example: Visual Config

```typescript
// 1. User opens /settings/overlays
// 2. Selects MediaCard
// 3. Clicks "Add Widget" → ProgressWidget

// 4. UI shows form:
{
  "Widget Type": "ProgressWidget",
  "Position": "bottom-center",
  "Data Field": [
    "uploadProgress" ← User selects this
    "downloadProgress"
    "percentage"
  ],
  "Show Label": true
}

// 5. System saves config:
{
  id: 'upload-progress',
  type: 'progress',
  value: "uploadProgress",  // String path!
  position: { anchor: 'bottom-center' }
}

// 6. At runtime, system converts to:
{
  id: 'upload-progress',
  type: 'progress',
  value: (data) => data.uploadProgress,  // Function
  position: { anchor: 'bottom-center' }
}
```

## Advanced: Nested Paths

String paths support dot notation and array indexing:

```typescript
// Nested objects
value: "user.profile.settings.theme"
→ (data) => data.user?.profile?.settings?.theme

// Arrays
value: "items[0]"
→ (data) => data.items?.[0]

// Complex
value: "users[0].settings.theme"
→ (data) => data.users?.[0]?.settings?.theme
```

## Migration Guide

### Before (Function Only)
```typescript
<MediaCard
  {...props}
  customWidgets={[
    createProgressWidget({
      id: 'progress',
      position: { anchor: 'bottom-center' },
      value: (data) => data.uploadProgress,  // Had to write function
    })
  ]}
/>
```

### After (String Path)
```typescript
<MediaCard
  {...props}
  customWidgets={[
    createProgressWidget({
      id: 'progress',
      position: { anchor: 'bottom-center' },
      value: "uploadProgress",  // Simple string!
    })
  ]}
/>
```

### Best Of Both Worlds
Use strings for simple paths, functions for complex logic:

```typescript
createProgressWidget({
  value: "uploadProgress",  // Simple - use string
  label: (value, data) => {  // Complex - use function
    return `${value}% of ${data.totalSize}MB`;
  }
})
```

## TypeScript Support

The system is fully typed:

```typescript
interface MediaCardData {
  uploadProgress: number;
  uploadState: 'idle' | 'uploading' | 'success' | 'error';
  remoteUrl: string;
}

// TypeScript validates these:
createProgressWidget({
  value: "uploadProgress",  // ✅ Valid path
  value: "invalidField",    // ❌ Type error (if typed)
})
```

## Summary

| Format | Use Case | Example |
|--------|----------|---------|
| **Static** | Fixed values | `value: 50` |
| **Function** | Custom logic | `value: (data) => data.progress * 2` |
| **String** | Visual config | `value: "uploadProgress"` |

String paths make it possible to build no-code widget configuration UIs while maintaining full backward compatibility with function-based configs!
