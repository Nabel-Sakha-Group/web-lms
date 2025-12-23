"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as XLSX from 'xlsx';

interface User {
  id: string;
  email: string;
  role: string;
  createdAt: string;
  emailVerified: boolean;
}

type Row = Record<string, string>;

export default function Home() {
  const router = useRouter();
  const [users, setUsers] = useState<User[]>([]);
  const [showAddUserModal, setShowAddUserModal] = useState(false);
  const [newUser, setNewUser] = useState({
    name: "",
    email: "",
    password: "",
    role: "user",
  });
  const [loading, setLoading] = useState(false);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [error, setError] = useState("");
  const [checkingAuth, setCheckingAuth] = useState(true);

  // Check authentication on page load
  useEffect(() => {
    checkAuth();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const checkAuth = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        router.push("/login");
        return;
      }

      // Check if session is expired
      const expiresAt = session.expires_at ? session.expires_at * 1000 : 0;
      const now = Date.now();
      
      if (now > expiresAt) {
        await supabase.auth.signOut();
        router.push("/login");
        return;
      }

      setCheckingAuth(false);
    } catch (err) {
      console.error("Auth check error:", err);
      router.push("/login");
    }
  };

  // Fetch users dari Supabase Auth saat page load
  useEffect(() => {
    if (!checkingAuth) {
      fetchUsers();
    }
  }, [checkingAuth]);

  const fetchUsers = async () => {
    try {
      setLoadingUsers(true);
      
      const response = await fetch('/api/users');
      const data = await response.json();
      
      if (!response.ok) {
        console.error("Error fetching users:", data.error);
        return;
      }

      if (data.users) {
        const formattedUsers: User[] = data.users.map((user: {
          id: string;
          email: string;
          created_at: string;
          email_confirmed_at: string | null;
          user_metadata?: { role?: string };
          raw_user_meta_data?: { role?: string };
        }) => ({
          id: user.id,
          email: user.email || "",
          role: user.user_metadata?.role || user.raw_user_meta_data?.role || "user",
          createdAt: new Date(user.created_at).toISOString().split('T')[0],
          emailVerified: user.email_confirmed_at !== null,
        }));
        
        setUsers(formattedUsers);
      }
    } catch (err) {
      console.error("Error:", err);
    } finally {
      setLoadingUsers(false);
    }
  };

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
      router.push("/login");
    } catch (err) {
      console.error("Logout error:", err);
    }
  };

  const handleAddUser = () => {
    setShowAddUserModal(true);
    setError("");
  };

  const handleCloseModal = () => {
    setShowAddUserModal(false);
    setNewUser({ name: "", email: "", password: "", role: "user" });
    setError("");
  };

  const handleSubmitUser = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!newUser.name || !newUser.email || !newUser.password) {
      setError("Semua field wajib diisi!");
      return;
    }

    if (newUser.password.length < 6) {
      setError("Password minimal 6 karakter!");
      return;
    }

    setLoading(true);
    setError("");

    try {
      // Sign up user di Supabase Auth dengan metadata lengkap seperti screenshot
      const { data: authData, error: signUpError } = await supabase.auth.signUp({
        email: newUser.email,
        password: newUser.password,
        options: {
          data: {
            role: newUser.role, // Ini akan masuk ke raw_user_meta_data
            display_name: newUser.name,
            created_by: "admin-screen",
            email_verified: true,
          },
          emailRedirectTo: undefined,
        }
      });

      if (signUpError) {
        setError(signUpError.message);
        return;
      }

      if (authData.user) {
        // Add to local state untuk tampilan langsung
        const newUserData: User = {
          id: authData.user.id,
          email: newUser.email,
          role: newUser.role,
          createdAt: new Date().toISOString().split('T')[0],
          emailVerified: false,
        };

        setUsers([...users, newUserData]);
        handleCloseModal();
        alert(`User berhasil ditambahkan!\nEmail: ${newUser.email}\nRole: ${newUser.role}`);
      }
    } catch (err) {
      setError("Terjadi kesalahan saat menambah user");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Bulk states and helpers
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkFile, setBulkFile] = useState<File | null>(null);
  const [bulkRows, setBulkRows] = useState<Row[]>([]);
  const [bulkMessage, setBulkMessage] = useState("");
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkResults, setBulkResults] = useState<any[]>([]);

  function parseCSV(text: string) {
    const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
    if (lines.length === 0) return [];
    const headerLine = lines.shift() as string;
    const headers = headerLine.split(",").map((h) => h.trim().toLowerCase());

    const parsed = lines.map((line) => {
      const values: string[] = [];
      let cur = "";
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
          if (inQuotes && line[i + 1] === '"') {
            cur += '"';
            i++;
          } else {
            inQuotes = !inQuotes;
          }
        } else if (ch === "," && !inQuotes) {
          values.push(cur);
          cur = "";
        } else {
          cur += ch;
        }
      }
      values.push(cur);
      const obj: Row = {};
      headers.forEach((h, idx) => (obj[h] = (values[idx] || "").trim()));
      return obj;
    });

    return parsed;
  }

  // Parse file (CSV or XLSX) into Row[] with lowercase headers
  async function parseFileToRows(file: File): Promise<Row[]> {
    const name = file.name.toLowerCase();
    // XLSX
    if (name.endsWith('.xls') || name.endsWith('.xlsx') || /spreadsheetml|excel/.test(file.type)) {
      const ab = await file.arrayBuffer();
      const wb = XLSX.read(ab, { type: 'array' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const raw = XLSX.utils.sheet_to_json(sheet, { defval: '' }) as Record<string, any>[];
      return raw.map(r => {
        const out: Row = {};
        Object.keys(r).forEach(k => {
          const key = String(k).trim().toLowerCase();
          out[key] = String(r[k] ?? '').trim();
        });
        return out;
      });
    }

    // CSV fallback
    const text = await file.text();
    return parseCSV(text).map(r => {
      const out: Row = {};
      Object.keys(r).forEach(k => out[k.trim().toLowerCase()] = r[k]);
      return out;
    });
  }

  const handleBulkFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setBulkFile(e.target.files[0]);
      setBulkRows([]);
      setBulkResults([]);
      setBulkMessage("");
    }
  };

  const handleBulkPreview = async () => {
    if (!bulkFile) {
      setBulkMessage("Pilih file CSV/XLSX terlebih dahulu.");
      return;
    }
    try {
      const parsed = await parseFileToRows(bulkFile);
      setBulkRows(parsed);
      setBulkMessage(`Parsed ${parsed.length} rows`);
      setBulkResults([]);
    } catch (err) {
      setBulkMessage("Gagal parse file: " + (err as any)?.message);
    }
  };

  const handleBulkSend = async () => {
    if (bulkRows.length === 0) {
      setBulkMessage("Tidak ada data untuk dikirim. Lakukan preview dulu.");
      return;
    }
    setBulkLoading(true);
    setBulkResults([]);
    try {
      // normalize rows: lowercase keys already from parseFileToRows
      const normalizeRole = (v: any) => {
        if (!v) return 'user';
        const s = String(v).trim().toLowerCase();
        return s === 'admin' ? 'admin' : 'user';
      };
      const getDisplayName = (r: Row) => r['employee name'] || r['employee_name'] || r['display_name'] || r['name'] || '';

      const payloadRows = bulkRows.map((r) => ({
        email: (r['email'] || '').trim(),
        password: (r['password'] || '').trim(),
        role: normalizeRole(r['role']),
        display_name: getDisplayName(r),
        // include original row for debugging on server
        __raw: r,
      }));

      const res = await fetch('/api/users/bulk-insert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: payloadRows }),
      });
      const data = await res.json();
      setBulkResults(data.results || []);
      setBulkMessage(data.message || 'Selesai');

      // Add successful created users to users list for UI
      (data.results || []).forEach((r: any) => {
        if (r.success && r.data?.id) {
          const newUserData: User = {
            id: r.data.id,
            email: r.data.email || r.row?.email || r.__raw?.email || '',
            role: r.row?.role || r.data?.user_metadata?.role || 'user',
            createdAt: new Date().toISOString().split('T')[0],
            emailVerified: !!r.data?.email_confirmed_at,
          };
          setUsers((prev) => [...prev, newUserData]);
        }
      });
    } catch (err) {
      setBulkMessage('Error mengirim data: ' + (err as any)?.message);
    } finally {
      setBulkLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900">
      {checkingAuth ? (
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-white text-xl">Loading...</div>
        </div>
      ) : (
        <div className="p-8">
          <div className="flex items-center justify-between mb-8">
            <h1 className="text-4xl font-bold text-white">Dashboard</h1>
            <button
              onClick={handleLogout}
              className="bg-red-600 hover:bg-red-700 text-white font-semibold py-2 px-6 rounded-lg transition"
            >
              Logout
            </button>
          </div>
        
          {/* Button Section */}
          <div className="flex gap-4 mb-8">
            <button
              onClick={handleAddUser}
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-4 px-6 rounded-lg transition-all shadow-lg hover:shadow-blue-500/50"
            >
              ➕ Tambah User Baru
            </button>
            <Link
              href="/upload"
              className="flex-1 bg-green-600 hover:bg-green-700 text-white font-semibold py-4 px-6 rounded-lg transition-all shadow-lg hover:shadow-green-500/50 text-center"
            >
              📁 Upload File
            </Link>
          </div>

          {/* Add User Modal/Card */}
          {showAddUserModal && (
            <div className="bg-[#1f1f1f] rounded-lg border border-blue-500 p-6 mb-8 shadow-xl">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-2xl font-semibold text-white">Tambah User Baru</h2>
              <button
                onClick={handleCloseModal}
                className="text-gray-400 hover:text-white text-2xl"
              >
                ✕
              </button>
            </div>

            {error && !bulkMode && (
              <div className="bg-red-900/50 border border-red-500 text-red-200 px-4 py-3 rounded mb-4">
                {error}
              </div>
            )}

            <div className="mb-4">
              <div className="flex gap-2">
                <button
                  onClick={() => setBulkMode(false)}
                  className={`px-4 py-2 rounded ${!bulkMode ? 'bg-blue-600 text-white' : 'bg-slate-700 text-white'}`}
                >Single</button>
                <button
                  onClick={() => setBulkMode(true)}
                  className={`px-4 py-2 rounded ${bulkMode ? 'bg-indigo-600 text-white' : 'bg-slate-700 text-white'}`}
                >Bulk (CSV)</button>
              </div>
            </div>

            {!bulkMode ? (
              <form onSubmit={handleSubmitUser} className="space-y-4">
                <div>
                  <label className="block text-gray-300 text-sm font-medium mb-2">Nama Lengkap</label>
                  <input
                    type="text"
                    value={newUser.name}
                    onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
                    className="w-full bg-slate-800 border border-slate-600 rounded-md text-white px-3 py-2 focus:outline-none focus:border-blue-500"
                    placeholder="Masukkan nama lengkap"
                    disabled={loading}
                  />
                </div>

                <div>
                  <label className="block text-gray-300 text-sm font-medium mb-2">Email</label>
                  <input
                    type="email"
                    value={newUser.email}
                    onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                    className="w-full bg-slate-800 border border-slate-600 rounded-md text-white px-3 py-2 focus:outline-none focus:border-blue-500"
                    placeholder="email@example.com"
                    disabled={loading}
                  />
                </div>

                <div>
                  <label className="block text-gray-300 text-sm font-medium mb-2">Password</label>
                  <input
                    type="password"
                    value={newUser.password}
                    onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                    className="w-full bg-slate-800 border border-slate-600 rounded-md text-white px-3 py-2 focus:outline-none focus:border-blue-500"
                    placeholder="Minimal 6 karakter"
                    disabled={loading}
                  />
                </div>

                <div>
                  <label className="block text-gray-300 text-sm font-medium mb-2">Role</label>
                  <select
                    value={newUser.role}
                    onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}
                    className="w-full bg-slate-800 border border-slate-600 rounded-md text-white px-3 py-2 focus:outline-none focus:border-blue-500"
                    disabled={loading}
                  >
                    <option value="user">User</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    type="submit"
                    disabled={loading}
                    className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-md transition disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loading ? "Menyimpan..." : "Simpan User"}
                  </button>
                  <button
                    type="button"
                    onClick={handleCloseModal}
                    disabled={loading}
                    className="flex-1 bg-slate-700 hover:bg-slate-600 text-white font-semibold py-2 px-4 rounded-md transition disabled:opacity-50"
                  >
                    Batal
                  </button>
                </div>
              </form>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="block text-gray-300 text-sm font-medium mb-2">Upload CSV/XLSX</label>
                  <input type="file" accept=".csv,.xls,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={handleBulkFileChange} />
                </div>

                <div className="flex gap-2">
                  <button onClick={handleBulkPreview} className="bg-slate-700 px-4 py-2 rounded text-white">Preview</button>
                  <button onClick={handleBulkSend} disabled={bulkLoading} className="bg-indigo-600 px-4 py-2 rounded text-white">{bulkLoading ? 'Mengirim...' : 'Kirim (Bulk)'}</button>
                  <button onClick={handleCloseModal} className="ml-auto bg-slate-700 px-4 py-2 rounded text-white">Tutup</button>
                </div>

                {bulkMessage && <div className="text-sm text-gray-300">{bulkMessage}</div>}

                {bulkRows.length > 0 && (
                  <div className="max-h-48 overflow-auto bg-slate-800 p-2 rounded">
                    <table className="w-full text-sm">
                      <thead>
                        <tr>
                          {Object.keys(bulkRows[0]).map((h) => (
                            <th key={h} className="px-2 text-left text-gray-300">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {bulkRows.slice(0, 10).map((r, i) => (
                          <tr key={i} className="odd:bg-slate-900/30">
                            {Object.keys(r).map((k) => (
                              <td key={k} className="px-2 py-1 text-gray-200">{r[k]}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {bulkResults.length > 0 && (
                  <div className="mt-2 max-h-48 overflow-auto bg-slate-800 p-2 rounded">
                    <ul className="text-sm">
                      {bulkResults.map((r, idx) => (
                        <li key={idx} className={r.success ? 'text-green-400' : 'text-red-400'}>
                          Row {idx + 1}: {r.success ? 'SUKSES' : `GAGAL (${r.error || 'unknown'})`}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
            </div>
          )}

          {/* User List Table */}
          <div className="bg-[#1f1f1f] rounded-lg overflow-hidden border border-slate-700">
          <div className="px-6 py-4 border-b border-slate-700">
            <h2 className="text-2xl font-semibold text-white">Daftar Akun User</h2>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-800">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">ID</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Email</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Role</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Tanggal Dibuat</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700">
                {loadingUsers ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-8 text-center text-gray-400">
                      Loading users...
                    </td>
                  </tr>
                ) : users.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-8 text-center text-gray-400">
                      Belum ada user. Tambahkan user baru untuk memulai.
                    </td>
                  </tr>
                ) : (
                  users.map((user) => (
                    <tr key={user.id} className="hover:bg-slate-800/50 transition">
                      <td className="px-6 py-4 whitespace-nowrap text-xs text-gray-300 font-mono">
                        {user.id.substring(0, 8)}...
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-white">{user.email}</td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                          user.role === "admin" ? "bg-red-900/50 text-red-300" :
                          "bg-green-900/50 text-green-300"
                        }`}>
                          {user.role}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">{user.createdAt}</td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 py-1 rounded text-xs ${
                          user.emailVerified ? "bg-green-900/30 text-green-400" : "bg-yellow-900/30 text-yellow-400"
                        }`}>
                          {user.emailVerified ? "✓ Verified" : "Pending"}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <button className="text-blue-400 hover:text-blue-300 mr-3">Edit</button>
                        <button className="text-red-400 hover:text-red-300">Hapus</button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          </div>
        </div>
      )}
    </div>
  );
}
