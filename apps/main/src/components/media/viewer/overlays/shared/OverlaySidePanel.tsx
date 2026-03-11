/**
 * Overlay Side Panel — Shared Primitives
 *
 * Reusable building blocks for embedded overlay sidebars (left/right).
 * Themed with surface / th / accent tokens.
 */

import type { ReactNode } from 'react';

import { Icon, type IconName } from '@lib/icons';

// ── OverlaySidePanel ──────────────────────────────────────────────────

interface OverlaySidePanelProps {
  children: ReactNode;
  className?: string;
  side?: 'left' | 'right';
}

export function OverlaySidePanel({ children, className, side = 'left' }: OverlaySidePanelProps) {
  const sideClass = side === 'right'
    ? 'border-l border-th/10'
    : 'border-r border-th/10';

  return (
    <div
      className={`${className ?? ''} h-full flex-shrink-0 flex flex-col gap-2 py-2 bg-surface-secondary/95 ${sideClass} text-xs select-none overflow-y-auto`}
    >
      {children}
    </div>
  );
}

// ── SideSection ───────────────────────────────────────────────────────

interface SideSectionProps {
  label?: string;
  children: ReactNode;
  className?: string;
}

export function SideSection({ label, children, className }: SideSectionProps) {
  return (
    <div className={`px-2 flex flex-col gap-1 ${className ?? ''}`}>
      {label && (
        <span className="text-[10px] text-th-muted uppercase tracking-wider">{label}</span>
      )}
      {children}
    </div>
  );
}

// ── SideDivider ───────────────────────────────────────────────────────

export function SideDivider() {
  return <div className="h-px bg-th/10 mx-1" />;
}

// ── SideToolButton ────────────────────────────────────────────────────

interface SideToolButtonProps {
  icon: IconName;
  label: string;
  active?: boolean;
  title?: string;
  onClick?: () => void;
}

export function SideToolButton({ icon, label, active, title, onClick }: SideToolButtonProps) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 w-full px-2 py-1.5 rounded transition-colors ${
        active
          ? 'bg-accent text-accent-text'
          : 'text-th-secondary hover:bg-surface-elevated'
      }`}
      title={title}
    >
      <Icon name={icon} size={14} />
      <span>{label}</span>
    </button>
  );
}

// ── SideSlider ────────────────────────────────────────────────────────

interface SideSliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}

export function SideSlider({ label, value, min, max, step, onChange }: SideSliderProps) {
  return (
    <label className="flex flex-col gap-0.5 text-th-secondary">
      <span className="text-[10px]">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-1 accent-accent"
      />
    </label>
  );
}

// ── SideIconButton ────────────────────────────────────────────────────

interface SideIconButtonProps {
  icon: IconName;
  title?: string;
  disabled?: boolean;
  onClick?: () => void;
}

export function SideIconButton({ icon, title, disabled, onClick }: SideIconButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex items-center justify-center w-8 h-7 rounded bg-th/10 hover:bg-th/15 text-th-secondary disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      title={title}
    >
      <Icon name={icon} size={14} />
    </button>
  );
}

// ── SidePrimaryButton ─────────────────────────────────────────────────

interface SidePrimaryButtonProps {
  children: ReactNode;
  variant?: 'accent' | 'success';
  disabled?: boolean;
  title?: string;
  onClick?: () => void;
}

export function SidePrimaryButton({
  children,
  variant = 'accent',
  disabled,
  title,
  onClick,
}: SidePrimaryButtonProps) {
  const colorClass = variant === 'success'
    ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
    : 'bg-accent hover:bg-accent-hover text-accent-text';

  return (
    <div className="px-2">
      <button
        onClick={onClick}
        disabled={disabled}
        className={`w-full py-2 rounded text-xs font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
          disabled ? 'bg-th/10 text-th-muted' : colorClass
        }`}
        title={title}
      >
        {children}
      </button>
    </div>
  );
}
