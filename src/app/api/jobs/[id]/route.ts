import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import type { Job } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const body = await req.json();

  const allowed = ['name', 'type', 'target', 'active', 'sort_order'] as const;
  const fields: string[] = [];
  const values: (string | number)[] = [];
  for (const key of allowed) {
    if (body[key] !== undefined) {
      fields.push(`${key} = ?`);
      values.push(body[key]);
    }
  }
  if (fields.length === 0) {
    return NextResponse.json({ error: 'no fields' }, { status: 400 });
  }
  values.push(id);

  const db = getDb();
  try {
    db.prepare(`UPDATE jobs SET ${fields.join(', ')} WHERE id = ?`).run(
      ...values,
    );
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'unknown error';
    const code = msg.includes('UNIQUE') ? 409 : 500;
    return NextResponse.json({ error: msg }, { status: code });
  }
  const job = db.prepare('SELECT * FROM jobs WHERE id = ?').get(id) as Job;
  return NextResponse.json(job);
}

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const db = getDb();
  db.prepare('DELETE FROM jobs WHERE id = ?').run(id);
  return NextResponse.json({ ok: true });
}
