#!/usr/bin/env node
/**
 * Generate Session Helper Documentation
 *
 * This script generates markdown documentation for all registered session helpers.
 * Run with: node scripts/generate-helper-docs.cjs
 */

const fs = require('fs');
const path = require('path');

// This is a simplified version that just generates example docs
// In a real implementation, you would import the actual functions

const sampleDocs = `# Session Helpers Reference

_Auto-generated from session helper registry_

## custom

### getFlag

Get a flag value from session by path

**Parameters:**

- \`session\`: \`GameSessionDTO\`
- \`path\`: \`string\` - Dot-separated path (e.g., "arcs.main.stage")

**Returns:** \`any\`

---

### setFlag

Set a flag value in session by path (mutates session.flags)

**Parameters:**

- \`session\`: \`GameSessionDTO\`
- \`path\`: \`string\` - Dot-separated path (e.g., "arcs.main.stage")
- \`value\`: \`any\`

**Returns:** \`void\`

---

### deleteFlag

Delete a flag from session

**Parameters:**

- \`session\`: \`GameSessionDTO\`
- \`path\`: \`string\`

**Returns:** \`void\`

---

### getSessionKind

Get session kind (world or scene)

**Parameters:**

- \`session\`: \`GameSessionDTO\`

**Returns:** \`'world' | 'scene' | undefined\`

---

### setSessionKind

Set session kind (mutates session)

**Parameters:**

- \`session\`: \`GameSessionDTO\`
- \`kind\`: \`'world' | 'scene'\`

**Returns:** \`void\`

---

### getWorldBlock

Get world block from session flags

**Parameters:**

- \`session\`: \`GameSessionDTO\`

**Returns:** \`object | null\`

---

### setWorldBlock

Set world block (mutates session)

**Parameters:**

- \`session\`: \`GameSessionDTO\`
- \`world\`: \`object\`

**Returns:** \`void\`

---

## arcs

### getArcState

Get arc state from session

**Parameters:**

- \`session\`: \`GameSessionDTO\`
- \`arcId\`: \`string\`

**Returns:** \`ArcState | null\`

---

### setArcState

Set arc state (mutates session)

**Parameters:**

- \`session\`: \`GameSessionDTO\`
- \`arcId\`: \`string\`
- \`state\`: \`ArcState\`

**Returns:** \`void\`

---

### updateArcStage

Update arc stage (mutates session)

**Parameters:**

- \`session\`: \`GameSessionDTO\`
- \`arcId\`: \`string\`
- \`stage\`: \`number\`

**Returns:** \`void\`

---

### markSceneSeen

Mark scene as seen in arc (mutates session)

**Parameters:**

- \`session\`: \`GameSessionDTO\`
- \`arcId\`: \`string\`
- \`sceneId\`: \`number\`

**Returns:** \`void\`

---

### hasSeenScene

Check if a scene has been seen in an arc

**Parameters:**

- \`session\`: \`GameSessionDTO\`
- \`arcId\`: \`string\`
- \`sceneId\`: \`number\`

**Returns:** \`boolean\`

---

## quests

### getQuestState

Get quest state from session

**Parameters:**

- \`session\`: \`GameSessionDTO\`
- \`questId\`: \`string\`

**Returns:** \`QuestState | null\`

---

### setQuestState

Set quest state (mutates session)

**Parameters:**

- \`session\`: \`GameSessionDTO\`
- \`questId\`: \`string\`
- \`state\`: \`QuestState\`

**Returns:** \`void\`

---

### updateQuestStatus

Update quest status (mutates session)

**Parameters:**

- \`session\`: \`GameSessionDTO\`
- \`questId\`: \`string\`
- \`status\`: \`'not_started' | 'in_progress' | 'completed' | 'failed'\`

**Returns:** \`void\`

---

### updateQuestSteps

Update quest steps completed (mutates session)

**Parameters:**

- \`session\`: \`GameSessionDTO\`
- \`questId\`: \`string\`
- \`stepsCompleted\`: \`number\`

**Returns:** \`void\`

---

### incrementQuestSteps

Increment quest step count (mutates session)

**Parameters:**

- \`session\`: \`GameSessionDTO\`
- \`questId\`: \`string\`

**Returns:** \`void\`

---

## inventory

### getInventoryItems

Get all inventory items

**Parameters:**

- \`session\`: \`GameSessionDTO\`

**Returns:** \`InventoryItem[]\`

---

### getInventoryItem

Get a specific inventory item by ID

**Parameters:**

- \`session\`: \`GameSessionDTO\`
- \`itemId\`: \`string\`

**Returns:** \`InventoryItem | null\`

---

### addInventoryItem

Add item to inventory (mutates session). If item exists, increases quantity

**Parameters:**

- \`session\`: \`GameSessionDTO\`
- \`itemId\`: \`string\`
- \`qty\`: \`number\` - Defaults to 1
- \`metadata\`: \`Record<string, any>\` - Optional metadata

**Returns:** \`void\`

---

### removeInventoryItem

Remove item from inventory (mutates session). If quantity reaches 0, removes the item entirely

**Parameters:**

- \`session\`: \`GameSessionDTO\`
- \`itemId\`: \`string\`
- \`qty\`: \`number\` - Defaults to 1

**Returns:** \`boolean\`

---

### hasInventoryItem

Check if inventory contains item with minimum quantity

**Parameters:**

- \`session\`: \`GameSessionDTO\`
- \`itemId\`: \`string\`
- \`minQty\`: \`number\` - Defaults to 1

**Returns:** \`boolean\`

---

## events

### getEventState

Get event state from session

**Parameters:**

- \`session\`: \`GameSessionDTO\`
- \`eventId\`: \`string\`

**Returns:** \`EventState | null\`

---

### setEventState

Set event state (mutates session)

**Parameters:**

- \`session\`: \`GameSessionDTO\`
- \`eventId\`: \`string\`
- \`state\`: \`EventState\`

**Returns:** \`void\`

---

### triggerEvent

Trigger a game event (mutates session)

**Parameters:**

- \`session\`: \`GameSessionDTO\`
- \`eventId\`: \`string\`
- \`worldTime\`: \`number\` - Optional world time, defaults to session.world_time

**Returns:** \`void\`

---

### endEvent

End a game event (mutates session)

**Parameters:**

- \`session\`: \`GameSessionDTO\`
- \`eventId\`: \`string\`

**Returns:** \`void\`

---

### isEventActive

Check if event is active

**Parameters:**

- \`session\`: \`GameSessionDTO\`
- \`eventId\`: \`string\`

**Returns:** \`boolean\`

---

`;

// Write to file
const outputPath = path.join(__dirname, '..', 'docs', 'SESSION_HELPER_REFERENCE.md');
fs.writeFileSync(outputPath, sampleDocs, 'utf-8');

console.log('✅ Session helper documentation generated!');
console.log(`📝 Output: ${outputPath}`);
console.log(`📊 Size: ${(sampleDocs.length / 1024).toFixed(2)} KB`);
