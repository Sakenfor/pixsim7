# Cube Rotation and Face Selection System - Detailed Analysis

## Executive Summary

I've identified **three critical bugs** related to cube rotation and face selection:

1. **Face detection is NOT rotation-aware** - Mouse position logic doesn't account for 3D cube rotation
2. **Redundant/duplicate state updates** after rotation - Creates potential race conditions
3. **No Settings cube special handling** - Settings cube treated identically to other cubes despite different requirements

---

## Bug #1: Face Detection Not Rotation-Aware (CRITICAL)

### Location
`/home/user/pixsim7/frontend/src/components/control/ControlCube.tsx` (lines 74-124)

### Problem
The `handleMouseMove` function detects which cube face is being hovered using **pure 2D mouse position logic** that ignores the cube's current 3D rotation:

```typescript
// Current implementation - NO rotation awareness
let face: CubeFace = cube.activeFace;
let atEdge = false;

if (absX > absY) {
  if (absX > edgeThreshold) {
    atEdge = true;
    face = x > 0 ? 'right' : 'left';  // ALWAYS left/right based on screen X
  }
} else {
  if (absY > edgeThreshold) {
    atEdge = true;
    face = y > 0 ? 'bottom' : 'top';  // ALWAYS top/bottom based on screen Y
  }
}
```

### Why This Causes the Reported Bug

**Scenario: "After rotating, clicking the newly visible face opens the panel for the previous face"**

1. User starts with cube showing **front face** (rotation: x=0, y=0, z=0)
2. User clicks right edge → hovers over 'right' face visually
3. `rotateCubeFace` called with 'right' → cube rotates visually (rotation: x=0, y=90, z=0)
4. `activeFace` is now 'right' in the store
5. User clicks center of newly visible face (which IS the 'right' face)
6. `handleMouseMove` calculates `hoveredFace` based on 2D mouse position:
   - If mouse is at center, it defaults to `hoveredFace = cube.activeFace`
   - But if mouse moved slightly, it might calculate `hoveredFace = 'front'` (old position!)
7. Since `hoveredFace !== cube.activeFace`, it executes the wrong panel action

### Root Cause
The detection logic uses absolute 2D coordinates relative to cube center, but doesn't apply the inverse of the cube's 3D rotation to the mouse coordinates. After rotation, a mouse position that *visually* hovers over the 'right' face will be geometrically interpreted as the 'front' face.

### Impact
- **HIGH SEVERITY**: Users cannot reliably click rotated cube faces
- After any cube rotation, face detection becomes unreliable
- Panel actions trigger for wrong faces
- Creates confusing user experience

---

## Bug #2: Redundant State Updates Creating Race Condition

### Location
`/home/user/pixsim7/frontend/src/components/control/ControlCube.tsx` (lines 255-257)

### Problem
When rotating a cube via edge click, TWO state updates are made sequentially:

```typescript
// Line 256
rotateCubeFace(cubeId, hoveredFace);

// Line 257 - REDUNDANT
updateCube(cubeId, { activeFace: hoveredFace });
```

### What `rotateCubeFace` Does
From `controlCubeStore.ts` (lines 295-301):

```typescript
rotateCubeFace: (id, face) => {
  const rotation = FACE_ROTATIONS[face];
  get().updateCube(id, {
    activeFace: face,    // <-- ALREADY sets activeFace
    rotation,
  });
},
```

### The Problem
1. `rotateCubeFace` calls `updateCube` with both `activeFace` and `rotation`
2. `updateCube` at line 257 calls `updateCube` AGAIN with just `activeFace`
3. The **second** update overwrites/duplicates the **first** update
4. This can cause:
   - **State sync issues**: activeFace might be updated before rotation in some cases
   - **React batching conflicts**: Multiple state updates may not batch properly
   - **Visual glitches**: Rotation animation might not match face state

### Code Flow

```
handleCubeClick()
  ├─ rotateCubeFace(cubeId, hoveredFace)
  │  └─ updateCube(id, { activeFace, rotation })  ← STATE UPDATE 1
  └─ updateCube(cubeId, { activeFace: hoveredFace })  ← STATE UPDATE 2 (REDUNDANT)
```

### Impact
- **MEDIUM SEVERITY**: Creates potential race conditions
- May cause visual rotation to happen but face detection to fail
- Could cause localStorage persistence issues
- Violates state management best practices

