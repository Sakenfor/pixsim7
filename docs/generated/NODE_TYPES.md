# Node Type Registry Reference

*Auto-generated documentation for all registered node types*

**Last Updated:** 2025-11-18T08:18:24.649Z

**Total Node Types:** 10

---

## Table of Contents

- [Media](#media)
- [Flow](#flow)
- [Logic](#logic)
- [Action](#action)
- [Custom](#custom)

---

## Media

### 🎬 Video

**ID:** `video`

**Description:** Play video/audio media

**Category:** `media`

**User Creatable:** ✅ Yes

**Color:** `text-blue-700 dark:text-blue-300`

**Background Color:** `bg-blue-100 dark:bg-blue-900/30`

**Default Data Fields:**

```typescript
mediaUrl
media
selection
playback
```

**Editor Component:** `VideoNodeEditor`

---

### 🎮 Mini-Game

**ID:** `miniGame`

**Description:** Interactive gameplay segment

**Category:** `media`

**User Creatable:** ✅ Yes

**Color:** `text-green-700 dark:text-green-300`

**Background Color:** `bg-green-100 dark:bg-green-900/30`

**Default Data Fields:**

```typescript
mediaUrl
media
selection
playback
metadata
```

**Editor Component:** `MiniGameNodeEditor`

---

## Flow

### 🔀 Choice

**ID:** `choice`

**Description:** Player makes a choice

**Category:** `flow`

**User Creatable:** ✅ Yes

**Color:** `text-purple-700 dark:text-purple-300`

**Background Color:** `bg-purple-100 dark:bg-purple-900/30`

**Default Data Fields:**

```typescript
choices
```

**Editor Component:** `ChoiceNodeEditor`

---

### 🏁 End

**ID:** `end`

**Description:** End scene

**Category:** `flow`

**User Creatable:** ✅ Yes

**Color:** `text-red-700 dark:text-red-300`

**Background Color:** `bg-red-100 dark:bg-red-900/30`

**Default Data Fields:**

```typescript
endType
endMessage
```

**Editor Component:** `EndNodeEditor`

---

### 📞 Scene Call

**ID:** `scene_call`

**Description:** Call another scene

**Category:** `flow`

**User Creatable:** ✅ Yes

**Color:** `text-cyan-700 dark:text-cyan-300`

**Background Color:** `bg-cyan-100 dark:bg-cyan-900/30`

**Default Data Fields:**

```typescript
targetSceneId
parameterBindings
returnRouting
```

**Editor Component:** `SceneCallNodeEditor`

---

### 🔙 Return

**ID:** `return`

**Description:** Return from scene call

**Category:** `flow`

**User Creatable:** ✅ Yes

**Color:** `text-orange-700 dark:text-orange-300`

**Background Color:** `bg-orange-100 dark:bg-orange-900/30`

**Default Data Fields:**

```typescript
returnPointId
returnValues
```

**Editor Component:** `ReturnNodeEditor`

---

## Logic

### ❓ Condition

**ID:** `condition`

**Description:** Branch based on flags

**Category:** `logic`

**User Creatable:** ✅ Yes

**Color:** `text-amber-700 dark:text-amber-300`

**Background Color:** `bg-amber-100 dark:bg-amber-900/30`

**Default Data Fields:**

```typescript
condition
trueTargetNodeId
falseTargetNodeId
```

**Editor Component:** `ConditionNodeEditor`

---

## Action

### ⚡ Action

**ID:** `action`

**Description:** Trigger actions/effects

**Category:** `action`

**User Creatable:** ✅ Yes

**Color:** `text-yellow-700 dark:text-yellow-300`

**Background Color:** `bg-yellow-100 dark:bg-yellow-900/30`

**Default Data Fields:**

```typescript
effects
```

**Editor Component:** `ActionNodeEditor`

---

## Custom

### 🤖 Generation

**ID:** `generation`

**Description:** AI content generation

**Category:** `custom`

**User Creatable:** ❌ No

**Color:** `text-violet-700 dark:text-violet-300`

**Background Color:** `bg-violet-100 dark:bg-violet-900/30`

---

### 📦 Group

**ID:** `node_group`

**Description:** Visual container for organizing nodes

**Category:** `custom`

**User Creatable:** ✅ Yes

**Color:** `text-neutral-700 dark:text-neutral-300`

**Background Color:** `bg-neutral-100 dark:bg-neutral-900/30`

**Default Data Fields:**

```typescript
collapsed
```

---

