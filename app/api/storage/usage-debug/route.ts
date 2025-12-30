import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getSupabaseClientForBucket } from '@/lib/supabase-multi';

export async function GET(request: NextRequest) {
  try {
    const secret = request.headers.get('x-usage-debug-secret') || request.nextUrl.searchParams.get('secret');
    if (!process.env.USAGE_DEBUG_SECRET || secret !== process.env.USAGE_DEBUG_SECRET) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
    }

    const bucket = request.nextUrl.searchParams.get('bucket');
    const path = request.nextUrl.searchParams.get('path') || '';
    const limit = Number(request.nextUrl.searchParams.get('limit') || '50');
    if (!bucket) return NextResponse.json({ error: 'bucket required' }, { status: 400 });

    const perBucket = getSupabaseClientForBucket(bucket, false);
    const serviceClient = createClient(supabaseUrl, supabaseServiceKey);
    const client = perBucket || serviceClient;

    const { data, error } = await client.storage.from(bucket).list(path, { limit, sortBy: { column: 'name', order: 'asc' } });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ entries: data, source: perBucket ? 'anon' : 'service' });
  } catch (err) {
    console.error('Usage-debug error', err);
    return NextResponse.json({ error: 'internal' }, { status: 500 });
  }
}
