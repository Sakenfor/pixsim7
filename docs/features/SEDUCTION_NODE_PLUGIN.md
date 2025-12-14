# Seduction Node Plugin

A complete example plugin demonstrating how to create custom scene node types using the NodeTypeRegistry system.

## Overview

The Seduction Node allows scene designers to create multi-stage NPC seduction interactions where players progress through stages (flirting → touching → intimacy) based on NPC affinity levels.

## Features

- **Multi-stage progression**: Define custom stages with unique descriptions and requirements
- **Affinity-based checks**: Each stage requires a minimum NPC affinity level (0-100)
- **Success/failure routing**: Branch to different nodes based on stage outcomes
- **Retry options**: Allow or prevent retries after failure
- **Visual editor**: User-friendly UI for configuring stages and parameters
- **Validation**: Built-in validation ensures affinity requirements are progressive

## File Structure

```
apps/main/src/
├── lib/plugins/
│   └── seductionNode.ts          # Node type definition and registration
└── components/inspector/
    └── SeductionNodeEditor.tsx   # UI editor component
```

## Installation

The seduction node is automatically registered in `App.tsx`:

```typescript
import { registerSeductionNode } from './lib/plugins/seductionNode';

// In app initialization
registerSeductionNode();
```

## Usage in Scene Builder

### 1. Adding a Seduction Node

1. Open the Scene Builder
2. Click "Add Node" in the node palette
3. Select "Seduction" from the custom category (💕 icon)
4. A new seduction node will be added to your scene

### 2. Configuring the Node

Select the seduction node to open the Inspector Panel:

#### Affinity Flag
- **Field**: Affinity Flag
- **Purpose**: Session flag name to check for NPC affinity value
- **Format**: String (e.g., `npc_emma_affinity`)
- **Default**: `npc_affinity`

The game engine will read this flag to determine the NPC's current affinity level (0-100).

#### Retry Option
- **Field**: Allow retry after failure
- **Purpose**: Whether players can retry after failing a stage
- **Default**: `false`

#### Stages Configuration

Each stage has the following properties:

- **Name**: Display name for the stage (e.g., "Flirt", "Kiss", "Intimacy")
- **Description**: What happens during this stage
- **Required Affinity**: Minimum affinity (0-100) needed to succeed
- **Success Message**: Message shown when stage succeeds (optional)
- **Failure Message**: Message shown when stage fails (optional)

**Default stages:**
1. **Flirt** - Required Affinity: 20
2. **Physical Touch** - Required Affinity: 50
3. **Intimacy** - Required Affinity: 80

### 3. Connecting Nodes

Seduction nodes have two output ports:

1. **Success Port** (green): Triggered when all stages complete successfully
2. **Failure Port** (red): Triggered when any stage fails

Connect these ports to other nodes to define the branching logic.

### 4. Runtime Behavior

When a seduction node executes:

1. Gets the current stage (starts at stage 0)
2. Reads NPC affinity from the specified flag
3. Checks if affinity meets the stage requirement
4. **If success:**
   - Shows success message (if defined)
   - Advances to next stage
   - If all stages complete, routes to success path
5. **If failure:**
   - Shows failure message (if defined)
   - Routes to failure path

## Example Scene

Here's a complete example of a seduction scene:

```
[Start Node]
    ↓
[Set Emma's Affinity: 60]  ← Action node setting emma_affinity = 60
    ↓
[Seduce Emma]  ← Seduction node
    ↓               ↓
 Success         Failure
    ↓               ↓
[Romance Scene]  [Rejection Scene]
    ↓               ↓
  [End]           [End]
```

### Configuration for "Seduce Emma" Node:

- **Affinity Flag**: `emma_affinity`
- **Allow Retry**: `false`
- **Stages**:
  1. Flirt (req: 20)
  2. Kiss (req: 50)
  3. Intimacy (req: 80)

With `emma_affinity = 60`:
- ✅ Stage 1 (Flirt) - Success (60 ≥ 20)
- ✅ Stage 2 (Kiss) - Success (60 ≥ 50)
- ❌ Stage 3 (Intimacy) - Failure (60 < 80)
- Result: Routes to **Rejection Scene**

## Creating Custom Stages

You can customize stages for different scenarios:

### Example 1: Gentle Seduction
```
Stages:
1. Eye Contact (req: 10)
2. Compliment (req: 25)
3. Hand Holding (req: 40)
4. Hug (req: 60)
5. Kiss (req: 80)
```

### Example 2: Aggressive Approach
```
Stages:
1. Direct Flirt (req: 40)
2. Physical Touch (req: 70)
3. Intimacy (req: 90)
```

