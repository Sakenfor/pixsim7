/**
 * Composition Preview tab — exercises the latin-enhancer composer endpoint
 * against (length × register × intensity × domains) so we can QA the join
 * logic without firing real generations.
 */
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
// Hardcoded for now — these are the domain tags on the shipped latin packs.
// Grouped roughly by pack so the chip row reads as a topic map. Once we add
// more packs we should query the tag dictionary.
const KNOWN_DOMAINS = [
  // touch_dynamics
  'touch', 'gluteal', 'hand_contact',
  // lips_mouth
  'oral', 'mouth', 'lips', 'kiss',
  // gaze_breath
  'gaze', 'breath', 'voice', 'eyes',
  // chest_torso
  'chest', 'breast', 'torso', 'embrace',
];

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
        {KNOWN_DOMAINS.map((d) => {
          const active = selected.includes(d);
          return (
            <button
              key={d}
              type="button"
              onClick={() => onToggle(d)}
              className={clsx(
                'px-2 py-0.5 text-[11px] rounded-full border transition-colors',
                active
                  ? 'bg-accent/15 border-accent text-accent'
                  : 'bg-neutral-100 dark:bg-neutral-800 border-neutral-200 dark:border-neutral-700 text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-200',
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
