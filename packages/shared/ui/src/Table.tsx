import React from 'react';
import { clsx } from 'clsx';

/**
 * Table — canonical table component system.
 * REUSE these components for any tabular data across the app.
 *
 * Features:
 * - Responsive with horizontal scroll
 * - Dark mode support
 * - Hover states
 * - Flexible column alignment
 * - Striped rows option
 *
 * Usage:
 * <Table>
 *   <TableHeader>
 *     <TableRow>
 *       <TableHead>Name</TableHead>
 *       <TableHead align="right">Count</TableHead>
 *     </TableRow>
 *   </TableHeader>
 *   <TableBody>
 *     <TableRow>
 *       <TableCell>Item 1</TableCell>
 *       <TableCell align="right">42</TableCell>
 *     </TableRow>
 *   </TableBody>
 * </Table>
 */

export interface TableProps {
  children: React.ReactNode;
  className?: string;
  /** Enable striped rows for better readability */
  striped?: boolean;
}

export function Table({ children, className, striped = false }: TableProps) {
  return (
    <div className="overflow-x-auto">
      <table className={clsx('w-full text-sm', striped && 'table-striped', className)}>
        {children}
      </table>
    </div>
  );
}

export interface TableHeaderProps {
  children: React.ReactNode;
  className?: string;
}

export function TableHeader({ children, className }: TableHeaderProps) {
  return (
    <thead
      className={clsx(
        'bg-neutral-100 dark:bg-neutral-800 border-b dark:border-neutral-700',
        className
      )}
    >
      {children}
    </thead>
  );
}

export interface TableBodyProps {
  children: React.ReactNode;
  className?: string;
}

export function TableBody({ children, className }: TableBodyProps) {
  return <tbody className={className}>{children}</tbody>;
}

export interface TableRowProps {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
}

export function TableRow({ children, className, onClick }: TableRowProps) {
  return (
    <tr
      className={clsx(
        'border-b dark:border-neutral-700',
        onClick && 'cursor-pointer',
        'hover:bg-neutral-50 dark:hover:bg-neutral-800/50',
        className
      )}
      onClick={onClick}
    >
      {children}
    </tr>
  );
}

export interface TableHeadProps {
  children: React.ReactNode;
  className?: string;
  /** Text alignment */
  align?: 'left' | 'center' | 'right';
}

export function TableHead({ children, className, align = 'left' }: TableHeadProps) {
  return (
    <th
      className={clsx(
        'px-3 py-2 font-semibold',
        align === 'left' && 'text-left',
        align === 'center' && 'text-center',
        align === 'right' && 'text-right',
        className
      )}
    >
      {children}
    </th>
  );
}

export interface TableCellProps {
  children: React.ReactNode;
  className?: string;
  /** Text alignment */
  align?: 'left' | 'center' | 'right';
}

export function TableCell({ children, className, align = 'left' }: TableCellProps) {
  return (
    <td
      className={clsx(
        'px-3 py-2',
        align === 'left' && 'text-left',
        align === 'center' && 'text-center',
        align === 'right' && 'text-right',
        className
      )}
    >
      {children}
    </td>
  );
}
