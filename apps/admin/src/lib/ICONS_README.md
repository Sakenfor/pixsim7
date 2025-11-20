# Icon System

Centralized icon management for Pixsim7 to prevent encoding issues and ensure consistency.

## Why This Exists

**Problem**: Raw Unicode characters (emoji) in source code cause issues:
- Encoding corruption when edited by different tools/editors
- Inconsistent rendering across platforms
- Hard to maintain and search
- Break when files are processed by certain build tools

**Solution**: Single source of truth using `lucide-react` icon components.

## Usage

### Basic Icon

```tsx
import { Icon } from '../lib/icons';

function MyComponent() {
  return <Icon name="video" size={20} className="text-blue-500" />;
}
```

### Theme-Aware Icon

```tsx
import { ThemedIcon } from '../lib/icons';

function MyComponent() {
  return (
    <ThemedIcon
      name="success"
      variant="success"  // Automatically themed
      size={24}
    />
  );
}
```

### Available Icons

See `/frontend/src/lib/icons.tsx` for the complete list. Common icons:

**Media**:
- `image`, `video`, `camera`

**Cube Faces** (directional):
- `cubeFront`, `cubeBack`, `cubeLeft`, `cubeRight`, `cubeTop`, `cubeBottom`

**Actions**:
- `pin`, `check`, `close`, `add`, `remove`, `delete`, `edit`, `save`

**Status**:
- `success`, `error`, `warning`, `info`, `loading`

**UI**:
- `settings`, `search`, `folder`, `eye`, `refresh`

## Adding New Icons

1. Import the lucide-react component in `/frontend/src/lib/icons.tsx`:
   ```tsx
   import { NewIcon } from 'lucide-react';
   ```

2. Add to the `Icons` object with a semantic name:
   ```tsx
   export const Icons = {
     // ...
     myNewIcon: NewIcon,
   } as const;
   ```

3. Use it:
   ```tsx
   <Icon name="myNewIcon" size={20} />
   ```

## Standardized Sizes

```tsx
import { IconSizes } from '../lib/icons';

<Icon name="video" size={IconSizes.md} />  // 20px
```

Available sizes: `xs` (12), `sm` (16), `md` (20), `lg` (24), `xl` (32), `2xl` (48)

## Migration Guide

### Before (❌ Encoding issues)
```tsx
<div className="text-2xl">
  {face === 'front' && '🖼️'}    {/* Will corrupt */}
  {face === 'back' && '🎨'}     {/* Will corrupt */}
</div>
```

### After (✅ Safe)
```tsx
import { Icon } from '../lib/icons';

<Icon name="cubeFront" size={24} className="text-white/60" />
<Icon name="cubeBack" size={24} className="text-white/60" />
```

## Theme Variants

The `ThemedIcon` component provides automatic theming:

```tsx
<ThemedIcon name="warning" variant="warning" />
  // Light mode: yellow-500
  // Dark mode: yellow-400

<ThemedIcon name="success" variant="success" />
  // Light mode: green-500
  // Dark mode: green-400
```

## Benefits

✅ **No encoding corruption** - Icon components are safe for all editors
✅ **Consistent** - Single source of truth for all icons
✅ **Theme-aware** - Automatic light/dark mode support
✅ **Searchable** - Find all icon usage with `grep "Icon name="`
✅ **Type-safe** - TypeScript ensures valid icon names
✅ **Maintainable** - Update one place, changes everywhere
✅ **Codex-safe** - AI assistants won't corrupt icon components
