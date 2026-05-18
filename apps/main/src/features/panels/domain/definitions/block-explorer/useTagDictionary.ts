/**
 * useTagDictionary — classify block tag keys against the canonical tag
 * dictionary (status, alias, unknown) for the Block Explorer governance
 * overlay.
 *
 * The dictionary is fetched once and cached for the hook's lifetime.
 */

import { useEffect, useRef, useState } from 'react';

import { getBlockTagDictionary } from '@lib/api/blockTemplates';

export type TagKeyClass =
  | { kind: 'pending' }
  | { kind: 'ok' }
  | { kind: 'status'; status: string }
  | { kind: 'alias'; canonical: string }
  | { kind: 'unknown' };

export function useTagDictionary() {
  const statusByKeyRef = useRef<Map<string, string>>(new Map());
  const aliasToCanonicalRef = useRef<Map<string, string>>(new Map());
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getBlockTagDictionary({ include_values: false })
      .then((res) => {
        if (cancelled) return;
        const status = new Map<string, string>();
        const aliases = new Map<string, string>();
        for (const key of res.keys) {
          status.set(key.key, key.status);
          for (const aliasKey of key.aliases?.keys ?? []) {
            aliases.set(aliasKey, key.key);
          }
        }
        statusByKeyRef.current = status;
        aliasToCanonicalRef.current = aliases;
        setLoaded(true);
      })
      .catch(() => {
        // Best-effort — overlay simply stays absent.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const classifyTagKey = (key: string): TagKeyClass => {
    if (!loaded) return { kind: 'pending' };
    const status = statusByKeyRef.current.get(key);
    if (status) {
      return status === 'active' ? { kind: 'ok' } : { kind: 'status', status };
    }
    const canonical = aliasToCanonicalRef.current.get(key);
    if (canonical) return { kind: 'alias', canonical };
    return { kind: 'unknown' };
  };

  return { classifyTagKey };
}
