# UI Consolidation - Quick Summary

## Key Files and Locations

### Duplicate Components to Address

#### 1. Toast Component (HIGHEST PRIORITY)
```
DUPLICATION:
  /home/user/pixsim7/packages/ui/src/Toast.tsx (64 lines)
  /home/user/pixsim7/frontend/src/components/common/Toast.tsx (94 lines)
  
ISSUE: Two completely different Toast implementations
  - packages/ui: Simple callback-based (id, message, type, duration, onClose)
  - frontend: Advanced, store-based (title, icon, cube-message type support)
  
STORE DEPENDENCY:
  /home/user/pixsim7/frontend/src/stores/toastStore.ts (67 lines)
  
USAGE: 21 files import from toastStore (useToast)
  None import from packages/ui Toast

RECOMMENDATION: 
  1. Enhance packages/ui/Toast with frontend features
  2. Migrate frontend to use enhanced packages/ui Toast
  3. Delete frontend/src/components/common/Toast.tsx & ToastContainer.tsx
```

#### 2. ExecutionList Component (MEDIUM PRIORITY)
```
DUPLICATION:
  /home/user/pixsim7/frontend/src/components/automation/ExecutionList.tsx (282 lines)
  /home/user/pixsim7/frontend/src/components/automation/ExecutionList_new.tsx (268 lines)

ISSUE: Nearly identical implementations
  - Original uses useRef for performance optimization
  - New version simplifies with cleaner logic
  
RECOMMENDATION:
  1. Ensure ExecutionList_new.tsx meets all requirements
  2. Replace original ExecutionList.tsx with _new version
  3. Delete ExecutionList_new.tsx (rename to ExecutionList.tsx)
```

### Unused Components in packages/ui

```
These are exported but never imported:
  - Dropdown.tsx (166 lines)
  - StatusBadge.tsx (27 lines)
  - Tabs.tsx (120 lines)
  - ThemeToggle.tsx (12 lines)
  - useToast.ts (hook - frontend has own)

Decision needed: Keep for future use or remove?
```

---

## File Structure Overview

### Core UI Package
```
/home/user/pixsim7/packages/ui/src/
  16 component files + 2 hooks
  ~1,400 lines total
```

### Game UI Package  
```
/home/user/pixsim7/packages/game-ui/src/
  4 files (ScenePlayer, MiniGameHost, ReflexMiniGame, registry)
  Minimal - could be expanded
```

### Main Frontend
```
/home/user/pixsim7/frontend/src/
  134 component files across 30 directories
  Largest concentration in:
    - control/ (27 files)
    - automation/ (13 files)
    - inspector/ (16 files)
    - game/ (14 files)
    - graph/ (11 files)
    - nodes/ (8 files)
```

---

## Component Patterns to Consolidate

### Panels (26 total)
Scattered across different directories. Consider:
- Creating PanelBase component
- Standardizing props and styling
- Moving related panels to same directory

### Editors (23 total)
Many in inspector/ directory share patterns. Current approach:
- useNodeEditor.ts hook exists (good!)
- Other editors don't leverage it fully

### Lists (5 total)
- DeviceList, ExecutionList, LoopList, PresetList
- Similar patterns for filtering, loading, display
- Could benefit from ListBase component

---

## Styling Approach

### Current State
- **Primary**: Tailwind CSS (utility-first)
- **Secondary**: Custom CSS for Mosaic layout theme
- **No @apply**: All styling done with inline classNames

### CSS Files
```
Main:
  frontend/src/index.css (243 lines) - Tailwind + Mosaic overrides
  
Component-specific:
  frontend/src/components/gizmos/*.css (6 files)
  frontend/src/components/shapes/BrainShape.css
  frontend/src/components/examples/BrainShapeExample.css
```

---

## Import Analysis

