/**
 * Settings Modules Index
 *
 * Import this file to register all built-in settings modules.
 * Each module self-registers when imported.
 */

// Import all modules to trigger their registration
import './GeneralSettings';
import './UISettings';
import './UnifiedPanelsSettings'; // Unified panel orchestration settings (replaces old PanelsSettings)
import './PromptsSettings';
import './ProfilesSettings';
import './LibrarySettings'; // Unified library settings (replaces Assets, Media, Gallery)
import './GenerationSettings';
import './PluginsSettings';
import './AnalyzersSettings'; // Analyzer instance management
import './DebugSettings';
import './ContextSettings';
import './WidgetPresetsSettings';
