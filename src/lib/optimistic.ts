import type { Confirmation, OverviewPayload, Status } from './types';

/** SQLite-style UTC timestamp, matches what the server stores. */
function nowUtc(): string {
  return new Date().toISOString().slice(0, 19).replace('T', ' ');
}

let tempId = -1;

/** Local copy of the payload with one cell set (POST /api/confirmations). */
export function withUpsert(
  data: OverviewPayload | undefined,
  c: {
    job_id: number;
    date: string;
    status: Status;
    note: string | null;
    confirmed_by: string | null;
  },
): OverviewPayload | undefined {
  if (!data) return data;
  const existing = data.confirmations.find(
    (x) => x.job_id === c.job_id && x.date === c.date,
  );
  const next: Confirmation = {
    id: existing?.id ?? tempId--,
    job_id: c.job_id,
    date: c.date,
    status: c.status,
    note: c.note,
    confirmed_by: c.confirmed_by,
    confirmed_at: nowUtc(),
  };
  return {
    ...data,
    confirmations: [
      ...data.confirmations.filter((x) => x !== existing),
      next,
    ],
    // A manual decision resolves a sync conflict for that cell.
    conflicts: data.conflicts?.filter(
      (x) => !(x.job_id === c.job_id && x.date === c.date),
    ),
  };
}

/** Local copy without one cell (DELETE /api/confirmations). */
export function withDelete(
  data: OverviewPayload | undefined,
  job_id: number,
  date: string,
): OverviewPayload | undefined {
  if (!data) return data;
  return {
    ...data,
    confirmations: data.confirmations.filter(
      (x) => !(x.job_id === job_id && x.date === date),
    ),
  };
}

/** All still-open jobs of a day as success (POST /api/confirmations/bulk). */
export function withBulkSuccess(
  data: OverviewPayload | undefined,
  date: string,
  by: string | null,
): OverviewPayload | undefined {
  if (!data) return data;
  const done = new Set(
    data.confirmations.filter((x) => x.date === date).map((x) => x.job_id),
  );
  const at = nowUtc();
  const added: Confirmation[] = data.jobs
    .filter((j) => !done.has(j.id))
    .map((j) => ({
      id: tempId--,
      job_id: j.id,
      date,
      status: 'success',
      note: null,
      confirmed_by: by,
      confirmed_at: at,
    }));
  return { ...data, confirmations: [...data.confirmations, ...added] };
}

/** Every confirmation of a day removed (DELETE /api/confirmations/bulk). */
export function withDayReset(
  data: OverviewPayload | undefined,
  date: string,
): OverviewPayload | undefined {
  if (!data) return data;
  return {
    ...data,
    confirmations: data.confirmations.filter((x) => x.date !== date),
  };
}
