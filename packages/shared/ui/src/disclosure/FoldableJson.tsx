/**
 * FoldableJson - Collapsible JSON/dict viewer
 *
 * Renders nested objects and arrays with fold capability,
 * similar to browser DevTools or IDE JSON viewers.
 */

import * as React from 'react';
import clsx from 'clsx';

export interface FoldableJsonProps {
  /** The data to display */
  data: unknown;
  /** Initial depth to expand (0 = all collapsed, Infinity = all expanded) */
  defaultExpandDepth?: number;
  /** Maximum depth to render (prevents infinite recursion) */
  maxDepth?: number;
  /** Root name label (optional) */
  rootName?: string;
  /** Compact mode - less spacing */
  compact?: boolean;
  /** Additional class */
  className?: string;
  /** Show data types */
  showTypes?: boolean;
  /** Indent size in characters */
  indentSize?: number;
}

interface NodeContextValue {
  defaultExpandDepth: number;
  maxDepth: number;
  compact: boolean;
  showTypes: boolean;
  indentSize: number;
}

const NodeContext = React.createContext<NodeContextValue>({
  defaultExpandDepth: 1,
  maxDepth: 10,
  compact: false,
  showTypes: false,
  indentSize: 2,
});

/**
 * Foldable JSON viewer with collapsible nested structures
 *
 * @example
 * ```tsx
 * <FoldableJson
 *   data={{ name: "test", config: { nested: true, items: [1, 2, 3] } }}
 *   defaultExpandDepth={1}
 * />
 * ```
 */
export function FoldableJson({
  data,
  defaultExpandDepth = 1,
  maxDepth = 10,
  rootName,
  compact = false,
  className,
  showTypes = false,
  indentSize = 2,
}: FoldableJsonProps) {
  const contextValue = React.useMemo(
    () => ({ defaultExpandDepth, maxDepth, compact, showTypes, indentSize }),
    [defaultExpandDepth, maxDepth, compact, showTypes, indentSize]
  );

  return (
    <NodeContext.Provider value={contextValue}>
      <div
        className={clsx(
          'foldable-json',
          'font-mono text-xs',
          'text-neutral-700 dark:text-neutral-300',
          className
        )}
      >
        <JsonNode value={data} depth={0} keyName={rootName} isLast={true} />
      </div>
    </NodeContext.Provider>
  );
}

// ============================================================================
// Internal Components
// ============================================================================

interface JsonNodeProps {
  value: unknown;
  depth: number;
  keyName?: string;
  isLast: boolean;
}

function JsonNode({ value, depth, keyName, isLast }: JsonNodeProps) {
  const ctx = React.useContext(NodeContext);

  if (depth > ctx.maxDepth) {
    return <span className="text-neutral-400">{"[max depth]"}</span>;
  }

  const type = getValueType(value);

  // Render based on type
  switch (type) {
    case 'object':
      return (
        <ObjectNode
          value={value as Record<string, unknown>}
          depth={depth}
          keyName={keyName}
          isLast={isLast}
        />
      );
    case 'array':
      return (
        <ArrayNode
          value={value as unknown[]}
          depth={depth}
          keyName={keyName}
          isLast={isLast}
        />
      );
    default:
      return (
        <PrimitiveNode
          value={value}
          type={type}
          depth={depth}
          keyName={keyName}
          isLast={isLast}
        />
      );
  }
}

interface ObjectNodeProps {
  value: Record<string, unknown>;
  depth: number;
  keyName?: string;
  isLast: boolean;
}

