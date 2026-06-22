/**
 * Panel Skin Registry
 *
 * A *skin* is a named, scoped override of the CSS-variable token set
 * (`--color-surface*`, `--color-text*`, `--color-border*`, `--color-accent*`,
 * `--success/--warning/--error/--info`) plus an optional font + CRT effects.
 * It is applied to a single panel subtree via a `.skin-<id>` class — the same
 * mechanism the Tailwind preset uses for `.dark` / `.accent-*`, but scoped
 * instead of global. See plan `panel-skin-theming`.
 *
 * This module is the single source of truth: the CSS is generated from these
 * descriptors at runtime (see `skinStyles.ts`) and the settings tab + context
 * menu enumerate from here, so adding a skin is data-only.
 *
 * Token values are bare `R G B` triplets to match the preset's
 * `rgb(var(--token) / <alpha-value>)` consumption form.
 */

export type SkinId =
  | 'default'
  | 'terminal'
  | 'paper'
  | 'solarized'
  | 'nord'
  | 'synthwave'
  | 'azure'
  | 'crt';

/** CSS custom-property map (token name → value). */
export type SkinVars = Record<string, string>;

export interface SkinEffects {
  /** Faint CRT scanline overlay (animated; gated by reduced-motion). */
  scanline?: boolean;
  /** Phosphor text-glow on the subtree. */
  glow?: boolean;
}

export interface PanelSkin {
  id: SkinId;
  label: string;
  /** One-line description for pickers. */
  blurb?: string;
  /**
   * Base token overrides. Empty for `default` (inherits the global theme so
   * light/dark + accent still flow through).
   */
  vars: SkinVars;
  /** Font stack applied to the subtree via `--font-skin`. Omit to keep panel fonts. */
  fontStack?: string;
  /**
   * Scheme-independent variants that *replace* the light/dark axis for this
   * skin (locked decision: terminal exposes phosphor variants, not light/dark).
   * Variant vars are layered on top of `vars`.
   */
  variants?: Record<string, { label: string; vars: SkinVars }>;
  /** Whether this skin supports the optional CRT effects (scanline / glow). */
  supportsEffects?: boolean;
}

const MONO_FONT =
  '"JetBrains Mono", "Cascadia Mono", ui-monospace, "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace';
const SERIF_FONT =
  '"Iowan Old Style", "Palatino Linotype", "Palatino", "Georgia", "Times New Roman", serif';

/**
 * Build a full token var-map terse-ly. Generic over any skin (not just
 * phosphor) — surfaces (bg/secondary/elevated/inset), text (body/secondary/
 * muted), border (base/secondary), accent (6), status (4).
 */
function skinVars(
  surface: [string, string, string, string],
  text: [string, string, string],
  border: [string, string],
  accent: { base: string; hover: string; deep: string; subtle: string; muted: string; text: string },
  status: { success: string; warning: string; error: string; info: string },
): SkinVars {
  return {
    '--color-surface': surface[0],
    '--color-surface-secondary': surface[1],
    '--color-surface-elevated': surface[2],
    '--color-surface-inset': surface[3],
    '--color-text': text[0],
    '--color-text-secondary': text[1],
    '--color-text-muted': text[2],
    '--color-text-inverse': accent.text,
    '--color-border': border[0],
    '--color-border-secondary': border[1],
    '--color-accent': accent.base,
    '--color-accent-hover': accent.hover,
    '--color-accent-deep': accent.deep,
    '--color-accent-subtle': accent.subtle,
    '--color-accent-muted': accent.muted,
    '--color-accent-text': accent.text,
    '--success': status.success,
    '--warning': status.warning,
    '--error': status.error,
    '--info': status.info,
  };
}

