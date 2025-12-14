/**
 * Prompt Companion Plugin
 *
 * Interactive toolbar bundle that injects alongside prompt input surfaces.
 * Provides:
 * - Block breakdown analysis
 * - Variant suggestions
 * - Semantic pack hints
 * - Simple block builder
 *
 * Supports surfaces:
 * - Prompt Lab Analyze tab
 * - Quick Generate panel
 * - Generation Workbench
 */

export { promptCompanionManifest } from './manifest';
export { PromptCompanionPanel } from './components/PromptCompanionPanel';
export { registerPromptCompanion } from './register';
