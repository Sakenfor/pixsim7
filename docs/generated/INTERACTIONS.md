# Interaction Registry Reference

*Auto-generated documentation for all registered interaction plugins*

**Last Updated:** 2025-11-18T08:18:24.651Z

---

## Overview

The Interaction Registry manages all interaction plugins available in the game engine.

Each interaction plugin defines:
- **ID**: Unique identifier
- **Name**: Display name
- **Description**: What the interaction does
- **Icon**: Visual identifier (emoji or icon name)
- **Config Fields**: Form fields for configuration
- **Execute Function**: Business logic
- **Validation**: Optional validation logic
- **Availability**: Optional conditional availability

## Plugin Structure

```typescript
interface InteractionPlugin<TConfig extends BaseInteractionConfig> {
  id: string;
  name: string;
  description: string;
  icon?: string;
  defaultConfig: TConfig;
  configFields: FormField[];
  execute: (config: TConfig, context: InteractionContext) => Promise<InteractionResult>;
  validate?: (config: TConfig) => string | null;
  isAvailable?: (context: InteractionContext) => boolean;
}
```

## Registered Interactions

*Note: Interaction registry documentation requires runtime access to the frontend environment.*
*To view registered interactions, start the development server and inspect the registry at runtime.*

**Registry Location:** `frontend/src/lib/game/interactions/types.ts`

**Global Instance:** `interactionRegistry`

### Example Interaction Plugins

The following interaction types are typically available:

- **pickpocket** - Attempt to steal items from NPCs
- **persuade** - Convince NPCs through dialogue
- **intimidate** - Use threats to influence behavior
- **bribe** - Offer money or items for cooperation
- **seduce** - Use charm and attraction
- **deceive** - Mislead through lies and trickery

### Creating Custom Interactions

To create a custom interaction plugin:

```typescript
import { interactionRegistry } from '@/lib/game/interactions/types';

interactionRegistry.register({
  id: 'my-custom-interaction',
  name: 'My Custom Interaction',
  description: 'Does something interesting',
  icon: '✨',
  defaultConfig: { enabled: true },
  configFields: [
    {
      key: 'enabled',
      label: 'Enabled',
      type: 'boolean',
      description: 'Enable this interaction'
    }
  ],
  execute: async (config, context) => {
    // Your interaction logic here
    return { success: true, message: 'Interaction completed!' };
  }
});
```

---

*For runtime documentation of registered interactions, use the developer console:*
```javascript
import { interactionRegistry } from '@/lib/game/interactions/types';
console.log(interactionRegistry.getAll());
```
