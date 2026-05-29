/**
 * Composition Preview tab — exercises the latin-enhancer composer endpoint
 * against (length × register × intensity × domains) so we can QA the join
 * logic without firing real generations.
 */
import {
  LATIN_COMPOSER_DOMAINS,
  LATIN_ENHANCER_DOMAIN_COLORS,
  type LatinEnhancerDomainColor,
} from '@pixsim7/shared.types';
import { Button } from '@pixsim7/shared.ui';
import clsx from 'clsx';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { Icon } from '@lib/icons';

import { useApi } from '@/hooks/useApi';

type LengthTier = 'brief' | 'short' | 'medium' | 'long';
type RegisterChoice = 'technical' | 'poetic' | 'mixed';
type IntensityChoice = 'subtle' | 'moderate' | 'firm' | 'absolute' | 'escalating';

const LENGTHS: LengthTier[] = ['brief', 'short', 'medium', 'long'];
const REGISTERS: RegisterChoice[] = ['technical', 'poetic', 'mixed'];
const INTENSITIES: IntensityChoice[] = ['subtle', 'moderate', 'firm', 'absolute', 'escalating'];

const ACTIVE_DOMAIN_COLOR_CLASSES: Record<LatinEnhancerDomainColor, string> = {
  blue: 'bg-blue-100 border-blue-300 text-blue-700 dark:bg-blue-900/30 dark:border-blue-700 dark:text-blue-300',
  green: 'bg-green-100 border-green-300 text-green-700 dark:bg-green-900/30 dark:border-green-700 dark:text-green-300',
  purple: 'bg-purple-100 border-purple-300 text-purple-700 dark:bg-purple-900/30 dark:border-purple-700 dark:text-purple-300',
  yellow: 'bg-yellow-100 border-yellow-300 text-yellow-700 dark:bg-yellow-900/30 dark:border-yellow-700 dark:text-yellow-300',
  pink: 'bg-pink-100 border-pink-300 text-pink-700 dark:bg-pink-900/30 dark:border-pink-700 dark:text-pink-300',
  cyan: 'bg-cyan-100 border-cyan-300 text-cyan-700 dark:bg-cyan-900/30 dark:border-cyan-700 dark:text-cyan-300',
  orange: 'bg-orange-100 border-orange-300 text-orange-700 dark:bg-orange-900/30 dark:border-orange-700 dark:text-orange-300',
  gray: 'bg-neutral-200 border-neutral-300 text-neutral-700 dark:bg-neutral-800 dark:border-neutral-600 dark:text-neutral-300',
  amber: 'bg-amber-100 border-amber-300 text-amber-700 dark:bg-amber-900/30 dark:border-amber-700 dark:text-amber-300',
  red: 'bg-red-100 border-red-300 text-red-700 dark:bg-red-900/30 dark:border-red-700 dark:text-red-300',
  slate: 'bg-slate-100 border-slate-300 text-slate-700 dark:bg-slate-900/30 dark:border-slate-700 dark:text-slate-300',
};

const INACTIVE_DOMAIN_COLOR_CLASSES: Record<LatinEnhancerDomainColor, string> = {
  blue: 'border-blue-200 text-blue-600 hover:bg-blue-50 dark:border-blue-800/40 dark:text-blue-300 dark:hover:bg-blue-900/20',
  green: 'border-green-200 text-green-600 hover:bg-green-50 dark:border-green-800/40 dark:text-green-300 dark:hover:bg-green-900/20',
  purple: 'border-purple-200 text-purple-600 hover:bg-purple-50 dark:border-purple-800/40 dark:text-purple-300 dark:hover:bg-purple-900/20',
  yellow: 'border-yellow-200 text-yellow-700 hover:bg-yellow-50 dark:border-yellow-800/40 dark:text-yellow-300 dark:hover:bg-yellow-900/20',
  pink: 'border-pink-200 text-pink-600 hover:bg-pink-50 dark:border-pink-800/40 dark:text-pink-300 dark:hover:bg-pink-900/20',
  cyan: 'border-cyan-200 text-cyan-600 hover:bg-cyan-50 dark:border-cyan-800/40 dark:text-cyan-300 dark:hover:bg-cyan-900/20',
  orange: 'border-orange-200 text-orange-600 hover:bg-orange-50 dark:border-orange-800/40 dark:text-orange-300 dark:hover:bg-orange-900/20',
  gray: 'border-neutral-200 text-neutral-500 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800',
  amber: 'border-amber-200 text-amber-600 hover:bg-amber-50 dark:border-amber-800/40 dark:text-amber-300 dark:hover:bg-amber-900/20',
  red: 'border-red-200 text-red-600 hover:bg-red-50 dark:border-red-900/40 dark:text-red-300 dark:hover:bg-red-900/20',
  slate: 'border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800',
};

