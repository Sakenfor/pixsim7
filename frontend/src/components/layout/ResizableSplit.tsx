import React, { useRef, useState } from 'react';
import clsx from 'clsx';

interface Props {
  direction: 'row' | 'col';
  sizes: number[]; // percentages
  onSizesChange?: (next: number[]) => void;
  children: React.ReactNode[];
}

export const ResizableSplit: React.FC<Props> = ({ direction, sizes, onSizesChange, children }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const dragIndexRef = useRef<number | null>(null);

  const isRow = direction === 'row';

  function onMouseDown(i: number) {
    dragIndexRef.current = i;
    setDragIndex(i);

    const handleMouseMove = (e: MouseEvent) => {
      const currentDragIndex = dragIndexRef.current;
      if (currentDragIndex === null || !containerRef.current) return;

      const rect = containerRef.current.getBoundingClientRect();
      const total = isRow ? rect.width : rect.height;
      const pos = isRow ? e.clientX - rect.left : e.clientY - rect.top;
      const prevSizes = [...sizes];

      let acc = 0;
      for (let i = 0; i < currentDragIndex; i++) acc += (prevSizes[i] / 100) * total;
      let nextAcc = pos;
      nextAcc = Math.max(60, Math.min(total - 60, nextAcc)); // min 60px per side

      const sumPrev = prevSizes.slice(0, currentDragIndex).reduce((a, b) => a + b, 0);
      const sumRest = prevSizes.slice(currentDragIndex + 1).reduce((a, b) => a + b, 0);
      const mid = (nextAcc / total) * 100 - sumPrev;
      const last = 100 - (sumPrev + mid + sumRest);

      const next = [...prevSizes];
      next[currentDragIndex] = mid;
      next[currentDragIndex + 1] = last;
      onSizesChange?.(next);
    };

    const handleMouseUp = () => {
      dragIndexRef.current = null;
      setDragIndex(null);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  }

  return (
    <div ref={containerRef} className={clsx('flex h-full w-full gap-1 p-1', isRow ? 'flex-row' : 'flex-col')}>
      {children.map((child, i) => (
        <React.Fragment key={i}>
          <div style={{ [isRow ? 'width' : 'height']: `${sizes[i]}%` } as any} className="min-w-[60px] min-h-[60px]">
            {child}
          </div>
          {i < children.length - 1 && (
            <div
              role="separator"
              aria-orientation={isRow ? 'vertical' : 'horizontal'}
              onMouseDown={() => onMouseDown(i)}
              className={clsx(
                'bg-neutral-300 dark:bg-neutral-600 hover:bg-blue-400 dark:hover:bg-blue-500 transition-colors flex-shrink-0',
                dragIndex === i && 'bg-blue-500 dark:bg-blue-400',
                isRow ? 'w-[6px] cursor-col-resize' : 'h-[6px] cursor-row-resize'
              )}
              title="Drag to resize"
            />
          )}
        </React.Fragment>
      ))}
    </div>
  );
};
