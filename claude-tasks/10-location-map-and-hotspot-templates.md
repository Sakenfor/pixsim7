**Task: 2D Location Map Editor & Hotspot Template System**

**Context**
- Game2D shows 2D locations with clickable hotspots (via `GameHotspot` table).
- Locations exist in `game_locations` table with `asset_id` (background image).
- Hotspots have positions, linked scenes, and can trigger interactions.
- Missing:
  - Visual map editor showing all locations and their connections.
  - Hotspot template system for reusable hotspot patterns.
  - Easy way to design location layouts with drag-and-drop hotspot placement.

**Goal**
Build a **Location Map Editor** and **Hotspot Template System** that:
- Provides **Visual Location Map** - graph view showing all locations and travel connections.
- Enables **Drag-and-Drop Hotspot Editor** - place hotspots directly on location background image.
- Adds **Hotspot Templates** - reusable hotspot configs (e.g., "exit door", "NPC dialogue spot").
- Integrates with existing location/hotspot data and Game2D rendering.

**Key Ideas**
- Location map as graph:
  ```ts
  interface LocationMap {
    locations: Array<{
      id: number;                    // GameLocation.id
      name: string;
      assetId: number;               // Background image
      position?: { x: number; y: number }; // For map layout
    }>;
    connections: Array<{
      from: number;                  // Location ID
      to: number;                    // Location ID
      hotspotId?: number;            // Which hotspot enables travel
      bidirectional: boolean;
    }>;
  }
  ```
- Hotspot template:
  ```ts
  interface HotspotTemplate {
    id: string;
    name: string;                    // 'Exit Door (Right)', 'NPC Talk Spot'
    description?: string;
    icon?: string;                   // Icon/emoji for visual recognition
    defaultPosition?: { x: number; y: number; width: number; height: number };
    linkedSceneType?: 'travel' | 'dialogue' | 'cutscene' | 'custom';
    defaultInteractions?: string[];  // Interaction plugin IDs to enable
    style?: {                        // Visual appearance in editor/game
      shape: 'rect' | 'circle' | 'polygon';
      color?: string;
      hoverEffect?: 'highlight' | 'pulse';
    };
  }
  ```

**Implementation Outline**

1. **Location Map Data Module**
   - New module: `frontend/src/lib/locations/locationMap.ts`.
   - Implement:
     - `buildLocationMap(locations, hotspots): LocationMap`.
     - `getLocationConnections(locationId): number[]` - which locations are reachable.
   - Derive connections from hotspots that link to other locations (via linked scenes or direct travel).

2. **Location Map Graph View**
   - New route: `frontend/src/routes/LocationMap.tsx`.
   - Use graph visualization (force-directed or manual layout):
     - Nodes = locations (show thumbnail of background asset).
     - Edges = travel connections (from hotspots).
   - Features:
     - Click node to open location detail/editor.
     - Click edge to edit travel hotspot.
     - Auto-layout or manual drag positioning.
     - Save layout positions to `GameWorld.meta.locationMapLayout`.

3. **Hotspot Template System**
   - New module: `frontend/src/lib/locations/hotspotTemplates.ts`.
   - Implement:
     - `HotspotTemplateStore` with CRUD (localStorage initially).
     - `applyTemplate(template, location): GameHotspotData`.
   - Ship with 5-10 built-in templates:
     - "Exit Door (Right)", "NPC Dialogue Spot", "Item Pickup", "Scene Trigger", "Investigation Point".

4. **Visual Hotspot Editor**
   - New component: `frontend/src/components/locations/HotspotEditor.tsx`.
   - Features:
     - Display location background image (from `Location.asset_id`).
     - Overlay existing hotspots as draggable rectangles/shapes.
     - **Add Hotspot**:
       - Select template from palette.
       - Click/drag on image to place.
       - Template defaults applied (size, interactions).
     - **Edit Hotspot**:
       - Click hotspot to open inspector.
       - Adjust position, size, linked scene, interactions.
     - **Delete Hotspot**: Remove from location.
   - Save changes via existing `createGameHotspot`, `updateGameHotspot` APIs.

