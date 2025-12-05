import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET(request: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json(
        { error: 'Supabase configuration missing' },
        { status: 500 }
      );
    }

    const searchParams = request.nextUrl.searchParams;
    const bucketName = searchParams.get('bucket');
    const path = searchParams.get('path') || '';

    if (!bucketName) {
      return NextResponse.json(
        { error: 'Bucket name is required' },
        { status: 400 }
      );
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    const { data: files, error } = await supabaseAdmin.storage
      .from(bucketName)
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
