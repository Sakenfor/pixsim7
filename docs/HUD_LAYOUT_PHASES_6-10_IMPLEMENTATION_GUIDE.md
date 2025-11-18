# HUD Layout Phases 6-10 Implementation Guide

This document provides implementation guidance for completing Phases 6-10 of the World HUD Layout Designer.

## ✅ Completed (Part 1)

### Phase 6 - Enhanced Layout Controls (Backend)
- ✅ Extended `HudToolPlacement` type with:
  - `size?: HudToolSize` - 'compact' | 'normal' | 'expanded'
  - `defaultCollapsed?: boolean`
  - `zIndex?: number`
  - `groupId?: string`
  - `customClassName?: string`
- ✅ Added `TOOL_SIZES` constant to HudLayoutEditor

### Phase 8 - Advanced Visibility Conditions (Backend)
- ✅ Extended visibility condition types: location, time, quest, relationship, composite
- ✅ Implemented complete evaluation logic in `hudLayout.ts`:
  - Location-based: Check if at specific location IDs
  - Time-based: Check day of week and hour range
  - Quest-based: Check quest status in session flags
  - Relationship-based: Check NPC relationship level
  - Composite: AND/OR logic for nested conditions
- ✅ Added new condition types to `VISIBILITY_CONDITION_KINDS`

### Phase 9 - Player HUD Preferences (Complete)
- ✅ Created `playerHudPreferences.ts` with full localStorage system
- ✅ Created `HudCustomizationPanel.tsx` component
- ✅ Player can:
  - Toggle tool visibility
  - Override view mode
  - Apply per-tool overrides
- ✅ Preferences stored separately from world config

### Phase 10 - Layout Variants & Inheritance (Complete)
- ✅ Extended `WorldUiConfig` with:
  - `hudLayouts?: Record<string, HudToolPlacement[]>` - Named variants
  - `activeLayout?: string` - Current variant
  - `inheritFrom?: string` - Preset to inherit from
  - `overrides?: HudToolPlacement[]` - Overridden tools
- ✅ Created `hudLayoutVariants.ts` with full variant management
- ✅ Functions for switching, creating, and deleting variants

## 🚧 Remaining Work (Part 2)

### Phase 6 - Enhanced Controls UI
**Location:** `frontend/src/components/game/HudLayoutEditor.tsx`

Add table columns for enhanced properties:

```tsx
// Add after Visibility column:
<th className="pb-2 font-semibold">Size</th>
<th className="pb-2 font-semibold">Options</th>

// In table body row:
<td className="py-2">
  <Select
    size="sm"
    value={placement.size || ''}
    onChange={(e) => handleSizeChange(placement.toolId, e.target.value)}
  >
    {TOOL_SIZES.map(size => (
      <option key={size.value} value={size.value}>{size.label}</option>
    ))}
  </Select>
</td>
<td className="py-2">
  <div className="flex gap-1">
    <label className="flex items-center gap-1 text-xs">
      <input
        type="checkbox"
        checked={placement.defaultCollapsed || false}
        onChange={(e) => handleCollapsedChange(placement.toolId, e.target.checked)}
      />
      Collapsed
    </label>
    {placement.region === 'overlay' && (
      <input
        type="number"
        placeholder="z-index"
        value={placement.zIndex || ''}
        onChange={(e) => handleZIndexChange(placement.toolId, parseInt(e.target.value))}
        className="w-16 px-1 text-xs"
      />
    )}
  </div>
</td>
```

Add handler functions:

```tsx
const handleSizeChange = (toolId: string, size: string) => {
  setPlacements(prev => prev.map(p =>
    p.toolId === toolId ? { ...p, size: size as any || undefined } : p
  ));
};

const handleCollapsedChange = (toolId: string, collapsed: boolean) => {
  setPlacements(prev => prev.map(p =>
    p.toolId === toolId ? { ...p, defaultCollapsed: collapsed } : p
  ));
};

const handleZIndexChange = (toolId: string, zIndex: number) => {
  setPlacements(prev => prev.map(p =>
    p.toolId === toolId ? { ...p, zIndex: isNaN(zIndex) ? undefined : zIndex } : p
  ));
};
```

### Phase 6 - RegionalHudLayout Updates
**Location:** `frontend/src/components/game/RegionalHudLayout.tsx`

Apply size and collapsed states:

```tsx
// In WorldToolsPanel or tool rendering:
const toolClassName = `hud-tool ${placement.size || 'normal'} ${placement.customClassName || ''}`;
const [collapsed, setCollapsed] = useState(placement.defaultCollapsed || false);

// Apply z-index for overlay region:
style={{ zIndex: placement.zIndex }}
```

### Phase 7 - Drag & Drop Editor
**New Component:** `frontend/src/components/game/DragDropHudEditor.tsx`

Use `@dnd-kit/core` or similar library:

