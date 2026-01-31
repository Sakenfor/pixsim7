/**
 * Parameter Icons
 *
 * Visual icons and representations for generation parameter values.
 * Used by GenerationSettingsPanel and other components that display
 * parameter options with visual indicators.
 */

/* eslint-disable react-refresh/only-export-components */

import {
  Star,
  Zap,
  Clock,
  Camera,
  RotateCcw,
  Film,
  Sparkles,
  ArrowRightLeft,
  ArrowUpDown,
  ZoomIn,
  Gauge,
} from 'lucide-react';

// ============================================================================
// Icon Configuration
// ============================================================================

/**
 * Icon configuration for param values - data-driven approach.
 * Maps parameter names to value-icon pairs.
 */
export const PARAM_ICON_CONFIG: Record<string, Record<string, React.ReactNode>> = {
  quality: {
    // Quality levels
    low: <Star size={14} />,
    medium: (
      <div className="flex gap-0.5">
        <Star size={11} fill="currentColor" />
        <Star size={11} fill="currentColor" />
      </div>
    ),
    high: (
      <div className="flex gap-0.5">
        <Star size={10} fill="currentColor" />
        <Star size={10} fill="currentColor" />
        <Star size={10} fill="currentColor" />
      </div>
    ),
    ultra: <Sparkles size={14} />,
    max: <Sparkles size={14} />,
    // Resolution levels
    '720p': <span className="text-[9px] font-bold">HD</span>,
    hd: <span className="text-[9px] font-bold">HD</span>,
    '1080p': <span className="text-[9px] font-bold">FHD</span>,
    fhd: <span className="text-[9px] font-bold">FHD</span>,
    '4k': <span className="text-[9px] font-bold">4K</span>,
    '8k': <span className="text-[9px] font-bold">8K</span>,
  },
  motion_mode: {
    slow: <Clock size={14} />,
    normal: <Gauge size={14} />,
    medium: <Gauge size={14} />,
    fast: <Zap size={14} />,
    dynamic: <Sparkles size={14} />,
    cinematic: <Film size={14} />,
  },
  camera_movement: {
    static: <Camera size={14} />,
    none: <Camera size={14} />,
    pan: <ArrowRightLeft size={14} />,
    horizontal: <ArrowRightLeft size={14} />,
    tilt: <ArrowUpDown size={14} />,
    vertical: <ArrowUpDown size={14} />,
    zoom: <ZoomIn size={14} />,
    orbit: <RotateCcw size={14} />,
    rotate: <RotateCcw size={14} />,
    dolly: <Film size={14} />,
    track: <Film size={14} />,
  },
};

// ============================================================================
// Icon Components
// ============================================================================

export interface AspectRatioIconProps {
  /** Aspect ratio value (e.g., "16:9") */
  value: string;
  /** Maximum dimension in pixels (default: 16) */
  maxDim?: number;
  /** Additional CSS classes */
  className?: string;
}

/**
 * Visual representation of an aspect ratio as a proportional box.
 */
export function AspectRatioIcon({ value, maxDim = 16, className }: AspectRatioIconProps) {
  const [w, h] = value.split(':').map(Number);
  if (!w || !h) return null;

  const ratio = w / h;
  const width = ratio >= 1 ? maxDim : Math.round(maxDim * ratio);
  const height = ratio <= 1 ? maxDim : Math.round(maxDim / ratio);

  return (
    <div className={`flex items-center justify-center w-5 h-5 ${className ?? ''}`}>
      <div
        className="border-2 border-current rounded-sm"
        style={{ width: `${width}px`, height: `${height}px` }}
      />
    </div>
  );
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Get icon/visual representation for a parameter value.
 *
 * @param paramName - The parameter name (e.g., "quality", "motion_mode")
 * @param value - The parameter value (e.g., "high", "fast")
 * @returns React node for the icon, or null if no icon configured
 */
export function getParamIcon(paramName: string, value: string): React.ReactNode {
  // Aspect ratios - show actual shape representation
  if (paramName === 'aspect_ratio') {
    return <AspectRatioIcon value={value} />;
  }

  // Look up icon from config
  const paramConfig = PARAM_ICON_CONFIG[paramName];
  if (paramConfig) {
    const normalizedValue = value.toLowerCase();
    return paramConfig[normalizedValue] || null;
  }

  return null;
}

/**
 * Check if a parameter should show visual icons (button grid) vs dropdown.
 */
export function isVisualParam(paramName: string): boolean {
  const VISUAL_PARAMS = ['quality', 'motion_mode', 'camera_movement'];
  return VISUAL_PARAMS.includes(paramName);
}
