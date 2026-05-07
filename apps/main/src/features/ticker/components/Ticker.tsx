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

import { Popover } from '@pixsim7/shared.ui';
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

import { NewsSourcesPicker } from './NewsSourcesPicker';

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
  /**
   * Override the marquee width with an explicit value (e.g. for narrow
   * surfaces). When omitted, the ticker is greedy: flex-grows to fill
   * available horizontal space within `min-w-[14rem]` … `max-w-[48rem]`.
   * Pass an explicit value to opt out of the greedy layout.
   */
  width?: CSSProperties['width'];
  /** Optional className for the outer wrapper. */
  className?: string;
  /**
   * Where the source-picker popover should open relative to its chevron
   * trigger. Default `'bottom'`. When the ticker lives on a bottom-edge
   * surface (e.g. CC docked at screen bottom), pass `'top'` so the popover
   * floats up into the screen rather than off the bottom of the viewport.
   */
  sourcePickerPlacement?: 'top' | 'bottom' | 'left' | 'right';
}

export function Ticker({
  width,
  className,
  sourcePickerPlacement = 'bottom',
}: TickerProps) {
  const sources = useRegisteredSources();
  const enabledSources = useTickerSettingsStore((s) => s.enabledSources);

  const [events, setEvents] = useState<TickerEvent[]>([]);
  const [expanded, setExpanded] = useState(true);
  const [paused, setPaused] = useState(false);
  const [offset, setOffset] = useState(0);
  const [showSourcePicker, setShowSourcePicker] = useState(false);
  const tickerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const chevronRef = useRef<HTMLButtonElement>(null);

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

  // We DON'T early-return when `events.length === 0` — the chevron must
  // remain reachable so the user can enable a source for the first time
  // (chicken-and-egg: no events yet because no source is on yet). The
  // marquee itself still only renders when there's something to scroll.
  const hasEvents = events.length > 0;

  // Greedy layout: when no explicit `width` is given, the wrapper takes
  // remaining horizontal space (`flex-1 min-w-0`) and the marquee inside
  // grows to fill it within sensible bounds. With an explicit width, fall
  // back to the legacy fixed-size layout for surfaces that need it.
  const greedy = width == null;

  return (
    <div
      className={clsx(
        'flex items-center gap-1',
        greedy && 'flex-1 min-w-0',
        className,
      )}
    >
      <button
        onClick={() => setExpanded((v) => !v)}
        className="text-xs px-1.5 py-0.5 rounded transition-colors hover:bg-accent-subtle/50 dark:hover:bg-accent-subtle/30 flex-shrink-0"
        title={expanded ? 'Collapse news ticker' : 'Expand news ticker'}
        aria-label={expanded ? 'Collapse news ticker' : 'Expand news ticker'}
      >
        📢
      </button>

      {/* Chevron — quick toggle for which sources feed the ticker. */}
      <button
        ref={chevronRef}
        onClick={() => setShowSourcePicker((v) => !v)}
        className="text-[10px] px-1 py-0.5 rounded transition-colors hover:bg-accent-subtle/50 dark:hover:bg-accent-subtle/30 flex-shrink-0 text-neutral-500 dark:text-neutral-400"
        title="Choose news sources"
        aria-label="Choose news sources"
        aria-haspopup="menu"
        aria-expanded={showSourcePicker}
      >
        ▾
      </button>
      <Popover
        anchor={chevronRef.current}
        placement={sourcePickerPlacement}
        align="start"
        offset={4}
        open={showSourcePicker}
        onClose={() => setShowSourcePicker(false)}
        triggerRef={chevronRef}
        className="w-56 bg-white dark:bg-neutral-800 rounded-lg shadow-xl border border-neutral-200 dark:border-neutral-700 py-1"
      >
        <NewsSourcesPicker />
      </Popover>

      {expanded && hasEvents && (
        <div
          ref={tickerRef}
          className={clsx(
            'relative overflow-hidden h-5 bg-neutral-100/50 dark:bg-neutral-800/50 rounded text-[10px]',
            greedy && 'flex-1 min-w-[14rem] max-w-[48rem]',
          )}
          style={greedy ? undefined : { width }}
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
