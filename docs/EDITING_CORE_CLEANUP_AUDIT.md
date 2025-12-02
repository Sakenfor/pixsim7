# Editing-Core Usage Audit & Cleanup Opportunities

**Date:** 2025-12-02
**Task:** Post-Task 105 cleanup analysis
**Audited by:** Claude (Task 104/105 session)

---

## Executive Summary

The editing-core integration is **mostly clean** with good patterns, but contains **defensive backwards compatibility** that can likely be removed. The registry layer is already fully migrated, but widget factories maintain legacy prop support that appears unused.

---

## Key Findings

### ✅ What's Working Well

1. **Registry is fully migrated**
   - `overlayWidgetRegistry.ts` uses ONLY `*Binding` props
   - No legacy props passed through factories
   - Clean `extractBinding()` helper for unified→runtime conversion

2. **No legacy comments or TODOs**
   - No FIXMEs, HACKs, or deprecation warnings
   - Code is clean and well-structured

3. **Binding adapters are focused**
   - `bindingAdapters.ts` handles serialization correctly
   - Clear separation of runtime vs serializable bindings
   - Good error messages for non-serializable bindings

4. **Documentation is comprehensive**
   - New README and inline docs are thorough
   - Clear patterns for componentType usage

### ⚠️ Backwards Compatibility (Potentially Removable)

#### Pattern: Legacy Props in Widget Configs

**7 widgets** maintain dual prop patterns:

```typescript
// BadgeWidget.tsx, ButtonWidget.tsx, PanelWidget.tsx, etc.
export interface BadgeWidgetConfig {
  // Legacy: string | ((data: any) => string)
  label?: string | ((data: any) => string);

  // Preferred: DataBinding<string>
  labelBinding?: DataBinding<string>;
}
```

**Fallback logic in every widget factory:**
```typescript
// Line 82-83 in BadgeWidget.tsx (repeated in 7 files)
// Create binding (prefer new DataBinding, fall back to legacy pattern)
const finalLabelBinding = labelBinding || (label !== undefined ? createBindingFromValue('label', label) : undefined);
```

**Files affected:**
- `apps/main/src/lib/overlay/widgets/BadgeWidget.tsx`
- `apps/main/src/lib/overlay/widgets/ButtonWidget.tsx`
- `apps/main/src/lib/overlay/widgets/ComicPanelWidget.tsx`
- `apps/main/src/lib/overlay/widgets/PanelWidget.tsx`
- `apps/main/src/lib/overlay/widgets/ProgressWidget.tsx`
- `apps/main/src/lib/overlay/widgets/UploadWidget.tsx`
- `apps/main/src/lib/overlay/widgets/VideoScrubWidget.tsx`

**Actual usage:**
- Registry: ❌ Does NOT use legacy props
- Presets: ❌ Does NOT use legacy props (only static configs)
- BadgePresets.count(): ✅ ONLY place using legacy `label` prop
- BadgePresets usage: ❌ NOT called anywhere in codebase

#### Finding: BadgePresets Helpers Unused

```typescript
// BadgeWidget.tsx lines 160-231
export const BadgePresets = {
  mediaType: (...) => createBadgeWidget(...),
  status: (...) => createBadgeWidget(...),
  count: (...) => createBadgeWidget({ label: (data) => { ... } }), // LEGACY PROP
};
```

**Grep results:**
- Imported in: `apps/main/src/lib/overlay/presets/mediaCard.tsx`
- Called: ❌ Zero usages found

---

## Cleanup Opportunities

### Option 1: Remove All Legacy Props (Breaking Change)

**Impact:** LOW (no call sites found using legacy props)

**Steps:**
1. Remove legacy `label`, `title`, `content`, etc. props from widget configs
2. Remove fallback logic (`labelBinding || createBindingFromValue(...)`)
3. Migrate or remove `BadgePresets` helpers
4. Update widget config types to ONLY accept `*Binding` props

**Benefits:**
- Cleaner APIs (one way to do things)
- Less code to maintain (remove 20+ lines of fallback logic per widget)
- Clearer migration path for future developers
- Aligns with editing-core principles (bindings-first)

**Risks:**
- If any external code uses legacy props (not found in grep), it will break
- Semantic versioning would require major version bump

**Recommendation:** ✅ **Safe to proceed** if no external consumers

### Option 2: Deprecate Legacy Props (Non-Breaking)

**Impact:** ZERO (adds warnings only)

**Steps:**
1. Add JSDoc `@deprecated` tags to legacy props
2. Add console.warn() in fallback logic
3. Document migration path in deprecation warnings
4. Plan removal for next major version

**Example:**
```typescript
export interface BadgeWidgetConfig {
  /**
   * Text label (if variant includes text)
   * @deprecated Use labelBinding instead. Will be removed in v2.0.0
   * @example
   * // Old
   * label: 'Click Me'
   * // New
   * labelBinding: createBindingFromValue('label', 'Click Me')
   */
  label?: string | ((data: any) => string);
  labelBinding?: DataBinding<string>;
}
```

