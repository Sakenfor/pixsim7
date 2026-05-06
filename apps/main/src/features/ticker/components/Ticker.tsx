/**
 * Ticker — generic news-style scrolling marquee.
 *
 * Reads enabled sources from `tickerSettingsStore`, subscribes to each via
 * the registry, merges events into a buffered list, evicts by per-event
 * TTL, and renders a hover-pausable scrolling marquee. Click on an event
 * dispatches via `handleTickerEventClick` (typed `refType` → panel).
 *
 * The component is intentionally render-only — sources own their data
 * lifecycle. To add a new "type of news," write a `TickerSource` and
 * register it via `sources.registrations.ts`.
 */

import clsx from 'clsx';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
} from 'react';

import { handleTickerEventClick } from '../lib/clickThrough';
import {
  listTickerSources,
  subscribeToTickerRegistry,
  type TickerEvent,
  type TickerSource,
} from '../lib/sourceRegistry';
import {
  isSourceEnabled,
  useTickerSettingsStore,
} from '../stores/tickerSettingsStore';

/** Default event TTL when the source doesn't specify one (ms). */
const DEFAULT_TTL = 60_000;
/** Marquee scroll speed in pixels/second. */
const SCROLL_SPEED = 40;
/** How often to evict expired events (ms). */
const CLEANUP_INTERVAL = 10_000;

/** React-friendly snapshot of registered sources, reactive to register/unregister. */
function useRegisteredSources(): TickerSource[] {
  return useSyncExternalStore(
    subscribeToTickerRegistry,
    listTickerSources,
    listTickerSources,
  );
}

interface TickerProps {
  /** Override the marquee width (e.g. for narrow surfaces). Default: 12rem. */
  width?: CSSProperties['width'];
  /** Optional className for the outer wrapper. */
  className?: string;
}

export function Ticker({ width, className }: TickerProps) {
  const sources = useRegisteredSources();
  const enabledSources = useTickerSettingsStore((s) => s.enabledSources);

  const [events, setEvents] = useState<TickerEvent[]>([]);
  const [expanded, setExpanded] = useState(true);
  const [paused, setPaused] = useState(false);
  const [offset, setOffset] = useState(0);
  const tickerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  // Which sources are currently active (after settings + registry).
  const activeSources = useMemo(
    () =>
      sources.filter((src) =>
        isSourceEnabled({ enabledSources }, src),
      ),
    [sources, enabledSources],
  );

  // Subscribe / unsubscribe on activeSources change. Each source may push
  // events whenever it sees fit; we merge by event.id (newer replaces).
  useEffect(() => {
    if (activeSources.length === 0) return undefined;

    const emit = (event: TickerEvent) => {
      setEvents((prev) => {
        const filtered = prev.filter((e) => e.id !== event.id);
        return [...filtered, event];
      });
    };

    const unsubs: Array<() => void> = [];
    for (const src of activeSources) {
      try {
        // Optional one-shot hydrate (e.g. plans worklog backlog).
        src.initial?.()
          .then((seed) => {
            if (seed.length > 0) {
              setEvents((prev) => {
                const seen = new Set(prev.map((e) => e.id));
                return [...prev, ...seed.filter((e) => !seen.has(e.id))];
              });
            }
          })
          .catch((err) => {
            console.warn(`[ticker] ${src.id} initial() failed:`, err);
          });

        unsubs.push(src.subscribe(emit));
      } catch (err) {
        console.error(`[ticker] ${src.id} subscribe() threw:`, err);
      }
    }

    return () => {
      for (const u of unsubs) {
        try {
          u();
        } catch (err) {
          console.warn('[ticker] unsubscribe threw:', err);
        }
      }
    };
  }, [activeSources]);

  // TTL eviction — pinned events bypass.
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      setEvents((prev) =>
        prev.filter((e) => {
          if (e.pinned) return true;
          const ttl = e.ttl ?? DEFAULT_TTL;
          return now - e.timestamp < ttl;
        }),
      );
    }, CLEANUP_INTERVAL);
    return () => clearInterval(interval);
  }, []);

  // Scrolling animation. Pauses on hover. Skips when content fits.
  useEffect(() => {
    if (!expanded || paused || events.length === 0) return undefined;

    const content = contentRef.current;
    const ticker = tickerRef.current;
    if (!content || !ticker) return undefined;

    const contentWidth = content.scrollWidth;
    const tickerWidth = ticker.clientWidth;
    if (contentWidth <= tickerWidth) {
      setOffset(0);
      return undefined;
    }

    let animationFrame = 0;
    let lastTime = performance.now();

    const animate = (time: number) => {
      const delta = time - lastTime;
      lastTime = time;
      setOffset((prev) => {
        const nextOffset = prev + (SCROLL_SPEED * delta) / 1000;
        if (nextOffset > contentWidth) return -tickerWidth;
        return nextOffset;
      });
      animationFrame = requestAnimationFrame(animate);
    };

    animationFrame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationFrame);
  }, [expanded, paused, events.length]);

  if (events.length === 0) return null;

  return (
    <div className={clsx('flex items-center gap-1', className)}>
      <button
        onClick={() => setExpanded((v) => !v)}
        className="text-xs px-1.5 py-0.5 rounded transition-colors hover:bg-accent-subtle/50 dark:hover:bg-accent-subtle/30"
        title={expanded ? 'Collapse news ticker' : 'Expand news ticker'}
        aria-label={expanded ? 'Collapse news ticker' : 'Expand news ticker'}
      >
        📢
      </button>

      {expanded && (
        <div
          ref={tickerRef}
          className="relative overflow-hidden h-5 bg-neutral-100/50 dark:bg-neutral-800/50 rounded text-[10px]"
          style={{ width: width ?? '12rem' }}
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
        >
          <div
            ref={contentRef}
            className="absolute whitespace-nowrap flex items-center h-full gap-4 px-2"
            style={{ transform: `translateX(-${offset}px)` }}
          >
            {/* Render the buffer twice for seamless loop */}
            {events.map((event) => (
              <TickerItem key={event.id} event={event} />
            ))}
            {events.map((event) => (
              <TickerItem key={`${event.id}-dup`} event={event} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function TickerItem({ event }: { event: TickerEvent }) {
  const clickable = Boolean(event.refType ?? event.href);
  const onClick = clickable
    ? (e: React.MouseEvent) => {
        e.stopPropagation();
        handleTickerEventClick(event);
      }
    : undefined;

  return (
    <span
      className={clsx(
        'flex items-center gap-1',
        event.color,
        clickable &&
          'cursor-pointer hover:underline focus-visible:outline focus-visible:outline-1 focus-visible:outline-accent rounded',
      )}
      onClick={onClick}
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      onKeyDown={
        clickable
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleTickerEventClick(event);
              }
            }
          : undefined
      }
    >
      {event.icon && <span aria-hidden="true">{event.icon}</span>}
      <span>{event.message}</span>
    </span>
  );
}
