# Port Configuration DSL

The port configuration system has been refactored into a mini DSL (Domain Specific Language) that makes it easy to define node ports without repeating boilerplate code.

## Benefits

1. **Reduced duplication**: Common patterns are extracted into reusable helpers (~70% code reduction)
2. **Consistency**: All nodes use the same port configuration patterns
3. **Extensibility**: Custom node types can define their own ports via the node type registry
4. **Maintainability**: Changes to port patterns can be made in one place
5. **Type safety**: Strong TypeScript types for node metadata and port definitions
6. **Validation**: Built-in validation for port configurations
7. **No circular dependencies**: DSL helpers are in a separate module

## DSL Helpers

The following helper functions are available. Import them from:
- **Plugin code**: `import { ... } from '@pixsim7/types'` (uses shared types)
- **Frontend code**: `import { ... } from './portConfigDsl'` (pure DSL helpers)
- **Via portConfig**: `import { ... } from './portConfig'` (re-exported for convenience)

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

### `branchWithFallback(successOutput, failureOutput, fallbackOverrides?, inputOverrides?)`

Creates a node with three outputs: success, failure, and a default fallback.

**Use case**: Operations that can succeed, fail, or continue normally (like `generation`)

**Example**:
```typescript
return branchWithFallback(
  { id: 'success', label: 'Success', description: 'Operation succeeded' },
  { id: 'failure', label: 'Failed', description: 'Operation failed' }
);
```

### `customPorts(inputs, outputs)`

Creates a completely custom port configuration for maximum flexibility.

**Use case**: Complex nodes that don't fit standard patterns

**Example**:
```typescript
return customPorts(
  [
    standardInput(),
    standardInput({ id: 'alt', label: 'Alt Input', position: 'left' })
  ],
  [
    standardOutput(),
    standardOutput({ id: 'error', label: 'Error', color: '#ef4444' })
  ]
);
```

### `validatePortConfig(config)`

Validates a port configuration and returns an array of error messages.

**Example**:
```typescript
const config = singleInOut();
const errors = validatePortConfig(config);
if (errors.length > 0) {
  console.error('Invalid port config:', errors);
}
```

Checks for:
- Duplicate port IDs
- Missing required fields (id, label)
- Invalid positions
- Invalid color format (must be #RRGGBB)

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

## Type Safety

The refactored system includes proper TypeScript types for node metadata:

```typescript
// apps/main/src/modules/scene-builder/nodeMetadataTypes.ts

interface ChoiceNodeMetadata {
  choices?: Array<{
    id: string;
    text: string;
    color?: string;
  }>;
}

interface SceneCallNodeMetadata {
  returnPoints?: Array<{
    id: string;
    label?: string;
    color?: string;
    description?: string;
  }>;
}
```

Usage in port configuration:

```typescript
case 'choice': {
  const metadata = node.metadata as ChoiceNodeMetadata | undefined;
  const choices = metadata?.choices || [];
  // ... use choices with type safety
}
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

Another example with the `generation` node:

**Before** (18 lines):
```typescript
case 'generation': {
  const branch = branchOutputs(
    {
      id: 'success',
      label: 'Success',
      description: 'Generation succeeded',
    },
    {
      id: 'failure',
      label: 'Failed',
      description: 'Generation failed',
    }
  );
  return {
    ...branch,
    outputs: [...branch.outputs, standardOutput({ color: '#6b7280' })],
  };
}
```

**After** (8 lines):
```typescript
case 'generation':
  return branchWithFallback(
    { id: 'success', label: 'Success', description: 'Generation succeeded' },
    { id: 'failure', label: 'Failed', description: 'Generation failed' }
  );
```

## Testing

The refactored port configuration maintains the same behavior as before. To verify:

1. Build the frontend to check for TypeScript errors
2. Test each node type in the scene builder to ensure ports render correctly
3. Test connections between nodes to ensure port matching works

## Architecture Improvements

### Separation of Concerns

The DSL is split into separate modules to prevent circular dependencies:

- `portConfigDsl.ts` - Pure DSL helpers (no dependencies)
- `nodeMetadataTypes.ts` - Type definitions for node metadata
- `portConfig.ts` - Integration with node type registry
- `packages/types/nodeTypeRegistry.ts` - Shared types for plugins

### Validation

The `validatePortConfig()` function checks for:
- Duplicate port IDs
- Missing required fields
- Invalid positions (must be top/bottom/left/right)
- Invalid colors (must be #RRGGBB format)

Use it in development/testing to catch configuration errors early.

## Future Enhancements

- **Async port loading**: Support lazy-loaded node types with async port definitions
- **Port types**: Add type checking for connections (e.g., data vs. control flow)
- **Port metadata**: Add more metadata for tooltips, documentation, etc.
- **Visual customization**: Allow more visual customization per port (size, shape, etc.)
- **Port constraints**: Define which ports can connect to which (compatibility rules)
