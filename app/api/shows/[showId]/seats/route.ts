import { NextResponse } from 'next/server';
import { getAuthorityAwareBookingShow, getCentralBookingUnavailableMessage } from '../../../../../lib/central-data';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: Promise<{ showId: string }> }) {
  const { showId } = await params;
  const { dbStatus, data } = await getAuthorityAwareBookingShow(showId);

  if (!data) {
    return NextResponse.json({ error: dbStatus.message ?? 'Show not found.' }, { status: 404 });
  }

  return NextResponse.json({
    ...data,
    unavailableMessage: data.bookingEnabled === false ? getCentralBookingUnavailableMessage(data.reason) : null
  });
}