```tsx
import { DndContext, DragEndEvent, useDraggable, useDroppable } from '@dnd-kit/core';

export function DragDropHudEditor({ placements, onChange }: Props) {
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;

    // Move tool to new region
    const toolId = active.id as string;
    const newRegion = over.id as HudRegion;

    const updated = placements.map(p =>
      p.toolId === toolId ? { ...p, region: newRegion } : p
    );
    onChange(updated);
  };

  return (
    <DndContext onDragEnd={handleDragEnd}>
      <div className="grid grid-cols-3 gap-4">
        {REGIONS.map(region => (
          <RegionDropZone key={region.value} region={region.value}>
            {placements
              .filter(p => p.region === region.value)
              .map(p => (
                <DraggableToolCard key={p.toolId} placement={p} />
              ))}
          </RegionDropZone>
        ))}
      </div>
    </DndContext>
  );
}
```

Add toggle in `HudLayoutEditor`:

```tsx
const [editorMode, setEditorMode] = useState<'table' | 'visual'>('table');

// In render:
<div className="flex gap-2 mb-4">
  <Button variant={editorMode === 'table' ? 'primary' : 'secondary'}
    onClick={() => setEditorMode('table')}>
    Table View
  </Button>
  <Button variant={editorMode === 'visual' ? 'primary' : 'secondary'}
    onClick={() => setEditorMode('visual')}>
    Visual Editor
  </Button>
</div>

{editorMode === 'table' ? (
  <table>...</table>
) : (
  <DragDropHudEditor placements={placements} onChange={setPlacements} />
)}
```

### Phase 8 - Advanced Condition UI
**Location:** Add to `HudLayoutEditor.tsx` visibility cell

For location condition:
```tsx
{placement.visibleWhen?.kind === 'location' && (
  <input
    type="text"
    placeholder="Location IDs (comma-separated)"
    value={placement.visibleWhen.id}
    onChange={(e) => handleConditionIdChange(placement.toolId, e.target.value)}
  />
)}
```

For time condition:
```tsx
{placement.visibleWhen?.kind === 'time' && (
  <>
    <Select value={placement.visibleWhen.dayOfWeek || 'any'}
      onChange={(e) => handleTimeDayChange(placement.toolId, e.target.value)}>
      <option value="any">Any Day</option>
      <option value="0">Monday</option>
      {/* ... */}
    </Select>
    <input type="number" placeholder="Start hour" min="0" max="23" />
    <input type="number" placeholder="End hour" min="0" max="23" />
  </>
)}
```

For relationship condition:
```tsx
{placement.visibleWhen?.kind === 'relationship' && (
  <>
    <input placeholder="NPC ID" />
    <input type="number" placeholder="Min level" min="0" max="100" />
  </>
)}
```

### Phase 10 - Variant Management UI
**Location:** Add to `HudLayoutEditor.tsx` before tool table

```tsx
const [layoutVariants, setLayoutVariants] = useState<string[]>([]);
const [selectedVariant, setSelectedVariant] = useState<string | null>(null);

useEffect(() => {
  const variants = getLayoutVariantNames(worldDetail);
  setLayoutVariants(variants);
}, [worldDetail]);

// UI:
<Panel className="mb-4">
  <h3>Layout Variants</h3>
  <div className="flex gap-2">
    <Button variant={!selectedVariant ? 'primary' : 'secondary'}
      onClick={() => setSelectedVariant(null)}>
      Default Layout
    </Button>
    {layoutVariants.map(name => (
      <Button key={name}
        variant={selectedVariant === name ? 'primary' : 'secondary'}
        onClick={() => setSelectedVariant(name)}>
        {name}
      </Button>
    ))}
  </div>
  <Button size="sm" onClick={() => promptCreateVariant()}>
    + New Variant
  </Button>
</Panel>
```

Add inheritance UI:
```tsx
<div className="flex items-center gap-2">
  <label>Inherit from preset:</label>
  <Select value={ui.inheritFrom || ''}
    onChange={(e) => handleInheritanceChange(e.target.value)}>
    <option value="">None</option>
    {presets.map(p => (
      <option key={p.id} value={p.id}>{p.name}</option>
    ))}
  </Select>
</div>
```

### Quick Wins

#### Keyboard Shortcuts
```tsx
useEffect(() => {
  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.ctrlKey || e.metaKey) {
      if (e.key === 's') {
        e.preventDefault();
        handleSave();
      }
      if (e.key === 'z') {
        e.preventDefault();
        undo();
      }
    }
    if (e.key === 'Delete' && selectedTool) {
      handleRemoveTool(selectedTool);
    }
  };

  document.addEventListener('keydown', handleKeyDown);
  return () => document.removeEventListener('keydown', handleKeyDown);
}, [selectedTool]);
```

#### Undo/Redo
```tsx
const [history, setHistory] = useState<ToolPlacementRow[][]>([]);
const [historyIndex, setHistoryIndex] = useState(-1);

const undo = () => {
  if (historyIndex > 0) {
    setHistoryIndex(historyIndex - 1);
    setPlacements(history[historyIndex - 1]);
  }
};

const redo = () => {
  if (historyIndex < history.length - 1) {
    setHistoryIndex(historyIndex + 1);
    setPlacements(history[historyIndex + 1]);
  }
};

// Save to history on changes:
const saveToHistory = (newPlacements: ToolPlacementRow[]) => {
  const newHistory = history.slice(0, historyIndex + 1);
  newHistory.push(newPlacements);
  setHistory(newHistory);
  setHistoryIndex(newHistory.length - 1);
};
```

