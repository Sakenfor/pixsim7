import { createContext, useContext, useMemo } from 'react';

export type Orientation = 'horizontal' | 'vertical';

interface OrientationValue {
  orientation: Orientation;
  isVertical: boolean;
  isHorizontal: boolean;
}

const OrientationContext = createContext<OrientationValue>({
  orientation: 'horizontal',
  isVertical: false,
  isHorizontal: true,
});

export function OrientationProvider({
  orientation,
  children,
}: {
  orientation: Orientation;
  children: React.ReactNode;
}) {
  const value = useMemo<OrientationValue>(
    () => ({
      orientation,
      isVertical: orientation === 'vertical',
      isHorizontal: orientation === 'horizontal',
    }),
    [orientation],
  );

  return (
    <OrientationContext.Provider value={value}>
      {children}
    </OrientationContext.Provider>
  );
}

export function useOrientation() {
  return useContext(OrientationContext);
}
