import type { DocLink, DocPageResponse } from '@pixsim7/shared.types';
import { DocAstRenderer } from '@pixsim7/shared.ui';
import { useEffect, useMemo, useState } from 'react';

import { pixsimClient } from '@lib/api/client';

interface DocViewerProps {
  docPath: string;
  onNavigateDoc?: (path: string) => void;
}

export function DocViewer({ docPath, onNavigateDoc }: DocViewerProps) {
  const [data, setData] = useState<DocPageResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (!docPath) return;
      setIsLoading(true);
      setError(null);

      try {
        const response = await pixsimClient.get<DocPageResponse>('/dev/docs/page', {
          params: { path: docPath },
        });

        if (!cancelled) {
          setData(response);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load doc');
          setData(null);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [docPath]);

  const linkMap = useMemo(() => {
    const map = new Map<string, DocLink>();
    if (data?.links) {
      for (const link of data.links) {
        map.set(link.href, link);
      }
    }
    return map;
  }, [data?.links]);

  const resolveLink = (href: string) => linkMap.get(href) ?? null;

  return (
    <div className="mt-4 border-t border-neutral-200 dark:border-neutral-700 pt-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
            {data?.title ?? docPath}
          </h3>
          {data?.summary && (
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
              {data.summary}
            </p>
          )}
        </div>
        <div className="text-xs text-neutral-500 dark:text-neutral-400">
          <code>{docPath}</code>
        </div>
      </div>

      {isLoading && (
        <div className="text-sm text-neutral-500 dark:text-neutral-400">
          Loading documentation...
        </div>
      )}

      {error && (
        <div className="text-sm text-red-600 dark:text-red-400">
          {error}
        </div>
      )}

      {data && !isLoading && !error && (
        <DocAstRenderer
          nodes={data.ast}
          resolveLink={resolveLink}
          onNavigateDoc={onNavigateDoc}
          className="text-sm text-neutral-800 dark:text-neutral-200"
        />
      )}

      {data?.links && data.links.length > 0 && (
        <div className="mt-4">
          <div className="text-xs font-semibold uppercase text-neutral-500 dark:text-neutral-400">
            Links
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {data.links.map((link) => {
              const label = link.title || link.resolvedPath || link.href;
              const isDoc = link.kind === 'doc' && link.resolvedPath && onNavigateDoc;

              return (
                <button
                  key={`${link.href}-${label}`}
                  onClick={() => {
                    if (isDoc && link.resolvedPath) {
                      onNavigateDoc(link.resolvedPath);
                    }
                  }}
                  className={
                    isDoc
                      ? 'text-xs px-2 py-1 rounded border border-blue-200 text-blue-700 hover:bg-blue-50 dark:border-blue-700 dark:text-blue-300 dark:hover:bg-blue-900/20'
                      : 'text-xs px-2 py-1 rounded border border-neutral-200 text-neutral-600 dark:border-neutral-700 dark:text-neutral-400'
                  }
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {data?.backlinks && data.backlinks.length > 0 && (
        <div className="mt-4">
          <div className="text-xs font-semibold uppercase text-neutral-500 dark:text-neutral-400">
            Referenced By
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {data.backlinks.map((path) => (
              <button
                key={path}
                onClick={() => onNavigateDoc?.(path)}
                className="text-xs px-2 py-1 rounded border border-emerald-200 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-700 dark:text-emerald-300 dark:hover:bg-emerald-900/20"
              >
                {path}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
