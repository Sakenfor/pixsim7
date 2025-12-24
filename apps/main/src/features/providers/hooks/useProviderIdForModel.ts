import { useMemo } from 'react';
import { useProviderCapabilities } from './useProviderCapabilities';

export function useProviderIdForModel(model: string | undefined): string | undefined {
  const { capabilities } = useProviderCapabilities();

  return useMemo(() => {
    if (!model) return undefined;
    const normalized = model.toLowerCase();

    for (const capability of capabilities) {
      const specs = capability.operation_specs;
      if (!specs) continue;

      for (const opSpec of Object.values(specs)) {
        const params = opSpec?.parameters ?? [];
        const modelParam = params.find((param) => param.name === 'model');
        const enumValues = modelParam?.enum ?? [];
        if (!Array.isArray(enumValues)) continue;

        const matches = enumValues.some((entry) => {
          if (typeof entry !== 'string') return false;
          return normalized.startsWith(entry.toLowerCase());
        });
        if (matches) {
          return capability.provider_id;
        }
      }
    }

    return undefined;
  }, [capabilities, model]);
}
