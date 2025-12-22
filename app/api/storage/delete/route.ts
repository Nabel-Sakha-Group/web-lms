import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

interface DeleteRequestBody {
  bucket?: string;
  path?: string;
  type?: 'file' | 'folder';
}

export async function POST(request: NextRequest) {
  try {
    // Determine which Supabase project/service key to use based on bucket
    const body = (await request.json()) as DeleteRequestBody;
    const bucket = body.bucket;
    const targetPath = body.path;
    const type = body.type ?? 'file';

    if (!bucket || !targetPath) {
      return NextResponse.json(
        { error: 'bucket and path are required' },
        { status: 400 }
      );
    }

    // Allow explicit account in request; otherwise infer env key from bucket name (e.g., 'NSG-LMS' -> 'NSG')
    const account = (body as any).account;
    const accountStr = typeof account === 'string' ? account : '';
    const envMatch = accountStr ? accountStr : String(bucket).split('-')[0] || '';
    const envKey = String(envMatch).toUpperCase();

    const projectUrl = process.env[`NEXT_PUBLIC_SUPABASE_URL_${envKey}`] || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env[`SUPABASE_SERVICE_ROLE_KEY_${envKey}`] || process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!projectUrl || !serviceKey) {
      console.error('[DELETE] Missing project URL or service role key for', envKey);
      const hint = `Missing service role key for ${envKey}. Add SUPABASE_SERVICE_ROLE_KEY_${envKey} to .env.local or set SUPABASE_SERVICE_ROLE_KEY.`;
      return NextResponse.json(
        { error: `Supabase configuration missing for this bucket/account. ${hint}` },
        { status: 500 }
      );
    }

    console.log('[DELETE] envKey=', envKey, 'projectUrl=', !!projectUrl, 'hasServiceKey=', !!serviceKey);
    const supabaseAdmin = createClient(projectUrl, serviceKey);

    // Track which bucket name actually worked for listing/removal
    let usedBucket: string | null = null;

    // Try listing the prefix on multiple candidate bucket names: provided bucket first, then fallback `${envKey}-LMS`.
    async function collectPaths(prefix: string): Promise<string[]> {
      const candidateBuckets: string[] = [];
      candidateBuckets.push(String(bucket));
      const fallbackBucket = `${envKey}-LMS`;
      if (!candidateBuckets.includes(fallbackBucket)) candidateBuckets.push(fallbackBucket);

      let lastErr: any = null;
      let entries: any[] | null = null;

      for (const candidate of candidateBuckets) {
        try {
          const resp = await supabaseAdmin.storage.from(candidate).list(prefix, { limit: 1000, sortBy: { column: 'name', order: 'asc' } });
          if ((resp as any).error) {
            lastErr = (resp as any).error;
            console.warn('[DELETE] list error for bucket', candidate, (resp as any).error?.message || resp);
            continue;
          }
          entries = (resp as any).data || [];
          usedBucket = candidate;
          break;
        } catch (err) {
          lastErr = err;
          console.warn('[DELETE] exception listing bucket', candidate, err);
          continue;
        }
      }

      if (!entries) {
        console.error('[DELETE] Unable to list prefix on any candidate bucket. lastErr=', lastErr);
        throw lastErr || new Error('Unable to list bucket');
      }

      if (!entries || entries.length === 0) return [];

      const paths: string[] = [];
      for (const entry of entries) {
        const entryPath = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (entry.metadata) {
          paths.push(entryPath);
        } else {
          const childPaths = await collectPaths(entryPath);
          paths.push(...childPaths);
        }
      }

      return paths;
    }

    let pathsToDelete: string[] = [];

    if (type === 'file') {
      pathsToDelete = [targetPath];
    } else {
      pathsToDelete = await collectPaths(targetPath);
    }

    if (pathsToDelete.length === 0) {
      console.log('[DELETE] No paths to delete for', targetPath);
      return NextResponse.json({ message: 'Nothing to delete' });
    }

    const bucketForRemoval = usedBucket || String(bucket);
    console.log('[DELETE] Deleting', pathsToDelete.length, 'objects from', bucketForRemoval, '->', pathsToDelete.slice(0, 10));
    try {
      const { error: removeError } = await supabaseAdmin.storage.from(bucketForRemoval).remove(pathsToDelete);

      if (removeError) {
        console.error('[DELETE] remove error:', removeError);
        // Attempt fallback: try all configured envs' service role keys
        const CONFIG_ENVS = ['NSG', 'RMW', 'DQW'];
        for (const altEnv of CONFIG_ENVS) {
          if (altEnv === envKey) continue;
          const altUrl = process.env[`NEXT_PUBLIC_SUPABASE_URL_${altEnv}`];
          const altKey = process.env[`SUPABASE_SERVICE_ROLE_KEY_${altEnv}`];
          if (!altUrl || !altKey) {
            console.log('[DELETE] skipping altEnv', altEnv, 'missing config');
            continue;
          }
          try {
            console.log('[DELETE] trying fallback remove with env', altEnv);
            const altClient = createClient(altUrl, altKey);
            const { error: altRemoveError } = await altClient.storage.from(bucketForRemoval).remove(pathsToDelete);
            if (!altRemoveError) {
              return NextResponse.json({ success: true, deleted: pathsToDelete.length, usedBucket: bucketForRemoval, fallbackUsed: altEnv });
            }
            console.warn('[DELETE] fallback remove error for', altEnv, altRemoveError.message || altRemoveError);
          } catch (e) {
            console.warn('[DELETE] exception trying fallback env', altEnv, e);
            continue;
          }
        }

        return NextResponse.json({ error: removeError.message || JSON.stringify(removeError) }, { status: 500 });
      }

      return NextResponse.json({ success: true, deleted: pathsToDelete.length, examples: pathsToDelete.slice(0, 5), usedBucket: bucketForRemoval });
    } catch (err) {
      console.error('[DELETE] exception while removing:', err);
      return NextResponse.json({ error: (err as any).message || String(err) }, { status: 500 });
    }
  } catch (error) {
    console.error('Server error (delete):', error);
    return NextResponse.json(
      { error: 'Failed to delete object(s)' },
      { status: 500 }
    );
  }
}
