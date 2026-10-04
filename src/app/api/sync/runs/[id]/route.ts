import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getRunItems } from '@/lib/sync-log';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  }
  return NextResponse.json(getRunItems(getDb(), id));
}