5. **Integration with Game2D**
   - Hotspot rendering in Game2D already works.
   - Ensure templates don't change runtime behavior - they're design-time helpers.
   - Hotspot styles (color, hover effect) can be stored in hotspot meta and used by Game2D render logic.

6. **Template Library UI**
   - Component: `frontend/src/components/locations/HotspotTemplateLibrary.tsx`.
   - Features:
     - List all templates with preview icons.
     - Create custom template from existing hotspot ("Save as template").
     - Edit/delete templates.
     - Drag template into hotspot editor to apply.

**Constraints**
- No backend schema changes; templates stored in frontend (localStorage).
- Use existing `game_hotspots` and `game_locations` tables.
- Hotspot editor works with existing asset system (background images from gallery).

**Success Criteria**
- Designers can visualize all locations and their travel connections in a map view.
- Drag-and-drop hotspot editor makes placement intuitive (no manual coordinate entry).
- Hotspot templates speed up common setups (exits, NPC spots, triggers).
- Changes in hotspot editor reflect immediately in Game2D playback.

---

## Phase 2: Multi-Floor Maps, Procedural Hotspots & Location Prefabs

Once basic location map and hotspot editing work, add advanced features:

**Phase 2 Goals**
- Support **Multi-Floor/Area Maps** - group locations into buildings, districts, regions.
- Add **Procedural Hotspot Generation** - AI-suggested hotspot placements based on image analysis.
- Introduce **Location Prefabs** - reusable location templates with pre-placed hotspots.
- Enable **Hotspot Scripting** - custom logic for advanced hotspot behaviors.

**Features**
- Location hierarchy:
  - World → Region → District → Building → Floor → Room.
  - Visual map shows hierarchical navigation.
- Procedural suggestions:
  - Analyze location background image (detect doors, furniture, NPCs).
  - Suggest hotspot placements automatically.
- Location prefabs:
  - "Bar Interior", "Bedroom", "City Street" - complete with hotspots.
  - Apply prefab, customize as needed.
- Hotspot scripting:
  - Define custom trigger logic beyond simple scene links.
  - Conditional visibility based on flags/time/NPCs.

**Success Criteria**
- Production-ready world building with hierarchical location organization.
- Procedural tools reduce manual hotspot placement work.
- Rich prefab library enables rapid level design.
- Advanced hotspot behaviors support complex gameplay mechanics.

---

## Phase 3: Procedural World Generation & Smart Layouts

Add intelligent world building and generation capabilities.

**Phase 3 Goals**
- Build **procedural location generator** with logical layouts.
- Add **pathfinding visualization** for travel routes.
- Implement **location clustering** for districts/regions.
- Create **landmark system** for memorable locations.

**Key Features**
- Procedural generation:
  - Building interiors from templates.
  - Street and district layouts.
  - Natural environment generation.
- Navigation systems:
  - Optimal path calculation.
  - Alternative routes.
  - Travel time estimation.
- World organization:
  - Hierarchical regions.
  - Thematic districts.
  - Points of interest.

---

## Phase 4: Living World Systems & Environmental Simulation

Create dynamic, living worlds that change over time.

**Phase 4 Goals**
- Implement **time-based location changes** (day/night, seasons).
- Add **crowd simulation** for populated areas.
- Create **environmental hazards** and weather effects.
- Build **location reputation** and atmosphere systems.

**Key Features**
- Temporal changes:
  - Business hours.
  - Seasonal decorations.
  - Event-based modifications.
- Population dynamics:
  - Crowd density patterns.
  - NPC traffic flow.
  - Activity schedules.
- Environmental systems:
  - Weather impacts.
  - Natural disasters.
  - Atmosphere effects.

---

## Phase 5: Metaverse-Scale World Platform

Build massive, persistent shared worlds.

**Phase 5 Goals**
- Create **persistent world state** across sessions.
- Add **multiplayer location** sharing.
- Implement **user-generated locations** with moderation.
- Build **cross-game world** connectivity.

**Key Features**
- Persistence:
  - Server-side world state.
  - Change history tracking.
  - World backups.
- Multiplayer:
  - Shared exploration.
  - Collaborative building.
  - Social spaces.
- User content:
  - Location creation tools.
  - Community voting.
  - Content moderation.
