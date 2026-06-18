import { NextRequest, NextResponse } from 'next/server';
import { requireCentralRole } from '../../../../lib/auth';
import { getReconciliationReport, reconciliationCsv } from '../../../../lib/reports';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const session = await requireCentralRole(['SUPER_ADMIN', 'THEATRE_ADMIN', 'FINANCE_VIEWER']);
  const rows = await getReconciliationReport(session.theatreId);
  if (request.nextUrl.searchParams.get('format') === 'csv') {
    return new NextResponse(reconciliationCsv(rows), {
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': 'attachment; filename="central-reconciliation.csv"'
      }
    });
  }
  return NextResponse.json({ success: true, rows });
}