### Example 3: Slow Build
```
Stages:
1. Small Talk (req: 5)
2. Friendly Conversation (req: 15)
3. Personal Topics (req: 30)
4. Light Flirting (req: 50)
5. Kiss (req: 75)
6. Intimacy (req: 95)
```

## Integration with Game Engine

To implement seduction node execution in your game engine:

```typescript
function executeSeductionNode(
  node: SceneNode,
  sessionFlags: Record<string, any>
): string {
  const config = node.metadata.seductionConfig as SeductionNodeData;

  // Get current stage
  const currentStageIndex = config.currentStage || 0;
  const stage = config.stages[currentStageIndex];

  // Get NPC affinity from session flags
  const affinity = sessionFlags[config.affinityCheckFlag || 'npc_affinity'] || 0;

  // Check if affinity meets requirement
  if (affinity >= stage.requiredAffinity) {
    // Success!
    if (stage.successMessage) {
      showMessage(stage.successMessage);
    }

    // Check if this was the final stage
    if (currentStageIndex + 1 >= config.stages.length) {
      // All stages complete - route to success
      return config.successTargetNodeId || node.edges[0]?.targetId;
    } else {
      // Move to next stage
      config.currentStage = currentStageIndex + 1;
      // Could return this node ID to loop, or route to next stage node
      return node.id; // Loop back for next stage
    }
  } else {
    // Failure
    if (stage.failureMessage) {
      showMessage(stage.failureMessage);
    }

    // Route to failure path
    return config.failureTargetNodeId || node.edges[1]?.targetId;
  }
}
```

## Plugin Architecture

This plugin demonstrates the NodeTypeRegistry pattern:

### 1. Type Definition (`seductionNode.ts`)

```typescript
export interface SeductionNodeData {
  stages: SeductionStage[];
  currentStage?: number;
  affinityCheckFlag?: string;
  // ... etc
}
```

### 2. Registration

```typescript
nodeTypeRegistry.register<SeductionNodeData>({
  id: 'seduction',
  name: 'Seduction',
  defaultData: { /* ... */ },
  editorComponent: 'SeductionNodeEditor',
  validate: (data) => { /* ... */ },
});
```

### 3. Editor Component (`SeductionNodeEditor.tsx`)

React component that provides the configuration UI in the Inspector Panel.

## Creating Your Own Plugins

Use this plugin as a template for creating other custom node types:

### Similar Use Cases

1. **Interrogation Node** - Multi-stage questioning with trust checks
2. **Persuasion Node** - Progressive arguments with logic checks
3. **Combat Node** - Multiple rounds with health/skill checks
4. **Negotiation Node** - Offers with charisma checks
5. **Puzzle Node** - Multiple steps with intelligence checks

### Plugin Checklist

- [ ] Define data interface (like `SeductionNodeData`)
- [ ] Set default values
- [ ] Register with `nodeTypeRegistry.register()`
- [ ] Create editor component
- [ ] Add editor to `InspectorPanel.tsx`
- [ ] Register in `App.tsx`
- [ ] Write documentation
- [ ] Test in scene builder

## Best Practices

1. **Progressive Requirements**: Ensure later stages have higher requirements
2. **Meaningful Messages**: Write clear success/failure messages for player feedback
3. **Balance**: Test with different affinity values to ensure balance
4. **Visual Feedback**: Consider adding video nodes between stages for visual variety
5. **Error Handling**: Always define both success and failure paths
6. **Testing**: Test edge cases (affinity = 0, 50, 100)

## Troubleshooting

### Node doesn't appear in scene builder
- Ensure `registerSeductionNode()` is called in `App.tsx`
- Check browser console for registration errors
- Verify `userCreatable: true` in node definition

### Editor doesn't show in Inspector
- Verify `SeductionNodeEditor` is imported in `InspectorPanel.tsx`
- Check it's added to `EDITOR_COMPONENTS` map
- Look for TypeScript/runtime errors in console

### Validation errors
- Ensure affinity requirements are progressive (increasing)
- Check that all required fields are filled
- Verify affinity values are between 0-100

## Future Enhancements

Potential improvements to this plugin:

- [ ] Visual stage progress indicator in node renderer
- [ ] Stage-specific icons
- [ ] Audio/SFX configuration per stage
- [ ] Conditional stage skipping
- [ ] Dynamic stage generation based on NPC personality
- [ ] Stage timing/cooldowns
- [ ] Multiple affinity checks (e.g., charisma + attractiveness)

## License

This plugin is part of the Pixsim7 project and follows the same license.

## Contributing

To improve this plugin or create new ones:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## Support

For questions or issues:
- Check the main documentation at `/docs/`
- Review `DYNAMIC_NODE_TYPES.md` for plugin system details
- Open an issue on GitHub