function ObjectNode({ value, depth, keyName, isLast }: ObjectNodeProps) {
  const ctx = React.useContext(NodeContext);
  const entries = Object.entries(value);
  const isEmpty = entries.length === 0;
  const [isOpen, setIsOpen] = React.useState(depth < ctx.defaultExpandDepth);

  const toggle = () => setIsOpen((prev) => !prev);

  const preview = React.useMemo(() => {
    if (isEmpty) return '{}';
    const keys = entries.slice(0, 3).map(([k]) => k);
    const more = entries.length > 3 ? ', ...' : '';
    return `{ ${keys.join(', ')}${more} }`;
  }, [entries, isEmpty]);

  const comma = isLast ? '' : ',';

  if (isEmpty) {
    return (
      <div className={clsx('json-line', ctx.compact ? 'leading-tight' : 'leading-relaxed')}>
        <Indent depth={depth} />
        {keyName !== undefined && <KeyLabel name={keyName} />}
        <span className="text-neutral-500">{'{}'}</span>
        <span className="text-neutral-400">{comma}</span>
      </div>
    );
  }

  return (
    <div className="json-object">
      {/* Header line */}
      <div
        className={clsx(
          'json-line cursor-pointer hover:bg-neutral-100 dark:hover:bg-neutral-800/50',
          ctx.compact ? 'leading-tight' : 'leading-relaxed'
        )}
        onClick={toggle}
      >
        <Indent depth={depth} />
        <FoldIndicator isOpen={isOpen} />
        {keyName !== undefined && <KeyLabel name={keyName} />}
        {isOpen ? (
          <span className="text-neutral-500">{'{'}</span>
        ) : (
          <>
            <span className="text-neutral-400 italic">{preview}</span>
            <span className="text-neutral-400">{comma}</span>
          </>
        )}
        {ctx.showTypes && !isOpen && (
          <TypeBadge type="object" count={entries.length} />
        )}
      </div>

      {/* Children */}
      {isOpen && (
        <>
          {entries.map(([key, val], i) => (
            <JsonNode
              key={key}
              value={val}
              depth={depth + 1}
              keyName={key}
              isLast={i === entries.length - 1}
            />
          ))}
          <div className={clsx('json-line', ctx.compact ? 'leading-tight' : 'leading-relaxed')}>
            <Indent depth={depth} />
            <span className="text-neutral-500">{'}'}</span>
            <span className="text-neutral-400">{comma}</span>
          </div>
        </>
      )}
    </div>
  );
}

interface ArrayNodeProps {
  value: unknown[];
  depth: number;
  keyName?: string;
  isLast: boolean;
}

function ArrayNode({ value, depth, keyName, isLast }: ArrayNodeProps) {
  const ctx = React.useContext(NodeContext);
  const isEmpty = value.length === 0;
  const [isOpen, setIsOpen] = React.useState(depth < ctx.defaultExpandDepth);

  const toggle = () => setIsOpen((prev) => !prev);

  const preview = React.useMemo(() => {
    if (isEmpty) return '[]';
    if (value.length <= 3 && value.every(isPrimitive)) {
      return `[${value.map(formatPrimitive).join(', ')}]`;
    }
    return `[${value.length} items]`;
  }, [value, isEmpty]);

  const comma = isLast ? '' : ',';

  if (isEmpty) {
    return (
      <div className={clsx('json-line', ctx.compact ? 'leading-tight' : 'leading-relaxed')}>
        <Indent depth={depth} />
        {keyName !== undefined && <KeyLabel name={keyName} />}
        <span className="text-neutral-500">{'[]'}</span>
        <span className="text-neutral-400">{comma}</span>
      </div>
    );
  }

  return (
    <div className="json-array">
      {/* Header line */}
      <div
        className={clsx(
          'json-line cursor-pointer hover:bg-neutral-100 dark:hover:bg-neutral-800/50',
          ctx.compact ? 'leading-tight' : 'leading-relaxed'
        )}
        onClick={toggle}
      >
        <Indent depth={depth} />
        <FoldIndicator isOpen={isOpen} />
        {keyName !== undefined && <KeyLabel name={keyName} />}
        {isOpen ? (
          <span className="text-neutral-500">{'['}</span>
        ) : (
          <>
            <span className="text-neutral-400 italic">{preview}</span>
            <span className="text-neutral-400">{comma}</span>
          </>
        )}
        {ctx.showTypes && !isOpen && (
          <TypeBadge type="array" count={value.length} />
        )}
      </div>

      {/* Children */}
      {isOpen && (
        <>
          {value.map((item, i) => (
            <JsonNode
              key={i}
              value={item}
              depth={depth + 1}
              keyName={undefined}
              isLast={i === value.length - 1}
            />
          ))}
          <div className={clsx('json-line', ctx.compact ? 'leading-tight' : 'leading-relaxed')}>
            <Indent depth={depth} />
            <span className="text-neutral-500">{']'}</span>
            <span className="text-neutral-400">{comma}</span>
          </div>
        </>
      )}
    </div>
  );
}

