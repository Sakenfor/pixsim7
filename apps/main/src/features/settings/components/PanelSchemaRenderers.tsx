/**
 * Panel Schema Renderers
 *
 * Components for rendering panel settings schemas:
 * - InstanceFieldWrapper: Wraps a field with an optional reset button for instance overrides
 * - PanelSchemaGroupRenderer: Renders a group of settings fields
 * - PanelSchemaRenderer: Renders a full schema with tabs/groups
 */

import { useState } from 'react';

import type { SettingField, SettingGroup, SettingTab } from '../lib/core/types';

import { SettingFieldRenderer } from './shared/SettingFieldRenderer';

/**
 * Wraps a field with an optional reset button for instance overrides.
 */
export function InstanceFieldWrapper({
  field,
  value,
  onChange,
  allValues,
  hasOverride,
  onReset,
}: {
  field: SettingField;
  value: any;
  onChange: (value: any) => void;
  allValues: Record<string, any>;
  hasOverride?: boolean;
  onReset?: () => void;
}) {
  // Check showWhen condition
  if (field.showWhen && !field.showWhen(allValues)) {
    return null;
  }

  return (
    <div className="flex items-center gap-2">
      <div className="flex-1">
        <SettingFieldRenderer
          field={field}
          value={value}
          onChange={onChange}
          allValues={allValues}
        />
      </div>
      {hasOverride && onReset && (
        <button
          type="button"
          onClick={onReset}
          title="Reset to global value"
          className="shrink-0 p-1 text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-900/20 rounded transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
      )}
    </div>
  );
}

export function PanelSchemaGroupRenderer({
  group,
  values,
  setValue,
  instanceOverrides,
  onResetField,
}: {
  group: SettingGroup;
  values: Record<string, any>;
  setValue: (fieldId: string, value: any) => void;
  instanceOverrides?: Record<string, unknown>;
  onResetField?: (fieldId: string) => void;
}) {
  if (group.showWhen && !group.showWhen(values)) {
    return null;
  }

  return (
    <div className="space-y-2">
      {group.title && (
        <h4 className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
          {group.title}
        </h4>
      )}
      {group.description && (
        <p className="text-xs text-neutral-600 dark:text-neutral-400">
          {group.description}
        </p>
      )}
      <div className="space-y-3">
        {group.fields.map((field) => (
          <InstanceFieldWrapper
            key={field.id}
            field={field}
            value={values[field.id]}
            onChange={(value) => setValue(field.id, value)}
            allValues={values}
            hasOverride={instanceOverrides ? field.id in instanceOverrides : false}
            onReset={onResetField ? () => onResetField(field.id) : undefined}
          />
        ))}
      </div>
    </div>
  );
}

export function PanelSchemaRenderer({
  schema,
  values,
  setValue,
  instanceOverrides,
  onResetField,
}: {
  schema: { tabs?: SettingTab[]; groups?: SettingGroup[] };
  values: Record<string, any>;
  setValue: (fieldId: string, value: any) => void;
  instanceOverrides?: Record<string, unknown>;
  onResetField?: (fieldId: string) => void;
}) {
  const tabs = schema.tabs ?? [];
  const groups = schema.groups ?? [];
  const [activeTabId, setActiveTabId] = useState<string | null>(tabs[0]?.id ?? null);
  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? tabs[0];

  if (tabs.length > 0 && activeTab) {
    return (
      <div className="space-y-4">
        <div className="flex gap-2 flex-wrap">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTabId(tab.id)}
              className={`px-3 py-1.5 text-[11px] font-medium rounded-md transition-colors ${
                activeTabId === tab.id
                  ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                  : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="space-y-4">
          {activeTab.groups.map((group) => (
            <PanelSchemaGroupRenderer
              key={group.id}
              group={group}
              values={values}
              setValue={setValue}
              instanceOverrides={instanceOverrides}
              onResetField={onResetField}
            />
          ))}
          {activeTab.footer && (
            <div className="text-[11px] text-neutral-500 dark:text-neutral-400">
              {activeTab.footer}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (groups.length === 0) {
    return (
      <div className="text-sm text-neutral-500">
        No schema settings available.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {groups.map((group) => (
        <PanelSchemaGroupRenderer
          key={group.id}
          group={group}
          values={values}
          setValue={setValue}
          instanceOverrides={instanceOverrides}
          onResetField={onResetField}
        />
      ))}
    </div>
  );
}
