/**
 * Sci-Fi Design Tokens for PixSim7
 * Holographic simulation command center aesthetic
 */

// ============================================================================
// Color System
// ============================================================================

export const colors = {
  // Primary simulation states
  sim: {
    active: '#00D9FF', // Cyan - running simulations
    paused: '#FFB800', // Amber - paused/editing
    error: '#FF0080', // Hot pink - errors
    success: '#00FF88', // Mint green - success
    loading: '#9333EA', // Purple - processing
  },

  // Data flow colors
  data: {
    flow: '#00FFFF', // Electric cyan
    input: '#FFFFFF', // Pure white
    output: '#FFE500', // Yellow
    transform: '#FF00FF', // Magenta
    neutral: '#808080', // Gray
  },

  // Semantic colors for different node types
  semantic: {
    // NPC/Character
    personality: '#9333EA', // Purple
    memory: '#3B82F6', // Blue
    emotion: '#EF4444', // Red
    logic: '#22C55E', // Green
    instinct: '#FB923C', // Orange
    social: '#06B6D4', // Cyan

    // System
    control: '#8B5CF6', // Violet
    generator: '#10B981', // Emerald
    editor: '#3B82F6', // Blue
    player: '#F59E0B', // Amber
  },

  // Environment colors
  environment: {
    background: '#0A0A0F', // Deep space black
    surface: '#111827', // Dark gray
    panel: 'rgba(17, 24, 39, 0.8)', // Translucent dark
    overlay: 'rgba(0, 0, 0, 0.7)', // Dark overlay
    grid: '#1A1A2E', // Subtle blue-gray
  },

  // Glow and effects
  glow: {
    cyan: 'rgba(0, 217, 255, 0.6)',
    purple: 'rgba(147, 51, 234, 0.6)',
    green: 'rgba(0, 255, 136, 0.6)',
    red: 'rgba(255, 0, 128, 0.6)',
    white: 'rgba(255, 255, 255, 0.6)',
  },
} as const;

// ============================================================================
// Typography
// ============================================================================

export const typography = {
  fonts: {
    display: '"Orbitron", "Exo 2", system-ui, sans-serif', // Futuristic headers
    body: '"Inter", "Roboto", system-ui, sans-serif', // Clean body text
    mono: '"Fira Code", "JetBrains Mono", "Courier New", monospace', // Code/data
    accent: '"Audiowide", "Michroma", system-ui, sans-serif', // Special elements
  },

  sizes: {
    xs: '0.625rem', // 10px
    sm: '0.75rem', // 12px
    base: '0.875rem', // 14px
    md: '1rem', // 16px
    lg: '1.125rem', // 18px
    xl: '1.5rem', // 24px
    '2xl': '2rem', // 32px
    '3xl': '3rem', // 48px
  },

  weights: {
    light: 300,
    normal: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
  },

  letterSpacing: {
    tight: '-0.02em',
    normal: '0',
    wide: '0.02em',
    wider: '0.05em',
    widest: '0.1em',
  },
} as const;

// ============================================================================
// Spacing & Layout
// ============================================================================

export const spacing = {
  unit: 4, // Base unit in pixels
  scale: {
    0: '0',
    1: '4px',
    2: '8px',
    3: '12px',
    4: '16px',
    5: '20px',
    6: '24px',
    8: '32px',
    10: '40px',
    12: '48px',
    16: '64px',
    20: '80px',
    24: '96px',
    32: '128px',
  },
} as const;

// ============================================================================
// Visual Effects
// ============================================================================

export const effects = {
  // Shadows
  shadows: {
    sm: '0 2px 4px rgba(0, 217, 255, 0.1)',
    md: '0 4px 12px rgba(0, 217, 255, 0.15)',
    lg: '0 8px 24px rgba(0, 217, 255, 0.2)',
    glow: '0 0 40px rgba(0, 217, 255, 0.5)',
    innerGlow: 'inset 0 0 20px rgba(0, 217, 255, 0.2)',
  },

  // Gradients
  gradients: {
    holographic: 'linear-gradient(135deg, #00D9FF 0%, #9333EA 50%, #FF0080 100%)',
    dataFlow: 'linear-gradient(90deg, transparent 0%, #00FFFF 50%, transparent 100%)',
    neural: 'radial-gradient(circle, rgba(0, 217, 255, 0.3) 0%, transparent 70%)',
    panel: 'linear-gradient(180deg, rgba(17, 24, 39, 0.9) 0%, rgba(10, 10, 15, 0.95) 100%)',
    rainbow: 'linear-gradient(90deg, #FF0080, #FFB800, #00FF88, #00D9FF, #9333EA, #FF0080)',
  },

  // Filters
  filters: {
    blur: 'blur(10px)',
    glow: 'drop-shadow(0 0 20px rgba(0, 217, 255, 0.6))',
    noise: 'url(#noise-filter)',
    hologram: 'saturate(1.5) contrast(1.2) brightness(1.1)',
  },

  // Borders
  borders: {
    default: '1px solid rgba(0, 217, 255, 0.2)',
    glow: '1px solid rgba(0, 217, 255, 0.5)',
    error: '1px solid rgba(255, 0, 128, 0.5)',
    success: '1px solid rgba(0, 255, 136, 0.5)',
  },
} as const;

