import React, { useRef, useEffect } from 'react';
import clsx from 'clsx';

/**
 * Tabs — canonical tab navigation component.
 * REUSE this component for any tabbed interface across the app.
 *
 * Features:
 * - Keyboard navigation (Arrow keys, Home, End)
 * - Accessible (ARIA roles and states)
 * - Badge support for counts
 * - Responsive with overflow scrolling
 *
 * Usage:
 * const tabs = [
 *   { id: 'all', label: 'All', count: 42 },
 *   { id: 'images', label: 'Images', count: 12 },
 * ];
 * <Tabs tabs={tabs} value={activeTab} onChange={setActiveTab} />
 */

export interface Tab {
  id: string;
  label: string;
  count?: number;
}

export interface TabsProps {
  tabs: Tab[];
  value: string;
  onChange: (id: string) => void;
  className?: string;
}

export function Tabs({ tabs, value, onChange, className }: TabsProps) {
  const tabsRef = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    tabsRef.current = tabsRef.current.slice(0, tabs.length);
  }, [tabs.length]);

  const handleKeyDown = (e: React.KeyboardEvent, index: number) => {
    let nextIndex = index;

    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      nextIndex = index > 0 ? index - 1 : tabs.length - 1;
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      nextIndex = index < tabs.length - 1 ? index + 1 : 0;
    } else if (e.key === 'Home') {
      e.preventDefault();
      nextIndex = 0;
    } else if (e.key === 'End') {
      e.preventDefault();
      nextIndex = tabs.length - 1;
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onChange(tabs[index].id);
      return;
    } else {
      return;
    }

    tabsRef.current[nextIndex]?.focus();
  };

  return (
    <div
      role="tablist"
      className={clsx(
        'flex gap-1 overflow-x-auto border-b border-neutral-200 dark:border-neutral-700 scrollbar-thin',
        className
      )}
      aria-label="Navigation tabs"
    >
      {tabs.map((tab, index) => {
        const isActive = tab.id === value;
        return (
          <button
            key={tab.id}
            ref={el => {
              tabsRef.current[index] = el;
            }}
            role="tab"
            aria-selected={isActive}
            aria-controls={`tabpanel-${tab.id}`}
            tabIndex={isActive ? 0 : -1}
            onClick={() => onChange(tab.id)}
            onKeyDown={e => handleKeyDown(e, index)}
            className={clsx(
              'whitespace-nowrap px-4 py-2.5 text-sm font-medium transition-colors',
              'focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2',
              'border-b-2 -mb-[1px]',
              isActive
                ? 'border-accent text-accent'
                : 'border-transparent text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200 hover:border-neutral-300 dark:hover:border-neutral-600'
            )}
          >
            <span className="flex items-center gap-2">
              <span>{tab.label}</span>
              {tab.count !== undefined && (
                <span
                  className={clsx(
                    'inline-flex items-center justify-center rounded-full px-2 py-0.5 text-xs',
                    isActive
                      ? 'bg-accent-subtle text-accent'
                      : 'bg-neutral-200 dark:bg-neutral-700 text-neutral-600 dark:text-neutral-400'
                  )}
                >
                  {tab.count}
                </span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}
