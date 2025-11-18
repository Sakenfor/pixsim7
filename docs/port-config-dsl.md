# Port Configuration DSL

The port configuration system has been refactored into a mini DSL (Domain Specific Language) that makes it easy to define node ports without repeating boilerplate code.

## Benefits

1. **Reduced duplication**: Common patterns are extracted into reusable helpers
2. **Consistency**: All nodes use the same port configuration patterns
3. **Extensibility**: Custom node types can define their own ports via the node type registry
4. **Maintainability**: Changes to port patterns can be made in one place

## DSL Helpers

The following helper functions are available in `frontend/src/modules/scene-builder/portConfig.ts`:

### `singleInOut(inputOverrides?, outputOverrides?)`

Creates a simple passthrough node with one input at the top and one output at the bottom.

**Use case**: Sequential nodes like `video`, `node_group`

**Example**:
```typescript
return singleInOut();
// or with custom labels
return singleInOut(undefined, { label: 'Continue', description: 'Go to next node' });
```

### `branchOutputs(trueOutput, falseOutput, inputOverrides?)`

Creates a branch node with two conditional outputs on the right side.

**Use case**: Binary decision nodes like `condition`

**Example**:
```typescript
return branchOutputs(
  { id: 'true', label: 'True', description: 'Condition is true' },
  { id: 'false', label: 'False', description: 'Condition is false' }
);
```

### `multiChoiceOutputs(choices, options?)`

Creates a node with dynamic outputs based on an array of choices.

**Use case**: Nodes with multiple outputs like `choice`, `scene_call`

**Example**:
```typescript
return multiChoiceOutputs([
  { id: 'opt1', label: 'Option 1', color: '#ff0000' },
  { id: 'opt2', label: 'Option 2', color: '#00ff00' },
  { id: 'opt3', label: 'Option 3', color: '#0000ff' }
]);
```

### `terminalNode(inputOverrides?)`

Creates a terminal node with one input and no outputs.

**Use case**: End nodes like `end`, `return`

**Example**:
```typescript
return terminalNode();
```

### `standardInput(overrides?)` and `standardOutput(overrides?)`

Creates individual port definitions with standard defaults.

**Example**:
```typescript
const myInput = standardInput({ label: 'Start', color: '#ff0000' });
const myOutput = standardOutput({ id: 'result', label: 'Result' });
```

## Custom Node Type Ports

Custom node types can now define their ports via the `NodeTypeDefinition`:

### Static Ports

Define ports that don't change based on node data:

```typescript
import { nodeTypeRegistry } from '@pixsim7/types';

nodeTypeRegistry.register({
  id: 'my_custom_node',
  name: 'My Custom Node',
  defaultData: {},
  ports: {
    inputs: [
      { id: 'input', label: 'In', position: 'top', color: '#3b82f6' }
    ],
    outputs: [
      { id: 'success', label: 'Success', position: 'right', color: '#10b981' },
      { id: 'failure', label: 'Failure', position: 'right', color: '#ef4444' }
    ]
  }
});
```

### Dynamic Ports

Define ports that change based on node data using the DSL helpers:

```typescript
import { nodeTypeRegistry } from '@pixsim7/types';
import { branchOutputs, multiChoiceOutputs } from '@pixsim7/frontend/portConfig';

nodeTypeRegistry.register({
  id: 'dynamic_choice_node',
  name: 'Dynamic Choice Node',
  defaultData: { options: [] },
  ports: {
    dynamic: (node) => {
      const options = node.metadata?.options || [];

      if (options.length === 0) {
        // Default to binary choice
        return branchOutputs(
          { id: 'yes', label: 'Yes' },
          { id: 'no', label: 'No' }
        );
      }

      // Multi-choice based on options
      return multiChoiceOutputs(
        options.map((opt, i) => ({
          id: opt.id || `option_${i}`,
          label: opt.label || `Option ${i + 1}`,
          color: opt.color
        }))
      );
    }
  }
});
```

## Migration from Old Switch Statement

The old switch statement has been refactored to use the DSL helpers:

**Before**:
```typescript
case 'video':
  return {
    inputs: [
      {
        id: 'input',
        label: 'In',
        type: 'input',
        position: 'top',
        color: '#3b82f6',
      },
    ],
    outputs: [
      {
        id: 'default',
        label: 'Next',
        type: 'output',
        position: 'bottom',
        color: '#10b981',
        description: 'Continue to next node',
      },
    ],
  };
```

**After**:
```typescript
case 'video':
  return singleInOut(
    undefined,
    { description: 'Continue to next node' }
  );
```

## Testing

The refactored port configuration maintains the same behavior as before. To verify:

1. Build the frontend to check for TypeScript errors
2. Test each node type in the scene builder to ensure ports render correctly
3. Test connections between nodes to ensure port matching works

## Future Enhancements

- **Port validation**: Add validation rules for required connections
- **Port types**: Add type checking for connections (e.g., data vs. control flow)
- **Port metadata**: Add more metadata for tooltips, documentation, etc.
- **Visual customization**: Allow more visual customization per port (size, shape, etc.)