export const SKINS: Record<SkinId, PanelSkin> = {
  default: {
    id: 'default',
    label: 'Default (follow theme)',
    blurb: 'Inherit the global light/dark + accent theme.',
    vars: {},
  },

  terminal: {
    id: 'terminal',
    label: 'Terminal',
    blurb: 'Monospace cmd/console with phosphor palettes.',
    vars: {},
    fontStack: MONO_FONT,
    supportsEffects: true,
    variants: {
      green: {
        label: 'Green phosphor',
        vars: skinVars(
          ['8 12 8', '14 20 14', '18 26 18', '4 7 4'],
          ['126 230 138', '86 176 100', '60 120 70'],
          ['34 64 40', '24 46 28'],
          { base: '126 230 138', hover: '160 245 170', deep: '90 180 105', subtle: '18 40 22', muted: '70 140 82', text: '6 12 6' },
          { success: '126 230 138', warning: '226 196 110', error: '240 120 110', info: '130 200 220' },
        ),
      },
      amber: {
        label: 'Amber phosphor',
        vars: skinVars(
          ['14 10 4', '22 16 8', '28 20 10', '8 6 2'],
          ['240 184 92', '200 150 70', '140 104 50'],
          ['70 52 24', '48 36 16'],
          { base: '240 184 92', hover: '252 206 120', deep: '200 150 70', subtle: '42 30 12', muted: '170 128 60', text: '16 11 4' },
          { success: '150 220 130', warning: '240 184 92', error: '240 120 110', info: '150 200 210' },
        ),
      },
      white: {
        label: 'White / modern',
        vars: skinVars(
          ['10 12 14', '18 20 24', '24 27 32', '5 6 8'],
          ['222 228 235', '160 168 180', '110 118 130'],
          ['48 54 64', '34 38 46'],
          { base: '130 200 235', hover: '165 215 245', deep: '90 160 200', subtle: '22 34 44', muted: '90 150 185', text: '8 10 12' },
          { success: '120 215 150', warning: '230 196 120', error: '240 130 120', info: '130 200 235' },
        ),
      },
    },
  },

  paper: {
    id: 'paper',
    label: 'Paper',
    blurb: 'Warm light reading mode, serif type.',
    fontStack: SERIF_FONT,
    vars: skinVars(
      ['247 244 236', '240 236 226', '252 250 244', '232 227 215'],
      ['38 34 28', '92 84 72', '140 130 116'],
      ['214 206 190', '226 219 205'],
      { base: '150 90 50', hover: '170 105 60', deep: '120 72 40', subtle: '234 222 206', muted: '190 140 100', text: '252 250 244' },
      { success: '70 130 70', warning: '176 120 30', error: '180 60 50', info: '60 110 150' },
    ),
  },

  solarized: {
    id: 'solarized',
    label: 'Solarized Dark',
    blurb: 'The classic low-glare teal/base palette.',
    vars: skinVars(
      ['0 43 54', '7 54 66', '10 66 80', '0 31 39'],
      ['147 161 161', '131 148 150', '88 110 117'],
      ['30 70 82', '12 55 66'],
      { base: '38 139 210', hover: '75 163 223', deep: '31 111 168', subtle: '7 54 66', muted: '108 179 224', text: '253 246 227' },
      { success: '133 153 0', warning: '181 137 0', error: '220 50 47', info: '42 161 152' },
    ),
  },

  nord: {
    id: 'nord',
    label: 'Nord',
    blurb: 'Muted arctic blue-grey dark palette.',
    vars: skinVars(
      ['46 52 64', '59 66 82', '67 76 94', '41 46 56'],
      ['236 239 244', '216 222 233', '123 136 161'],
      ['76 86 106', '59 66 82'],
      { base: '136 192 208', hover: '143 188 187', deep: '94 129 172', subtle: '59 66 82', muted: '129 161 193', text: '46 52 64' },
      { success: '163 190 140', warning: '235 203 139', error: '191 97 106', info: '136 192 208' },
    ),
  },

  azure: {
    id: 'azure',
    label: 'Azure',
    blurb: 'Calm deep-blue surfaces with a bright cyan accent.',
    vars: skinVars(
      ['15 23 42', '23 34 58', '30 44 74', '10 17 33'],
      ['226 235 248', '170 190 220', '120 142 178'],
      ['44 62 96', '32 46 72'],
      { base: '56 165 245', hover: '96 188 252', deep: '40 128 200', subtle: '23 34 58', muted: '110 178 232', text: '8 14 26' },
      { success: '92 200 160', warning: '236 196 120', error: '236 110 120', info: '56 165 245' },
    ),
  },

  crt: {
    id: 'crt',
    label: 'Old TV',
    blurb: 'Vintage cathode-ray glow. Turn on the scanlines.',
    supportsEffects: true,
    vars: skinVars(
      ['18 22 20', '26 31 28', '32 38 34', '12 15 13'],
      ['208 224 210', '150 176 156', '104 128 110'],
      ['46 58 50', '34 44 38'],
      { base: '120 214 196', hover: '156 234 218', deep: '84 168 152', subtle: '24 34 30', muted: '110 180 168', text: '10 16 14' },
      { success: '140 220 150', warning: '232 200 120', error: '236 124 108', info: '120 214 196' },
    ),
  },

  synthwave: {
    id: 'synthwave',
    label: 'Synthwave',
    blurb: 'Neon magenta/cyan on deep indigo. Try the glow.',
    supportsEffects: true,
    vars: skinVars(
      ['26 16 46', '38 24 64', '48 30 78', '16 10 30'],
      ['245 225 255', '200 170 230', '150 120 180'],
      ['70 45 110', '50 32 80'],
      { base: '255 92 208', hover: '255 130 220', deep: '200 60 160', subtle: '48 30 78', muted: '255 140 220', text: '20 10 30' },
      { success: '120 240 170', warning: '255 200 90', error: '255 90 110', info: '90 220 255' },
    ),
  },
};

/** First variant id of a skin, if it has variants (used as the default). */
export function defaultVariantOf(skin: PanelSkin): string | undefined {
  const keys = skin.variants ? Object.keys(skin.variants) : [];
  return keys[0];
}

/** Back-compat: terminal's default phosphor. */
export const DEFAULT_TERMINAL_VARIANT = 'green';

export function listSkins(): PanelSkin[] {
  return Object.values(SKINS);
}

export function getSkin(id: string | undefined | null): PanelSkin {
  return SKINS[(id as SkinId)] ?? SKINS.default;
}
