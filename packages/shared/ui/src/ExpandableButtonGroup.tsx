import { ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import clsx from 'clsx';
import { useHoverExpand } from './useHoverExpand';

export interface ExpandableButtonGroupProps {
  /** The trigger element (usually a button) */
  trigger: ReactNode;
  /** The content to show when expanded */
  children: ReactNode;
  /** Direction to expand towards */
  direction?: 'down' | 'up' | 'left' | 'right';
  /** Additional className for the trigger wrapper */
  triggerClassName?: string;
  /** Additional className for the content wrapper */
  contentClassName?: string;
  /** Delay in ms before expanding on hover (prevents accidental triggers) */
  hoverDelay?: number;
  /** Delay in ms before collapsing on mouse leave (allows time to reach expanded content) */
  collapseDelay?: number;
  /** Distance offset from trigger in pixels */
  offset?: number;
  /** Enable stagger animation for children */
  staggerChildren?: boolean;
  /** Stagger delay between children in seconds */
  staggerDelay?: number;
}

export function ExpandableButtonGroup({
  trigger,
  children,
  direction = 'down',
  triggerClassName,
  contentClassName,
  hoverDelay = 150,
  collapseDelay = 100,
  offset = 4,
  staggerChildren = false,
  staggerDelay = 0.05,
}: ExpandableButtonGroupProps) {
  const { isExpanded, handlers } = useHoverExpand({
    expandDelay: hoverDelay,
    collapseDelay,
  });

  // Animation variants based on direction
  const animations = {
    down: {
      initial: { y: -10, opacity: 0, scale: 0.95 },
      animate: { y: 0, opacity: 1, scale: 1 }
    },
    up: {
      initial: { y: 10, opacity: 0, scale: 0.95 },
      animate: { y: 0, opacity: 1, scale: 1 }
    },
    left: {
      initial: { x: 10, opacity: 0, scale: 0.95 },
      animate: { x: 0, opacity: 1, scale: 1 }
    },
    right: {
      initial: { x: -10, opacity: 0, scale: 0.95 },
      animate: { x: 0, opacity: 1, scale: 1 }
    },
  };

  // Position styles based on direction
  const positionClasses = {
    down: 'top-full',
    up: 'bottom-full',
    left: 'right-full',
    right: 'left-full',
  };

  const positionStyles = {
    down: { marginTop: offset },
    up: { marginBottom: offset },
    left: { marginRight: offset },
    right: { marginLeft: offset },
  };

  // Container variants for stagger effect
  const containerVariants = staggerChildren
    ? {
        hidden: { opacity: 0 },
        show: {
          opacity: 1,
          transition: {
            staggerChildren: staggerDelay,
          },
        },
      }
    : undefined;

  return (
    <div
      className={clsx('relative inline-block', triggerClassName)}
      {...handlers}
    >
      {/* Trigger element */}
      {trigger}

      {/* Expandable content */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={animations[direction].initial}
            animate={animations[direction].animate}
            exit={animations[direction].initial}
            transition={{
              duration: 0.2,
              ease: [0.4, 0, 0.2, 1], // Custom easing for smooth feel
            }}
            variants={containerVariants}
            className={clsx(
              'absolute z-30',
              positionClasses[direction],
              contentClassName
            )}
            style={positionStyles[direction]}
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Helper component for staggered items
export const ExpandableItem = motion.div;

// Preset variants for common item animations
export const expandableItemVariants = {
  hidden: { opacity: 0, x: -10 },
  show: { opacity: 1, x: 0 },
};
