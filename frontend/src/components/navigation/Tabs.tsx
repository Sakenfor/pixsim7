import React, { useRef, useEffect } from 'react';
import clsx from 'clsx';

export interface Tab {
  id: string;
  label: string;
  count?: number;
}

export interface TabsProps {
  tabs: Tab[];
  value: string;
  onChange: (id: string) => void;
}

export function Tabs({ tabs, value, onChange }: TabsProps) {
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
      className="flex gap-1 overflow-x-auto border-b border-neutral-200 scrollbar-thin"
      aria-label="Gallery scopes"
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
              'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2',
              'border-b-2 -mb-[1px]',
              isActive
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-neutral-600 hover:text-neutral-900 hover:border-neutral-300'
            )}
          >
            <span className="flex items-center gap-2">
              <span>{tab.label}</span>
              {tab.count !== undefined && (
                <span
                  className={clsx(
                    'inline-flex items-center justify-center rounded-full px-2 py-0.5 text-xs',
                    isActive
                      ? 'bg-blue-100 text-blue-700'
                      : 'bg-neutral-200 text-neutral-600'
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
