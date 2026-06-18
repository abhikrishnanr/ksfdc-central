import { redirect } from 'next/navigation';
import { NextResponse } from 'next/server';
import { logoutCentralUser } from '../../../lib/auth';

export async function GET() {
  await logoutCentralUser();
  redirect('/admin/login');
}

export async function POST() {
  await logoutCentralUser();
  return NextResponse.json({ success: true });
}
