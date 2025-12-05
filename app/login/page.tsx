"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError("Email & Password wajib diisi");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        console.error("Login error:", error);
        setError(error.message === 'Invalid login credentials'
          ? 'Email atau password salah'
          : 'Login gagal: ' + error.message);
        return;
      }

      // Double-check session and role before redirect
      const { data: sessionData } = await supabase.auth.getSession();
      const session = sessionData.session;
      if (session) {
        // Fetch user to check role
        const { data: userData } = await supabase.auth.getUser();
        const user = userData.user;
        const userMeta = user?.user_metadata as Record<string, unknown> | undefined;
        const appMeta = user?.app_metadata as Record<string, unknown> | undefined;
        const role = (userMeta?.['role'] as string | undefined) ?? (appMeta?.['role'] as string | undefined);

        if (role !== 'admin') {
          // If not admin, prevent access
          await supabase.auth.signOut();
          setError('Akun tidak memiliki akses admin');
          return;
        }

        console.log("Login berhasil sebagai admin! Redirecting...");
        // Set a lightweight session cookie for middleware (24h)
        try {
          const accessToken = session.access_token;
          const expiresIn = session.expires_in ?? 60 * 60 * 24; // seconds
          const maxAge = Math.min(expiresIn, 60 * 60 * 24); // cap to 24h
          document.cookie = `sb-access-token=${accessToken}; Path=/; Max-Age=${maxAge}; SameSite=Lax`;
        } catch (e) {
          console.warn('Gagal set cookie sesi untuk middleware', e);
        }
        window.location.assign("/");
      } else {
        setError("Login berhasil tapi sesi tidak ditemukan. Coba ulangi.");
      }
    } catch (err) {
      setError("Terjadi kesalahan saat login");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen w-screen bg-slate-900 justify-center items-center">
      <div className="bg-[#1f1f1f] rounded-lg p-12 flex flex-col w-full max-w-md border border-slate-700">
        <h1 className="font-bold text-3xl text-white mb-2">Login</h1>
        <p className="text-gray-400 mb-8">Masuk ke akun Anda</p>
        
        {error && (
          <div className="bg-red-900/50 border border-red-500 text-red-200 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} className="gap-6 flex flex-col">
          <div>
            <label className="block text-gray-300 text-sm font-medium mb-2">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-slate-800 border border-slate-600 rounded-md text-white px-3 py-2 focus:outline-none focus:border-blue-500"
              placeholder="email@example.com"
              disabled={loading}
            />
          </div>
          
          <div>
            <label className="block text-gray-300 text-sm font-medium mb-2">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-slate-800 border border-slate-600 rounded-md text-white px-3 py-2 focus:outline-none focus:border-blue-500"
              placeholder="••••••••"
              disabled={loading}
            />
          </div>
          
          <button 
            type="submit" 
            disabled={loading}
            className="bg-blue-600 text-white rounded-md py-3 hover:bg-blue-700 transition font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Memproses..." : "Login"}
          </button>
        </form>
      </div>
    </div>
  );
}
