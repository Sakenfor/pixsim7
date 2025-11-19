/**
 * Theme Packs & Sharing
 *
 * Support for bundling and sharing multiple theme presets as packs.
 * Packs can be exported to/imported from JSON files for easy sharing.
 */

import type { WorldUiTheme } from '@pixsim7/types';
import type { WorldUiThemePreset } from './worldUiThemePresets';

/**
 * A collection of theme presets bundled together
 */
export interface ThemePack {
  /** Unique identifier for the pack */
  id: string;
  /** Display name */
  name: string;
  /** Description of the pack */
  description?: string;
  /** Author/creator name */
  author?: string;
  /** Version string */
  version?: string;
  /** Tags for categorization */
  tags?: string[];
  /** Themes included in this pack */
  themes: WorldUiTheme[];
  /** When this pack was created/updated */
  createdAt?: number;
  /** Whether this is a built-in pack */
  isBuiltIn?: boolean;
}

/**
 * Built-in theme packs
 */
export const BUILT_IN_THEME_PACKS: ThemePack[] = [
  {
    id: 'sci-fi-pack',
    name: 'Sci-Fi Pack',
    description: 'Futuristic and cyberpunk themes for sci-fi worlds',
    author: 'PixSim7',
    version: '1.0.0',
    tags: ['sci-fi', 'cyberpunk', 'futuristic'],
    isBuiltIn: true,
    themes: [
      {
        id: 'neo-noir',
        colors: {
          primary: '#00f3ff',
          secondary: '#ff00e5',
          background: '#0a0a0f',
          text: '#e0e0e0',
        },
        density: 'compact',
        motion: 'snappy',
      },
      {
        id: 'cyberpunk',
        colors: {
          primary: '#ff00ff',
          secondary: '#00ffff',
          background: '#1a0033',
          text: '#e0e0ff',
        },
        density: 'compact',
        motion: 'snappy',
      },
      {
        id: 'space-station',
        colors: {
          primary: '#4d9fff',
          secondary: '#ff6b35',
          background: '#0d1117',
          text: '#c9d1d9',
        },
        density: 'comfortable',
        motion: 'calm',
      },
    ],
  },
  {
    id: 'fantasy-pack',
    name: 'Fantasy Pack',
    description: 'Medieval and magical themes for fantasy worlds',
    author: 'PixSim7',
    version: '1.0.0',
    tags: ['fantasy', 'medieval', 'magical'],
    isBuiltIn: true,
    themes: [
      {
        id: 'fantasy-rpg',
        colors: {
          primary: '#d97706',
          secondary: '#059669',
          background: '#1c1917',
          text: '#fef3c7',
        },
        density: 'comfortable',
        motion: 'comfortable',
      },
      {
        id: 'enchanted-forest',
        colors: {
          primary: '#10b981',
          secondary: '#a78bfa',
          background: '#064e3b',
          text: '#d1fae5',
        },
        density: 'comfortable',
        motion: 'calm',
      },
      {
        id: 'dark-castle',
        colors: {
          primary: '#dc2626',
          secondary: '#b45309',
          background: '#18181b',
          text: '#fca5a5',
        },
        density: 'comfortable',
        motion: 'comfortable',
      },
    ],
  },
  {
    id: 'accessibility-pack',
    name: 'Accessibility Pack',
    description: 'Themes optimized for various accessibility needs',
    author: 'PixSim7',
    version: '1.0.0',
    tags: ['accessibility', 'a11y', 'inclusive'],
    isBuiltIn: true,
    themes: [
      {
        id: 'high-contrast',
        colors: {
          primary: '#ffff00',
          secondary: '#00ffff',
          background: '#000000',
          text: '#ffffff',
        },
        density: 'comfortable',
        motion: 'comfortable',
      },
      {
        id: 'reduced-motion',
        colors: {
          primary: '#3b82f6',
          secondary: '#8b5cf6',
          background: '#ffffff',
          text: '#1f2937',
        },
        density: 'comfortable',
        motion: 'none',
      },
      {
        id: 'large-ui',
        colors: {
          primary: '#2563eb',
          secondary: '#7c3aed',
          background: '#f9fafb',
          text: '#111827',
        },
        density: 'spacious',
        motion: 'calm',
      },
      {
        id: 'maximum-accessibility',
        colors: {
          primary: '#ffff00',
          secondary: '#00ffff',
          background: '#000000',
          text: '#ffffff',
        },
        density: 'spacious',
        motion: 'none',
      },
    ],
  },
  {
    id: 'slice-of-life-pack',
    name: 'Slice of Life Pack',
    description: 'Warm and casual themes for everyday life sims',
    author: 'PixSim7',
    version: '1.0.0',
    tags: ['casual', 'cozy', 'everyday'],
    isBuiltIn: true,
    themes: [
      {
        id: 'bright-minimal',
        colors: {
          primary: '#6366f1',
          secondary: '#ec4899',
          background: '#ffffff',
          text: '#1f2937',
        },
        density: 'spacious',
        motion: 'calm',
      },
      {
        id: 'cozy-cafe',
        colors: {
          primary: '#92400e',
          secondary: '#f59e0b',
          background: '#fef3c7',
          text: '#451a03',
        },
        density: 'comfortable',
        motion: 'calm',
      },
      {
        id: 'pastel-dream',
        colors: {
          primary: '#ec4899',
          secondary: '#8b5cf6',
          background: '#fdf2f8',
          text: '#831843',
        },
        density: 'spacious',
        motion: 'calm',
      },
    ],
  },
];