---

## Bug #3: Settings Cube Has No Special Handling

### Location
Multiple files - no special handling found for Settings cube type

### Evidence
The 'settings' cube type is:
- Defined in `controlCubeStore.ts` (line 14)
- Has static face content in `CubeFaceContent.tsx` (lines 98-108)
- BUT has no special rotation, click handling, or face detection logic

### Expected Special Behavior
The user reports: **"The 'Settings' cube doesn't rotate its sides properly"**

This suggests the Settings cube might need:
1. **Different rotation speed/sensitivity**
2. **Alternative face detection** (more permissive for settings controls)
3. **Special click handling** (toggle modes instead of rotate?)
4. **Different face mapping** (faces might represent different setting categories)

### Current Treatment
Settings cube is treated **identically** to Control, Provider, and Preset cubes in:
- `ControlCube.tsx` - Same rotation transforms
- `handleCubeClick()` - Same click logic
- `handleMouseMove()` - Same face detection

### Where Settings Cube Differs
```typescript
// In controlCubeStore.ts - FACE_ROTATIONS applies to ALL cube types
const FACE_ROTATIONS: Record<CubeFace, CubeRotation> = {
  front: { x: 0, y: 0, z: 0 },
  back: { x: 0, y: 180, z: 0 },
  right: { x: 0, y: 90, z: 0 },
  left: { x: 0, y: -90, z: 0 },
  top: { x: -90, y: 0, z: 0 },
  bottom: { x: 90, y: 0, z: 0 },
};

// This is used for ALL cube types, no Settings-specific overrides
```

### Impact
- **LOW-MEDIUM SEVERITY**: Settings cube doesn't work as intended
- Possible that Settings cube needs different UX model
- No way to distinguish Settings cube from other types in rotation logic

---

## How Cube Rotation & Face Selection Currently Works

### Architecture Overview

```
┌─────────────────────────────────────────┐
│ DraggableCube (wrapper)                 │
├─────────────────────────────────────────┤
│ ControlCube (3D rendering)              │
│  ├─ renderFace('front')                 │
│  ├─ renderFace('back')                  │
│  ├─ renderFace('right')                 │
│  ├─ renderFace('left')                  │
│  ├─ renderFace('top')                   │
│  └─ renderFace('bottom')                │
│                                         │
│ CSS 3D Transform: rotateX(...) rotateY(...) │
└─────────────────────────────────────────┘
         ↓ onClick
    handleCubeClick()
         ↓
    Determine hoveredFace (based on 2D mouse position)
         ↓
    Either rotate OR execute action
```

### Current Rotation Flow (Simplified)

```
1. User clicks cube edge
   ↓
2. handleMouseMove calculates hoveredFace from 2D position
   ↓
3. handleCubeClick checks:
   - If hoveredFace === cube.activeFace? → call onFaceClick (execute action)
   - If not at edge? → call onFaceClick with cube.activeFace
   - If at edge AND different face? → rotateCubeFace
   ↓
4. rotateCubeFace updates store:
   - Sets activeFace = face
   - Sets rotation = FACE_ROTATIONS[face]
   ↓
5. ControlCube component re-renders with new rotation transform
   ↓
6. Cube visually rotates (CSS transition animates it)
```

### Data Flow for Face Detection

```
cube.rotation (stored in Zustand)
   ↓
ControlCube.useEffect watches cube.rotation
   ↓
Updates DOM: cubeEl.style.transform = "rotateX(...) rotateY(...)"
   ↓
Cube rotates in 3D space
   ↓
BUT: handleMouseMove IGNORES rotation when calculating hoveredFace
   ↓
hoveredFace = mouse position in 2D (DISCONNECTED from 3D rotation)
```

---

## File-by-File Implementation Details

### Key Files in Rotation System

