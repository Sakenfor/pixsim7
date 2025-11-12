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

  const isRow = direction === 'row';

  function onMouseDown(i: number) {
    setDragIndex(i);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }

  function onMouseMove(e: MouseEvent) {
    if (dragIndex === null || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const total = isRow ? rect.width : rect.height;
    const pos = isRow ? e.clientX - rect.left : e.clientY - rect.top;
    const prevSizes = [...sizes];

    let acc = 0;
    for (let i = 0; i < dragIndex; i++) acc += (prevSizes[i] / 100) * total;
    let nextAcc = pos;
    nextAcc = Math.max(60, Math.min(total - 60, nextAcc)); // min 60px per side

    const sumPrev = prevSizes.slice(0, dragIndex).reduce((a, b) => a + b, 0);
    const sumRest = prevSizes.slice(dragIndex + 1).reduce((a, b) => a + b, 0);
    const mid = (nextAcc / total) * 100 - sumPrev;
    const last = 100 - (sumPrev + mid + sumRest);

    const next = [...prevSizes];
    next[dragIndex] = mid;
    next[dragIndex + 1] = last;
    onSizesChange?.(next);
  }

  function onMouseUp() {
    setDragIndex(null);
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('mouseup', onMouseUp);
  }

  return (
    <div ref={containerRef} className={clsx('flex h-full w-full', isRow ? 'flex-row' : 'flex-col')}>
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
              className={clsx('bg-neutral-200 dark:bg-neutral-700', isRow ? 'w-1 cursor-col-resize' : 'h-1 cursor-row-resize')}
            />
          )}
        </React.Fragment>
      ))}
    </div>
  );
};
