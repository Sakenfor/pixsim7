/**
 * Settings Modules Index
 *
 * Import this file to register all built-in settings modules.
 * Each module self-registers when imported.
 *
 * ============================================================================
 * SETTINGS ARCHITECTURE
 * ============================================================================
 *
 * There are TWO settings systems that work together:
 *
 * 1. COMPONENT REGISTRY (settingsRegistry)
 *    - Provides sidebar navigation in the Settings panel
 *    - Each module registers: { id, label, icon, component, order }
 *    - The `component` renders when user clicks that settings category
 *
 * 2. SCHEMA REGISTRY (settingsSchemaRegistry)
 *    - Declarative field definitions (toggle, text, number, select, custom)
 *    - Auto-generates UI via DynamicSettingsPanel
 *    - Supports tabs, groups, conditional visibility (showWhen)
 *    - Registered via feature modules (e.g., contextHubModule)
 *
 * ============================================================================
 * THE BRIDGE PATTERN (Recommended for new settings)
 * ============================================================================
 *
 * Modern settings use BOTH systems together:
 *
 * 1. Component module registers in settingsRegistry for sidebar navigation
 * 2. Component renders DynamicSettingsPanel which uses the schema
 * 3. Schema defines the actual settings fields
 *
 * Example (ContextSettings.tsx):
 * ```tsx
 * export function ContextSettings() {
 *   return <DynamicSettingsPanel categoryId="context" />;
 * }
 *
 * settingsRegistry.register({
 *   id: 'context',
 *   label: 'Context',
 *   icon: '🔗',
 *   component: ContextSettings,
 *   order: 60,
 * });
 * ```
 *
 * The schema is registered separately (e.g., in contextHubModule):
 * ```tsx
 * settingsSchemaRegistry.register({
 *   categoryId: 'context',
 *   groups: [...],
 *   useStore: useContextSettingsStore,
 * });
 * ```
 *
 * ============================================================================
 * WHEN TO USE CUSTOM COMPONENTS (Component-Only)
 * ============================================================================
 *
 * Some settings legitimately need custom UI that schemas can't express:
 *
 * - GeneralSettings: Control center selection cards
 * - UnifiedPanelsSettings: Master-detail panel browser (PanelCentricSettings)
 * - PluginsSettings: Plugin cards with family grouping
 * - AnalyzersSettings: Instance management with forms
 * - WidgetPresetsSettings: Preset import/export with modals
 * - ProfilesSettings: Workspace profile manager
 * - DebugSettings: Developer tools
 *
 * For complex custom UI, use schema's `type: 'custom'` field when possible,
 * or implement a full custom component if the UI is significantly different.
 *
 * ============================================================================
 */

// Import all modules to trigger their registration

// Bridge pattern modules (use DynamicSettingsPanel + schema)
import './ContextSettings';
import './GenerationSettings';
import './IconSettings';
import './ThemeSettings';
import './LibrarySettings';
import './NodesSettings';
import './PromptsSettings';
import './TaggingSettings';

// Custom component modules (complex UI that schemas can't express)
import './GeneralSettings';
import './UnifiedPanelsSettings';
import './PluginsSettings';
import './AnalyzersSettings';
import './WidgetPresetsSettings';
import './ProfilesSettings';
import './BackupSettings';
import './DebugSettings';

// Schema registration utilities (not settings modules themselves)
import './UISettings'; // Registers panel settings schema
