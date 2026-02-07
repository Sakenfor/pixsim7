import clsx from 'clsx';
import type { DocAstNode, DocLinkKind } from '@pixsim7/shared.types';

export interface ResolvedDocLink {
  kind: DocLinkKind;
  resolvedPath?: string;
}

export interface DocAstRendererProps {
  nodes: DocAstNode[];
  className?: string;
  resolveLink?: (href: string) => ResolvedDocLink | null;
  onNavigateDoc?: (path: string) => void;
}

export function DocAstRenderer({
  nodes,
  className,
  resolveLink,
  onNavigateDoc,
}: DocAstRendererProps) {
  return (
    <div className={clsx('space-y-3 text-sm leading-6', className)}>
      {nodes.map((node, index) => renderBlock(node, index, resolveLink, onNavigateDoc))}
    </div>
  );
}

function renderBlock(
  node: DocAstNode,
  key: number,
  resolveLink?: (href: string) => ResolvedDocLink | null,
  onNavigateDoc?: (path: string) => void
) {
  switch (node.type) {
    case 'heading': {
      const level = Math.min(Math.max(node.level ?? 1, 1), 6);
      const Tag = `h${level}` as keyof JSX.IntrinsicElements;
      return (
        <Tag key={key} className="font-semibold text-neutral-900 dark:text-neutral-100">
          {renderInlineChildren(node.children ?? [], resolveLink, onNavigateDoc)}
        </Tag>
      );
    }
    case 'paragraph':
      return (
        <p key={key} className="text-neutral-800 dark:text-neutral-200">
          {renderInlineChildren(node.children ?? [], resolveLink, onNavigateDoc)}
        </p>
      );
    case 'block_code':
      return (
        <pre
          key={key}
          className="bg-neutral-900 text-neutral-100 rounded-md p-3 text-xs overflow-x-auto"
        >
          <code>{node.text}</code>
        </pre>
      );
    case 'block_quote':
      return (
        <blockquote
          key={key}
          className="border-l-2 border-neutral-300 dark:border-neutral-600 pl-3 text-neutral-700 dark:text-neutral-300"
        >
          {renderBlockChildren(node.children ?? [], resolveLink, onNavigateDoc)}
        </blockquote>
      );
    case 'list': {
      const Tag = node.ordered ? 'ol' : 'ul';
      const listClass = node.ordered ? 'list-decimal' : 'list-disc';
      return (
        <Tag key={key} className={clsx('pl-5 space-y-2', listClass)}>
          {renderBlockChildren(node.children ?? [], resolveLink, onNavigateDoc)}
        </Tag>
      );
    }
    case 'list_item':
      return (
        <li key={key} className="text-neutral-800 dark:text-neutral-200">
          {renderBlockChildren(node.children ?? [], resolveLink, onNavigateDoc)}
        </li>
      );
    case 'table':
      return (
        <div key={key} className="overflow-x-auto">
          <table className="min-w-full text-sm border border-neutral-200 dark:border-neutral-700">
            {renderTableSections(node.children ?? [], resolveLink, onNavigateDoc)}
          </table>
        </div>
      );
    case 'thematic_break':
      return <hr key={key} className="border-neutral-200 dark:border-neutral-700" />;
    case 'text':
      return (
        <p key={key} className="text-neutral-800 dark:text-neutral-200">
          {node.text}
        </p>
      );
    default:
      return (
        <div key={key} className="text-neutral-800 dark:text-neutral-200">
          {renderInlineChildren(node.children ?? [], resolveLink, onNavigateDoc)}
        </div>
      );
  }
}

function renderTableSections(
  children: DocAstNode[],
  resolveLink?: (href: string) => ResolvedDocLink | null,
  onNavigateDoc?: (path: string) => void
) {
  const head = children.find((child) => child.type === 'table_head');
  const body = children.find((child) => child.type === 'table_body');

  return (
    <>
      {head && (
        <thead className="bg-neutral-100 dark:bg-neutral-800">
          {renderTableRows(head.children ?? [], resolveLink, onNavigateDoc, true)}
        </thead>
      )}
      {body && (
        <tbody>
          {renderTableRows(body.children ?? [], resolveLink, onNavigateDoc, false)}
        </tbody>
      )}
    </>
  );
}

function renderTableRows(
  rows: DocAstNode[],
  resolveLink?: (href: string) => ResolvedDocLink | null,
  onNavigateDoc?: (path: string) => void,
  isHeader: boolean = false
) {
  return rows.map((row, rowIndex) => (
    <tr key={rowIndex} className="border-t border-neutral-200 dark:border-neutral-700">
      {(row.children ?? []).map((cell, cellIndex) => {
        const CellTag = isHeader ? 'th' : 'td';
        return (
          <CellTag
            key={cellIndex}
            className="px-3 py-2 text-left align-top text-neutral-800 dark:text-neutral-200"
          >
            {renderInlineChildren(cell.children ?? [], resolveLink, onNavigateDoc)}
          </CellTag>
        );
      })}
    </tr>
  ));
}

function renderBlockChildren(
  nodes: DocAstNode[],
  resolveLink?: (href: string) => ResolvedDocLink | null,
  onNavigateDoc?: (path: string) => void
) {
  return nodes.map((node, index) => renderBlock(node, index, resolveLink, onNavigateDoc));
}

function renderInlineChildren(
  nodes: DocAstNode[],
  resolveLink?: (href: string) => ResolvedDocLink | null,
  onNavigateDoc?: (path: string) => void
) {
  return nodes.map((node, index) => renderInline(node, index, resolveLink, onNavigateDoc));
}

function renderInline(
  node: DocAstNode,
  key: number,
  resolveLink?: (href: string) => ResolvedDocLink | null,
  onNavigateDoc?: (path: string) => void
) {
  switch (node.type) {
    case 'text':
      return <span key={key}>{node.text}</span>;
    case 'codespan':
      return (
        <code key={key} className="px-1 py-0.5 bg-neutral-100 dark:bg-neutral-800 rounded">
          {node.text}
        </code>
      );
    case 'strong':
      return (
        <strong key={key}>{renderInlineChildren(node.children ?? [], resolveLink, onNavigateDoc)}</strong>
      );
    case 'emphasis':
      return (
        <em key={key}>{renderInlineChildren(node.children ?? [], resolveLink, onNavigateDoc)}</em>
      );
    case 'link': {
      const href = node.link;
      const resolved = resolveLink?.(href) ?? null;
      const isDoc = resolved?.kind === 'doc' && resolved.resolvedPath && onNavigateDoc;

      return (
        <a
          key={key}
          href={href}
          onClick={(event) => {
            if (isDoc && resolved?.resolvedPath) {
              event.preventDefault();
              onNavigateDoc?.(resolved.resolvedPath);
            }
          }}
          className={clsx(
            'underline underline-offset-2',
            isDoc
              ? 'text-blue-600 hover:text-blue-800 dark:text-blue-300 dark:hover:text-blue-200'
              : 'text-neutral-700 dark:text-neutral-300'
          )}
        >
          {renderInlineChildren(node.children ?? [], resolveLink, onNavigateDoc)}
        </a>
      );
    }
    case 'image':
      return (
        <img
          key={key}
          src={node.src}
          alt={node.alt ?? ''}
          className="max-w-full rounded"
        />
      );
    case 'linebreak':
    case 'softbreak':
      return <br key={key} />;
    default:
      return (
        <span key={key}>{renderInlineChildren(node.children ?? [], resolveLink, onNavigateDoc)}</span>
      );
  }
}