// ============================================================================
// Animation Presets
// ============================================================================

export const animations = {
  // Durations
  durations: {
    instant: '0ms',
    fast: '150ms',
    normal: '300ms',
    slow: '500ms',
    slower: '750ms',
    slowest: '1000ms',
  },

  // Easings
  easings: {
    linear: 'linear',
    easeIn: 'cubic-bezier(0.4, 0, 1, 1)',
    easeOut: 'cubic-bezier(0, 0, 0.2, 1)',
    easeInOut: 'cubic-bezier(0.4, 0, 0.2, 1)',
    spring: 'cubic-bezier(0.68, -0.55, 0.265, 1.55)',
    bounce: 'cubic-bezier(0.68, -0.55, 0.265, 1.55)',
  },

  // Keyframes (as CSS strings)
  keyframes: {
    pulse: `
      @keyframes pulse {
        0%, 100% { opacity: 1; transform: scale(1); }
        50% { opacity: 0.8; transform: scale(1.05); }
      }
    `,
    glow: `
      @keyframes glow {
        0%, 100% { box-shadow: 0 0 20px currentColor; }
        50% { box-shadow: 0 0 40px currentColor, 0 0 60px currentColor; }
      }
    `,
    dataFlow: `
      @keyframes dataFlow {
        0% { transform: translateX(-100%); opacity: 0; }
        50% { opacity: 1; }
        100% { transform: translateX(100%); opacity: 0; }
      }
    `,
    scanLine: `
      @keyframes scanLine {
        0% { transform: translateY(-100%); }
        100% { transform: translateY(100%); }
      }
    `,
    rotate: `
      @keyframes rotate {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
    `,
    float: `
      @keyframes float {
        0%, 100% { transform: translateY(0); }
        50% { transform: translateY(-10px); }
      }
    `,
  },
} as const;

// ============================================================================
// Component Styles
// ============================================================================

export const components = {
  // Panel styles
  panel: {
    base: `
      background: ${effects.gradients.panel};
      border: ${effects.borders.default};
      border-radius: 8px;
      backdrop-filter: blur(20px);
      box-shadow: ${effects.shadows.lg};
    `,
    hover: `
      border-color: rgba(0, 217, 255, 0.4);
      box-shadow: ${effects.shadows.glow};
    `,
    active: `
      border-color: rgba(0, 217, 255, 0.6);
      box-shadow: ${effects.shadows.glow}, ${effects.shadows.innerGlow};
    `,
  },

  // Button styles
  button: {
    primary: `
      background: linear-gradient(135deg, ${colors.sim.active}, ${colors.sim.loading});
      color: white;
      border: none;
      text-transform: uppercase;
      letter-spacing: ${typography.letterSpacing.wider};
      font-weight: ${typography.weights.semibold};
      transition: all ${animations.durations.normal} ${animations.easings.easeOut};
    `,
    secondary: `
      background: transparent;
      color: ${colors.sim.active};
      border: 1px solid ${colors.sim.active};
      transition: all ${animations.durations.normal} ${animations.easings.easeOut};
    `,
    ghost: `
      background: transparent;
      color: ${colors.data.neutral};
      border: 1px solid transparent;
      transition: all ${animations.durations.fast} ${animations.easings.easeOut};
    `,
  },

  // Input styles
  input: {
    base: `
      background: rgba(10, 10, 15, 0.6);
      border: 1px solid rgba(0, 217, 255, 0.2);
      color: ${colors.data.input};
      font-family: ${typography.fonts.mono};
      padding: ${spacing.scale[2]} ${spacing.scale[3]};
      transition: all ${animations.durations.fast} ${animations.easings.easeOut};
    `,
    focus: `
      border-color: ${colors.sim.active};
      box-shadow: 0 0 0 2px rgba(0, 217, 255, 0.2);
      outline: none;
    `,
  },
} as const;

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Get color with opacity
 */
export function withOpacity(color: string, opacity: number): string {
  if (color.startsWith('#')) {
    const r = parseInt(color.slice(1, 3), 16);
    const g = parseInt(color.slice(3, 5), 16);
    const b = parseInt(color.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${opacity})`;
  }
  return color;
}

/**
 * Generate neon glow effect
 */
export function neonGlow(color: string, intensity: number = 1): string {
  return `
    0 0 ${10 * intensity}px ${color},
    0 0 ${20 * intensity}px ${color},
    0 0 ${30 * intensity}px ${color},
    0 0 ${40 * intensity}px ${withOpacity(color, 0.5)}
  `;
}

/**
 * Create holographic shimmer effect
 */
export function holographicShimmer(): string {
  return `
    background: ${effects.gradients.holographic};
    background-size: 200% 200%;
    animation: shimmer 3s linear infinite;

    @keyframes shimmer {
      0% { background-position: 0% 50%; }
      50% { background-position: 100% 50%; }
      100% { background-position: 0% 50%; }
    }
  `;
}

// ============================================================================
// Theme Export
// ============================================================================

export const sciFiTheme = {
  colors,
  typography,
  spacing,
  effects,
  animations,
  components,
  utils: {
    withOpacity,
    neonGlow,
    holographicShimmer,
  },
} as const;

export type SciFiTheme = typeof sciFiTheme;