**Benefits:**
- Non-breaking change
- Gives consumers time to migrate
- Clearer intent

**Risks:**
- Still need to maintain fallback code until removal
- Console warnings may be noisy

**Recommendation:** ⚠️ **Good transition strategy**

### Option 3: Keep As-Is (No Change)

**Benefits:**
- Zero risk
- Defensive programming

**Costs:**
- Code bloat (20+ lines per widget × 7 widgets = 140+ lines)
- Two ways to do the same thing (confusing for new developers)
- Contradicts documentation (README says "use bindings")

**Recommendation:** ❌ **Not recommended** (documentation now says bindings are preferred)

---

## Specific Recommendations

### 1. Remove BadgePresets or Migrate to Bindings

**Current state:** Exported but unused

**Options:**
A. **Remove entirely** (they're unused)
B. **Migrate to use bindings**:
```typescript
export const BadgePresets = {
  count: (
    id: string,
    countBinding: DataBinding<number>,
    position?: WidgetPosition,
  ): OverlayWidget =>
    createBadgeWidget({
      id,
      position: position || { anchor: 'top-right', offset: { x: -4, y: -4 } },
      visibility: { trigger: 'always' },
      variant: 'text',
      labelBinding: {
        kind: 'fn',
        target: 'label',
        fn: (data) => {
          const value = resolveDataBinding(countBinding, data);
          return value && value > 99 ? '99+' : String(value || 0);
        },
      },
      // ...
    }),
};
```

C. **Keep but mark as deprecated**

**Recommendation:** **Option A (remove)** - they're not used anywhere

### 2. Add JSDoc to createBindingFromValue

**Current:** Exported from editing-core but not documented

**Location:** `apps/main/src/lib/editing-core/bindingAdapters.ts`

**Add:**
```typescript
/**
 * Create a DataBinding from a value (static or function).
 *
 * Helper to quickly create bindings without verbose object syntax.
 *
 * @param target - Binding target (e.g., 'label', 'value')
 * @param value - Static value or function that computes value
 * @returns DataBinding<T>
 *
 * @example
 * // Static binding
 * createBindingFromValue('label', 'Click Me')
 *
 * // Function binding (not serializable)
 * createBindingFromValue('label', (data) => data.username)
 *
 * @note Function bindings (kind='fn') are not serializable and cannot be
 * saved to presets or exported. Use path bindings for serializable dynamic data.
 */
export function createBindingFromValue<T = unknown>(
  target: string,
  value: T | ((data: any) => T)
): DataBinding<T>
```

### 3. Simplify Widget Configs (If Option 1 Chosen)

**Before:**
```typescript
export interface BadgeWidgetConfig {
  label?: string | ((data: any) => string);
  labelBinding?: DataBinding<string>;
}
```

**After:**
```typescript
export interface BadgeWidgetConfig {
  /**
   * Label binding for badge text.
   * Use createBindingFromValue() for static values or functions.
   */
  labelBinding?: DataBinding<string>;
}
```

### 4. Update Widget Factory Implementations

**Before (82-96 lines in BadgeWidget.tsx):**
```typescript
// Create binding (prefer new DataBinding, fall back to legacy pattern)
const finalLabelBinding = labelBinding || (label !== undefined ? createBindingFromValue('label', label) : undefined);

return {
  // ...
  render: (data, context) => {
    const resolvedLabel = resolveDataBinding(finalLabelBinding, data);
    // ...
  }
};
```

**After:**
```typescript
return {
  // ...
  render: (data, context) => {
    const resolvedLabel = resolveDataBinding(labelBinding, data);
    // ...
  }
};
```

**Lines saved:** ~15 lines per widget × 7 widgets = **~105 lines removed**

---

## Migration Path (If Breaking Changes)

### For External Consumers

**Step 1: Identify usage** (none found in current codebase)

**Step 2: Provide migration guide:**
```typescript
// OLD (deprecated)
createBadgeWidget({
  label: 'Static text',
})

// NEW
import { createBindingFromValue } from '@/lib/editing-core';
createBadgeWidget({
  labelBinding: createBindingFromValue('label', 'Static text'),
})

// OLD (function)
createBadgeWidget({
  label: (data) => data.username,
})

// NEW
createBadgeWidget({
  labelBinding: {
    kind: 'fn',
    target: 'label',
    fn: (data) => data.username,
  },
})

// OR use path binding for simple cases
createBadgeWidget({
  labelBinding: {
    kind: 'path',
    target: 'label',
    path: 'username',
  },
})
```

---

## Decision Matrix

| Option | Breaking? | Lines Removed | Clarity | Risk | Recommendation |
|--------|-----------|---------------|---------|------|----------------|
| **Option 1: Remove legacy** | ✅ Yes | ~105 | ✅✅✅ High | Low (unused) | ✅ Proceed |
| **Option 2: Deprecate** | ❌ No | 0 | ✅✅ Medium | Very Low | ⚠️ Transition |
| **Option 3: Keep as-is** | ❌ No | 0 | ❌ Low | None | ❌ Not advised |

---

## Next Steps

### Recommended: Option 1 (Remove Legacy Props)

1. Create task: "Remove legacy widget props in favor of DataBinding"
2. Update widget config interfaces (remove `label`, `title`, etc.)
3. Remove fallback logic from widget factories
4. Remove or migrate `BadgePresets`
5. Update any examples or documentation
6. Run tests to ensure no breakage
7. Bump major version (v2.0.0) if published as package

### Quick Wins (No Breaking Changes)

1. ✅ Remove `BadgePresets` export (unused)
2. ✅ Add JSDoc to `createBindingFromValue`
3. ✅ Add note in widget config JSDoc: "Legacy `label` prop is deprecated"

---

## Detailed File Inventory

### Files with Legacy Props (7 widgets)

Each file has the pattern: `legacyProp?: Type | Function` + `legacyPropBinding?: DataBinding<Type>`

1. **BadgeWidget.tsx**
   - Legacy: `label?: string | ((data: any) => string)`
   - New: `labelBinding?: DataBinding<string>`
   - Fallback code: Lines 82-83
   - Additional: `BadgePresets` object (lines 160-231) with unused helpers

2. **ButtonWidget.tsx**
   - Legacy: `label?: string | ((data: any) => string)`
   - New: `labelBinding?: DataBinding<string>`
   - Fallback code: Lines 87-88

3. **PanelWidget.tsx**
   - Legacy: `title?: string | ((data: any) => string)`, `content?: string | ((data: any) => string)`
   - New: `titleBinding?: DataBinding<string>`, `contentBinding?: DataBinding<string>`
   - Fallback code: Lines 83-85

4. **ProgressWidget.tsx**
   - Legacy: `value?: number | ((data: any) => number)`, `label?: string | ((data: any) => string)`
   - New: `valueBinding?: DataBinding<number>`, `labelBinding?: DataBinding<string>`
   - Fallback code: Lines 115-118

5. **ComicPanelWidget.tsx**
   - Legacy: `panelIds?: string[] | ((data: any) => string[])`, `assetIds?: string[] | ((data: any) => string[])`
   - New: `panelIdsBinding?: DataBinding<string[]>`, `assetIdsBinding?: DataBinding<string[]>`
   - Fallback code: Lines 87-90

6. **UploadWidget.tsx**
   - Legacy: `state?: UploadState | ((data: any) => UploadState)`, `progress?: number | ((data: any) => number)`
   - New: `stateBinding?: DataBinding<UploadState>`, `progressBinding?: DataBinding<number>`
   - Fallback code: Lines 118-120

7. **VideoScrubWidget.tsx**
   - Legacy: `currentTime?: number | ((data: any) => number)`, `duration?: number | ((data: any) => number)`
   - New: `currentTimeBinding?: DataBinding<number>`, `durationBinding?: DataBinding<number>`
   - Fallback code: Lines 108-110

### Files Already Clean

- `overlayWidgetRegistry.ts` - ✅ Only uses `*Binding` props
- `overlayConfig.ts` - ✅ Clean converters, no legacy code
- `editing-core/*.ts` - ✅ No backwards compatibility code
- Preset files - ✅ Don't use legacy props

---

## Testing Strategy (If Changes Made)

### 1. Unit Tests

```typescript
describe('BadgeWidget without legacy props', () => {
  it('should render with labelBinding', () => {
    const widget = createBadgeWidget({
      id: 'test',
      position: { anchor: 'top-left', offset: { x: 0, y: 0 } },
      visibility: { trigger: 'always' },
      variant: 'text',
      labelBinding: createBindingFromValue('label', 'Test'),
    });
    // Assert widget renders correctly
  });

  it('should handle undefined labelBinding', () => {
    const widget = createBadgeWidget({
      id: 'test',
      position: { anchor: 'top-left', offset: { x: 0, y: 0 } },
      visibility: { trigger: 'always' },
      variant: 'icon',
      icon: 'check',
      // No labelBinding - should work fine for icon-only
    });
    // Assert widget renders correctly
  });
});
```

### 2. Integration Tests

- Test overlay preset loading
- Test registry widget creation
- Test config serialization/deserialization
- Test HUD integration (if applicable)

### 3. Visual Regression Tests

- Ensure widgets look the same after refactor
- Test all badge variants (icon, text, icon-text)
- Test all widget types in overlay

---

## Related Tasks

- **Task 102** - Editable UI Core cleanup (mentioned in overlayConfig.ts)
- **Task 105** - Editing-Core Hardening & Adoption Guidelines (this task)
- **Future Task** - Remove legacy widget props (if Option 1 chosen)

---

## Conclusion

The editing-core integration is **well-architected and clean**. The main opportunity is **removing defensive backwards compatibility** that appears to serve no actual consumers. This would:

- Reduce code by ~105 lines
- Improve clarity (one clear pattern)
- Align implementation with documentation
- Make future maintenance easier

**Risk is LOW** - no call sites found using legacy props.

**Recommended next action:** Create a new task for Option 1 (Remove Legacy Props) or implement Option 2 (Deprecate) as a quick interim step.
