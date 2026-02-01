/**
 * Interaction Plugin Types
 *
 * Re-exports from @pixsim7/game.engine for backward compatibility.
 * New code should import directly from @pixsim7/game.engine.
 *
 * @deprecated Import from '@pixsim7/game.engine' instead
 */

export {
  // Types
  type BaseInteractionConfig,
  type FormFieldType,
  type FormField,
  type SessionHelpers,
  type InteractionContext,
  type InteractionState,
  type SessionUpdateResponse,
  type SessionAPI,
  type InteractionAPI,
  type PickpocketRequest,
  type PickpocketResult,
  type InteractionResult,
  type ConfigField,
  type ConfigSchema,
  type InteractionUIMode,
  type InteractionCapabilities,
  type InteractionPlugin,
  type InteractionRegistryOptions,
  // Classes
  InteractionRegistry,
  // Instances
  interactionRegistry,
  // Functions
  executeInteraction,
} from '@pixsim7/game.engine';
