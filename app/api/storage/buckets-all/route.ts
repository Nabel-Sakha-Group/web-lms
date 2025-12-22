import { NextResponse } from 'next/server';
import { getSupabaseClientForBucket } from '@/lib/supabase-multi';

const ALL_BUCKETS = [
  { bucket: 'NSG-LMS', env: 'NSG' },
  { bucket: 'RMW-LMS', env: 'RMW' },
  { bucket: 'DQW-LMS', env: 'DQW' },
];

export async function GET() {
  try {
    // Many Supabase admin operations (like listing all buckets) require a
    // service role key. To avoid requiring service role keys for every
    // connected account, we will infer available buckets from configured
    // environment variables and return a synthetic bucket entry for each
    // account that has an URL + anon key configured. This lets the UI
    // show the expected buckets without needing server-admin credentials.

    const buckets = ALL_BUCKETS.reduce((acc: any[], { bucket, env }) => {
      const url = process.env[`NEXT_PUBLIC_SUPABASE_URL_${env}`];
      const anon = process.env[`NEXT_PUBLIC_SUPABASE_ANON_KEY_${env}`];
      if (url && anon) {
        acc.push({ id: bucket, name: bucket, public: true, created_at: null, _account: env });
      } else {
        console.warn(`[BUCKETS-ALL] ENV MISSING for ${env}:`, !!url, !!anon);
      }
      return acc;
    }, [] as any[]);

    return NextResponse.json({ buckets });
  } catch (error) {
    console.error('Server error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
