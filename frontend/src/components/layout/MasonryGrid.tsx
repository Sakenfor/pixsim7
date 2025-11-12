import React from 'react';

export interface MasonryGridProps {
  items: React.ReactNode[];
  columnGap?: number;
  rowGap?: number;
  minColumnWidth?: number;
}

export function MasonryGrid({
  items,
  columnGap = 16,
  rowGap = 16,
}: MasonryGridProps) {
  // Detect if user prefers reduced motion
  const prefersReducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Fallback to simple grid for reduced motion or unsupported browsers
  if (prefersReducedMotion) {
    return (
      <div
        className="grid gap-4 md:grid-cols-3 lg:grid-cols-4"
        style={{
          gap: `${rowGap}px ${columnGap}px`,
        }}
      >
        {items.map((item, index) => (
          <div key={index}>{item}</div>
        ))}
      </div>
    );
  }

  // Use CSS columns for masonry layout
  return (
    <div
      className="columns-1 md:columns-2 lg:columns-3 xl:columns-4"
      style={{
        columnGap: `${columnGap}px`,
        // @ts-expect-error CSS custom property for tailwind
        '--masonry-row-gap': `${rowGap}px`,
      }}
    >
      {items.map((item, index) => (
        <div
          key={index}
          className="break-inside-avoid inline-block w-full"
          style={{
            marginBottom: `${rowGap}px`,
          }}
        >
          {item}
        </div>
      ))}
    </div>
  );
}