#### 1. **ControlCube.tsx** (Main component)
- **Lines 74-124**: `handleMouseMove` - **[BUG #1 HERE]** - Face detection without rotation awareness
- **Lines 227-258**: `handleCubeClick` - **[BUG #2 HERE]** - Redundant state updates
- **Lines 346-376**: Face rendering with individual transforms
- **Lines 357**: Cube rotation transform application

#### 2. **controlCubeStore.ts** (State management)
- **Lines 175-182**: `FACE_ROTATIONS` - Hardcoded rotation values for each face
- **Lines 295-301**: `rotateCubeFace` action - Updates both rotation and activeFace
- **Lines 271-280**: `updateCube` action - Generic state updates

#### 3. **CubeFaceContent.tsx** (Face content generation)
- **Lines 147-184**: `getDynamicPanelFaces` - Generates face content with embedded onClick
- **Lines 118-142**: `getCubeFaceContent` - Routes to correct face content based on type
- **Lines 16-108**: Individual face content functions (Control, Provider, Preset, Panel, Settings)

#### 4. **ControlCubeManager.tsx** (High-level manager)
- **Lines 179-181**: `handleFaceClick` - Simply calls `rotateCubeFace`, no logic for executing actions
- **Lines 208**: Passes `onFaceClick` to DraggableCube

#### 5. **DraggableCube.tsx** (Drag wrapper)
- **Lines 79-85**: Renders ControlCube with onFaceClick prop

---

## Panel Action Execution Path

### How Panel Actions Actually Execute

```
Panel registers actions → panelActionRegistry.register(config)
                              ↓
                     (Panel actions stored by panelId)
                              ↓
getCubeFaceContent(cubeType, dockedPanelId)
                              ↓
getDynamicPanelFaces(dockedPanelId)
                              ↓
panelActionRegistry.getFaceMappings(dockedPanelId)
                              ↓
                     Maps: { front: action1, right: action2, ... }
                              ↓
          Returns face content with onClick handlers:
          action.execute() when clicked
                              ↓
          BUT THIS EXECUTE HAPPENS ON RENDER, NOT ON CLICK
          (Click is handled by ControlCube's handleCubeClick first)
```

### The Disconnect

1. **Panel actions are embedded in face content** as React components with onClick handlers
2. **ControlCube's handleCubeClick** intercepts all clicks BEFORE they reach the face content
3. **onFaceClick callback** is called with the detected face (which may be wrong due to bug #1)
4. **In ControlCubeManager**, onFaceClick just rotates the cube - no action execution

**Result**: Panel actions are never actually executed from cube clicks in the normal flow!

### Where Panel Actions Actually Execute

Panel actions execute when:
1. **Face content is clicked directly** (onClick embedded in JSX) - but only if ControlCube's click handler lets it bubble
2. **Called programmatically** from panel UI (not cube-based)
3. **Via keyboard shortcuts** registered in the panel

---

## Summary Table

| Bug | Severity | Impact | Location | Fix Complexity |
|-----|----------|--------|----------|-----------------|
| Face detection not rotation-aware | CRITICAL | Face clicks wrong, unreliable UX | ControlCube.tsx:74-124 | HIGH |
| Redundant state updates | MEDIUM | Race conditions, visual glitches | ControlCube.tsx:255-257 | LOW |
| Settings cube no special handling | LOW-MEDIUM | Settings cube doesn't work as intended | Multiple files | MEDIUM |

---

## Recommended Fixes

### Fix #1: Rotation-Aware Face Detection

Apply inverse rotation to mouse coordinates before determining which face is hovered. The solution requires:
1. Calculate the inverse of the cube's current rotation
2. Apply this inverse rotation to the mouse position
3. Then determine which face the rotated mouse position points to
4. This will properly map screen coordinates to 3D cube faces

### Fix #2: Remove Redundant updateCube Call

Delete line 257 in ControlCube.tsx:
```typescript
// REMOVE THIS LINE:
updateCube(cubeId, { activeFace: hoveredFace });
```

Let `rotateCubeFace` handle all state updates atomically.

### Fix #3: Settings Cube Special Handling

Decide on intended Settings cube behavior:
1. Should it toggle settings panel instead of rotating?
2. Should face detection be more forgiving?
3. Should faces represent different setting categories?
4. Implement appropriate logic in ControlCube.tsx or ControlCubeManager.tsx

---

## References

- **ControlCube main rendering**: `/home/user/pixsim7/frontend/src/components/control/ControlCube.tsx`
- **State management**: `/home/user/pixsim7/frontend/src/stores/controlCubeStore.ts`
- **Face content**: `/home/user/pixsim7/frontend/src/components/control/CubeFaceContent.tsx`
- **Panel actions**: `/home/user/pixsim7/frontend/src/lib/panelActions.ts`
- **Documentation**: `/home/user/pixsim7/docs/CONTROL_CUBES.md`
