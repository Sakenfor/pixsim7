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

// React components - Section-level disclosure (UI panels, accordions)
export {
  DisclosureSection,
  DisclosureGroup,
  DisclosureGroupContext,
  type DisclosureSectionProps,
  type DisclosureGroupProps,
  type DisclosureGroupContextValue,
} from './DisclosureSection';

// React components - Inline text folding (code folding, text regions)
export {
  Fold,
  FoldGroup,
  FoldGroupContext,
  GroupedFold,
  FoldRegions,
  type FoldProps,
  type FoldGroupProps,
  type FoldGroupContextValue,
  type GroupedFoldProps,
  type FoldRegion,
  type FoldRegionsProps,
} from './Fold';

// React components - JSON/dict viewer with folding
export { FoldableJson, type FoldableJsonProps } from './FoldableJson';
