import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function POST(request: NextRequest) {
  try {
    const { userId, role } = await request.json();

    if (!userId || !role) {
      return NextResponse.json(
        { error: 'userId and role are required' },
        { status: 400 }
      );
    }

    // Create admin client with service role
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    // Update user metadata
    const { data, error } = await supabaseAdmin.auth.admin.updateUserById(
      userId,
      { 
        user_metadata: { role: role }
      }
    );

    if (error) {
      console.error('Error updating user role:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, user: data.user });
  } catch (error) {
    console.error('Update role error:', error);
    return NextResponse.json(
      { error: 'Failed to update user role' },
      { status: 500 }
    );
  }
}
