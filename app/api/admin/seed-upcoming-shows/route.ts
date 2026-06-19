import { NextRequest, NextResponse } from 'next/server';
import { verifyCentralSyncRequest } from '../../../../lib/sync-security';
import { seedUpcomingPublicShows } from '../../../../lib/upcoming-show-seed';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const body = await request.text();
  const authError = await verifyCentralSyncRequest(request, body);
  if (authError) return authError;

  try {
    const result = await seedUpcomingPublicShows();
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unable to seed upcoming shows.'
    }, { status: 500 });
  }
}
