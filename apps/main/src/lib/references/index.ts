export type { ReferenceItem, ReferenceType, ReferenceSource } from './types';
export { referenceRegistry } from './registry';
export type { ReferenceSourceRegistration } from './registry';
export { useReferences } from './useReferences';
export { useReferenceInput } from './useReferenceInput';
export { ReferencePicker } from './ReferencePicker';
export type { ReferencePickerProps, ReferencePickerHandle } from './ReferencePicker';

// Auto-register built-in platform sources (plans, contracts, worlds, projects).
// Feature-specific sources (game entities, assets, etc.) register themselves
// from their own modules via referenceRegistry.register().
import './sources';
