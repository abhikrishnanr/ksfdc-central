import { NextRequest, NextResponse } from 'next/server';
import { returnShowToCentral } from '../../../../../lib/authority-return';

export const dynamic = 'force-dynamic';

type Payload = {
  showId?: string;
  theatreId?: string;
};

export async function POST(request: NextRequest) {
  const payload = await request.json().catch(() => ({})) as Payload;
  const showId = payload.showId?.trim();
  const theatreId = payload.theatreId?.trim();

  if (!showId || !theatreId) {
    return NextResponse.json({ success: false, error: 'showId and theatreId are required.' }, { status: 400 });
  }

  const result = await returnShowToCentral(showId, theatreId);
  const httpStatus = result.switched
    ? 200
    : result.status.blockingReasons.includes('SHOW_NOT_FOUND')
      ? 404
      : 409;

  return NextResponse.json({
    success: result.switched,
    switched: result.switched,
    ...result.status
  }, { status: httpStatus });
}
