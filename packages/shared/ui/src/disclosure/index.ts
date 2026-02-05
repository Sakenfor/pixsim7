/**
 * Disclosure - Collapsible content pattern
 *
 * A framework-agnostic state management system with React bindings
 * for show/hide, accordion, and nested disclosure patterns.
 *
 * @example Basic usage
 * ```tsx
 * import { DisclosureSection } from '@shared/ui';
 *
 * <DisclosureSection label="Details" defaultOpen={false}>
 *   <p>Hidden content</p>
 * </DisclosureSection>
 * ```
 *
 * @example Hook usage
 * ```tsx
 * import { useDisclosure } from '@shared/ui';
 *
 * const { isOpen, toggle, triggerProps } = useDisclosure();
 * ```
 *
 * @example Pure state (non-React)
 * ```ts
 * import { createDisclosure } from '@shared/ui';
 *
 * const state = createDisclosure({ defaultOpen: false });
 * state.toggle();
 * ```
 */

// Core state (framework-agnostic)
export {
  createDisclosure,
  createDisclosureGroup,
  type DisclosureState,
  type DisclosureOptions,
  type DisclosureGroupState,
  type DisclosureGroupOptions,
} from './disclosureState';

// React hooks
export {
  useDisclosure,
  useDisclosureGroup,
  type UseDisclosureOptions,
  type UseDisclosureReturn,
  type UseDisclosureGroupOptions,
  type UseDisclosureGroupReturn,
} from './useDisclosure';

// React components
export {
  DisclosureSection,
  DisclosureGroup,
  DisclosureGroupContext,
  type DisclosureSectionProps,
  type DisclosureGroupProps,
  type DisclosureGroupContextValue,
} from './DisclosureSection';
