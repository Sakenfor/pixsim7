import React from 'react';
import clsx from 'clsx';

export interface BadgeProps {
  color?: 'blue' | 'green' | 'red' | 'gray' | 'purple';
  children: React.ReactNode;
  className?: string;
}

const colorMap: Record<string, string> = {
  blue: 'bg-blue-100 text-blue-700',
  green: 'bg-green-100 text-green-700',
  red: 'bg-red-100 text-red-700',
  gray: 'bg-neutral-200 text-neutral-700',
  purple: 'bg-purple-100 text-purple-700',
};

export function Badge({ color = 'gray', children, className }: BadgeProps) {
  return (
    <span className={clsx('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium', colorMap[color], className)}>
      {children}
    </span>
  );
}