function getDomainChipColorClasses(color: LatinEnhancerDomainColor, active: boolean): string {
  return active ? ACTIVE_DOMAIN_COLOR_CLASSES[color] : INACTIVE_DOMAIN_COLOR_CLASSES[color];
}

interface ComposedVariant {
  block_id: string;
  text: string;
  register: string | null;
  intensity: string | null;
  motion_type: string | null;
  applies_to: string | null;
  latin_form: string | null;
  domains: string[];
  connector_type: string | null;
  attaches: string | null;
}

interface ComposeResponse {
  text: string;
  variants: ComposedVariant[];
  pool_size: number;
  intensity_curve: string[];
}

function PillRadio<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: readonly T[];
  value: T;
  onChange: (next: T) => void;
  label: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] uppercase tracking-wide text-neutral-500">{label}</span>
      <div className="inline-flex flex-wrap gap-1">
        {options.map((opt) => (
          <button
            key={opt}
            type="button"
            onClick={() => onChange(opt)}
            className={clsx(
              'px-2 py-1 text-xs rounded border transition-colors',
              value === opt
                ? 'bg-accent text-white border-accent'
                : 'bg-neutral-100 dark:bg-neutral-800 border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-700',
            )}
          >
            {opt}
          </button>
        ))}
      </div>
    </div>
  );
}

