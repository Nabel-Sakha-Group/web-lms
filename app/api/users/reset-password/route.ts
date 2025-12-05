import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function POST(request: NextRequest) {
  try {
    const { email, newPassword } = await request.json();

    if (!email || !newPassword) {
      return NextResponse.json(
        { error: 'email and newPassword are required' },
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

    // Get user by email
    const { data: { users }, error: getUserError } = await supabaseAdmin.auth.admin.listUsers();
    
    if (getUserError) {
      return NextResponse.json({ error: getUserError.message }, { status: 500 });
    }

    const user = users.find(u => u.email === email);
    
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Update user password
    const { data, error } = await supabaseAdmin.auth.admin.updateUserById(
      user.id,
      { 
        password: newPassword,
        email_confirm: true
      }
    );

    if (error) {
      console.error('Error updating password:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ 
      success: true, 
      message: `Password updated for ${email}`,
      user: data.user 
    });
  } catch (error) {
    console.error('Reset password error:', error);
    return NextResponse.json(
      { error: 'Failed to reset password' },
      { status: 500 }
    );
  }
}
