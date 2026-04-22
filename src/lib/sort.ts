import type { Job } from './types';

export type SortPreset = 'numeric' | 'asc' | 'desc';

export const SORT_PRESETS: { id: SortPreset; label: string; hint: string }[] = [
  { id: 'numeric', label: 'Numerisch', hint: 'K01 → K99, natürliche Zahlen-Reihenfolge' },
  { id: 'asc',     label: 'A → Z',     hint: 'Alphabetisch aufsteigend' },
  { id: 'desc',    label: 'Z → A',     hint: 'Alphabetisch absteigend' },
];

export function sortJobs(jobs: Job[], preset: SortPreset): Job[] {
  const copy = [...jobs];
  switch (preset) {
    case 'numeric':
      return copy.sort((a, b) =>
        a.name.localeCompare(b.name, 'de', {
          numeric: true,
          sensitivity: 'base',
        }),
      );
    case 'asc':
      return copy.sort((a, b) =>
        a.name.localeCompare(b.name, 'de', { sensitivity: 'base' }),
      );
    case 'desc':
      return copy.sort((a, b) =>
        b.name.localeCompare(a.name, 'de', { sensitivity: 'base' }),
      );
  }
}
