import { NextRequest, NextResponse } from 'next/server';
import { getAuthorityDebugStatus } from '../../../../lib/authority-return';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const showId = request.nextUrl.searchParams.get('showId')?.trim();
  if (!showId) {
    return NextResponse.json({ success: false, error: 'showId is required.' }, { status: 400 });
  }

  const status = await getAuthorityDebugStatus(showId);
  return NextResponse.json({ success: true, ...status }, { status: status.blockingReasons.includes('SHOW_NOT_FOUND') ? 404 : 200 });
}
