import { NextRequest, NextResponse } from 'next/server';
import { verifyPublicEmailOtp } from '../../../../../lib/public-auth';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const payload = await request.json().catch(() => ({}));
  const result = await verifyPublicEmailOtp(payload);
  return NextResponse.json(result.body, { status: result.status });
}
