/**
 * Panel Settings Module
 *
 * Registers schema-based settings used by panel definitions.
 * UI settings are integrated into panel settings sections under the Panels category.
 */
import { registerPanelSettings } from '../../lib/schemas/panel.settings';

// Auto-register schema-based settings when module loads
registerPanelSettings();
