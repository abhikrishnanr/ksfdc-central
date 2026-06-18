import { NextRequest, NextResponse } from 'next/server';
import { requestPublicEmailOtp } from '../../../../../lib/public-auth';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const payload = await request.json().catch(() => ({}));
  const result = await requestPublicEmailOtp(payload);
  return NextResponse.json(result.body, { status: result.status });
}
