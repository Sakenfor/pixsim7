# PixSim7 Gameplay Systems - Complete Reference

> **Status:** Canonical | **Topic:** Relationships, quests, inventory, dialogue, stealth | **Last verified:** 2026-03-03
> **Related:** `SYSTEM_OVERVIEW.md`, `../game/RELATIONSHIPS_AND_ARCS.md`, `HOTSPOT_ACTIONS_2D.md`

## Overview

This document describes the gameplay systems implemented in PixSim7.

## Architecture

All gameplay data is stored in `GameSession.flags` and `GameSession.relationships` as JSON, avoiding new database tables while maintaining clean semantics.

## Core Systems

### 1. Relationship System

**Backend:**
- Location: `pixsim7/backend/main/domain/game/stats/relationships_package.py`
- Data: `GameSession.relationships` (JSON field)

**Data Structure:**
```json
{
  "relationships": {
    "npc:1": {
      "affinity": 75.0,
      "trust": 60.0,
      "chemistry": 80.0,
      "tension": 20.0,
      "flags": {}
    }
  }
}
```

**Tiers:**
- `stranger` (affinity 0-10)
- `acquaintance` (affinity 10-30)
- `friend` (affinity 30-60)
- `close_friend` (affinity 60-80)
- `lover` (affinity 80+)

**Intimacy Levels:**
- `light_flirt` (affinity 20+, chemistry 20+)
- `deep_flirt` (affinity 40+, chemistry 40+, trust 20+)
- `intimate` (affinity 60+, chemistry 60+, trust 40+)
- `very_intimate` (affinity 80+, chemistry 80+, trust 60+)

**Frontend:**
- Component: `apps/main/src/components/game/RelationshipDashboard.tsx`
- Features:
  - Visual progress bars for all 4 axes
  - Color-coded relationship tiers and intimacy levels
  - Relationship flags display
  - Sorted by affinity (highest first)

### 2. Quest System

**Backend:**
- Service: `pixsim7/backend/main/services/game/quest.py` (`QuestService`)
- API: `pixsim7/backend/main/api/v1/game_quests.py`
- Routes: Registered via `pixsim7/backend/main/routes/game_quests/manifest.py`
- Data: `GameSession.flags.quests` (JSON field)

**Data Structure:**
```json
{
  "flags": {
    "quests": {
      "main_story_01": {
        "id": "main_story_01",
        "title": "Find the Ancient Artifact",
        "description": "Locate the legendary artifact in the ruins",
        "status": "active",
        "objectives": [
          {
            "id": "explore_ruins",
            "description": "Explore the ancient ruins",
            "completed": false,
            "progress": 0,
            "target": 1,
            "optional": false
          }
        ],
        "metadata": {}
      }
    }
  }
}
```

**API Endpoints:**
- `GET /api/v1/game/quests/sessions/{session_id}/quests` - List quests (filter by status)
- `GET /api/v1/game/quests/sessions/{session_id}/quests/{quest_id}` - Get quest details
- `POST /api/v1/game/quests/sessions/{session_id}/quests` - Add new quest
- `PATCH /api/v1/game/quests/sessions/{session_id}/quests/{quest_id}/status` - Update status
- `PATCH /api/v1/game/quests/sessions/{session_id}/quests/{quest_id}/objectives` - Update objective
- `POST /api/v1/game/quests/sessions/{session_id}/quests/{quest_id}/objectives/{objective_id}/complete` - Complete objective

**Quest Statuses:**
- `active` - Currently being worked on
- `completed` - Successfully finished
- `failed` - Failed to complete
- `hidden` - Not yet revealed to player

**Frontend:**
- Component: `apps/main/src/components/game/QuestLog.tsx`
- Features:
  - Quest list with filtering (active/completed/all)
  - Quest details panel
  - Objective tracking with progress bars
  - Optional objectives marked
  - Auto-completion when all required objectives done

### 3. Inventory System

**Backend:**
- Service: `pixsim7/backend/main/services/game/inventory.py` (`InventoryService`)
- API: `pixsim7/backend/main/api/v1/game_inventory.py`
- Routes: Registered via `pixsim7/backend/main/routes/game_inventory/manifest.py`
- Data: `GameSession.flags.inventory` (JSON field)

**Data Structure:**
```json
{
  "flags": {
    "inventory": {
      "items": [
        {
          "id": "health_potion",
          "name": "Health Potion",
          "quantity": 5,
          "metadata": {
            "description": "Restores 50 HP",
            "rarity": "common"
          }
        }
      ]
    }
  }
}
```

**API Endpoints:**
- `GET /api/v1/game/inventory/sessions/{session_id}/items` - List all items
- `GET /api/v1/game/inventory/sessions/{session_id}/items/{item_id}` - Get item details
- `POST /api/v1/game/inventory/sessions/{session_id}/items` - Add item (or increase quantity)
- `DELETE /api/v1/game/inventory/sessions/{session_id}/items/{item_id}` - Remove item (or decrease quantity)
- `PATCH /api/v1/game/inventory/sessions/{session_id}/items/{item_id}` - Update item
- `DELETE /api/v1/game/inventory/sessions/{session_id}/clear` - Clear inventory
- `GET /api/v1/game/inventory/sessions/{session_id}/stats` - Get statistics

**Frontend:**
- Component: `apps/main/src/components/game/panels/InventoryPanel.tsx`
- Features:
  - Item list with quantities
  - Item details panel with metadata
  - Inventory statistics (unique items, total quantity)
  - Clean grid layout

## Interaction Systems

### 4. NPC Dialogue

