import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getSupabaseClientForBucket } from '@/lib/supabase-multi';

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

    // Prefer a per-bucket client if available (for multi-project setups)
    const perBucketClient = getSupabaseClientForBucket(bucketName as string, false);
    const serviceClient = createClient(supabaseUrl, supabaseServiceKey);
    // Prefer per-bucket anon client when available, but keep serviceClient for fallback
    let supabaseAdmin = perBucketClient || serviceClient;

    // Recursively sum file sizes in the bucket. Also detect if any entries
    // appear to be missing metadata/size which indicates an incomplete listing
    // (e.g. anon client doesn't surface metadata).
    async function sumFolder(path: string): Promise<{ total: number; incomplete: boolean }> {
      const pageSize = 1000;
      let offset = 0;
      let total = 0;
      let incomplete = false;

      while (true) {
        const { data: entries, error } = await supabaseAdmin.storage
          .from(bucketName as string)
          .list(path, {
            limit: pageSize,
            offset,
            sortBy: { column: 'name', order: 'asc' },
          });

        if (error) {
          console.error('Error listing for usage:', error);
          throw error;
        }

        if (!entries || entries.length === 0) break;

        for (const entry of entries) {
          if (entry.metadata && typeof entry.metadata.size === 'number') {
            total += entry.metadata.size;
          } else if (!entry.metadata) {
            const childPath = path ? `${path}/${entry.name}` : entry.name;
            const child = await sumFolder(childPath);
            total += child.total;
            if (child.incomplete) incomplete = true;
          } else {
            // metadata exists but size missing -> incomplete
            incomplete = true;
          }
        }

        if (entries.length < pageSize) break;
        offset += pageSize;
      }

      return { total, incomplete };
    }

    const forceService = process.env.FORCE_SERVICE_USAGE === '1';

    // First attempt with per-bucket client (if available) unless forced to use service
    let usedBytes = 0;
    let usedIncomplete = false;
    let source = 'service';

    if (!forceService && perBucketClient) {
      supabaseAdmin = perBucketClient;
      source = 'anon';
      const first = await sumFolder('');
      usedBytes = first.total;
      usedIncomplete = first.incomplete;

      // If the per-bucket attempt looks incomplete (missing metadata) and we
      // have a service client, retry with the service client.
      if (usedIncomplete || usedBytes === 0) {
        supabaseAdmin = serviceClient;
        const second = await sumFolder('');
        usedBytes = second.total;
        usedIncomplete = second.incomplete;
        source = 'service';
      }
    } else {
      supabaseAdmin = serviceClient;
      source = 'service';
      const r = await sumFolder('');
      usedBytes = r.total;
      usedIncomplete = r.incomplete;
    }

    // Simple configurable quota per bucket (in bytes). Adjust as needed.
    const defaultQuotaGB = Number(process.env.NEXT_PUBLIC_BUCKET_QUOTA_GB || '1');
    const totalBytes = defaultQuotaGB * 1024 * 1024 * 1024;

    return NextResponse.json({ usedBytes, totalBytes, source, incomplete: usedIncomplete });
  } catch (error) {
    console.error('Server error (usage):', error);
    return NextResponse.json(
      { error: 'Failed to calculate bucket usage' },
      { status: 500 }
    );
  }
}
