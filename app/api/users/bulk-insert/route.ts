import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

type Row = Record<string, string>;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const rows: Row[] = Array.isArray(body?.rows) ? body.rows : [];

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json({ error: 'Supabase configuration missing' }, { status: 500 });
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    if (rows.length === 0) {
      return NextResponse.json({ message: 'No rows provided', results: [] });
    }

    const results: any[] = [];

    // Use Promise.allSettled to collect per-row results
    const promises = rows.map(async (r) => {
      const email = String(r.email || '').trim();
      const password = String(r.password || '').trim();
      // prefer explicit display_name, otherwise check common raw fields
      const display_name = String(r.display_name || r['display_name'] || r['employee name'] || r['employee_name'] || r.name || '').trim();
      let role = String(r.role || '').trim().toLowerCase();
      if (role !== 'admin') role = 'user';

      if (!email || !password) {
        return { success: false, error: 'email or password missing', row: r };
      }

      try {
        const res = await supabaseAdmin.auth.admin.createUser({
          email,
          password,
          user_metadata: { display_name, role },
          email_confirm: true,
        } as any);

        if ((res as any).error) {
          return { success: false, error: (res as any).error.message, row: r };
        }

        return { success: true, data: (res as any).user ?? (res as any).data, row: r };
      } catch (err) {
        return { success: false, error: (err as any)?.message || String(err), row: r };
      }
    });

    const settled = await Promise.all(promises);
    settled.forEach((s) => results.push(s));

    return NextResponse.json({ message: 'Bulk insert finished', results }, { status: 200 });
  } catch (error) {
    console.error('bulk-insert error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
