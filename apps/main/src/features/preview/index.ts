// Preview scope system
export { usePreviewScopeStores, PreviewScopeProvider } from "./hooks/usePreviewScope";
export type { PreviewScopeStores } from "./hooks/usePreviewScope";

// Preview settings store
export type {
  PreviewSettingsState,
  PreviewSettingsStore,
  FitMode,
  BackgroundStyle,
} from "./stores/previewSettingsStore";

// Registration
export { registerPreviewScopes } from "./lib/registerPreviewScopes";
