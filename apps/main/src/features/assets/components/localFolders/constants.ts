export const CONTENT_SCROLL_BY_SCOPE_KEY = 'ps7_localFolders_content_scroll_by_scope';
export const GROUP_MODE_KEY = 'ps7_localFolders_group_mode';
export const FILTER_STATE_KEY = 'ps7_localFolders_filter_state';
export const ALL_ASSETS_SCROLL_SCOPE = '__all__';
export const SUBFOLDER_VALUE_SEPARATOR = '::';
export const ROOT_SUBFOLDER_VALUE = '__root__';
export const LOCAL_MEDIA_CARD_PRESET = 'media-card-local-folders';

export type ContentScrollByScope = Record<string, number>;
export type UploadFilterState = 'uploaded' | 'uploading' | 'failed' | 'pending';
export type HashFilterState = 'duplicate' | 'unique' | 'hashing' | 'unhashed';
export type LocalGroupMode = 'none' | 'folder' | 'subfolder';

export const GROUP_MODE_OPTIONS: Array<{ value: LocalGroupMode; label: string }> = [
  { value: 'none', label: 'None' },
  { value: 'folder', label: 'Folder' },
  { value: 'subfolder', label: 'Subfolder' },
];