interface PrimitiveNodeProps {
  value: unknown;
  type: ValueType;
  depth: number;
  keyName?: string;
  isLast: boolean;
}

function PrimitiveNode({ value, type, depth, keyName, isLast }: PrimitiveNodeProps) {
  const ctx = React.useContext(NodeContext);
  const comma = isLast ? '' : ',';

  const colorClasses: Record<ValueType, string> = {
    string: 'text-green-600 dark:text-green-400',
    number: 'text-blue-600 dark:text-blue-400',
    boolean: 'text-purple-600 dark:text-purple-400',
    null: 'text-neutral-500 dark:text-neutral-500',
    undefined: 'text-neutral-500 dark:text-neutral-500',
    object: 'text-neutral-600 dark:text-neutral-400',
    array: 'text-neutral-600 dark:text-neutral-400',
  };
  const colorClass = colorClasses[type];

  return (
    <div className={clsx('json-line', ctx.compact ? 'leading-tight' : 'leading-relaxed')}>
      <Indent depth={depth} />
      {keyName !== undefined && <KeyLabel name={keyName} />}
      <span className={colorClass}>{formatValue(value, type)}</span>
      <span className="text-neutral-400">{comma}</span>
    </div>
  );
}

// ============================================================================
// Utility Components
// ============================================================================

function Indent({ depth }: { depth: number }) {
  const ctx = React.useContext(NodeContext);
  if (depth === 0) return null;
  return <span className="whitespace-pre">{' '.repeat(depth * ctx.indentSize)}</span>;
}

function KeyLabel({ name }: { name: string }) {
  return (
    <>
      <span className="text-rose-600 dark:text-rose-400">"{name}"</span>
      <span className="text-neutral-500">: </span>
    </>
  );
}

function FoldIndicator({ isOpen }: { isOpen: boolean }) {
  return (
    <span
      className={clsx(
        'inline-block w-3 text-center',
        'text-neutral-400 dark:text-neutral-500',
        'select-none'
      )}
    >
      {isOpen ? '▾' : '▸'}
    </span>
  );
}

function TypeBadge({ type, count }: { type: 'object' | 'array'; count: number }) {
  return (
    <span className="ml-1 px-1 py-0.5 text-[9px] bg-neutral-200 dark:bg-neutral-700 rounded text-neutral-500 dark:text-neutral-400">
      {type === 'object' ? `${count} keys` : `${count} items`}
    </span>
  );
}

// ============================================================================
// Utilities
// ============================================================================

type ValueType = 'object' | 'array' | 'string' | 'number' | 'boolean' | 'null' | 'undefined';

function getValueType(value: unknown): ValueType {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'object') return 'object';
  if (typeof value === 'string') return 'string';
  if (typeof value === 'number') return 'number';
  if (typeof value === 'boolean') return 'boolean';
  return 'string'; // fallback
}

function isPrimitive(value: unknown): boolean {
  return value === null || typeof value !== 'object';
}

function formatPrimitive(value: unknown): string {
  if (typeof value === 'string') return `"${value}"`;
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  return String(value);
}

function formatValue(value: unknown, type: ValueType): string {
  switch (type) {
    case 'string':
      // Truncate long strings
      const str = value as string;
      if (str.length > 100) {
        return `"${str.slice(0, 100)}..."`;
      }
      return `"${str}"`;
    case 'null':
      return 'null';
    case 'undefined':
      return 'undefined';
    case 'boolean':
      return value ? 'true' : 'false';
    case 'number':
      return String(value);
    default:
      return String(value);
  }
}
