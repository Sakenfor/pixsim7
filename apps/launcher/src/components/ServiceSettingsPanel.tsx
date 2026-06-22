/**
 * Generic per-service settings renderer.
 *
 * Fetches the settings schema + values from the API and renders
 * controls for each field type (string, number, boolean, select, multi_select).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button, Input, Select, Switch } from '@pixsim7/shared.ui'
import {
  type SettingField,
  type OptionGroup,
  type ServiceSettingsResponse,
  getServiceSettings,
  updateServiceSettings,
} from '../api/client'

/** Group fields by section, preserving declaration order. */
function groupBySection(fields: SettingField[]) {
  const groups: { name: string | null; fields: SettingField[] }[] = []
  const seen = new Map<string | null, number>()
  for (const field of fields) {
    const key = field.section ?? null
    if (seen.has(key)) {
      groups[seen.get(key)!].fields.push(field)
    } else {
      seen.set(key, groups.length)
      groups.push({ name: key, fields: [field] })
    }
  }
  return groups
}

export function ServiceSettingsPanel({
  serviceKey,
  title,
  activeSection,
  children,
}: {
  serviceKey: string
  title?: string
  /** When set, only fields from this section are shown */
  activeSection?: string | null
  /** Render extra content below the settings controls (receives current values) */
  children?: (values: Record<string, unknown>) => React.ReactNode
}) {
  const [data, setData] = useState<ServiceSettingsResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    getServiceSettings(serviceKey)
      .then(setData)
      .catch((e) => setError(e.message))
  }, [serviceKey])

  useEffect(() => { load() }, [load])

  const sections = useMemo(
    () => data ? groupBySection(data.schema) : [],
    [data],
  )

  if (error) return null
  if (!data || data.schema.length === 0) return null

  const hasSections = sections.some((s) => s.name !== null)
  const visibleSections = activeSection
    ? sections.filter((s) => s.name === activeSection)
    : sections

  const handleChange = (fieldKey: string, value: unknown) => {
    setData((prev) => prev ? { ...prev, values: { ...prev.values, [fieldKey]: value } } : prev)
    updateServiceSettings(serviceKey, { [fieldKey]: value })
      .then(setData)
      .catch(() => load())
  }

  return (
    <div className="bg-surface-secondary rounded border border-border p-3 space-y-2.5">
      <div className="text-[11px] font-semibold text-gray-300">{title || 'Settings'}</div>
      <div className="text-[10px] text-gray-500 leading-relaxed">
        Changes take effect on next restart.
      </div>
      {hasSections ? (
        <div className="space-y-3">
          {visibleSections.map((section, i) => (
            <div key={section.name ?? i}>
              {section.name && !activeSection && (
                <div className="text-[10px] font-medium text-gray-400 mb-1.5 pt-1 border-t border-gray-800 first:border-0 first:pt-0">
                  {section.name}
                </div>
              )}
              <div className="space-y-2">
                {section.fields.map((field) => (
                  <SettingFieldControl
                    key={field.key}
                    field={field}
                    value={data.values[field.key]}
                    onChange={(value) => handleChange(field.key, value)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {data.schema.map((field) => (
            <SettingFieldControl
              key={field.key}
              field={field}
              value={data.values[field.key]}
              onChange={(value) => handleChange(field.key, value)}
            />
          ))}
        </div>
      )}
      {children?.(data.values)}
    </div>
  )
}

function SettingFieldControl({
  field,
  value,
  onChange,
}: {
  field: SettingField
  value: unknown
  onChange: (value: unknown) => void
}) {
  // Nudge when a secret is still its shipped placeholder default.
  const isInsecureSecret = field.env_export === 'SECRET_KEY' && (!value || value === field.default)
  return (
    <div className="space-y-0.5">
      <div className="flex items-center gap-2">
        <label className="text-[10px] text-gray-400 font-medium">{field.label}</label>
        {(field.arg_map || field.env_map) && (
          <span className="text-[8px] font-mono text-gray-600">{field.arg_map || field.env_map}</span>
        )}
      </div>
      {field.description && (
        <div className="text-[9px] text-gray-600 leading-relaxed">{field.description}</div>
      )}
      {isInsecureSecret && (
        <div className="text-[9px] text-amber-400/90 leading-relaxed">⚠ Still the default key — change before any non-local use.</div>
      )}
      <div className="mt-0.5">
        {field.type === 'boolean' && (
          <Switch size="sm" checked={!!value} onCheckedChange={onChange} />
        )}
        {field.type === 'number' && (
          <NumberControl value={value as number} onChange={onChange} />
        )}
        {field.type === 'string' && !field.separator && (
          isSecretField(field)
            ? <SecretStringControl value={(value as string) ?? ''} onChange={onChange} />
            : <StringControl value={(value as string) ?? ''} onChange={onChange} />
        )}
        {field.type === 'string' && field.separator && (
          <StringListControl value={(value as string) ?? ''} separator={field.separator} onChange={onChange} />
        )}
        {field.type === 'select' && (
          <SelectControl value={(value as string) ?? ''} options={field.options ?? []} onChange={onChange} />
        )}
        {field.type === 'multi_select' && field.option_groups ? (
          <GroupedMultiSelectControl value={(value as string[]) ?? []} groups={field.option_groups} onChange={onChange} />
        ) : field.type === 'multi_select' && (
          <MultiSelectControl value={(value as string[]) ?? []} options={field.options ?? []} onChange={onChange} />
        )}
      </div>
    </div>
  )
}

function NumberControl({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const [local, setLocal] = useState(String(value ?? 0))

  useEffect(() => { setLocal(String(value ?? 0)) }, [value])

  const commit = (v: string) => {
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      const n = parseInt(v, 10)
      if (!isNaN(n)) onChange(n)
    }, 500)
  }

  return (
    <div className="w-24">
      <Input
        size="xs"
        type="number"
        value={local}
        onChange={(e) => { setLocal(e.target.value); commit(e.target.value) }}
      />
    </div>
  )
}

/** Secret-ish fields (API keys, tokens, signing keys) — masked by env_export name. */
function isSecretField(field: SettingField): boolean {
  return /(API_KEY|SECRET_KEY|_TOKEN|_SECRET)$/.test(field.env_export ?? '')
}

/** Masked string input with a show/hide toggle, for secrets. */
function SecretStringControl({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const [local, setLocal] = useState(value)
  const [reveal, setReveal] = useState(false)

  useEffect(() => { setLocal(value) }, [value])

  const commit = (v: string) => {
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => onChange(v), 500)
  }

  return (
    <div className="flex items-center gap-1">
      <Input
        size="xs"
        type={reveal ? 'text' : 'password'}
        value={local}
        placeholder="(unset — uses .env)"
        onChange={(e) => { setLocal(e.target.value); commit(e.target.value) }}
        className="flex-1 font-mono"
      />
      <button
        type="button"
        onClick={() => setReveal((r) => !r)}
        className="text-[9px] text-gray-500 hover:text-gray-300 px-1 shrink-0"
      >
        {reveal ? 'Hide' : 'Show'}
      </button>
    </div>
  )
}

function StringControl({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const [local, setLocal] = useState(value)

  useEffect(() => { setLocal(value) }, [value])

  const commit = (v: string) => {
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => onChange(v), 500)
  }

  return (
    <Input
      size="xs"
      type="text"
      value={local}
      onChange={(e) => { setLocal(e.target.value); commit(e.target.value) }}
    />
  )
}

function StringListControl({ value, separator, onChange }: { value: string; separator: string; onChange: (v: string) => void }) {
  const items = value ? value.split(separator).map((s) => s.trim()).filter(Boolean) : []
  const [draft, setDraft] = useState('')

  const add = () => {
    const trimmed = draft.trim()
    if (!trimmed || items.includes(trimmed)) return
    onChange([...items, trimmed].join(separator))
    setDraft('')
  }

  const remove = (index: number) => {
    onChange(items.filter((_, i) => i !== index).join(separator))
  }

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap gap-1">
        {items.map((item, i) => (
          <span key={i} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-gray-800 border border-gray-700 text-[10px] text-gray-300 font-mono">
            <span className="truncate max-w-[200px]">{item}</span>
            <button onClick={() => remove(i)} className="text-gray-500 hover:text-red-400 transition-colors text-[9px] leading-none">&times;</button>
          </span>
        ))}
      </div>
      <div className="flex gap-1">
        <Input
          size="xs"
          type="text"
          value={draft}
          placeholder="Add entry..."
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add() } }}
          className="flex-1"
        />
        <Button variant="secondary" size="xs" onClick={add}>+</Button>
      </div>
    </div>
  )
}

function SelectControl({ value, options, onChange }: { value: string; options: string[]; onChange: (v: string) => void }) {
  return (
    <Select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      size="xs" width="auto" className="text-gray-300"
    >
      {options.map((opt) => (
        <option key={opt} value={opt}>{opt}</option>
      ))}
    </Select>
  )
}

function MultiSelectControl({ value, options, onChange }: { value: string[]; options: string[]; onChange: (v: string[]) => void }) {
  const toggle = (opt: string) => {
    const next = value.includes(opt) ? value.filter((v) => v !== opt) : [...value, opt]
    onChange(next)
  }

  return (
    <div className="flex flex-wrap gap-1">
      {options.map((opt) => {
        const active = value.includes(opt)
        return (
          <button
            key={opt}
            onClick={() => toggle(opt)}
            className={`px-2 py-0.5 rounded text-[10px] font-mono transition-colors border ${
              active
                ? 'bg-cyan-900/30 text-cyan-300 border-cyan-700/60 hover:bg-cyan-900/50'
                : 'bg-gray-800/50 text-gray-500 border-gray-700/50 hover:text-gray-400'
            }`}
          >
            {opt}
          </button>
        )
      })}
    </div>
  )
}

function GroupedMultiSelectControl({ value, groups, onChange }: { value: string[]; groups: OptionGroup[]; onChange: (v: string[]) => void }) {
  const [activeGroup, setActiveGroup] = useState(groups[0]?.group ?? '')
  const currentGroup = groups.find((g) => g.group === activeGroup)

  const toggle = (name: string) => {
    const next = value.includes(name) ? value.filter((v) => v !== name) : [...value, name]
    onChange(next)
  }

  const toggleGroup = (group: OptionGroup) => {
    const groupNames = group.tools.map((t) => t.name)
    const allSelected = groupNames.every((n) => value.includes(n))
    if (allSelected) {
      onChange(value.filter((v) => !groupNames.includes(v)))
    } else {
      onChange([...new Set([...value, ...groupNames])])
    }
  }

  return (
    <div className="flex rounded border border-gray-700 overflow-hidden" style={{ minHeight: 120, maxHeight: 200 }}>
      {/* Sidebar — groups */}
      <div className="w-[140px] shrink-0 border-r border-gray-700 overflow-y-auto bg-gray-900/50">
        {groups.map((g) => {
          const count = g.tools.filter((t) => value.includes(t.name)).length
          return (
            <button
              key={g.group}
              onClick={() => setActiveGroup(g.group)}
              className={`w-full text-left px-2 py-1.5 text-[10px] flex items-center justify-between transition-colors ${
                activeGroup === g.group
                  ? 'bg-gray-800 text-gray-200'
                  : 'text-gray-500 hover:text-gray-400 hover:bg-gray-800/50'
              }`}
            >
              <span className="truncate">{g.label}</span>
              {count > 0 && (
                <span className="text-[8px] px-1 py-0.5 rounded bg-cyan-900/40 text-cyan-400 font-mono shrink-0 ml-1">
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Content — tools in selected group */}
      <div className="flex-1 overflow-y-auto p-1.5 space-y-0.5">
        {currentGroup && (
          <>
            <button
              onClick={() => toggleGroup(currentGroup)}
              className="text-[9px] text-gray-500 hover:text-cyan-400 transition-colors mb-1 px-1"
            >
              {currentGroup.tools.every((t) => value.includes(t.name)) ? 'Deselect all' : 'Select all'}
            </button>
            {currentGroup.tools.map((tool) => {
              const active = value.includes(tool.name)
              return (
                <button
                  key={tool.name}
                  onClick={() => toggle(tool.name)}
                  title={tool.description || tool.name}
                  className={`w-full text-left px-2 py-1 rounded text-[10px] transition-colors flex items-center gap-2 ${
                    active
                      ? 'bg-cyan-900/20 text-cyan-300'
                      : 'text-gray-500 hover:text-gray-400 hover:bg-gray-800/30'
                  }`}
                >
                  <span className={`w-2.5 h-2.5 rounded-sm border shrink-0 flex items-center justify-center ${
                    active ? 'bg-cyan-600 border-cyan-500' : 'border-gray-600'
                  }`}>
                    {active && <span className="text-white text-[7px]">✓</span>}
                  </span>
                  <span className="font-mono truncate">{tool.short_name ?? tool.name}</span>
                  {tool.method && (
                    <span className={`ml-auto shrink-0 text-[8px] font-mono px-1 rounded ${
                      tool.write ? 'bg-amber-900/40 text-amber-400' : 'bg-gray-800 text-gray-500'
                    }`}>
                      {tool.method}
                    </span>
                  )}
                </button>
              )
            })}
          </>
        )}
      </div>
    </div>
  )
}
