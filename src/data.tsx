import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { CircuitStats, EveningStats, Meta, Stats, WizardStats } from './lib/types.ts';

export interface Data {
  stats: Stats;
  meta: Meta;
  evening: (id: string) => EveningStats | undefined;
  wizard: (sheetName: string) => WizardStats | undefined;
  circuit: (n: number) => CircuitStats | undefined;
  /** Display name for a sheet name ("Charles" -> "Charlie"). */
  name: (sheetName: string) => string;
}

const DataContext = createContext<Data | null>(null);

async function load<T>(file: string): Promise<T> {
  const res = await fetch(`${import.meta.env.BASE_URL}data/${file}`, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${file}: HTTP ${res.status}`);
  return (await res.json()) as T;
}

export function DataProvider({ children }: { children: ReactNode }) {
  const [loaded, setLoaded] = useState<{ stats: Stats; meta: Meta } | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    Promise.all([load<Stats>('stats.json'), load<Meta>('meta.json')])
      .then(([stats, meta]) => setLoaded({ stats, meta }))
      .catch(() => setFailed(true));
  }, []);

  const data = useMemo<Data | null>(() => {
    if (!loaded) return null;
    const { stats, meta } = loaded;
    const evenings = new Map(stats.evenings.map((e) => [e.id, e]));
    const wizards = new Map(stats.wizards.map((w) => [w.sheetName, w]));
    const circuits = new Map(stats.circuits.map((c) => [c.circuit, c]));
    return {
      stats,
      meta,
      evening: (id) => evenings.get(id),
      wizard: (n) => wizards.get(n),
      circuit: (n) => circuits.get(n),
      name: (n) => wizards.get(n)?.displayName ?? n,
    };
  }, [loaded]);

  if (failed) {
    return (
      <main className="mx-auto max-w-md px-4 py-16 text-center">
        <h1 className="text-xl">The records could not be opened</h1>
        <p className="mt-3 text-ink-2">Check your connection and reload the page.</p>
      </main>
    );
  }
  if (!data) {
    return (
      <main className="mx-auto max-w-md px-4 py-16 text-center text-ink-2" aria-busy="true">
        Opening the records…
      </main>
    );
  }
  return <DataContext.Provider value={data}>{children}</DataContext.Provider>;
}

export function useData(): Data {
  const data = useContext(DataContext);
  if (!data) throw new Error('useData must be used inside DataProvider');
  return data;
}
