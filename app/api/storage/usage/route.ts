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

    if (!bucketName) {
      return NextResponse.json(
        { error: 'Bucket name is required' },
        { status: 400 }
      );
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Recursively sum file sizes in the bucket
    async function sumFolder(path: string): Promise<number> {
      const { data: entries, error } = await supabaseAdmin.storage
        .from(bucketName as string)
        .list(path, {
          limit: 1000,
          sortBy: { column: 'name', order: 'asc' },
        });

      if (error) {
        console.error('Error listing for usage:', error);
        throw error;
      }

      let total = 0;
      if (!entries) return total;

      for (const entry of entries) {
        if (entry.metadata && typeof entry.metadata.size === 'number') {
          total += entry.metadata.size;
        } else if (!entry.metadata) {
          const childPath = path ? `${path}/${entry.name}` : entry.name;
          total += await sumFolder(childPath);
        }
      }

      return total;
    }

    const usedBytes = await sumFolder('');

    // Simple configurable quota per bucket (in bytes). Adjust as needed.
    const defaultQuotaGB = Number(process.env.NEXT_PUBLIC_BUCKET_QUOTA_GB || '1');
    const totalBytes = defaultQuotaGB * 1024 * 1024 * 1024;

    return NextResponse.json({ usedBytes, totalBytes });
  } catch (error) {
    console.error('Server error (usage):', error);
    return NextResponse.json(
      { error: 'Failed to calculate bucket usage' },
      { status: 500 }
    );
  }
}
