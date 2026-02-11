/**
 * Template Validation
 *
 * Thin re-export from @pixsim7/game.engine.
 * All pure logic lives in the engine package.
 *
 * @see packages/game/engine/src/intimacy/templateValidation.ts
 */

export {
  validateSceneTemplate,
  validateArcTemplate,
  validateSceneForTemplate,
  validateArcForTemplate,
  type TemplateValidationResult as ValidationResult,
  type SceneTemplate,
  type ArcTemplate,
} from '@pixsim7/game.engine';
