'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Plus,
  Pencil,
  Trash2,
  Check,
  X as XIcon,
  Power,
  PowerOff,
  GripVertical,
  ArrowUpAZ,
  ArrowDownAZ,
  Hash,
  ArrowDownUp,
} from 'lucide-react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
  DragOverlay,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  restrictToVerticalAxis,
  restrictToParentElement,
} from '@dnd-kit/modifiers';
import { NavBar } from '@/components/NavBar';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { useCan } from '@/components/CurrentUserContext';
import type { Job } from '@/lib/types';
import { SORT_PRESETS, sortJobs, type SortPreset } from '@/lib/sort';
import { cn } from '@/lib/utils';

export default function JobsPage() {
  const canWrite = useCan('write');
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<number | null>(null);
  const [draft, setDraft] = useState('');
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState('VMware Backup');
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Job | null>(null);
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const [savingSort, setSavingSort] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch('/api/jobs', { cache: 'no-store' });
    const data = (await res.json()) as Job[];
    setJobs(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function persistOrder(orderedActive: Job[]) {
    setSavingSort(true);
    const inactive = jobs.filter((j) => !j.active);
    const fullOrder = [...orderedActive, ...inactive].map((j) => j.id);
    try {
      await fetch('/api/jobs/reorder', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ order: fullOrder }),
      });
    } finally {
      setSavingSort(false);
    }
  }

  async function addJob() {
    setError(null);
    if (!newName.trim()) return;
    setAdding(true);
    const res = await fetch('/api/jobs', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: newName.trim(), type: newType }),
    });
    setAdding(false);
    if (!res.ok) {
      const err = await res.json();
      setError(err.error || 'Konnte nicht anlegen');
      return;
    }
    setNewName('');
    load();
  }

  async function saveEdit(id: number) {
    if (!draft.trim()) return;
    await fetch(`/api/jobs/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: draft.trim() }),
    });
    setEditing(null);
    load();
  }

  async function toggleActive(job: Job) {
    await fetch(`/api/jobs/${job.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ active: job.active ? 0 : 1 }),
    });
    load();
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    await fetch(`/api/jobs/${deleteTarget.id}`, { method: 'DELETE' });
    load();
  }

  async function applyPreset(preset: SortPreset) {
    const active = jobs.filter((j) => j.active);
    const sorted = sortJobs(active, preset);
    const inactive = jobs.filter((j) => !j.active);
    setJobs([...sorted, ...inactive]);
    await persistOrder(sorted);
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  function handleDragStart(e: DragStartEvent) {
    setDraggingId(Number(e.active.id));
  }

  async function handleDragEnd(e: DragEndEvent) {
    setDraggingId(null);
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const activeJobs = jobs.filter((j) => j.active);
    const oldIndex = activeJobs.findIndex((j) => j.id === Number(active.id));
    const newIndex = activeJobs.findIndex((j) => j.id === Number(over.id));
    if (oldIndex < 0 || newIndex < 0) return;
    const reordered = arrayMove(activeJobs, oldIndex, newIndex);
    const inactive = jobs.filter((j) => !j.active);
    setJobs([...reordered, ...inactive]);
    await persistOrder(reordered);
  }

  const active = jobs.filter((j) => j.active);
  const inactive = jobs.filter((j) => !j.active);
  const draggingJob = draggingId
    ? active.find((j) => j.id === draggingId) ?? null
    : null;

  return (
    <div className="min-h-screen">
      <NavBar />
      <main className="mx-auto max-w-3xl px-4 sm:px-6 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
            Jobs verwalten
          </h1>
          <p className="text-sm text-slate-500 mt-1 dark:text-slate-400">
            {canWrite
              ? 'Aktive Jobs erscheinen in der Übersicht und im Monatsbericht. Reihenfolge per Drag-and-Drop oder Sortier-Preset — wirkt sofort auch auf die Matrix.'
              : 'Übersicht der aktiven und deaktivierten Jobs. Für Änderungen benötigst du eine Schreiben-Berechtigung.'}
          </p>
        </div>

        {canWrite && (
        <div className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-soft p-4 mb-6 dark:bg-slate-900 dark:ring-slate-800">
          <div className="text-sm font-semibold text-slate-700 mb-3 dark:text-slate-300">
            Neuen Job anlegen
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              value={newName}
              onChange={(e) => {
                setNewName(e.target.value);
                setError(null);
              }}
              placeholder="Job-Name, z. B. K22 Kundenserver"
              className="flex-1 text-sm rounded-lg ring-1 ring-slate-200 focus:ring-2 focus:ring-osk-500 focus:outline-none px-3 py-2 bg-white text-slate-900 placeholder:text-slate-400 dark:bg-slate-950 dark:ring-slate-700 dark:text-slate-100 dark:placeholder:text-slate-500"
              onKeyDown={(e) => e.key === 'Enter' && addJob()}
            />
            <select
              value={newType}
              onChange={(e) => setNewType(e.target.value)}
              className="text-sm rounded-lg ring-1 ring-slate-200 focus:ring-2 focus:ring-osk-500 focus:outline-none px-3 py-2 bg-white text-slate-900 dark:bg-slate-950 dark:ring-slate-700 dark:text-slate-100"
            >
              <option>VMware Backup</option>
              <option>Windows Agent Backup</option>
              <option>Linux Agent Backup</option>
              <option>NAS Backup</option>
              <option>Backup Copy</option>
            </select>
            <button
              onClick={addJob}
              disabled={!newName.trim() || adding}
              className={cn(
                'inline-flex items-center justify-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold shadow-soft transition',
                !newName.trim() || adding
                  ? 'bg-slate-100 text-slate-400 cursor-not-allowed dark:bg-slate-800 dark:text-slate-600'
                  : 'bg-osk-600 hover:bg-osk-700 text-white',
              )}
            >
              <Plus className="h-4 w-4" />
              Anlegen
            </button>
          </div>
          {error && (
            <div className="mt-2 text-xs text-rose-600 dark:text-rose-400">
              {error}
            </div>
          )}
        </div>
        )}

        {/* Sort presets */}
        {canWrite && (
        <div className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-soft p-4 mb-4 dark:bg-slate-900 dark:ring-slate-800">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-300">
              <ArrowDownUp className="h-4 w-4" />
              Sortieren
            </div>
            <div className="flex flex-wrap gap-2">
              {SORT_PRESETS.map((p) => {
                const Icon =
                  p.id === 'numeric'
                    ? Hash
                    : p.id === 'asc'
                      ? ArrowUpAZ
                      : ArrowDownAZ;
                return (
                  <button
                    key={p.id}
                    onClick={() => applyPreset(p.id)}
                    disabled={savingSort || active.length < 2}
                    title={p.hint}
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition',
                      savingSort || active.length < 2
                        ? 'bg-slate-50 text-slate-400 cursor-not-allowed dark:bg-slate-800/50 dark:text-slate-600'
                        : 'bg-slate-50 text-slate-700 ring-1 ring-slate-200 hover:bg-osk-50 hover:text-osk-700 hover:ring-osk-300 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700 dark:hover:bg-osk-500/15 dark:hover:text-osk-300 dark:hover:ring-osk-500/40',
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {p.label}
                  </button>
                );
              })}
            </div>
            <div className="ml-auto text-xs text-slate-400 dark:text-slate-500">
              oder per Drag-Handle ziehen
            </div>
          </div>
        </div>
        )}

        <Section title={`Aktive Jobs · ${active.length}`}>
          {canWrite ? (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            modifiers={[restrictToVerticalAxis, restrictToParentElement]}
          >
            <SortableContext
              items={active.map((j) => j.id)}
              strategy={verticalListSortingStrategy}
            >
              {active.map((job) => (
                <SortableJobRow
                  key={job.id}
                  job={job}
                  editing={editing === job.id}
                  draft={draft}
                  onEditStart={() => {
                    setEditing(job.id);
                    setDraft(job.name);
                  }}
                  onEditCancel={() => setEditing(null)}
                  onDraftChange={setDraft}
                  onEditSave={() => saveEdit(job.id)}
                  onToggle={() => toggleActive(job)}
                  onDelete={() => setDeleteTarget(job)}
                />
              ))}
            </SortableContext>
            <DragOverlay dropAnimation={{ duration: 150 }}>
              {draggingJob ? (
                <JobRow
                  job={draggingJob}
                  editing={false}
                  draft=""
                  onEditStart={() => {}}
                  onEditCancel={() => {}}
                  onDraftChange={() => {}}
                  onEditSave={() => {}}
                  onToggle={() => {}}
                  onDelete={() => {}}
                  isOverlay
                />
              ) : null}
            </DragOverlay>
          </DndContext>
          ) : (
            active.map((job) => (
              <JobRow
                key={job.id}
                job={job}
                editing={false}
                draft=""
                onEditStart={() => {}}
                onEditCancel={() => {}}
                onDraftChange={() => {}}
                onEditSave={() => {}}
                onToggle={() => {}}
                onDelete={() => {}}
                readOnly
              />
            ))
          )}
          {active.length === 0 && !loading && (
            <div className="p-6 text-center text-sm text-slate-500 dark:text-slate-400">
              Noch keine aktiven Jobs.
            </div>
          )}
        </Section>

        {inactive.length > 0 && (
          <div className="mt-6">
            <Section title={`Deaktiviert · ${inactive.length}`}>
              {inactive.map((job) => (
                <JobRow
                  key={job.id}
                  job={job}
                  editing={editing === job.id}
                  draft={draft}
                  onEditStart={() => {
                    setEditing(job.id);
                    setDraft(job.name);
                  }}
                  onEditCancel={() => setEditing(null)}
                  onDraftChange={setDraft}
                  onEditSave={() => saveEdit(job.id)}
                  onToggle={() => toggleActive(job)}
                  onDelete={() => setDeleteTarget(job)}
                  readOnly={!canWrite}
                />
              ))}
            </Section>
          </div>
        )}
      </main>

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(v) => !v && setDeleteTarget(null)}
        title="Job endgültig löschen?"
        description={
          deleteTarget ? (
            <>
              <span className="font-medium text-slate-800 dark:text-slate-200">
                {deleteTarget.name}
              </span>{' '}
              wird entfernt. Alle bisherigen Quittungen für diesen Job
              werden ebenfalls gelöscht und lassen sich nicht
              wiederherstellen.
            </>
          ) : null
        }
        confirmLabel="Löschen"
        variant="destructive"
        onConfirm={confirmDelete}
      />
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-soft overflow-hidden dark:bg-slate-900 dark:ring-slate-800">
      <div className="px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide border-b border-slate-100 bg-slate-50/50 dark:text-slate-400 dark:border-slate-800 dark:bg-slate-800/40">
        {title}
      </div>
      <div className="divide-y divide-slate-100 dark:divide-slate-800">
        {children}
      </div>
    </div>
  );
}

