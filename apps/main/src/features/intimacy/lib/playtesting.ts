/**
 * Playtesting Tools for Progression Arcs
 *
 * Thin re-export from @pixsim7/game.engine.
 * All pure logic lives in the engine package.
 *
 * @see packages/game/engine/src/intimacy/playtesting.ts
 */

export {
  startPlaytestSession,
  advanceStage,
  adjustState,
  resetPlaytest,
  autoPlay,
  analyzePlaytest,
  getPlaytestPreset,
  getPlaytestPresetList,
  exportPlaytestSession,
  importPlaytestSession,
  PLAYTEST_PRESETS,
  type PlaytestConfig,
  type PlaytestStep,
  type PlaytestSession,
  type PlaytestAnalysis,
  type PlaytestPresetKey,
} from '@pixsim7/game.engine';