#### Validation Warnings
```tsx
const validateLayout = (): string[] => {
  const warnings: string[] = [];

  // Check for tools with impossible conditions
  placements.forEach(p => {
    if (p.visibleWhen?.kind === 'composite' &&
        (!p.visibleWhen.conditions || p.visibleWhen.conditions.length === 0)) {
      warnings.push(`Tool "${p.name}" has composite condition with no sub-conditions`);
    }
  });

  // Check for duplicate orders in same region
  const regionOrders = new Map<HudRegion, Set<number>>();
  placements.forEach(p => {
    if (!regionOrders.has(p.region)) {
      regionOrders.set(p.region, new Set());
    }
    if (p.order !== undefined && regionOrders.get(p.region)!.has(p.order)) {
      warnings.push(`Duplicate order ${p.order} in ${p.region} region`);
    }
    regionOrders.get(p.region)!.add(p.order || 0);
  });

  return warnings;
};

// Show warnings in UI
const warnings = validateLayout();
{warnings.length > 0 && (
  <div className="p-3 bg-yellow-100 border border-yellow-300 rounded">
    <h4 className="font-semibold">Warnings:</h4>
    <ul className="list-disc pl-5">
      {warnings.map((w, i) => <li key={i}>{w}</li>)}
    </ul>
  </div>
)}
```

#### Preset Tags
Update `HudLayoutPreset` type:
```tsx
interface HudLayoutPreset {
  // ... existing fields
  tags?: string[];
  category?: 'minimal' | 'standard' | 'debug' | 'custom';
}
```

Add tag filtering in preset list:
```tsx
const [selectedTag, setSelectedTag] = useState<string | null>(null);
const filteredPresets = selectedTag
  ? presets.filter(p => p.tags?.includes(selectedTag))
  : presets;
```

## Integration with Game2D

### Add HUD Customization Button
**Location:** `frontend/src/routes/Game2D.tsx`

```tsx
import { HudCustomizationButton } from '../components/game/HudCustomizationPanel';

// In render, near other HUD controls:
<HudCustomizationButton
  worldDetail={worldDetail}
  availableTools={visibleWorldTools}
  currentViewMode={viewMode}
  onUpdate={() => {
    // Trigger HUD refresh
    setWorldDetail({ ...worldDetail });
  }}
/>
```

### Apply Player Preferences
**Location:** `frontend/src/routes/Game2D.tsx`

```tsx
import { applyPlayerPreferences, getEffectiveViewMode } from '../lib/worldTools/playerHudPreferences';

// Apply player preferences to tools
const visibleWorldTools = useMemo(() => {
  const contextFiltered = worldToolRegistry.getVisible(worldToolContext);
  const viewModeFiltered = filterToolsByViewMode(contextFiltered, viewMode);

  // Apply player preferences
  if (selectedWorldId) {
    const effectiveViewMode = getEffectiveViewMode(selectedWorldId, viewMode);
    // Re-filter with effective view mode
    const reFiltered = filterToolsByViewMode(contextFiltered, effectiveViewMode);
    return applyPlayerPreferences(reFiltered, selectedWorldId);
  }

  return viewModeFiltered;
}, [worldToolContext, viewMode, selectedWorldId]);
```

## Testing Checklist

- [ ] Enhanced controls (size, collapsed, z-index) work in editor
- [ ] Location-based visibility works (show tool only at specific locations)
- [ ] Time-based visibility works (show tool during specific hours)
- [ ] Quest-based visibility works
- [ ] Relationship-based visibility works
- [ ] Composite conditions work (AND/OR logic)
- [ ] Player preferences persist across sessions
- [ ] View mode override works
- [ ] Tool hide/show toggles work
- [ ] Layout variants can be created and switched
- [ ] Layout inheritance from presets works
- [ ] Overrides apply correctly to inherited layouts
- [ ] Drag-and-drop editor functions properly
- [ ] Keyboard shortcuts work (Ctrl+S, Delete, Undo/Redo)
- [ ] Validation warnings display correctly
- [ ] Preset tags filter presets
- [ ] All features are backward compatible

## Performance Considerations

1. **Condition Evaluation**: Caching condition results to avoid re-evaluating on every render
2. **Player Preferences**: Batch localStorage updates to prevent excessive writes
3. **Layout Variants**: Lazy-load variant data only when needed
4. **Drag & Drop**: Use virtualization for large tool lists

## Future Enhancements

1. **Visual Layout Preview**: Real-time preview of HUD layout
2. **Mobile/Tablet Support**: Responsive HUD customization
3. **Cloud Sync**: Sync player preferences across devices
4. **Layout Analytics**: Track which tools players use most
5. **A/B Testing**: Test different HUD layouts with players
6. **Accessibility**: ARIA labels, keyboard navigation
7. **Animation**: Smooth transitions when switching layouts
8. **Smart Defaults**: ML-based layout suggestions based on playstyle
