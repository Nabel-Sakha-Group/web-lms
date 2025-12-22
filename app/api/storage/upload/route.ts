import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClientForBucket } from '@/lib/supabase-multi';

export const runtime = 'edge';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const rawBucket = formData.get('bucket');
    const rawAccount = formData.get('account');
    const rawPath = formData.get('path');
    const file = formData.get('file');

    if (!rawBucket || !file) {
      return NextResponse.json({ error: 'Missing bucket or file' }, { status: 400 });
    }

    const bucketStr = typeof rawBucket === 'string' ? rawBucket : String(rawBucket);
    const accountStr = typeof rawAccount === 'string' ? rawAccount : '';
    const pathStr = typeof rawPath === 'string' ? rawPath : '';

    let resolvedBucket: string = bucketStr;
    let supabase: any = null;
    if (accountStr) {
      const envKey = accountStr.toUpperCase();
      resolvedBucket = `${envKey}-LMS`;
      supabase = getSupabaseClientForBucket(resolvedBucket, false);
    } else {
      supabase = getSupabaseClientForBucket(bucketStr, false);
    }

    if (!supabase) {
      return NextResponse.json({ error: 'Supabase client not found for this bucket/account' }, { status: 500 });
    }

    // file is a Blob/File from FormData
    let uploadPath = '';
    if (typeof pathStr === 'string' && pathStr.length > 0) {
      uploadPath = pathStr;
    } else if (typeof file === 'object' && file !== null && 'name' in file && typeof (file as any).name === 'string') {
      uploadPath = (file as any).name;
    } else {
      uploadPath = '';
    }
    // Supabase upload expects File/Blob, not ArrayBuffer. Normalize path.
    let uploadFile: Blob;
    if (typeof file === 'object' && file !== null && 'arrayBuffer' in file && 'type' in file) {
      uploadFile = file as Blob;
    } else {
      return NextResponse.json({ error: 'Invalid file type' }, { status: 400 });
    }

    // Normalize uploadPath: remove leading slashes
    uploadPath = String(uploadPath || '').replace(/^\/+/, '');

    // Log details to help debugging folder uploads
    try {
      const fileSize = typeof (uploadFile as any).size === 'number' ? (uploadFile as any).size : undefined;
      const fileType = (uploadFile as any).type || 'unknown';
      console.log(`[UPLOAD] bucket=${resolvedBucket} account=${accountStr || 'N/A'} path=${uploadPath || '(root)'} type=${fileType} size=${fileSize ?? 'unknown'}`);
    } catch (e) {
      console.log('[UPLOAD] unable to read file meta', e);
    }

    const { error } = await supabase.storage.from(resolvedBucket).upload(uploadPath, uploadFile, {
      cacheControl: '3600',
      upsert: false,
      contentType: (uploadFile as Blob).type || 'application/octet-stream',
    });

    if (error) {
      console.error('[UPLOAD] Supabase error:', error);
    }

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
