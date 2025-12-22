"use client";

import { useState, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface Bucket {
  id: string;
  name: string;
  public: boolean;
  created_at: string;
}

interface FileObject {
  name: string;
  id: string | null;
  updated_at: string | null;
  created_at: string | null;
  last_accessed_at: string | null;
  metadata: {
    mimetype?: string;
    size?: number;
  } | null;
}

export default function UploadPage() {
  const router = useRouter();
  const [buckets, setBuckets] = useState<Bucket[]>([]);
  const [selectedBucket, setSelectedBucket] = useState<string>("");
  const [files, setFiles] = useState<FileObject[]>([]);
  const [currentPath, setCurrentPath] = useState<string>("");
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [loadingBuckets, setLoadingBuckets] = useState(true);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{name: string; status: 'pending' | 'uploading' | 'success' | 'error'}[]>([]);
  const [error, setError] = useState("");
  const [showNewFolderModal, setShowNewFolderModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [checkingAuth, setCheckingAuth] = useState(true);
  const folderInputRef = useRef<HTMLInputElement | null>(null);
  const [folderPickerSupported, setFolderPickerSupported] = useState<boolean>(false);
  const [selectedFolderName, setSelectedFolderName] = useState<string | null>(null);
  const [bucketUsage, setBucketUsage] = useState<{ usedBytes: number; totalBytes: number } | null>(null);
  const [loadingUsage, setLoadingUsage] = useState(false);

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

  useEffect(() => {
    if (!checkingAuth) {
      fetchBuckets();
    }
  }, [checkingAuth]);

  // Ensure folder input has proper non-standard attributes
  useEffect(() => {
    const el = folderInputRef.current;
    if (el) {
      try {
        el.setAttribute('webkitdirectory', '');
        el.setAttribute('directory', '');
        el.setAttribute('multiple', '');
      } catch (e) {
        console.warn('Failed to set folder upload attributes', e);
      }
    }
    // Detect File System Access API support
    const supportsFS = typeof (window as unknown as { showDirectoryPicker?: () => Promise<FileSystemDirectoryHandle> }).showDirectoryPicker === 'function';
    setFolderPickerSupported(supportsFS);
  }, []);

  // Fallback using File System Access API (Chromium only)
  const pickFolderWithFSAPI = async () => {
    try {
      const dirPicker = (window as unknown as { showDirectoryPicker?: () => Promise<FileSystemDirectoryHandle> }).showDirectoryPicker;
      if (!dirPicker) return;
      const dirHandle = await dirPicker();
      setSelectedFolderName(dirHandle.name || null);
      const files: File[] = [];
      // Recursively traverse directory
      for await (const [name, handle] of (dirHandle as unknown as AsyncIterable<[string, FileSystemHandle]>)) {
        await collectFiles(handle, name, files, dirHandle.name || '');
      }
      if (files.length === 0) {
        alert('Folder kosong atau tidak ada akses file');
        return;
      }
      setUploadFiles(files);
      setUploadProgress(files.map(f => ({ name: f.name, status: 'pending' as const })));
    } catch (e) {
      const err = e as { name?: string; message?: string } | undefined;
      if (err?.name !== 'AbortError') {
        console.error('Folder picker error:', e);
        const msg = err?.message ?? 'unknown error';
        alert('Gagal memilih folder: ' + msg);
      }
    }
  };

  // Helper to collect files from a handle
  const collectFiles = async (handle: FileSystemHandle, path: string, files: File[], rootName: string) => {
    if ((handle as FileSystemHandle).kind === 'file') {
      const file = await (handle as FileSystemFileHandle).getFile();
      // Preserve relative path via webkitRelativePath if available
      Object.defineProperty(file, 'webkitRelativePath', {
        value: `${rootName}/${path}`,
        writable: false
      });
      files.push(file);
      return;
    }
    if ((handle as FileSystemHandle).kind === 'directory') {
      for await (const [childName, childHandle] of (handle as unknown as AsyncIterable<[string, FileSystemHandle]>)) {
        await collectFiles(childHandle, `${path}/${childName}`, files, rootName);
      }
    }
  };

  const fetchBuckets = async () => {
    try {
      setLoadingBuckets(true);
      const response = await fetch('/api/storage/buckets-all');
      const data = await response.json();
      if (!response.ok) {
        console.error("Error fetching buckets:", data.error);
        setError(data.error);
        return;
      }
      if (data.buckets) {
        setBuckets(data.buckets);
      }
    } catch (err) {
      console.error("Error:", err);
      setError("Failed to load buckets");
    } finally {
      setLoadingBuckets(false);
    }
  };

  const fetchFiles = async (bucketName: string, path: string = "") => {
    try {
      setLoadingFiles(true);
      setError("");
      // Always use the _account property from the bucket for correct account context
      const acct = (() => {
        const bucket = buckets.find(b => b.name === bucketName || b.id === bucketName);
        return bucket && '_account' in bucket ? (bucket as { _account?: string })._account || null : null;
      })();
      const params = acct ? `account=${encodeURIComponent(acct)}&path=${encodeURIComponent(path)}` : `bucket=${encodeURIComponent(bucketName)}&path=${encodeURIComponent(path)}`;
      const response = await fetch(`/api/storage/files?${params}`);
      const data = await response.json();

      if (!response.ok) {
        console.error("Error fetching files:", data.error);
        setError(data.error || "Gagal mengambil isi bucket. Cek policy dan koneksi.");
        setFiles([]);
        return;
      }

      if (data.files) {
        setFiles(data.files);
      } else {
        setFiles([]);
      }
    } catch (err) {
      console.error("Error:", err);
      setError("Gagal mengambil isi bucket. Cek policy dan koneksi.");
      setFiles([]);
    } finally {
      setLoadingFiles(false);
    }
  };

  const handleBucketSelect = (bucketName: string) => {
    setSelectedBucket(bucketName);
    setFiles([]); // Reset files state to avoid showing old files
    setCurrentPath("");
    setBucketUsage(null);
    setUploadFiles([]);
    setUploadProgress([]);
    setSelectedFolderName(null);
    // Find the _account for this bucket
    const bucketObj = buckets.find(b => b.name === bucketName || b.id === bucketName);
    const acct = bucketObj && '_account' in bucketObj ? (bucketObj as { _account?: string })._account || null : null;
    // Always use correct account for fetchFiles
    if (acct) {
      fetchFiles(bucketName, "");
      fetchBucketUsage(bucketName);
    } else {
      fetchFiles(bucketName, "");
      fetchBucketUsage(bucketName);
    }
  };

  const fetchBucketUsage = async (bucketName: string) => {
    try {
      setLoadingUsage(true);
      const response = await fetch(`/api/storage/usage?bucket=${encodeURIComponent(bucketName)}`);
      const data = await response.json();
      if (!response.ok) {
        console.error('Error fetching usage:', data.error);
        return;
      }
      setBucketUsage({ usedBytes: data.usedBytes, totalBytes: data.totalBytes });
    } catch (err) {
      console.error('Error fetching usage:', err);
    } finally {
      setLoadingUsage(false);
    }
  };

  const handleFolderClick = (folderName: string) => {
    const newPath = currentPath ? `${currentPath}/${folderName}` : folderName;
    setCurrentPath(newPath);
    fetchFiles(selectedBucket, newPath);
  };

  const handleBackClick = () => {
    const pathParts = currentPath.split('/');
    pathParts.pop();
    const newPath = pathParts.join('/');
    setCurrentPath(newPath);
    fetchFiles(selectedBucket, newPath);
  };

  const handleDeleteItem = async (item: FileObject) => {
    if (!selectedBucket) return;

    const isFolder = !item.metadata;
    const targetPath = currentPath ? `${currentPath}/${item.name}` : item.name;
    const confirmed = window.confirm(
      isFolder
        ? `Hapus folder "${targetPath}" beserta semua isinya?`
        : `Hapus file "${targetPath}"?`
    );
    if (!confirmed) return;

    try {
      setLoadingFiles(true);
      const response = await fetch('/api/storage/delete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          bucket: selectedBucket,
          path: targetPath,
          type: isFolder ? 'folder' : 'file',
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        console.error('Delete error:', data.error);
        alert(`Gagal menghapus: ${data.error || 'Unknown error'}`);
      } else {
        // Refresh current folder view
        fetchFiles(selectedBucket, currentPath);
      }
    } catch (err) {
      console.error('Delete error:', err);
      alert('Terjadi kesalahan saat menghapus');
    } finally {
      setLoadingFiles(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const fileArray = Array.from(e.target.files);
      setUploadFiles(fileArray);
      setUploadProgress(fileArray.map(f => ({ name: f.name, status: 'pending' as const })));
    }
  };

  const handleRemoveFile = (index: number) => {
    setUploadFiles(prev => prev.filter((_, i) => i !== index));
    setUploadProgress(prev => prev.filter((_, i) => i !== index));
  };

  const handleFileUpload = async () => {
    if (uploadFiles.length === 0 || !selectedBucket) {
      setError("Pilih bucket dan file terlebih dahulu!");
      return;
    }

    setUploadingFile(true);
    setError("");

    try {
      // Detect if this is a folder upload by presence of webkitRelativePath
      const relativePaths = uploadFiles.map((f) => (f as unknown as { webkitRelativePath?: string }).webkitRelativePath || "");
      const isFolderUpload = relativePaths.some((p) => p && p.length > 0);
      let baseFolder: string | null = selectedFolderName;
      if (isFolderUpload && !baseFolder) {
        const firstPath = relativePaths.find((p) => p && p.length > 0) as string;
        baseFolder = firstPath.split('/')[0] || null;
      }

      // Find the _account for this bucket
      const bucketObj = buckets.find(b => b.name === selectedBucket || b.id === selectedBucket);
      const acct = bucketObj && '_account' in bucketObj ? (bucketObj as { _account?: string })._account || null : null;

      for (let i = 0; i < uploadFiles.length; i++) {
        const file = uploadFiles[i];
        setUploadProgress(prev => prev.map((p, idx) => idx === i ? { ...p, status: 'uploading' as const } : p));
        try {
          // Build storage path preserving folder structure if available
          const relPath = (file as unknown as { webkitRelativePath?: string }).webkitRelativePath;
          let filePath: string;
          if (isFolderUpload && relPath) {
            const pathUnderBase = baseFolder ? relPath.replace(new RegExp(`^${baseFolder}/`), '') : relPath;
            const prefix = currentPath ? `${currentPath}/${baseFolder || ''}`.replace(/\/$/, '') : (baseFolder || '');
            filePath = prefix ? `${prefix}/${pathUnderBase}` : relPath;
          } else {
            filePath = currentPath ? `${currentPath}/${file.name}` : file.name;
          }

          const formData = new FormData();
          formData.append('bucket', selectedBucket);
          if (acct) formData.append('account', acct);
          formData.append('path', filePath);
          formData.append('file', file);

          const response = await fetch('/api/storage/upload', {
            method: 'POST',
            body: formData,
          });
          const data = await response.json();
          if (!response.ok) {
            setUploadProgress(prev => prev.map((p, idx) => idx === i ? { ...p, status: 'error' as const } : p));
            setError(data.error || `Gagal upload file: ${file.name}`);
            console.error(`Error uploading ${file.name}:`, data.error);
          } else {
            setUploadProgress(prev => prev.map((p, idx) => idx === i ? { ...p, status: 'success' as const } : p));
          }
        } catch (err) {
          setUploadProgress(prev => prev.map((p, idx) => idx === i ? { ...p, status: 'error' as const } : p));
          setError(`Gagal upload file: ${file.name}`);
          console.error(`Error uploading ${file.name}:`, err);
        }
      }

      const successCount = uploadProgress.filter(p => p.status === 'success').length;
      alert(`Upload selesai! ${successCount} dari ${uploadFiles.length} file berhasil diupload.`);
      setTimeout(() => {
        setUploadFiles([]);
        setUploadProgress([]);
        fetchFiles(selectedBucket, currentPath);
        const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
        if (fileInput) fileInput.value = '';
      }, 2000);
    } catch (err) {
      setError("Terjadi kesalahan saat upload file");
      console.error(err);
    } finally {
      setUploadingFile(false);
    }
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim() || !selectedBucket) {
      alert("Nama folder tidak boleh kosong");
      return;
    }

    try {
      // Create a placeholder file to create the folder structure
      const folderPath = currentPath ? `${currentPath}/${newFolderName}/.keep` : `${newFolderName}/.keep`;
      const emptyFile = new Blob([""], { type: "text/plain" });
      
      const { error } = await supabase.storage
        .from(selectedBucket)
        .upload(folderPath, emptyFile, {
          cacheControl: '3600',
          upsert: false
        });

      if (error) {
        console.error("Error creating folder:", error);
        alert("Gagal membuat folder: " + error.message);
      } else {
        alert(`Folder "${newFolderName}" berhasil dibuat!`);
        setNewFolderName("");
        setShowNewFolderModal(false);
        fetchFiles(selectedBucket, currentPath);
      }
    } catch (err) {
      console.error("Error creating folder:", err);
      alert("Terjadi kesalahan saat membuat folder");
    }
  };

  if (checkingAuth) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-white text-xl">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900">
      <div className="p-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-4xl font-bold text-white mb-2">File Storage</h1>
            <p className="text-gray-400">Upload dan kelola file di Supabase Storage</p>
          </div>
          <Link
            href="/"
            className="bg-slate-700 hover:bg-slate-600 text-white font-semibold py-2 px-6 rounded-lg transition"
          >
            ← Back to Dashboard
          </Link>
        </div>

        {error && (
          <div className="bg-red-900/50 border border-red-500 text-red-200 px-4 py-3 rounded mb-6">
            {error}
          </div>
        )}

        <div className="grid grid-cols-2 gap-6 mb-6">
          {/* Buckets List */}
          <div className="bg-[#1f1f1f] rounded-lg border border-slate-700 p-6">
            <h2 className="text-2xl font-semibold text-white mb-4">Storage Buckets</h2>
            {loadingBuckets ? (
              <div className="text-gray-400 text-center py-8">Loading buckets...</div>
            ) : buckets.length === 0 ? (
              <div className="text-gray-500 text-center py-8">
                Tidak ada bucket. Buat bucket di Supabase Dashboard.
              </div>
            ) : (
              <div className="space-y-2 max-h-[500px] overflow-y-auto">
                {buckets.map((bucket) => (
                  <button
                    key={bucket.id}
                    onClick={() => handleBucketSelect(bucket.name)}
                    className={`w-full text-left px-4 py-3 rounded-md transition ${
                      selectedBucket === bucket.name
                        ? 'bg-green-600 text-white shadow-lg'
                        : 'bg-slate-800 text-gray-300 hover:bg-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">🗂️</span>
                      <div className="flex-1">
                        <div className="font-medium text-lg">{bucket.name}</div>
                        <div className="text-xs opacity-70">
                          {bucket.public ? '🌐 Public' : '🔒 Private'}
                        </div>
                      </div>
                      {selectedBucket === bucket.name && (
                        <span className="text-xl">✓</span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Files Tree */}
          <div className="bg-[#1f1f1f] rounded-lg border border-slate-700 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-2xl font-semibold text-white">
                {selectedBucket ? `Files in "${selectedBucket}"` : 'Select a bucket'}
              </h2>
              {selectedBucket && (
                <button
                  onClick={() => setShowNewFolderModal(true)}
                  className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg transition font-medium"
                >
                  + New Folder
                </button>
              )}
            </div>

            {selectedBucket && (
              <div className="mb-4 space-y-2">
                <div className="bg-slate-800 rounded-md p-3 flex flex-col gap-2">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-lg">📁</span>
                    <span className="text-gray-300 font-mono">{currentPath || '/'}</span>
                    {currentPath && (
                      <button
                        onClick={handleBackClick}
                        className="ml-auto text-blue-400 hover:text-blue-300 font-medium"
                      >
                        ← Back
                      </button>
                    )}
                  </div>
                </div>

                {/* Bucket usage progress */}
                <div className="bg-slate-800 rounded-md p-3">
                  {bucketUsage ? (
                    <>
                      <div className="flex items-center justify-between text-xs text-gray-300 mb-1">
                        <span>
                          Used: {(bucketUsage.usedBytes / 1024 / 1024).toFixed(2)} MB
                        </span>
                        <span>
                          Total: {(bucketUsage.totalBytes / 1024 / 1024).toFixed(2)} MB
                        </span>
                      </div>
                      <div className="w-full h-2 rounded-full bg-slate-900 overflow-hidden">
                        <div
                          className="h-full bg-emerald-500"
                          style={{
                            width: `${Math.min(
                              100,
                              (bucketUsage.usedBytes / Math.max(bucketUsage.totalBytes, 1)) * 100
                            ).toFixed(1)}%`,
                          }}
                        />
                      </div>
                      <div className="text-[10px] text-gray-500 mt-1">
                        {`Approx. ${(bucketUsage.usedBytes / Math.max(bucketUsage.totalBytes, 1) * 100).toFixed(1)}% used`}
                      </div>
                    </>
                  ) : (
                    <div className="text-xs text-gray-500">
                      {loadingUsage
                        ? 'Calculating bucket usage...'
                        : 'Select a bucket to see usage'}
                    </div>
                  )}
                </div>
              </div>
            )}
            
            {loadingFiles ? (
              <div className="text-gray-400 text-center py-8">Loading files...</div>
            ) : selectedBucket ? (
              files.length === 0 ? (
                <div className="text-gray-500 text-center py-8">
                  Folder kosong. Upload file untuk memulai.
                </div>
              ) : (
                <div className="space-y-1 max-h-[400px] overflow-y-auto">
                  {files.map((file, idx) => (
                    <div
                      key={idx}
                      onClick={() => {
                        if (!file.metadata) {
                          handleFolderClick(file.name);
                        }
                      }}
                      className={`px-4 py-3 rounded-md ${
                        file.metadata
                          ? 'text-gray-400 bg-slate-800/50'
                          : 'text-white bg-slate-800 hover:bg-slate-700 cursor-pointer'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-xl">{file.metadata ? '📄' : '📁'}</span>
                        <span className="flex-1 font-medium">{file.name}</span>
                        {file.metadata && file.metadata.size && (
                          <span className="text-xs text-gray-500">
                            {(file.metadata.size / 1024).toFixed(2)} KB
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteItem(file);
                          }}
                          className="ml-2 text-xs text-red-400 hover:text-red-300 px-2 py-1 rounded border border-red-500/50"
                        >
                          Hapus
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )
            ) : (
              <div className="text-gray-500 text-center py-8">
                👈 Pilih bucket untuk melihat file
              </div>
            )}
          </div>
        </div>

        {/* Upload Section */}
        {selectedBucket && (
          <div className="bg-[#1f1f1f] rounded-lg border border-green-500 p-6">
            <h2 className="text-2xl font-semibold text-white mb-4">Upload Files</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-gray-300 text-sm font-medium mb-2">
                  Choose Files or Folder
                </label>
                <div className="grid grid-cols-2 gap-4">
                  {/* Multiple Files */}
                  <div>
                    <input
                      type="file"
                      multiple
                      onChange={handleFileSelect}
                      className="hidden"
                      id="multiple-files"
                      disabled={uploadingFile}
                    />
                    <label
                      htmlFor="multiple-files"
                      className={`flex flex-col items-center justify-center border-2 border-dashed rounded-lg p-6 cursor-pointer transition-all ${
                        uploadingFile
                          ? 'border-gray-600 bg-slate-800/50 cursor-not-allowed'
                          : 'border-blue-500 bg-slate-800 hover:bg-slate-700 hover:border-blue-400'
                      }`}
                    >
                      <div className="text-4xl mb-2">📄</div>
                      <div className="text-blue-400 font-semibold text-lg mb-1">Choose Files</div>
                      <div className="text-xs text-gray-400">Select multiple files</div>
                    </label>
                  </div>

                  {/* Folder */}
                  <div>
                    <input
                      type="file"
                      ref={folderInputRef}
                      onChange={handleFileSelect}
                      className="hidden"
                      id="folder-upload"
                      disabled={uploadingFile}
                    />
                    <label
                      htmlFor="folder-upload"
                      onClick={(e) => {
                        // If FS API supported, use it for better UX
                        if (folderPickerSupported) {
                          e.preventDefault();
                          if (!uploadingFile) pickFolderWithFSAPI();
                        }
                      }}
                      className={`flex flex-col items-center justify-center border-2 border-dashed rounded-lg p-6 cursor-pointer transition-all ${
                        uploadingFile
                          ? 'border-gray-600 bg-slate-800/50 cursor-not-allowed'
                          : 'border-purple-500 bg-slate-800 hover:bg-slate-700 hover:border-purple-400'
                      }`}
                    >
                      <div className="text-4xl mb-2">📁</div>
                      <div className="text-purple-400 font-semibold text-lg mb-1">Choose Folder</div>
                      <div className="text-xs text-gray-400">Upload entire folder</div>
                    </label>
                  </div>
                </div>
              </div>
              
              {uploadFiles.length > 0 && (
                <div className="bg-slate-800 rounded-md p-3 max-h-48 overflow-y-auto">
                  <div className="text-sm text-gray-400 mb-2">
                    Selected Files: ({uploadFiles.length})
                  </div>
                  <div className="space-y-2">
                    {uploadFiles.map((file, idx) => (
                      <div key={idx} className="flex items-center justify-between bg-slate-700 rounded px-3 py-2">
                        <div className="flex-1 min-w-0">
                          <div className="text-white text-sm font-medium truncate">
                            📎 {file.name}
                          </div>
                          <div className="text-xs text-gray-400">
                            {(file.size / 1024).toFixed(2)} KB
                            {uploadProgress[idx] && (
                              <span className={`ml-2 ${
                                uploadProgress[idx].status === 'success' ? 'text-green-400' :
                                uploadProgress[idx].status === 'error' ? 'text-red-400' :
                                uploadProgress[idx].status === 'uploading' ? 'text-blue-400' :
                                'text-gray-500'
                              }`}>
                                {uploadProgress[idx].status === 'success' && '✓ Uploaded'}
                                {uploadProgress[idx].status === 'error' && '✗ Failed'}
                                {uploadProgress[idx].status === 'uploading' && '⟳ Uploading...'}
                                {uploadProgress[idx].status === 'pending' && '⋯ Pending'}
                              </span>
                            )}
                          </div>
                        </div>
                        {!uploadingFile && (
                          <button
                            onClick={() => handleRemoveFile(idx)}
                            className="text-red-400 hover:text-red-300 ml-2"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                  <div className="mt-2 text-xs text-gray-400">
                    Total size: {(uploadFiles.reduce((sum, f) => sum + f.size, 0) / 1024 / 1024).toFixed(2)} MB
                  </div>
                </div>
              )}

              <div className="bg-slate-800 rounded-md p-3">
                <div className="text-sm text-gray-400 mb-1">Upload Destination:</div>
                <div className="text-white font-mono text-sm">
                  {selectedBucket}/{currentPath || '(root)'}
                </div>
              </div>

              <button
                onClick={handleFileUpload}
                disabled={uploadFiles.length === 0 || uploadingFile}
                className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-3 rounded-md transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {uploadingFile ? `Uploading ${uploadProgress.filter(p => p.status === 'uploading').length} files...` : `Upload ${uploadFiles.length} File(s)`}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* New Folder Modal */}
      {showNewFolderModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-[#1f1f1f] border border-slate-700 rounded-lg p-6 w-full max-w-md">
            <h3 className="text-xl font-semibold text-white mb-4">Create New Folder</h3>
            
            <div className="mb-4">
              <label className="block text-gray-300 text-sm font-medium mb-2">
                Folder Name
              </label>
              <input
                type="text"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                placeholder="Enter folder name"
                className="w-full bg-slate-800 border border-slate-600 rounded-md text-white px-3 py-2 focus:outline-none focus:border-green-500"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreateFolder();
                }}
              />
              {currentPath && (
                <div className="text-xs text-gray-400 mt-2">
                  Will be created in: {currentPath}/
                </div>
              )}
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleCreateFolder}
                className="flex-1 bg-green-600 hover:bg-green-700 text-white font-semibold py-2 px-4 rounded-md transition"
              >
                Create
              </button>
              <button
                onClick={() => {
                  setShowNewFolderModal(false);
                  setNewFolderName("");
                }}
                className="flex-1 bg-slate-700 hover:bg-slate-600 text-white font-semibold py-2 px-4 rounded-md transition"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