function SortableJobRow(props: {
  job: Job;
  editing: boolean;
  draft: string;
  onEditStart: () => void;
  onEditCancel: () => void;
  onDraftChange: (s: string) => void;
  onEditSave: () => void;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: props.job.id, disabled: props.editing });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'relative',
        isDragging && 'opacity-30',
      )}
    >
      <JobRow
        {...props}
        dragHandle={
          <button
            {...attributes}
            {...listeners}
            type="button"
            aria-label="Ziehen zum Sortieren"
            title="Ziehen zum Sortieren"
            className={cn(
              'p-1 rounded-md text-slate-300 hover:bg-slate-100 hover:text-slate-600 dark:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300',
              props.editing && 'cursor-not-allowed opacity-30',
              !props.editing && 'cursor-grab active:cursor-grabbing',
            )}
            disabled={props.editing}
          >
            <GripVertical className="h-4 w-4" />
          </button>
        }
      />
    </div>
  );
}

function JobRow({
  job,
  editing,
  draft,
  onEditStart,
  onEditCancel,
  onDraftChange,
  onEditSave,
  onToggle,
  onDelete,
  dragHandle,
  isOverlay,
  readOnly,
}: {
  job: Job;
  editing: boolean;
  draft: string;
  onEditStart: () => void;
  onEditCancel: () => void;
  onDraftChange: (s: string) => void;
  onEditSave: () => void;
  onToggle: () => void;
  onDelete: () => void;
  dragHandle?: React.ReactNode;
  isOverlay?: boolean;
  readOnly?: boolean;
}) {
  return (
    <div
      className={cn(
        'flex items-center gap-2 px-3 py-2.5 bg-white dark:bg-slate-900',
        !job.active && 'opacity-60',
        isOverlay && 'rounded-xl ring-1 ring-slate-200 shadow-pop dark:ring-slate-700',
      )}
    >
      {dragHandle ?? <span className="w-6" />}
      <div className="flex-1 min-w-0">
        {editing ? (
          <input
            autoFocus
            value={draft}
            onChange={(e) => onDraftChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onEditSave();
              if (e.key === 'Escape') onEditCancel();
            }}
            className="w-full text-sm rounded-md ring-1 ring-slate-200 focus:ring-2 focus:ring-osk-500 focus:outline-none px-2 py-1 bg-white text-slate-900 dark:bg-slate-950 dark:ring-slate-700 dark:text-slate-100"
          />
        ) : (
          <>
            <div className="font-medium text-slate-900 truncate dark:text-slate-100">
              {job.name}
            </div>
            <div className="text-xs text-slate-400 truncate dark:text-slate-500">
              {job.type} · {job.target}
            </div>
          </>
        )}
      </div>
      {!readOnly && (
        <div className="flex items-center gap-1">
          {editing ? (
            <>
              <button
                onClick={onEditSave}
                className="p-1.5 rounded-md text-emerald-600 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-500/10"
                aria-label="Speichern"
              >
                <Check className="h-4 w-4" />
              </button>
              <button
                onClick={onEditCancel}
                className="p-1.5 rounded-md text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                aria-label="Abbrechen"
              >
                <XIcon className="h-4 w-4" />
              </button>
            </>
          ) : (
            <>
              <button
                onClick={onEditStart}
                className="p-1.5 rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
                aria-label="Umbenennen"
                title="Umbenennen"
              >
                <Pencil className="h-4 w-4" />
              </button>
              <button
                onClick={onToggle}
                className="p-1.5 rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
                aria-label={job.active ? 'Deaktivieren' : 'Aktivieren'}
                title={job.active ? 'Deaktivieren' : 'Aktivieren'}
              >
                {job.active ? (
                  <PowerOff className="h-4 w-4" />
                ) : (
                  <Power className="h-4 w-4" />
                )}
              </button>
              <button
                onClick={onDelete}
                className="p-1.5 rounded-md text-rose-500 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-500/10"
                aria-label="Löschen"
                title="Löschen"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
