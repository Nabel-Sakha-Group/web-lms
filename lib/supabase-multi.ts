import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Map bucket name to env prefix
const BUCKET_TO_ENV: Record<string, 'NSG' | 'RMW' | 'DQW'> = {
  'NSG-LMS': 'NSG',
  'RMW-LMS': 'RMW',
  'DQW-LMS': 'DQW',
};

export function getSupabaseClientForBucket(bucket: string, admin: boolean = true): SupabaseClient | null {
  const envKey = BUCKET_TO_ENV[bucket];
  if (!envKey) return null;
  const url = process.env[`NEXT_PUBLIC_SUPABASE_URL_${envKey}`];
  let key: string | undefined;
  key = process.env[`NEXT_PUBLIC_SUPABASE_ANON_KEY_${envKey}`];
  if (!url || !key) return null;
  return createClient(url, key);
}
