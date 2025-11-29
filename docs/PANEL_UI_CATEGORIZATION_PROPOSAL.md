# Panel UI Categorization Proposal

**Date:** 2025-11-29
**Status:** 💡 PROPOSAL
**Related:** Task 102 Panel Organization Hybrid Migration

## Problem

After completing the file organization migration (Task 102), there's a mismatch between how panels are organized in **files** vs how they're grouped in the **UI**:

| Aspect | File Organization | UI Categories |
|--------|------------------|---------------|
| Dev tools | `components/panels/dev/` | `category: 'development'` + nested dev tool categories |
| Shared infrastructure | `components/panels/shared/` | Not represented |
| Utilities | `components/panels/tools/` | `category: 'tools'` |
| Scene panels | `components/scene/panels/` | `category: 'core'` (mixed with other core) |
| Game panels | `components/game/panels/` | `category: 'game'` (only 2 panels use it) |

## Proposed Solution

### Option A: Enhanced Category System (Recommended)

Align panel categories with the file organization while preserving backward compatibility:

```typescript
// New panel categories
type PanelCategory =
  // Core workspace
  | 'workspace'      // Gallery, Graph, Inspector

  // Domain-specific
  | 'scene'          // Scene Builder, Scene Management, Scene Library, etc.
  | 'game'           // Game Theming, Game iframe, etc.
  | 'gallery'        // Gallery tools

  // Development & tools
  | 'dev'            // Dev Tools panel (launcher)
  | 'tools'          // Gizmo Lab, NPC Brain Lab, HUD Designer
  | 'utilities'      // Export/Import, Validation, Settings

  // System
  | 'system';        // Health, Provider Settings
```

**Panel grouping in Add Panel menu:**
```
Workspace
├── Gallery 🖼️
├── Graph 🔀
└── Inspector 🔍

Scene
├── Scene Builder 🎬
├── Scene Management 📚
└── Scene Library 📖

Game
├── Game Preview 🎮
└── Game Theming 🎨

Development
├── Dev Tools 🧰
└── Health ❤️

Tools
├── Gizmo Lab 🧪
├── NPC Brain Lab 🧠
└── HUD Designer 🎨

System
├── Settings ⚙️
└── Provider Settings 🔌
```

### Option B: Hybrid with Subcategories

Keep current categories but add subcategories:

```typescript
interface PanelDefinition {
  category: 'core' | 'scene' | 'game' | 'development' | 'tools';
  subcategory?: string;
  // ...
}
```

This allows grouping like:
- `core` / `workspace` - Gallery, Graph, Inspector
- `core` / `scene` - Scene panels
- `core` / `game` - Game panels

---

## Implementation Steps

### 1. Update Panel Definitions

**File:** `apps/main/src/lib/panels/corePanelsPlugin.tsx`

Add new categories to panel definitions:

```typescript
// Example: Scene Builder
{
  id: 'scene',
  title: 'Scene Builder',
  component: SceneBuilderPanel,
  category: 'scene',  // Changed from 'core'
  tags: ['scene', 'builder', 'editor'],
  // ...
}

// Example: Gallery
{
  id: 'gallery',
  title: 'Gallery',
  component: AssetsRoute,
  category: 'workspace',  // Changed from 'core'
  tags: ['assets', 'media', 'images'],
  // ...
}
```

### 2. Update Panel Registry Types

**File:** `apps/main/src/lib/panels/panelPlugin.ts`

```typescript
export type PanelCategory =
  | 'workspace'
  | 'scene'
  | 'game'
  | 'gallery'
  | 'dev'
  | 'tools'
  | 'utilities'
  | 'system';

export interface PanelDefinition {
  id: string;
  title: string;
  category: PanelCategory;
  subcategory?: string;
  // ...
}
```

### 3. Update Add Panel Dropdown

**File:** `apps/main/src/components/layout/workspace-toolbar/AddPanelDropdown.tsx`

Group panels by category with section headers:

```typescript
const CATEGORY_LABELS: Record<PanelCategory, string> = {
  workspace: 'Workspace',
  scene: 'Scene',
  game: 'Game',
  gallery: 'Gallery',
  dev: 'Development',
  tools: 'Tools',
  utilities: 'Utilities',
  system: 'System',
};

const CATEGORY_ORDER: PanelCategory[] = [
  'workspace',
  'scene',
  'game',
  'gallery',
  'dev',
  'tools',
  'utilities',
  'system',
];

// In component:
{CATEGORY_ORDER.map(category => {
  const panelsInCategory = panels.filter(p => p.category === category);
  if (panelsInCategory.length === 0) return null;

  return (
    <div key={category}>
      <div className="category-header">{CATEGORY_LABELS[category]}</div>
      {panelsInCategory.map(panel => (
        <PanelButton panel={panel} />
      ))}
    </div>
  );
})}
```

### 4. Keep Dev Tools Separate

The Dev Tools panel has its own categorization system for **developer tools** (not workspace panels). This should remain separate:

```typescript
// Dev Tools categories (in devToolRegistry)
type DevToolCategory =
  | 'session'
  | 'generation'
  | 'plugins'
  | 'graph'
  | 'debug'
  | 'world'
  | 'prompts'
  | 'misc';
```

---

## Benefits

✅ **Consistency** - UI categories match file organization
✅ **Discoverability** - Clearer grouping helps users find panels
✅ **Scalability** - Easy to add new domain categories (e.g., `'animation'`, `'audio'`)
✅ **Backward Compatible** - Existing panel IDs unchanged
✅ **Better UX** - Grouped Add Panel menu is easier to navigate

---

## Migration Checklist

- [ ] Update `PanelCategory` type in `panelPlugin.ts`
- [ ] Update all panel definitions in `corePanelsPlugin.tsx`
- [ ] Update `AddPanelDropdown.tsx` to group by category
- [ ] Update workspace toolbar panel launcher if needed
- [ ] Update Quick Panel Switcher to group by category
- [ ] Test all panel opening/closing functionality
- [ ] Update documentation

---

## Related Files

- `apps/main/src/lib/panels/panelPlugin.ts` - Panel types
- `apps/main/src/lib/panels/corePanelsPlugin.tsx` - Core panel definitions
- `apps/main/src/components/layout/workspace-toolbar/AddPanelDropdown.tsx` - Add panel UI
- `apps/main/src/components/workspace/QuickPanelSwitcher.tsx` - Quick switcher
- `apps/main/src/lib/devtools/types.ts` - Dev tool categories (separate system)

---

## Notes

- **Dev Tools vs Workspace Panels**: Keep these as separate systems
  - **Workspace panels** = Main app panels (Gallery, Scene, Graph, etc.)
  - **Dev tools** = Developer diagnostics (App Map, Session Viewer, etc.)
- **Core category**: Consider renaming to `'workspace'` to be more descriptive
- **Tools category**: Currently mixed - separate into `'tools'` (Gizmo Lab) and `'utilities'` (Settings)

---

**Author:** Claude (Task 102 follow-up)
**Status:** Proposal - Ready for implementation
