import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 });
  }

  const order = (body as { order?: unknown })?.order;
  if (!Array.isArray(order) || order.some((id) => !Number.isInteger(id))) {
    return NextResponse.json(
      { error: 'order must be an array of job ids' },
      { status: 400 },
    );
  }

  const db = getDb();
  const update = db.prepare('UPDATE jobs SET sort_order = ? WHERE id = ?');
  let changed = 0;

  const tx = db.transaction(() => {
    (order as number[]).forEach((id, idx) => {
      const res = update.run(idx, id);
      if (res.changes > 0) changed++;
    });
  });
  tx();

  return NextResponse.json({ reordered: changed, total: order.length });
}
