/**
 * NotificationTicker Component
 *
 * A news-style ticker that displays recent generation events.
 * Shows scrolling notifications for started, completed, and failed generations.
 */
import { useState, useEffect, useMemo, useRef } from 'react';
import clsx from 'clsx';
import { useGenerationsStore, isGenerationActive } from '@features/generation';

interface TickerEvent {
  id: string;
  generationId: number;
  type: 'started' | 'completed' | 'failed' | 'processing';
  message: string;
  timestamp: number;
}

// How long to keep events in the ticker (ms)
const EVENT_TTL = 60_000; // 1 minute
// Animation speed (pixels per second)
const SCROLL_SPEED = 40;

export function NotificationTicker() {
  const [events, setEvents] = useState<TickerEvent[]>([]);
  const [expanded, setExpanded] = useState(true);
  const [paused, setPaused] = useState(false);
  const tickerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [offset, setOffset] = useState(0);

  const generations = useGenerationsStore((s) => s.generations);

  // Track previous generation states to detect changes
  const prevGenerationsRef = useRef<Map<number, string>>(new Map());

  // Detect generation state changes and create events
  useEffect(() => {
    const prev = prevGenerationsRef.current;
    const now = Date.now();

    generations.forEach((gen, id) => {
      const prevStatus = prev.get(id);
      const currentStatus = gen.status;

      // New generation or status changed
      if (prevStatus !== currentStatus) {
        let event: TickerEvent | null = null;

        if (!prevStatus && isGenerationActive(currentStatus)) {
          // New generation started (skip separate processing event for new gens)
          event = {
            id: `${id}-started-${now}`,
            generationId: id,
            type: 'started',
            message: `#${id} started`,
            timestamp: now,
          };
        } else if (prevStatus && currentStatus === 'processing' && prevStatus !== 'processing') {
          // Existing generation moved to processing (not a new generation)
          event = {
            id: `${id}-processing-${now}`,
            generationId: id,
            type: 'processing',
            message: `#${id} processing...`,
            timestamp: now,
          };
        } else if (currentStatus === 'completed') {
          event = {
            id: `${id}-completed-${now}`,
            generationId: id,
            type: 'completed',
            message: `#${id} completed ✓`,
            timestamp: now,
          };
        } else if (currentStatus === 'failed') {
          const errorSnippet = gen.error_message
            ? gen.error_message.slice(0, 30) + (gen.error_message.length > 30 ? '...' : '')
            : 'failed';
          event = {
            id: `${id}-failed-${now}`,
            generationId: id,
            type: 'failed',
            message: `#${id} ${errorSnippet}`,
            timestamp: now,
          };
        }

        if (event) {
          setEvents((prev) => {
            // Remove old events for same generation with same type
            const filtered = prev.filter(
              (e) => !(e.generationId === id && e.type === event!.type)
            );
            return [...filtered, event!];
          });
        }
      }
    });

    // Update previous state
    const newPrev = new Map<number, string>();
    generations.forEach((gen, id) => {
      newPrev.set(id, gen.status);
    });
    prevGenerationsRef.current = newPrev;
  }, [generations]);

  // Cleanup old events
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      setEvents((prev) => prev.filter((e) => now - e.timestamp < EVENT_TTL));
    }, 10_000);
    return () => clearInterval(interval);
  }, []);

  // Scrolling animation
  useEffect(() => {
    if (!expanded || paused || events.length === 0) return;

    const content = contentRef.current;
    const ticker = tickerRef.current;
    if (!content || !ticker) return;

    const contentWidth = content.scrollWidth;
    const tickerWidth = ticker.clientWidth;

    // Only scroll if content is wider than container
    if (contentWidth <= tickerWidth) {
      setOffset(0);
      return;
    }

    let animationFrame: number;
    let lastTime = performance.now();

    const animate = (time: number) => {
      const delta = time - lastTime;
      lastTime = time;

      setOffset((prev) => {
        const newOffset = prev + (SCROLL_SPEED * delta) / 1000;
        // Reset when scrolled past content
        if (newOffset > contentWidth) {
          return -tickerWidth;
        }
        return newOffset;
      });

      animationFrame = requestAnimationFrame(animate);
    };

    animationFrame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationFrame);
  }, [expanded, paused, events.length]);

  // Count active generations
  const activeCount = useMemo(() => {
    let count = 0;
    generations.forEach((gen) => {
      if (isGenerationActive(gen.status)) count++;
    });
    return count;
  }, [generations]);

  // Get icon for event type
  const getEventIcon = (type: TickerEvent['type']) => {
    switch (type) {
      case 'started':
        return '🚀';
      case 'processing':
        return '⚙️';
      case 'completed':
        return '✅';
      case 'failed':
        return '❌';
    }
  };

  // Get color for event type
  const getEventColor = (type: TickerEvent['type']) => {
    switch (type) {
      case 'started':
        return 'text-blue-500';
      case 'processing':
        return 'text-amber-500';
      case 'completed':
        return 'text-green-500';
      case 'failed':
        return 'text-red-500';
    }
  };

  if (events.length === 0 && activeCount === 0) {
    return null; // Hide when nothing to show
  }

  return (
    <div className="flex items-center gap-1">
      {/* Collapse/expand toggle */}
      <button
        onClick={() => setExpanded(!expanded)}
        className={clsx(
          'text-xs px-1.5 py-0.5 rounded transition-colors relative',
          'hover:bg-blue-100 dark:hover:bg-blue-900/30',
          activeCount > 0 && 'animate-pulse'
        )}
        title={expanded ? 'Collapse notifications' : 'Expand notifications'}
      >
        {activeCount > 0 ? (
          <span className="flex items-center gap-0.5">
            <span className="animate-spin">⚙️</span>
            <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400">
              {activeCount}
            </span>
          </span>
        ) : (
          '📢'
        )}
      </button>

      {/* Ticker display */}
      {expanded && events.length > 0 && (
        <div
          ref={tickerRef}
          className="relative overflow-hidden w-48 h-5 bg-neutral-100/50 dark:bg-neutral-800/50 rounded text-[10px]"
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
        >
          <div
            ref={contentRef}
            className="absolute whitespace-nowrap flex items-center h-full gap-4 px-2"
            style={{ transform: `translateX(-${offset}px)` }}
          >
            {events.map((event) => (
              <span
                key={event.id}
                className={clsx('flex items-center gap-1', getEventColor(event.type))}
              >
                <span>{getEventIcon(event.type)}</span>
                <span>{event.message}</span>
              </span>
            ))}
            {/* Duplicate for seamless loop */}
            {events.map((event) => (
              <span
                key={`${event.id}-dup`}
                className={clsx('flex items-center gap-1', getEventColor(event.type))}
              >
                <span>{getEventIcon(event.type)}</span>
                <span>{event.message}</span>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
