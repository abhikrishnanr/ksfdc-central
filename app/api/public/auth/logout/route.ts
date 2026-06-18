import { NextResponse } from 'next/server';
import { logoutPublicUser } from '../../../../../lib/public-auth';

export const dynamic = 'force-dynamic';

export async function POST() {
  await logoutPublicUser();
  return NextResponse.json({ success: true });
}
