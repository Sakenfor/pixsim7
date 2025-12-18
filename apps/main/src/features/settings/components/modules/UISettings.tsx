/**
 * UI Settings Module
 *
 * Visual and interaction settings for the application UI.
 * Uses schema-driven settings system with auto-registration.
 *
 * NOTE: This module no longer registers itself as a separate settings category.
 * UI settings are now integrated into individual panels under the Panels category.
 * We keep this file to ensure the schemas are registered.
 */
import { registerUISettings } from '../../lib/schemas/ui.settings';

// Auto-register schema-based settings when module loads
// (Schemas are still needed for the PanelCentricSettings component)
registerUISettings();
