import { NextResponse } from 'next/server';
import { getPublicSearchSuggestions } from '../../../../lib/central-data';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = url.searchParams.get('q') ?? '';
  const { dbStatus, data } = await getPublicSearchSuggestions(query);
  return NextResponse.json({ success: dbStatus.ok, suggestions: data });
}
