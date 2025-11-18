# 🔌 Plugin Reference

> Auto-generated documentation for all PixSim7 plugin systems

_Last updated: 2025-11-18T06:35:57.539Z_

---

## 📑 Table of Contents

1. [Node Types](#-node-types) - Available scene node types
2. [Node Renderers](#-node-renderers) - Custom visual renderers
3. [Interaction Plugins](#-interaction-plugins) - NPC interaction systems
4. [Session Helpers](#-session-helpers) - Game session manipulation API

---

## 🎯 Node Types

Node types define the building blocks of scenes in PixSim7. Each node represents a discrete unit of gameplay logic.

**Total Registered:** 10 node types

### Quick Reference

| Icon | Name | ID | Category | User Creatable |
|------|------|----|----------|----------------|
| 🎬 | **Video** | `video` | media | ✅ |
| 🔀 | **Choice** | `choice` | flow | ✅ |
| ❓ | **Condition** | `condition` | logic | ✅ |
| 🏁 | **End** | `end` | flow | ✅ |
| 📞 | **Scene Call** | `scene_call` | flow | ✅ |
| 🔙 | **Return** | `return` | flow | ✅ |
| 🤖 | **Generation** | `generation` | custom | ❌ |
| ⚡ | **Action** | `action` | action | ✅ |
| 🎮 | **Mini-Game** | `miniGame` | media | ✅ |
| 📦 | **Group** | `node_group` | custom | ✅ |

### By Category

#### 🎬 MEDIA

##### 🎬 Video (`video`)

Play video/audio media

**Properties:**
```typescript
id: "video"
category: "media"
userCreatable: true
editorComponent: "VideoNodeEditor"
color: "text-blue-700 dark:text-blue-300"
bgColor: "bg-blue-100 dark:bg-blue-900/30"
```

**Default Data:**
```json
{
  "mediaUrl": "",
  "media": [],
  "selection": {
    "kind": "ordered"
  },
  "playback": {
    "kind": "normal"
  }
}
```

**Usage Example:**
```typescript
const videoNode: SceneNode = {
  id: "node_1",
  type: "video",
  data: {
    ...nodeTypeRegistry.get("video").defaultData,
    // Override properties as needed
  },
  transitions: []
};
```

---

##### 🎮 Mini-Game (`miniGame`)

Interactive gameplay segment

**Properties:**
```typescript
id: "miniGame"
category: "media"
userCreatable: true
editorComponent: "MiniGameNodeEditor"
color: "text-green-700 dark:text-green-300"
bgColor: "bg-green-100 dark:bg-green-900/30"
```

**Default Data:**
```json
{
  "mediaUrl": "",
  "media": [],
  "selection": {
    "kind": "ordered"
  },
  "playback": {
    "kind": "normal"
  },
  "metadata": {
    "isMiniGame": true
  }
}
```

**Usage Example:**
```typescript
const miniGameNode: SceneNode = {
  id: "node_1",
  type: "miniGame",
  data: {
    ...nodeTypeRegistry.get("miniGame").defaultData,
    // Override properties as needed
  },
  transitions: []
};
```

---

#### 🔀 FLOW

##### 🔀 Choice (`choice`)

Player makes a choice

**Properties:**
```typescript
id: "choice"
category: "flow"
userCreatable: true
editorComponent: "ChoiceNodeEditor"
color: "text-purple-700 dark:text-purple-300"
bgColor: "bg-purple-100 dark:bg-purple-900/30"
```

**Default Data:**
```json
{
  "choices": []
}
```

**Usage Example:**
```typescript
const choiceNode: SceneNode = {
  id: "node_1",
  type: "choice",
  data: {
    ...nodeTypeRegistry.get("choice").defaultData,
    // Override properties as needed
  },
  transitions: []
};
```

---

##### 🏁 End (`end`)

End scene

**Properties:**
```typescript
id: "end"
category: "flow"
userCreatable: true
editorComponent: "EndNodeEditor"
color: "text-red-700 dark:text-red-300"
bgColor: "bg-red-100 dark:bg-red-900/30"
```

**Default Data:**
```json
{
  "endType": "success",
  "endMessage": ""
}
```

**Usage Example:**
```typescript
const endNode: SceneNode = {
  id: "node_1",
  type: "end",
  data: {
    ...nodeTypeRegistry.get("end").defaultData,
    // Override properties as needed
  },
  transitions: []
};
```

---

##### 📞 Scene Call (`scene_call`)

Call another scene

**Properties:**
```typescript
id: "scene_call"
category: "flow"
userCreatable: true
editorComponent: "SceneCallNodeEditor"
color: "text-cyan-700 dark:text-cyan-300"
bgColor: "bg-cyan-100 dark:bg-cyan-900/30"
```

**Default Data:**
```json
{
  "targetSceneId": "",
  "parameterBindings": {},
  "returnRouting": {}
}
```

**Usage Example:**
```typescript
const scene_callNode: SceneNode = {
  id: "node_1",
  type: "scene_call",
  data: {
    ...nodeTypeRegistry.get("scene_call").defaultData,
    // Override properties as needed
  },
  transitions: []
};
```

---

##### 🔙 Return (`return`)

Return from scene call

**Properties:**
```typescript
id: "return"
category: "flow"
userCreatable: true
editorComponent: "ReturnNodeEditor"
color: "text-orange-700 dark:text-orange-300"
bgColor: "bg-orange-100 dark:bg-orange-900/30"
```

**Default Data:**
```json
{
  "returnPointId": "",
  "returnValues": {}
}
```

**Usage Example:**
```typescript
const returnNode: SceneNode = {
  id: "node_1",
  type: "return",
  data: {
    ...nodeTypeRegistry.get("return").defaultData,
    // Override properties as needed
  },
  transitions: []
};
```

---

#### 🧠 LOGIC

##### ❓ Condition (`condition`)

Branch based on flags

**Properties:**
```typescript
id: "condition"
category: "logic"
userCreatable: true
editorComponent: "ConditionNodeEditor"
color: "text-amber-700 dark:text-amber-300"
bgColor: "bg-amber-100 dark:bg-amber-900/30"
```

**Default Data:**
```json
{
  "condition": {
    "key": "",
    "op": "eq",
    "value": ""
  },
  "trueTargetNodeId": "",
  "falseTargetNodeId": ""
}
```

**Usage Example:**
```typescript
const conditionNode: SceneNode = {
  id: "node_1",
  type: "condition",
  data: {
    ...nodeTypeRegistry.get("condition").defaultData,
    // Override properties as needed
  },
  transitions: []
};
```

---

#### ⚡ ACTION

##### ⚡ Action (`action`)

Trigger actions/effects

**Properties:**
```typescript
id: "action"
category: "action"
userCreatable: true
editorComponent: "ActionNodeEditor"
color: "text-yellow-700 dark:text-yellow-300"
bgColor: "bg-yellow-100 dark:bg-yellow-900/30"
```

**Default Data:**
```json
{
  "effects": []
}
```

**Usage Example:**
```typescript
const actionNode: SceneNode = {
  id: "node_1",
  type: "action",
  data: {
    ...nodeTypeRegistry.get("action").defaultData,
    // Override properties as needed
  },
  transitions: []
};
```

---

#### 🔧 CUSTOM

##### 🤖 Generation (`generation`)

AI content generation

**Properties:**
```typescript
id: "generation"
category: "custom"
userCreatable: false
color: "text-violet-700 dark:text-violet-300"
bgColor: "bg-violet-100 dark:bg-violet-900/30"
```

**Usage Example:**
```typescript
const generationNode: SceneNode = {
  id: "node_1",
  type: "generation",
  data: {
    ...nodeTypeRegistry.get("generation").defaultData,
    // Override properties as needed
  },
  transitions: []
};
```

---

##### 📦 Group (`node_group`)

Visual container for organizing nodes

**Properties:**
```typescript
id: "node_group"
category: "custom"
userCreatable: true
color: "text-neutral-700 dark:text-neutral-300"
bgColor: "bg-neutral-100 dark:bg-neutral-900/30"
```

**Default Data:**
```json
{
  "collapsed": false
}
```

**Usage Example:**
```typescript
const node_groupNode: SceneNode = {
  id: "node_1",
  type: "node_group",
  data: {
    ...nodeTypeRegistry.get("node_group").defaultData,
    // Override properties as needed
  },
  transitions: []
};
```

---

## 🎨 Node Renderers

Node renderers define how nodes are visually displayed in the graph editor. Each renderer is a Svelte component.

**Location:** `frontend/src/lib/graph/`

**Registry:** `nodeRendererRegistry`

### Available Renderers

#### `default` → DefaultNodeRenderer

Fallback renderer for all node types

**Default Size:**
```typescript
{
  "width": 200,
  "height": 120
}
```

**Features:**
- Node icon and name
- Basic info display
- Standard header

**Registration:**
```typescript
nodeRendererRegistry.register({
  nodeType: 'default',
  component: DefaultNodeRenderer,
  defaultSize: {"width":200,"height":120}
});
```

---

#### `video` → VideoNodeRenderer

Displays media nodes with thumbnail and playback info

**Default Size:**
```typescript
{
  "width": 220,
  "height": 180
}
```

**Features:**
- Media thumbnail preview
- Playback mode indicator
- Media selection display

**Registration:**
```typescript
nodeRendererRegistry.register({
  nodeType: 'video',
  component: VideoNodeRenderer,
  defaultSize: {"width":220,"height":180}
});
```

---

#### `choice` → ChoiceNodeRenderer

Shows available player choices

**Default Size:**
```typescript
{
  "width": 200,
  "height": 150
}
```

**Features:**
- Choice list display
- Choice text preview
- Branch indicators

**Registration:**
```typescript
nodeRendererRegistry.register({
  nodeType: 'choice',
  component: ChoiceNodeRenderer,
  defaultSize: {"width":200,"height":150}
});
```

---

#### `miniGame` → VideoNodeRenderer

Reuses video renderer for mini-game nodes

**Default Size:**
```typescript
{
  "width": 220,
  "height": 180
}
```

**Features:**
- Game thumbnail
- Configuration preview

**Registration:**
```typescript
nodeRendererRegistry.register({
  nodeType: 'miniGame',
  component: VideoNodeRenderer,
  defaultSize: {"width":220,"height":180}
});
```

---

### Renderer Interface

```typescript
interface NodeRendererProps {
  node: DraftSceneNode;      // The node being rendered
  isSelected: boolean;       // Whether node is selected
  isStart: boolean;          // Whether this is the start node
  hasErrors: boolean;        // Whether node has validation errors
}

interface NodeRenderer {
  nodeType: string;
  component: ComponentType<NodeRendererProps>;
  defaultSize?: { width: number; height: number };
  customHeader?: boolean;    // Use custom header (default: false)
}
```

## 🤝 Interaction Plugins

Interaction plugins define actions players can take when interacting with NPCs in the game world.

**Location:** `frontend/src/lib/game/interactions/`

**Registry:** `interactionRegistry`

### Built-in Interactions

### 💬 Talk (`talk`)

Start a conversation with the NPC

**Configuration Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `npcId` | number | Optional: Override which NPC to talk to |
| `preferredSceneId` | number | The scene to play when talking to this NPC |

**Default Configuration:**
```json
{
  "enabled": true,
  "npcId": null,
  "preferredSceneId": 42
}
```

**Usage Example:**
```typescript
import { interactionRegistry } from 'frontend/lib/game/interactions';

const result = await executeInteraction('talk', {
  enabled: true,
  npcId: null,
  preferredSceneId: 42,
}, context);

if (result.success) {
  console.log("Interaction succeeded:", result.message);
} else {
  console.error("Interaction failed:", result.message);
}
```

---

### 🤏 Pickpocket (`pickpocket`)

Attempt to steal from the NPC

**Configuration Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `baseSuccessChance` | number (0-1) | Base probability of successful pickpocket |
| `detectionChance` | number (0-1) | Probability of being caught |
| `onSuccessFlags` | tags | Flags to set when pickpocket succeeds |
| `onFailFlags` | tags | Flags to set when pickpocket fails |

**Default Configuration:**
```json
{
  "enabled": true,
  "baseSuccessChance": 0.4,
  "detectionChance": 0.3,
  "onSuccessFlags": [
    "stealth:stole_from_npc"
  ],
  "onFailFlags": [
    "stealth:caught_by_npc"
  ]
}
```

**Usage Example:**
```typescript
import { interactionRegistry } from 'frontend/lib/game/interactions';

const result = await executeInteraction('pickpocket', {
  enabled: true,
  baseSuccessChance: 0.4,
  detectionChance: 0.3,
  onSuccessFlags: ["stealth:stole_from_npc"],
  onFailFlags: ["stealth:caught_by_npc"],
}, context);

if (result.success) {
  console.log("Interaction succeeded:", result.message);
} else {
  console.error("Interaction failed:", result.message);
}
```

---

### 🎁 Give Item (`give_item`)

Offer an item to the NPC

**Configuration Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `itemId` | text | Item ID |
| `requiredRelationship` | number (0-100) | Required Relationship Level |
| `rewardSceneId` | number | Reward Scene (if accepted) |
| `rejectSceneId` | number | Reject Scene (if declined) |

**Default Configuration:**
```json
{
  "enabled": true,
  "itemId": "flower",
  "requiredRelationship": 20,
  "rewardSceneId": 100,
  "rejectSceneId": 101
}
```

**Usage Example:**
```typescript
import { interactionRegistry } from 'frontend/lib/game/interactions';

const result = await executeInteraction('give_item', {
  enabled: true,
  itemId: 'flower',
  requiredRelationship: 20,
  rewardSceneId: 100,
  rejectSceneId: 101,
}, context);

if (result.success) {
  console.log("Interaction succeeded:", result.message);
} else {
  console.error("Interaction failed:", result.message);
}
```

---

### Plugin Interface

```typescript
interface InteractionPlugin<TConfig extends BaseInteractionConfig> {
  id: string;                           // Unique plugin ID
  name: string;                         // Display name
  description: string;                  // Short description
  icon?: string;                        // Emoji or icon
  defaultConfig: TConfig;               // Default configuration
  configFields: FormField[];            // Auto-generates UI forms
  execute: (config: TConfig, context: InteractionContext) => Promise<InteractionResult>;
  validate?: (config: TConfig) => string | null;
  isAvailable?: (context: InteractionContext) => boolean;
}
```

## 🎮 Session Helpers

Session helpers provide a clean API for manipulating game session state with optimistic updates and conflict resolution.

**Location:** `frontend/src/lib/game/interactions/sessionAdapter.ts`

**Pattern:** Factory Function (not a traditional registry)

### Overview

Session helpers are created via the `createSessionHelpers()` factory function, which provides:
- **Optimistic updates** - Changes apply instantly to UI, then validate server-side
- **Conflict resolution** - Automatic handling of version conflicts
- **Rollback on error** - Failed updates restore previous state
- **Type safety** - Full TypeScript support

### Available Helper Functions

| Function | Signature | Description |
|----------|-----------|-------------|
| `getNpcRelationship` | `(npcId: number) => NpcRelationshipState | null` | Get the current relationship state with an NPC |
| `updateNpcRelationship` | `(npcId: number, patch: Partial<NpcRelationshipState>) => Promise<GameSessionDTO>` | Update NPC relationship values |
| `getInventory` | `() => InventoryItem[]` | Get current player inventory |
| `addInventoryItem` | `(itemId: string, quantity?: number) => Promise<GameSessionDTO>` | Add item to player inventory |
| `removeInventoryItem` | `(itemId: string, quantity?: number) => Promise<GameSessionDTO>` | Remove item from player inventory |
| `updateArcStage` | `(arcId: string, stage: number) => Promise<GameSessionDTO>` | Progress story arc to a new stage |
| `markSceneSeen` | `(arcId: string, sceneId: number) => Promise<GameSessionDTO>` | Mark a scene as seen in story tracking |
| `updateQuestStatus` | `(questId: string, status: QuestStatus) => Promise<GameSessionDTO>` | Update quest status (pending/active/completed/failed) |
| `incrementQuestSteps` | `(questId: string, increment?: number) => Promise<GameSessionDTO>` | Increment quest progress steps |
| `triggerEvent` | `(eventId: string) => Promise<GameSessionDTO>` | Trigger a world event |
| `endEvent` | `(eventId: string) => Promise<GameSessionDTO>` | End an active world event |
| `isEventActive` | `(eventId: string) => boolean` | Check if a world event is currently active |

### Detailed Documentation

#### `getNpcRelationship`

Get the current relationship state with an NPC

**Signature:**
```typescript
(npcId: number) => NpcRelationshipState | null
```

**Returns:** NpcRelationshipState object with affinity, trust, romance, friendship

**Example:**
```typescript
const rel = session.getNpcRelationship(42);
```

---

#### `updateNpcRelationship`

Update NPC relationship values

**Signature:**
```typescript
(npcId: number, patch: Partial<NpcRelationshipState>) => Promise<GameSessionDTO>
```

**Returns:** Updated game session

**Example:**
```typescript
await session.updateNpcRelationship(42, { affinity: 50, trust: 30 });
```

---

#### `getInventory`

Get current player inventory

**Signature:**
```typescript
() => InventoryItem[]
```

**Returns:** Array of inventory items

**Example:**
```typescript
const items = session.getInventory();
```

---

#### `addInventoryItem`

Add item to player inventory

**Signature:**
```typescript
(itemId: string, quantity?: number) => Promise<GameSessionDTO>
```

**Returns:** Updated game session

**Example:**
```typescript
await session.addInventoryItem("flower", 1);
```

---

#### `removeInventoryItem`

Remove item from player inventory

**Signature:**
```typescript
(itemId: string, quantity?: number) => Promise<GameSessionDTO>
```

**Returns:** Updated game session

**Example:**
```typescript
await session.removeInventoryItem("flower", 1);
```

---

#### `updateArcStage`

Progress story arc to a new stage

**Signature:**
```typescript
(arcId: string, stage: number) => Promise<GameSessionDTO>
```

**Returns:** Updated game session

**Example:**
```typescript
await session.updateArcStage("main_quest", 3);
```

---

#### `markSceneSeen`

Mark a scene as seen in story tracking

**Signature:**
```typescript
(arcId: string, sceneId: number) => Promise<GameSessionDTO>
```

**Returns:** Updated game session

**Example:**
```typescript
await session.markSceneSeen("main_quest", 42);
```

---

#### `updateQuestStatus`

Update quest status (pending/active/completed/failed)

**Signature:**
```typescript
(questId: string, status: QuestStatus) => Promise<GameSessionDTO>
```

**Returns:** Updated game session

**Example:**
```typescript
await session.updateQuestStatus("find_flower", "completed");
```

---

#### `incrementQuestSteps`

Increment quest progress steps

**Signature:**
```typescript
(questId: string, increment?: number) => Promise<GameSessionDTO>
```

**Returns:** Updated game session

**Example:**
```typescript
await session.incrementQuestSteps("collect_items", 1);
```

---

#### `triggerEvent`

Trigger a world event

**Signature:**
```typescript
(eventId: string) => Promise<GameSessionDTO>
```

**Returns:** Updated game session

**Example:**
```typescript
await session.triggerEvent("festival_started");
```

---

#### `endEvent`

End an active world event

**Signature:**
```typescript
(eventId: string) => Promise<GameSessionDTO>
```

**Returns:** Updated game session

**Example:**
```typescript
await session.endEvent("festival_started");
```

---

#### `isEventActive`

Check if a world event is currently active

**Signature:**
```typescript
(eventId: string) => boolean
```

**Returns:** Boolean indicating event status

**Example:**
```typescript
if (session.isEventActive("festival")) { ... }
```

---

### Factory Function

```typescript
function createSessionHelpers(
  gameSession: GameSessionDTO | null,
  onUpdate?: (session: GameSessionDTO) => void,
  api?: SessionAPI
): SessionHelpers
```

**Usage in Interaction Context:**
```typescript
// Inside an interaction plugin execute method:
async execute(config, context) {
  // Access helpers via context.session
  const rel = context.session.getNpcRelationship(npcId);
  
  // Update with optimistic UI and server validation
  await context.session.updateNpcRelationship(npcId, {
    affinity: rel.affinity + 10
  });
  
  // Add items to inventory
  await context.session.addInventoryItem("reward_token", 1);
  
  return { success: true };
}
```

### Optimistic Update Pattern

Session helpers use optimistic updates for better UX:
1. **Apply locally** - Change reflects in UI immediately
2. **Validate server-side** - Send update to backend
3. **Handle conflicts** - Resolve version mismatches automatically
4. **Rollback on error** - Restore previous state if update fails

```typescript
// Behind the scenes:
async updateNpcRelationship(npcId, patch) {
  // 1. Optimistic update (instant UI)
  const optimistic = applyLocalUpdate(session, patch);
  onUpdate(optimistic);
  
  // 2. Backend validation
  try {
    const response = await api.updateSession(session.id, {
      relationships: patch,
      expectedVersion: session.version
    });
    
    // 3. Handle conflicts
    if (response.conflict) {
      const resolved = resolveConflict(session, response.serverSession);
      return api.updateSession(session.id, resolved);
    }
    
    onUpdate(response);
    return response;
  } catch (err) {
    // 4. Rollback on error
    onUpdate(session);
    throw err;
  }
}
```

---

## 🚀 Adding Your Own Plugins

### Creating a Custom Node Type

```typescript
import { nodeTypeRegistry } from '@pixsim7/types';

nodeTypeRegistry.register({
  id: 'my_custom_node',
  name: 'My Custom Node',
  description: 'Does something amazing',
  icon: '✨',
  category: 'custom',
  userCreatable: true,
  defaultData: {
    // Your default node data
  },
  editorComponent: 'MyCustomNodeEditor',
});
```

### Creating an Interaction Plugin

```typescript
import { interactionRegistry, InteractionPlugin } from 'frontend/lib/game/interactions';

const myPlugin: InteractionPlugin<MyConfig> = {
  id: 'my_interaction',
  name: 'My Interaction',
  description: 'Custom interaction behavior',
  icon: '⚡',
  defaultConfig: { enabled: true },
  configFields: [
    { key: "param", label: "Parameter", type: "text" }
  ],
  async execute(config, context) {
    // Your interaction logic
    return { success: true, message: "Done!" };
  }
};

interactionRegistry.register(myPlugin);
```

### Creating a Custom Renderer

```typescript
import { nodeRendererRegistry } from 'frontend/lib/graph/nodeRendererRegistry';
import MyRenderer from './MyRenderer.svelte';

nodeRendererRegistry.register({
  nodeType: 'my_custom_node',
  component: MyRenderer,
  defaultSize: { width: 200, height: 150 }
});
```

---

_Generated by `packages/game-core/src/utils/generatePluginDocs.ts`_
