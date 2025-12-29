import clsx from "clsx";
import type { PanelSettingsScopeMode } from "../../lib/panelSettingsScopes";

const DEFAULT_LABELS: Record<PanelSettingsScopeMode, string> = {
  global: "App",
  local: "Local",
};

interface ScopeModeSelectProps {
  value: PanelSettingsScopeMode;
  onChange: (value: PanelSettingsScopeMode) => void;
  className?: string;
  disabled?: boolean;
  id?: string;
  labels?: Partial<Record<PanelSettingsScopeMode, string>>;
  ariaLabel?: string;
}

export function ScopeModeSelect({
  value,
  onChange,
  className,
  disabled,
  id,
  labels,
  ariaLabel,
}: ScopeModeSelectProps) {
  const resolvedLabels = { ...DEFAULT_LABELS, ...(labels ?? {}) };

  return (
    <select
      id={id}
      value={value}
      disabled={disabled}
      aria-label={ariaLabel ?? "Scope mode"}
      onChange={(event) => onChange(event.target.value as PanelSettingsScopeMode)}
      className={clsx(
        "text-xs border border-neutral-300 dark:border-neutral-700 rounded px-2 py-1 bg-white dark:bg-neutral-900",
        className,
      )}
    >
      <option value="global">{resolvedLabels.global}</option>
      <option value="local">{resolvedLabels.local}</option>
    </select>
  );
}
