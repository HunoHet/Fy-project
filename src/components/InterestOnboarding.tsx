import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import type { Interest } from '@/types';
import { interestOptions } from '@/data/mockData';

const MAX_INTERESTS = 50;

function getErrorMessage(error: unknown): string {
  if (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof error.message === 'string'
  ) return error.message;
  return 'Please try again.';
}

export default function InterestOnboarding({
  onComplete,
  onCancel,
  initialInterests = [],
}: {
  onComplete: (interests: Interest[]) => void | Promise<void>;
  onCancel?: () => void;
  initialInterests?: Interest[];
}) {
  const [selected, setSelected] = useState<Interest[]>(initialInterests);
  const [search, setSearch] = useState('');
  const [saveError, setSaveError] = useState('');
  const [saving, setSaving] = useState(false);
  const filteredOptions = useMemo(() => {
    const query = search.trim().replace(/^#/, '').toLowerCase();
    return interestOptions.filter(({ id, label }) =>
      id.toLowerCase().includes(query) || label.toLowerCase().includes(query),
    );
  }, [search]);

  const toggleInterest = (interest: Interest) => {
    setSelected((current) => {
      if (current.includes(interest)) return current.filter((item) => item !== interest);
      if (current.length >= MAX_INTERESTS) return current;
      return [...current, interest];
    });
  };

  return (
    <div className="absolute inset-0 z-[100] flex items-center justify-center bg-black/85 p-5 backdrop-blur-md">
      <section
        aria-labelledby="interest-onboarding-title"
        className="flex max-h-[90vh] w-full max-w-sm flex-col overflow-hidden rounded-3xl border border-white/10 bg-zinc-950 p-5 shadow-2xl"
      >
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-green-400">Make it yours</p>
        <h1 id="interest-onboarding-title" className="mt-2 text-2xl font-black text-white">
          What are you into?
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-white/50">
          Choose up to {MAX_INTERESTS} topics. Your interests are private and only visible to you.
        </p>
        <p aria-live="polite" className="mt-2 text-xs font-semibold text-green-300/80">
          {selected.length}/{MAX_INTERESTS} selected
        </p>

        <label className="mt-4 flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3">
          <Search size={15} className="text-white/40" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={`Search ${interestOptions.length} topics...`}
            aria-label="Search interest topics"
            className="min-w-0 flex-1 bg-transparent py-2.5 text-xs text-white outline-none placeholder:text-white/35"
          />
        </label>

        <div className="mt-3 grid max-h-[48vh] grid-cols-4 gap-1.5 overflow-y-auto overscroll-contain pr-1">
          {filteredOptions.map(({ id }) => {
            const isSelected = selected.includes(id);
            const selectionLimitReached = selected.length >= MAX_INTERESTS && !isSelected;
            return (
              <button
                key={id}
                type="button"
                aria-pressed={isSelected}
                disabled={selectionLimitReached}
                onClick={() => toggleInterest(id)}
                className={`min-w-0 rounded-xl border px-1.5 py-2 text-center transition-colors ${
                  isSelected
                    ? 'border-white/20 bg-white/5'
                    : selectionLimitReached
                    ? 'cursor-not-allowed border-white/5 bg-white/[0.02] opacity-40'
                    : 'border-white/10 bg-white/[0.03] hover:border-white/25'
                }`}
              >
                <span className="block break-words text-[10px] font-bold leading-tight text-zinc-300">#{id}</span>
              </button>
            );
          })}
          {filteredOptions.length === 0 && (
            <p className="col-span-4 py-6 text-center text-xs text-white/40">No matching topics.</p>
          )}
        </div>

        {saveError && <p role="alert" className="mt-3 text-xs text-red-300">{saveError}</p>}
        <div className="mt-5 flex gap-2">
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="rounded-2xl border border-white/10 px-4 py-3 text-sm font-bold text-white/70"
            >
              Cancel
            </button>
          )}
          <button
            type="button"
            disabled={selected.length === 0 || saving}
            onClick={async () => {
              setSaving(true);
              setSaveError('');
              try {
                await onComplete(selected);
              } catch (error) {
                console.error('Could not save selected interests.', error);
                setSaveError(`Could not save your interests. ${getErrorMessage(error)}`);
              } finally {
                setSaving(false);
              }
            }}
            className="flex-1 rounded-2xl bg-green-400 px-4 py-3 text-sm font-extrabold text-black transition-opacity disabled:cursor-not-allowed disabled:opacity-35"
          >
            {saving ? 'Saving…' : `Continue${selected.length > 0 ? ` · ${selected.length} selected` : ''}`}
          </button>
        </div>
      </section>
    </div>
  );
}