**Frontend:**
- Component: `apps/main/src/components/game/DialogueUI.tsx`
- Features:
  - Dialogue message display
  - Speaker identification with NPC badge
  - Choice selection (can trigger scenes)
  - Simple fallback dialogue for unconfigured NPCs

**Integration:**
- Appears when clicking NPCs with `talk` interaction
- Can trigger scene playback
- Shows during NPC conversations

### 5. Game Notifications

**Frontend:**
- Component: `apps/main/src/components/game/GameNotification.tsx`
- Features:
  - Toast-style notifications (bottom-right)
  - 4 types: success, error, warning, info
  - Auto-dismiss after 5 seconds (configurable)
  - Manual dismiss option
  - Smooth animations

**Usage:**
- Pickpocket results
- Interaction outcomes
- Error messages
- Success confirmations

### 6. Stealth/Pickpocket

**Backend:**
- Plugin: `packages/plugins/stealth/backend/manifest.py` (external plugin package)
- API: `/api/v1/game/stealth/pickpocket`

**Features:**
- Success chance calculation
- Detection mechanics
- Relationship penalties on detection
- Flag tracking (attempts, successes)

**Frontend:**
- Results shown via notifications
- Integrated in NPC slot interactions

## UI Components Library

### Shared Components (@pixsim7/ui)

**New Components:**
1. **ProgressBar** (`packages/shared/ui/src/ProgressBar.tsx`)
   - Value/max support
   - 7 color variants (blue, green, red, purple, pink, orange, yellow)
   - Optional label and value display
   - Smooth animations

2. **Badge** (enhanced)
   - Added 3 new colors: pink, orange, yellow
   - Total 8 colors available

## Game2D View Integration

**Location:** `apps/main/src/routes/Game2D.tsx`

**Features:**
- Toggle buttons for Relationships, Quests, Inventory
- Panels appear in grid layout
- Scene playback overlay
- Dialogue overlay
- Notification system
- NPC slot interactions
- Hotspot interactions
- World time management
- Location navigation

## Complete Gameplay Loop

### Player Journey:

1. **Explore** → Navigate between locations
2. **Interact** → Click hotspots or NPCs
3. **Dialogue** → Talk to NPCs (opens dialogue UI)
4. **Actions** → Perform interactions (pickpocket, etc.)
5. **Scenes** → Play interactive scenes with choices
6. **Progress** → Choices affect relationships
7. **Track** → View relationships, quests, inventory
8. **Complete** → Finish quest objectives
9. **Collect** → Gain items from scenes/interactions
10. **Advance** → Progress time, trigger events

## Data Flow

```
Scene Choice/Edge Effects
        ↓
GameSession.flags (quests, inventory)
GameSession.relationships (NPC data)
        ↓
Frontend Components Read/Display
        ↓
Player Makes Decisions
        ↓
Backend Updates via API
        ↓
Loop
```

## Testing Checklist

- [ ] Create a game world
- [ ] Create locations with hotspots
- [ ] Add NPCs to locations
- [ ] Configure NPC schedules
- [ ] Set up NPC slot interactions
- [ ] Create a scene with choices
- [ ] Add relationship effects to edges
- [ ] Test dialogue UI with NPCs
- [ ] Test pickpocket interaction
- [ ] Add a quest via API
- [ ] Add items to inventory
- [ ] View relationship dashboard
- [ ] Check quest log
- [ ] Check inventory panel
- [ ] Play scene and make choices
- [ ] Verify relationship changes
- [ ] Verify quest progress updates
- [ ] Verify notifications appear

## API Client

All frontend API functions located in: `apps/main/src/lib/api/game.ts`

Functions include:
- Quest management: `listSessionQuests`, `addQuest`, `updateQuestStatus`, etc.
- Inventory management: `listInventoryItems`, `addInventoryItem`, `removeInventoryItem`, etc.
- Relationship computation: `@pixsim7/game.engine` (`packages/game/engine/src/`)

## UI Enhancement Notes (Non-Canonical)

> The following are planning notes for future UI work, not descriptions of current behavior.

**Areas for enhancement:** visual design, UX flow, animations, layout/responsiveness, game feel, accessibility, mobile, theming.

**Recommended approach:** review systems in action → create design mockups → implement design system → polish interactions → add onboarding.

## File Structure

```
Backend:
- pixsim7/backend/main/services/game/
  - quest.py (QuestService)
  - inventory.py (InventoryService)
- pixsim7/backend/main/api/v1/
  - game_quests.py
  - game_inventory.py
- pixsim7/backend/main/routes/
  - game_quests/
  - game_inventory/
- pixsim7/backend/main/domain/game/stats/
  - relationships_package.py

Frontend:
- apps/main/src/components/game/
  - RelationshipDashboard.tsx
  - QuestLog.tsx
  - DialogueUI.tsx
  - GameNotification.tsx
- apps/main/src/components/game/panels/
  - InventoryPanel.tsx
- packages/game/engine/src/
  - session/ (relationship/session helpers used by frontend via `@pixsim7/game.engine`)
- apps/main/src/routes/
  - Game2D.tsx

UI Package:
- packages/ui/src/
  - ProgressBar.tsx
  - Badge.tsx (enhanced)
```

## Summary

All core gameplay systems are **fully implemented and functional**:
- ✅ Relationships with visual tracking
- ✅ Quests with objective management
- ✅ Inventory with item management
- ✅ NPC dialogue system
- ✅ Notification system
- ✅ Stealth/pickpocket mechanics

The foundation is **solid and ready** for UI/UX enhancement by Opus.
