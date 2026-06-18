import { NextRequest, NextResponse } from 'next/server';
import { getBookingAuthorityDecision } from '../../../../lib/booking-authority';

export const dynamic = 'force-dynamic';

function hasEnv(name: string) {
  return Boolean(process.env[name]?.trim());
}

export async function GET(request: NextRequest) {
  const showId = request.nextUrl.searchParams.get('showId')?.trim();
  if (!showId) {
    return NextResponse.json({ success: false, error: 'showId is required.' }, { status: 400 });
  }

  const decision = await getBookingAuthorityDecision({ showId });

  return NextResponse.json({
    success: true,
    showId,
    decision,
    env: {
      hasLocalTheatreApiUrl: hasEnv('LOCAL_THEATRE_API_URL'),
      hasLocalTheatreApiBaseUrl: hasEnv('LOCAL_THEATRE_API_BASE_URL'),
      hasLocalAuthorityBaseUrl: hasEnv('LOCAL_AUTHORITY_BASE_URL'),
      hasLocalTheatreSharedSecret: hasEnv('LOCAL_THEATRE_SHARED_SECRET'),
      hasLocalSharedSecret: hasEnv('LOCAL_SHARED_SECRET'),
      hasCloudflareAccessClientId: hasEnv('CLOUDFLARE_ACCESS_CLIENT_ID'),
      hasCloudflareAccessClientSecret: hasEnv('CLOUDFLARE_ACCESS_CLIENT_SECRET'),
      hasLocalHealthCheckTimeout: hasEnv('LOCAL_HEALTH_CHECK_TIMEOUT_MS'),
      hasLocalTunnelTimeout: hasEnv('LOCAL_TUNNEL_TIMEOUT_MS'),
      hasLocalSeatStatusTimeout: hasEnv('LOCAL_SEAT_STATUS_TIMEOUT_MS')
    }
  }, { status: decision ? 200 : 404 });
}
