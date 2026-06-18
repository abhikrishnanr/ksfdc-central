import { NextResponse } from 'next/server';
import { getCentralSyncStatus } from '../../../../lib/reports';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ success: true, theatres: await getCentralSyncStatus() });
}
