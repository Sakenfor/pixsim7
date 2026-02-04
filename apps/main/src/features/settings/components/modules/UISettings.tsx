/**
 * Panel Settings Schema Registration
 *
 * NOTE: This is NOT a settings module - it's a schema registration utility.
 * It registers panel-related settings in the schema registry for use by
 * PanelCentricSettings and other panel-aware components.
 *
 * The actual UI for panel settings is handled by UnifiedPanelsSettings.tsx
 * which uses PanelCentricSettings (a custom master-detail component).
 */
import { registerPanelSettings } from '../../lib/schemas/panel.settings';

// Auto-register schema-based settings when module loads
registerPanelSettings();