const STORAGE_KEY = 'pixsim7:themePacks';

/**
 * Load custom theme packs from localStorage
 */
export function loadCustomPacks(): ThemePack[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.error('Failed to load custom theme packs', err);
    return [];
  }
}

/**
 * Save custom theme packs to localStorage
 */
function saveCustomPacks(packs: ThemePack[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(packs));
  } catch (err) {
    console.error('Failed to save custom theme packs', err);
  }
}

/**
 * Get all theme packs (built-in + custom)
 */
export function getAllThemePacks(): ThemePack[] {
  const custom = loadCustomPacks();
  return [...BUILT_IN_THEME_PACKS, ...custom];
}

/**
 * Get a theme pack by ID
 */
export function getThemePackById(id: string): ThemePack | undefined {
  return getAllThemePacks().find(pack => pack.id === id);
}

/**
 * Save a custom theme pack
 * Returns true if successful, false if ID already exists
 */
export function saveThemePack(pack: Omit<ThemePack, 'isBuiltIn' | 'createdAt'>): boolean {
  // Check if ID already exists
  const existing = getThemePackById(pack.id);
  if (existing) {
    console.warn(`Theme pack '${pack.id}' already exists`);
    return false;
  }

  const custom = loadCustomPacks();
  const newPack: ThemePack = {
    ...pack,
    createdAt: Date.now(),
    isBuiltIn: false,
  };

  custom.push(newPack);
  saveCustomPacks(custom);
  return true;
}

/**
 * Delete a custom theme pack
 * Returns true if successful, false if pack is built-in or doesn't exist
 */
export function deleteThemePack(id: string): boolean {
  // Don't allow deleting built-in packs
  const builtIn = BUILT_IN_THEME_PACKS.find(p => p.id === id);
  if (builtIn) {
    console.warn(`Cannot delete built-in theme pack '${id}'`);
    return false;
  }

  const custom = loadCustomPacks();
  const filtered = custom.filter(pack => pack.id !== id);

  if (filtered.length === custom.length) {
    console.warn(`Custom theme pack '${id}' not found`);
    return false;
  }

  saveCustomPacks(filtered);
  return true;
}

/**
 * Export a theme pack to JSON string
 */
export function exportThemePack(pack: ThemePack): string {
  const exportData: ThemePack = {
    id: pack.id,
    name: pack.name,
    description: pack.description,
    author: pack.author,
    version: pack.version,
    tags: pack.tags,
    themes: pack.themes,
    createdAt: pack.createdAt,
  };

  return JSON.stringify(exportData, null, 2);
}

/**
 * Import a theme pack from JSON string
 * Returns the imported pack or undefined if invalid
 */
export function importThemePack(jsonString: string): ThemePack | undefined {
  try {
    const parsed = JSON.parse(jsonString);

    // Validate required fields
    if (!parsed.id || !parsed.name || !Array.isArray(parsed.themes)) {
      console.error('Invalid theme pack format');
      return undefined;
    }

    // Ensure themes have required fields
    const validThemes = parsed.themes.filter((theme: any) => theme.id);
    if (validThemes.length === 0) {
      console.error('Theme pack contains no valid themes');
      return undefined;
    }

    return {
      ...parsed,
      themes: validThemes,
      isBuiltIn: false,
    };
  } catch (err) {
    console.error('Failed to parse theme pack JSON', err);
    return undefined;
  }
}

/**
 * Download a theme pack as a JSON file
 */
export function downloadThemePack(pack: ThemePack): void {
  const json = exportThemePack(pack);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = `${pack.id}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Create a theme pack from selected themes
 */
export function createThemePackFromThemes(
  id: string,
  name: string,
  themes: WorldUiTheme[],
  options?: {
    description?: string;
    author?: string;
    version?: string;
    tags?: string[];
  }
): ThemePack {
  return {
    id,
    name,
    themes,
    description: options?.description,
    author: options?.author,
    version: options?.version || '1.0.0',
    tags: options?.tags,
    isBuiltIn: false,
  };
}

/**
 * Clear all custom theme packs (for testing/reset)
 */
export function clearCustomPacks(): void {
  localStorage.removeItem(STORAGE_KEY);
}
