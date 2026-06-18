import { NextResponse } from 'next/server';
import { requireCentralRole } from '../../../../../lib/auth';
import { getReconciliationDetail } from '../../../../../lib/reports';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: Promise<{ showId: string }> }) {
  const session = await requireCentralRole(['SUPER_ADMIN', 'THEATRE_ADMIN', 'FINANCE_VIEWER']);
  const { showId } = await params;
  const detail = await getReconciliationDetail(showId, session.theatreId);
  return NextResponse.json({ success: detail.status !== 'UNKNOWN', ...detail }, { status: detail.status === 'UNKNOWN' ? 404 : 200 });
}
