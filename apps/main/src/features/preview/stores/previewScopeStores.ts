import {
  createPreviewSettingsStore,
  type PreviewSettingsStoreHook,
} from "./previewSettingsStore";

const previewStores = new Map<string, PreviewSettingsStoreHook>();

function getStorageKey(scopeId: string) {
  return `preview_settings:${scopeId}`;
}

export function getPreviewSettingsStore(scopeId: string): PreviewSettingsStoreHook {
  const existing = previewStores.get(scopeId);
  if (existing) return existing;

  const store = createPreviewSettingsStore(getStorageKey(scopeId));
  previewStores.set(scopeId, store);
  return store;
}
