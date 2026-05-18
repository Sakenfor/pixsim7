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
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
} from 'react';

import { Icon } from '@lib/icons';

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
   * available horizontal space with a floor of `min-w-[14rem]`.
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
  // True only when one copy of the buffer overflows the ticker width. The
  // marquee renders the buffer twice ONLY in this case (for a seamless
  // wrap). When the content fits we render a single copy — otherwise the
  // leftover space shows the start of copy 2 and every item looks doubled.
  const [needsScroll, setNeedsScroll] = useState(false);
  const [showSourcePicker, setShowSourcePicker] = useState(false);
  const tickerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const firstGroupRef = useRef<HTMLDivElement>(null);
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

  useEffect(() => {
    setOffset(0);
  }, [events]);

  // Measure whether one copy overflows the ticker. Drives both the
  // single-vs-double render and whether the scroll animation runs.
  // Re-measures on events/expand changes and on container resize (greedy
  // layout means width changes as the toolbar reflows).
  useLayoutEffect(() => {
    const ticker = tickerRef.current;
    const firstGroup = firstGroupRef.current;
    if (!expanded || !ticker || !firstGroup) {
      setNeedsScroll(false);
      return undefined;
    }
    const measure = () => {
      const fg = firstGroupRef.current;
      const tk = tickerRef.current;
      if (!fg || !tk) return;
      setNeedsScroll(fg.scrollWidth > tk.clientWidth + 1);
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(measure);
    ro.observe(ticker);
    ro.observe(firstGroup);
    return () => ro.disconnect();
  }, [events, expanded]);

  // Scrolling animation. Pauses on hover. Only runs when content overflows.
  useEffect(() => {
    if (!expanded || paused || !needsScroll || events.length === 0) {
      setOffset(0);
      return undefined;
    }

    const content = contentRef.current;
    const ticker = tickerRef.current;
    const firstGroup = firstGroupRef.current;
    if (!content || !ticker || !firstGroup) return undefined;

    // Seamless loop: the buffer is rendered twice and we scroll by exactly
    // ONE copy's width (plus the seam gap between the two copies), then
    // wrap — copy 2 is sitting exactly where copy 1 started, so the wrap is
    // invisible. (The old code scrolled past BOTH copies before resetting,
    // so every item was visibly shown twice with a blank gap on wrap.)
    const oneCopyWidth = firstGroup.scrollWidth;

    // Seam gap = the outer flex gap between the two copy groups. Read it
    // off computed style so the period stays exact regardless of rem size.
    const seamGap =
      parseFloat(getComputedStyle(content).columnGap || '0') || 0;
    const period = oneCopyWidth + seamGap;

    let animationFrame = 0;
    let lastTime = performance.now();

    const animate = (time: number) => {
      const delta = time - lastTime;
      lastTime = time;
      setOffset((prev) => {
        const nextOffset = prev + (SCROLL_SPEED * delta) / 1000;
        return nextOffset >= period ? nextOffset - period : nextOffset;
      });
      animationFrame = requestAnimationFrame(animate);
    };

    animationFrame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationFrame);
  }, [expanded, paused, needsScroll, events]);

  // We DON'T early-return when `events.length === 0` — the chevron must
  // remain reachable so the user can enable a source for the first time
  // (chicken-and-egg: no events yet because no source is on yet). When
  // empty, the ticker shows a small placeholder instead of disappearing.
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
        greedy && 'flex-1 basis-0 min-w-0',
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

      {expanded && (
        <div
          ref={tickerRef}
          className={clsx(
            'relative overflow-hidden h-5 bg-neutral-100/50 dark:bg-neutral-800/50 rounded text-[10px]',
            greedy && 'flex-1 w-full min-w-[14rem]',
          )}
          style={greedy ? undefined : { width }}
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
        >
          {hasEvents ? (
            <div
              ref={contentRef}
              className="absolute whitespace-nowrap flex items-center h-full gap-4 px-2"
              style={{ transform: `translateX(-${offset}px)` }}
            >
              {/* The first group is always rendered and is measured to
                  derive the wrap period. The second group is a duplicate
                  that ONLY exists while scrolling — it provides the
                  seamless wrap. Rendering it when the content already fits
                  would show the start of copy 2 in the leftover space,
                  which looks like every item is doubled. */}
              <div ref={firstGroupRef} className="flex items-center gap-4">
                {events.map((event) => (
                  <TickerItem key={event.id} event={event} />
                ))}
              </div>
              {needsScroll && (
                <div className="flex items-center gap-4" aria-hidden="true">
                  {events.map((event) => (
                    <TickerItem key={`${event.id}-dup`} event={event} />
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="h-full px-2 flex items-center text-neutral-500 dark:text-neutral-400">
              No recent items from enabled sources
            </div>
          )}
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
      {event.icon && (
        // `Icon` renders registered names (e.g. plan-type icons like
        // `sparkles`) as SVGs and gracefully falls back to rendering the raw
        // string for emoji sources (📋, 🎬, …).
        <Icon name={event.icon} size={12} aria-hidden="true" />
      )}
      <span>{event.message}</span>
    </span>
  );
}
