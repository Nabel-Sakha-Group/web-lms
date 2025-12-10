import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

interface DeleteRequestBody {
  bucket?: string;
  path?: string;
  type?: 'file' | 'folder';
}

export async function POST(request: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json(
        { error: 'Supabase configuration missing' },
        { status: 500 }
      );
    }

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

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    async function collectPaths(prefix: string): Promise<string[]> {
      const { data: entries, error } = await supabaseAdmin.storage
        .from(bucket as string)
        .list(prefix, {
          limit: 1000,
          sortBy: { column: 'name', order: 'asc' },
        });

      if (error) {
        console.error('Error listing for delete:', error);
        throw error;
      }

      if (!entries || entries.length === 0) {
        return [];
      }

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
      return NextResponse.json({ message: 'Nothing to delete' });
    }

    const { error: removeError } = await supabaseAdmin.storage
      .from(bucket)
      .remove(pathsToDelete);

    if (removeError) {
      console.error('Error deleting objects:', removeError);
      return NextResponse.json({ error: removeError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, deleted: pathsToDelete.length });
  } catch (error) {
    console.error('Server error (delete):', error);
    return NextResponse.json(
      { error: 'Failed to delete object(s)' },
      { status: 500 }
    );
  }
}
