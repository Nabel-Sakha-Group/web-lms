-- Reset password untuk admin3@nsg.com
-- Jalankan SQL ini di Supabase Dashboard -> SQL Editor
-- Password baru: admin123456

UPDATE auth.users
SET 
  encrypted_password = crypt('admin123456', gen_salt('bf')),
  email_confirmed_at = NOW(),
  confirmed_at = NOW()
WHERE email = 'admin3@nsg.com';
