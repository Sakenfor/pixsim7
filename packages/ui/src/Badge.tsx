import React from 'react';
import clsx from 'clsx';

export interface BadgeProps {
  color?: 'blue' | 'green' | 'red' | 'gray' | 'purple';
  children: React.ReactNode;
  className?: string;
}

const colorMap: Record<string, string> = {
  blue: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
  green: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300',
  red: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300',
  gray: 'bg-neutral-200 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300',
  purple: 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300',
};

export function Badge({ color = 'gray', children, className }: BadgeProps) {
  return (
    <span className={clsx('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium', colorMap[color], className)}>
      {children}
    </span>
  );
}
