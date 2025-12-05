import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    // Set session expiry to 1 day (86400 seconds)
    storageKey: 'supabase.auth.token',
  },
  global: {
    headers: {
      'x-session-max-age': '86400', // 1 day in seconds
    },
  },
});