function DomainChips({
  selected,
  onToggle,
}: {
  selected: string[];
  onToggle: (domain: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] uppercase tracking-wide text-neutral-500">
        Domains <span className="text-neutral-400 normal-case">(none = all)</span>
      </span>
      <div className="flex flex-wrap gap-1">
        {LATIN_COMPOSER_DOMAINS.map((d) => {
          const active = selected.includes(d);
          const color = LATIN_ENHANCER_DOMAIN_COLORS[d] ?? 'gray';
          return (
            <button
              key={d}
              type="button"
              onClick={() => onToggle(d)}
              className={clsx(
                'px-2 py-0.5 text-[11px] rounded-full border transition-colors',
                getDomainChipColorClasses(color, active),
              )}
            >
              {d}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function VariantRow({ v, tier }: { v: ComposedVariant; tier: string | undefined }) {
  return (
    <div className="grid grid-cols-[auto_1fr_auto] gap-2 px-2 py-1.5 text-xs border-b border-neutral-200 dark:border-neutral-800 last:border-b-0">
      <span className="text-[10px] text-neutral-400 font-mono pt-0.5">
        {tier ?? '—'}
      </span>
      <div className="min-w-0">
        <div className="text-neutral-800 dark:text-neutral-100 italic">{v.text}</div>
        <div className="text-[10px] text-neutral-500 mt-0.5 truncate font-mono">
          {v.block_id}
        </div>
      </div>
      <div className="flex flex-col items-end gap-0.5 text-[10px] text-neutral-500">
        {v.register && <span>{v.register}</span>}
        <span>{[v.intensity, v.motion_type].filter(Boolean).join(' · ')}</span>
        {v.applies_to && <span>→ {v.applies_to}</span>}
      </div>
    </div>
  );
}

export function LatinComposerWorkbench() {
  const api = useApi();
  const [length, setLength] = useState<LengthTier>('short');
  const [register, setRegister] = useState<RegisterChoice>('mixed');
  const [intensity, setIntensity] = useState<IntensityChoice>('moderate');
  const [domains, setDomains] = useState<string[]>([]);
  const [includeConnectors, setIncludeConnectors] = useState(false);
  const [seed, setSeed] = useState<number | undefined>(undefined);
  const [result, setResult] = useState<ComposeResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleDomain = useCallback((d: string) => {
    setDomains((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]));
  }, []);

  const compose = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set('length', length);
      params.set('register', register);
      params.set('intensity', intensity);
      domains.forEach((d) => params.append('domains', d));
      if (includeConnectors) params.set('include_connectors', 'true');
      if (seed !== undefined) params.set('seed', String(seed));
      const res = await api.get<ComposeResponse>(
        `/prompts/latin-enhancer/compose?${params.toString()}`,
      );
      setResult(res);
    } catch (e: any) {
      setError(e?.message ?? String(e));
      setResult(null);
    } finally {
      setLoading(false);
    }
  }, [api, length, register, intensity, domains, includeConnectors, seed]);

  useEffect(() => {
    compose();
  }, [compose]);

  const reroll = useCallback(() => {
    setSeed(undefined);
    compose();
  }, [compose]);

  const lockSeed = useCallback(() => {
    setSeed(Math.floor(Math.random() * 1_000_000));
  }, []);

  const tierByIndex = useMemo(() => {
    const curve = result?.intensity_curve ?? [];
    return (i: number) => curve[i];
  }, [result]);

  return (
    <div className="flex flex-col h-full bg-white dark:bg-neutral-900 overflow-y-auto">
      <div className="border-b border-neutral-200 dark:border-neutral-800 p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-neutral-800 dark:text-neutral-100">
              Latin Enhancer Composition Preview
            </h2>
            <p className="text-xs text-neutral-500 mt-0.5">
              Pick N tagged Latin variants from blocks declaring{' '}
              <code className="text-[10px] bg-neutral-100 dark:bg-neutral-800 px-1 rounded">
                latin.enhancer
              </code>{' '}
              capability and join them. Pool draws across all latin packs.
            </p>
          </div>
          <div className="flex gap-1.5">
            <Button size="sm" variant="ghost" onClick={lockSeed} title="Lock current seed for reproducibility">
              <Icon name="pin" size={11} />
              <span className="ml-1">Lock</span>
            </Button>
            <Button size="sm" variant="primary" onClick={reroll} disabled={loading}>
              <Icon name="refresh" size={11} />
              <span className="ml-1">{loading ? 'Composing…' : 'Re-roll'}</span>
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2">
          <PillRadio label="Length" options={LENGTHS} value={length} onChange={setLength} />
          <PillRadio label="Register" options={REGISTERS} value={register} onChange={setRegister} />
          <PillRadio label="Intensity" options={INTENSITIES} value={intensity} onChange={setIntensity} />
          <DomainChips selected={domains} onToggle={toggleDomain} />
        </div>

        <label className="inline-flex items-center gap-2 text-xs text-neutral-700 dark:text-neutral-300 cursor-pointer">
          <input
            type="checkbox"
            checked={includeConnectors}
            onChange={(e) => setIncludeConnectors(e.target.checked)}
            className="accent-accent"
          />
          <span>Interleave connectors</span>
          <span className="text-[10px] text-neutral-500">(simile / temporal / anaphor glue between clauses)</span>
        </label>

        {seed !== undefined && (
          <div className="text-[10px] text-neutral-400 font-mono">
            seed={seed}{' '}
            <button
              type="button"
              className="underline hover:text-neutral-600 dark:hover:text-neutral-200"
              onClick={() => setSeed(undefined)}
            >
              clear
            </button>
          </div>
        )}
      </div>

      {error && (
        <div className="m-4 p-3 text-xs bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      <div className="flex-1 min-h-0 p-4 space-y-4">
        <div>
          <div className="text-[10px] uppercase tracking-wide text-neutral-500 mb-1">
            Output
          </div>
          <div className="p-3 rounded border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950 text-sm italic text-neutral-800 dark:text-neutral-100 leading-relaxed min-h-[3em]">
            {result?.text || (loading ? '…' : '(empty)')}
          </div>
        </div>

        {result && (
          <div>
            <div className="flex items-center justify-between mb-1">
              <div className="text-[10px] uppercase tracking-wide text-neutral-500">
                Picks
              </div>
              <div className="text-[10px] text-neutral-400 font-mono">
                pool={result.pool_size} · curve=[{result.intensity_curve.join(', ')}]
              </div>
            </div>
            <div className="rounded border border-neutral-200 dark:border-neutral-800 overflow-hidden">
              {result.variants.length === 0 ? (
                <div className="p-3 text-xs text-neutral-500">No variants matched the filter.</div>
              ) : (
                result.variants.map((v, i) => (
                  <VariantRow key={`${v.block_id}-${i}`} v={v} tier={tierByIndex(i)} />
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