### What's Used from packages/ui
```
Heavily used:
  - Button (8 files)
  - Panel (8 files)
  - Select (3 files)
  - Badge (3 files)
  - Modal (2 files)

Barely used:
  - PromptInput (1 file)
  - Tooltip/CubeTooltip (2 files)
  - FormField, Input, ProgressBar, Table (Game components only)

Never used:
  - Dropdown
  - StatusBadge
  - Tabs
  - ThemeToggle
  - Toast (frontend has own)
  - useToast (frontend has own)
```

---

## Consolidation Roadmap (Priority Order)

### Phase 1: HIGH PRIORITY (Do First)
```
1. Toast Component Consolidation
   - Merge frontend version into packages/ui
   - Update all imports
   - Delete frontend duplicate
   
   Files to modify:
   - /home/user/pixsim7/packages/ui/src/Toast.tsx
   - /home/user/pixsim7/frontend/src/stores/toastStore.ts
   - /home/user/pixsim7/frontend/src/components/common/Toast.tsx (DELETE)
   - /home/user/pixsim7/frontend/src/components/common/ToastContainer.tsx (DELETE)
```

### Phase 2: MEDIUM PRIORITY (Do Next)
```
2. ExecutionList Deduplication
   - Complete migration to _new version
   - Delete old version
   
   Files to modify:
   - /home/user/pixsim7/frontend/src/components/automation/ExecutionList.tsx (DELETE)
   - /home/user/pixsim7/frontend/src/components/automation/ExecutionList_new.tsx (RENAME)

3. Unused Components
   - Decide: Keep or remove Dropdown, StatusBadge, Tabs, ThemeToggle
   
   Files to review:
   - /home/user/pixsim7/packages/ui/src/Dropdown.tsx
   - /home/user/pixsim7/packages/ui/src/StatusBadge.tsx
   - /home/user/pixsim7/packages/ui/src/Tabs.tsx
   - /home/user/pixsim7/packages/ui/src/ThemeToggle.tsx
```

### Phase 3: MEDIUM-HIGH PRIORITY (Nice to Have)
```
4. Create Component Base Classes
   - PanelBase for 26 panel components
   - EditorBase for 23 editor components
   - ListBase for 5 list components
   
   New files to create:
   - packages/ui/src/PanelBase.tsx
   - frontend/src/components/base/EditorBase.tsx
   - frontend/src/components/base/ListBase.tsx
```

### Phase 4: LOW PRIORITY (Future)
```
5. Extract Styling Constants
   - Color maps (used in Toast, gizmos, etc.)
   - Animation classes
   - Theme variables
   
   New file to create:
   - frontend/src/lib/theme/constants.ts
```

---

## Related Documentation

Full analysis available in:
- `/home/user/pixsim7/UI_STRUCTURE_ANALYSIS.md` - Comprehensive analysis
- `/home/user/pixsim7/UI_FILE_TREE_REFERENCE.txt` - Complete file tree

---

## Quick Command Reference

### Find Toast imports
```bash
grep -r "import.*Toast" /home/user/pixsim7/frontend/src --include="*.tsx" --include="*.ts"
```

### Find all Panel components
```bash
find /home/user/pixsim7/frontend/src/components -name "*Panel*"
```

### Find all Editor components
```bash
find /home/user/pixsim7/frontend/src/components -name "*Editor*"
```

### Check packages/ui imports
```bash
grep -r "from '@pixsim7/ui" /home/user/pixsim7/frontend/src --include="*.tsx" | cut -d: -f2 | sort | uniq -c | sort -rn
```

### Compare ExecutionList files
```bash
diff /home/user/pixsim7/frontend/src/components/automation/ExecutionList.tsx /home/user/pixsim7/frontend/src/components/automation/ExecutionList_new.tsx
```

---

## Technology Stack Summary

| System | Tech | Components | Status |
|--------|------|-----------|--------|
| packages/ui | React 18 | 16 | Core library - some unused |
| packages/game-ui | React 18 | 4 | Minimal |
| frontend | React 19 | 134 | Large, needs consolidation |
| game-frontend | Svelte | 1 | Minimal |
| launcher | SvelteKit | 2 | Minimal |

All use Tailwind CSS for styling.
