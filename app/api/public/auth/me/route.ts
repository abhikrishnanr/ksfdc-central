import { NextResponse } from 'next/server';
import { getPublicSession, publicOtpEnabled } from '../../../../../lib/public-auth';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getPublicSession();
  return NextResponse.json({
    success: true,
    otpEnabled: publicOtpEnabled(),
    authenticated: Boolean(session),
    user: session ? { id: session.userId, email: session.email, displayName: session.displayName } : null
  });
}
