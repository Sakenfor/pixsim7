import { useEffect, useMemo, useState } from 'react';
import { pixsimClient } from '@lib/api/client';
import { useProviderCapabilities } from './useProviderCapabilities';

export interface UseCostEstimateOptions {
  providerId?: string;
  operationType?: string;
  params: Record<string, any>;
  dependencyKeys?: string[];
}

export interface CostEstimateResult {
  estimated_credits: number | null;
  estimated_cost_usd?: number | null;
}

export function useCostEstimate({
  providerId,
  operationType,
  params,
  dependencyKeys,
}: UseCostEstimateOptions) {
  const { capabilities } = useProviderCapabilities();
  const [estimate, setEstimate] = useState<CostEstimateResult | null>(null);
  const [loading, setLoading] = useState(false);

  const inferredProviderId = useMemo(() => {
    if (providerId) return providerId;
    const model = params.model;
    if (!model) return undefined;
    const normalized = String(model).toLowerCase();
    for (const capability of capabilities) {
      const specs = capability.operation_specs || {};
      const matches = Object.values(specs).some((spec) =>
        (spec.parameters || []).some((param) => {
          if (param.name !== 'model' || !Array.isArray(param.enum)) return false;
          return param.enum.some((entry) =>
            typeof entry === 'string' && normalized.startsWith(entry.toLowerCase())
          );
        })
      );
      if (matches) {
        return capability.provider_id;
      }
    }
    return undefined;
  }, [providerId, params.model, capabilities]);

  const capability = useMemo(
    () => capabilities.find((cap) => cap.provider_id === inferredProviderId),
    [capabilities, inferredProviderId]
  );

  const estimatorConfig = capability?.cost_estimator;

  const depSnapshot = useMemo(() => {
    const keys =
      dependencyKeys?.length
        ? dependencyKeys
        : estimatorConfig?.payload_keys?.length
        ? estimatorConfig.payload_keys
        : [];
    const snapshot: Record<string, any> = {};
    for (const key of keys) {
      snapshot[key] = params[key];
    }
    return snapshot;
  }, [params, dependencyKeys, estimatorConfig]);

  const depKey = useMemo(
    () => JSON.stringify({ providerId, operationType, depSnapshot }),
    [providerId, operationType, depSnapshot],
  );

  useEffect(() => {
    let cancelled = false;
    const debugEnabled =
      typeof globalThis !== 'undefined' &&
      'localStorage' in globalThis &&
      globalThis.localStorage.getItem('debug_cost_estimate') === '1';
    const debug = (message: string, details?: Record<string, any>) => {
      if (!debugEnabled) return;
      // eslint-disable-next-line no-console
      console.info(`[cost-estimate] ${message}`, details || {});
    };

    if (!estimatorConfig?.endpoint) {
      debug('skip: missing estimatorConfig', {
        providerId,
        inferredProviderId,
        hasCapabilities: capabilities.length > 0,
      });
      setEstimate(null);
      setLoading(false);
      return () => {
        cancelled = true;
      };
    }

    const payload: Record<string, any> = {};
    const payloadKeys = estimatorConfig.payload_keys || [];
    for (const key of payloadKeys) {
      if (key === 'duration') {
        const raw = params.duration;
        const numeric =
          typeof raw === 'number'
            ? raw
            : typeof raw === 'string' && raw.trim() !== ''
            ? Number(raw)
            : undefined;
        if (typeof numeric === 'number' && Number.isFinite(numeric) && numeric > 0) {
          payload.duration = Math.max(1, Math.round(numeric));
        }
        continue;
      }

      const value = params[key];
      if (value === undefined || value === null || value === '') {
        continue;
      }
      payload[key] = value;
    }

    if (estimatorConfig.include_operation_type && operationType) {
      payload.operation_type = operationType;
    }

    if (capability && operationType && capability.operation_specs?.[operationType]) {
      const opSpec = capability.operation_specs[operationType];
      for (const key of estimatorConfig.payload_keys || []) {
        if (payload[key] !== undefined && payload[key] !== null && payload[key] !== '') {
          continue;
        }
        const param = (opSpec.parameters || []).find((entry) => entry.name === key);
        if (!param || param.default === undefined || param.default === null) {
          continue;
        }
        if (key === 'duration') {
          const numeric = Number(param.default);
          if (Number.isFinite(numeric) && numeric > 0) {
            payload.duration = Math.max(1, Math.round(numeric));
          }
        } else {
          payload[key] = param.default;
        }
      }
    }

    if (capability) {
      if (!payload.model && capability.default_model) {
        payload.model = capability.default_model;
      }
      if (!payload.quality && Array.isArray(capability.quality_presets) && capability.quality_presets.length > 0) {
        payload.quality = capability.quality_presets[0];
      }
    }

    if (capability && capability.operation_specs) {
      if (!payload.model) {
        const modelParam = Object.values(capability.operation_specs)
          .flatMap((spec) => spec.parameters || [])
          .find((param) => param.name === 'model' && Array.isArray(param.enum) && param.enum.length > 0);
        if (modelParam?.enum) {
          const firstModel = modelParam.enum.find((entry) => typeof entry === 'string');
          if (firstModel) {
            payload.model = firstModel;
          }
        }
      }
      if (!payload.quality) {
        const qualityParam = Object.values(capability.operation_specs)
          .flatMap((spec) => spec.parameters || [])
          .find((param) => param.name === 'quality' && Array.isArray(param.enum) && param.enum.length > 0);
        if (qualityParam?.enum) {
          const firstQuality = qualityParam.enum.find((entry) => typeof entry === 'string');
          if (firstQuality) {
            payload.quality = firstQuality;
          }
        }
      }
    }

    if (capability && capability.operation_specs) {
      const requiredKeys = estimatorConfig.required_keys || [];
      const missingRequired = requiredKeys.some((key) => {
        const value = payload[key];
        return value === undefined || value === null || value === '';
      });
      if (missingRequired) {
        const specs = Object.values(capability.operation_specs);
        const hasDuration = payload.duration !== undefined;
        const candidate = specs.find((spec) =>
          (spec.parameters || []).some((param) =>
            hasDuration ? param.name === 'duration' : param.name === 'model'
          )
        );
        if (candidate) {
          for (const key of estimatorConfig.payload_keys || []) {
            if (payload[key] !== undefined && payload[key] !== null && payload[key] !== '') {
              continue;
            }
            const param = (candidate.parameters || []).find((entry) => entry.name === key);
            if (!param || param.default === undefined || param.default === null) {
              continue;
            }
            if (key === 'duration') {
              const numeric = Number(param.default);
              if (Number.isFinite(numeric) && numeric > 0) {
                payload.duration = Math.max(1, Math.round(numeric));
              }
            } else {
              payload[key] = param.default;
            }
          }
        }
      }
    }

    if (capability && payload.model && capability.operation_specs) {
      const normalizedModel = String(payload.model).toLowerCase();
      const matchesProviderModel = Object.values(capability.operation_specs).some((spec) =>
        (spec.parameters || []).some((param) => {
          if (param.name !== 'model' || !Array.isArray(param.enum)) return false;
          return param.enum.some((entry) =>
            typeof entry === 'string' && normalizedModel.startsWith(entry.toLowerCase())
          );
        })
      );
      if (!matchesProviderModel) {
        let fallbackModel: string | undefined;
        if (capability.default_model) {
          fallbackModel = capability.default_model;
        } else {
          const modelParam = Object.values(capability.operation_specs)
            .flatMap((spec) => spec.parameters || [])
            .find((param) => param.name === 'model' && Array.isArray(param.enum) && param.enum.length > 0);
          if (modelParam?.enum) {
            const firstModel = modelParam.enum.find((entry) => typeof entry === 'string');
            if (firstModel) {
              fallbackModel = firstModel;
            }
          }
        }
        if (fallbackModel) {
          debug('override: model not in provider specs', { from: payload.model, to: fallbackModel });
          payload.model = fallbackModel;
        } else {
          debug('skip: model not in provider specs', { model: payload.model });
          setEstimate(null);
          setLoading(false);
          return () => {
            cancelled = true;
          };
        }
      }
    }

    const requiredKeys = estimatorConfig.required_keys || [];
    const missingRequired = requiredKeys.some((key) => {
      const value = payload[key];
      return value === undefined || value === null || value === '';
    });
    if (missingRequired) {
      debug('skip: missing required keys', {
        requiredKeys,
        payload,
        operationType,
      });
      setEstimate(null);
      setLoading(false);
      return () => {
        cancelled = true;
      };
    }

    debug('request', { endpoint: estimatorConfig.endpoint, payload });
    setLoading(true);
    const method = (estimatorConfig.method || 'POST').toUpperCase();
    const request =
      method === 'GET'
        ? pixsimClient.get<CostEstimateResult>(estimatorConfig.endpoint, { params: payload })
        : pixsimClient.post<CostEstimateResult>(estimatorConfig.endpoint, payload);

    request
      .then((data) => {
        if (!cancelled) {
          setEstimate({
            estimated_credits:
              typeof data?.estimated_credits === 'number' ? data.estimated_credits : null,
            estimated_cost_usd:
              typeof data?.estimated_cost_usd === 'number' ? data.estimated_cost_usd : null,
          });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setEstimate(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [estimatorConfig, operationType, depKey]);

  return { estimate, loading };
}
