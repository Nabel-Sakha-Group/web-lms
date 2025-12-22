import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClientForBucket } from '@/lib/supabase-multi';

export async function GET(request: NextRequest) {
  try {
    // ...existing code...

    const searchParams = request.nextUrl.searchParams;
    const bucketName = searchParams.get('bucket');
    const account = searchParams.get('account');
    const path = searchParams.get('path') || '';

    // If account is provided, use it to select the Supabase client and bucket
    let resolvedBucket = bucketName || null;
    let supabase = null as any;
    if (account) {
      const envKey = account.toUpperCase();
      resolvedBucket = `${envKey}-LMS`;
      supabase = getSupabaseClientForBucket(resolvedBucket, false);
    } else if (bucketName) {
      // Try to infer account from bucket name
      supabase = getSupabaseClientForBucket(bucketName, false);
      resolvedBucket = bucketName;
    }

    if (!resolvedBucket || !supabase) {
      return NextResponse.json(
        { error: 'Supabase configuration missing for this bucket/account' },
        { status: 500 }
      );
    }

    const { data: files, error } = await supabase.storage
      .from(resolvedBucket)
      .list(path, {
        limit: 1000,
        sortBy: { column: 'name', order: 'asc' },
      });

    if (error) {
      console.error('Error fetching files:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ files });
  } catch (error) {
    console.error('Server error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
