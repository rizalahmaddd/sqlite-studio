// File System Access API & Export Services for Direct Disk Sync & Download

export interface PickedFileResult {
  file: File;
  handle?: FileSystemFileHandle;
}

const IO_CHUNK_BYTES = 16 * 1024 * 1024;

/**
 * Check if browser supports File System Access API
 */
export function isFileSystemAccessSupported(): boolean {
  return typeof window !== 'undefined' && 'showOpenFilePicker' in window;
}

/**
 * Pick a file via File System Access API (Chromium) or Fallback Input.
 * The content is not read here; use readFileWithProgress.
 */
export async function openFileWithHandle(): Promise<PickedFileResult | null> {
  if (isFileSystemAccessSupported()) {
    try {
      const [handle] = await (window as any).showOpenFilePicker({
        types: [
          {
            description: 'SQLite Database (*.db, *.sqlite, *.sqlite3)',
            accept: {
              'application/vnd.sqlite3': ['.db', '.sqlite', '.sqlite3', '']
            }
          }
        ],
        excludeAcceptAllOption: false,
        multiple: false
      });

      const file = await handle.getFile();
      return { file, handle };
    } catch (err: any) {
      if (err.name === 'AbortError') return null;
      console.warn('File picker error or cancelled, falling back to standard input', err);
    }
  }

  // Fallback to standard input
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.db,.sqlite,.sqlite3';
    input.onchange = () => {
      resolve(input.files && input.files[0] ? { file: input.files[0] } : null);
    };
    input.oncancel = () => resolve(null);
    input.click();
  });
}

/**
 * Read a file into memory in chunks so the UI stays responsive and can show progress.
 * Throws RangeError when the device cannot allocate enough memory for the file.
 */
export async function readFileWithProgress(
  file: Blob,
  onProgress?: (fraction: number) => void
): Promise<Uint8Array> {
  const total = file.size;
  const out = new Uint8Array(total);
  let offset = 0;
  while (offset < total) {
    const end = Math.min(offset + IO_CHUNK_BYTES, total);
    const chunk = await file.slice(offset, end).arrayBuffer();
    out.set(new Uint8Array(chunk), offset);
    offset = end;
    onProgress?.(offset / total);
  }
  return out;
}

/**
 * Check or request write permission on a file handle.
 * requestPermission only works while the user gesture is still fresh (a few seconds),
 * so call this BEFORE any heavy work such as exporting the database.
 */
export async function ensureWritePermission(handle: any): Promise<boolean> {
  try {
    if (!handle || typeof handle.createWritable !== 'function') {
      return false;
    }
    if (typeof handle.queryPermission !== 'function') {
      return true;
    }
    if (await handle.queryPermission({ mode: 'readwrite' }) === 'granted') {
      return true;
    }
    return await handle.requestPermission({ mode: 'readwrite' }) === 'granted';
  } catch (err) {
    console.warn('Could not get write permission for file handle:', err);
    return false;
  }
}

/**
 * Direct sync back to the user's local disk file via FileSystemFileHandle.
 * Write permission must already be granted (see ensureWritePermission).
 */
export async function writeBackToDisk(
  handle: any,
  buffer: Uint8Array,
  onProgress?: (fraction: number) => void
): Promise<boolean> {
  let writable: any = null;
  try {
    writable = await handle.createWritable();
    for (let offset = 0; offset < buffer.length; offset += IO_CHUNK_BYTES) {
      const end = Math.min(offset + IO_CHUNK_BYTES, buffer.length);
      await writable.write(buffer.subarray(offset, end));
      onProgress?.(end / buffer.length);
    }
    await writable.close();
    return true;
  } catch (err) {
    console.error('Failed to write directly to disk handle:', err);
    // Aborting discards the temp file, so the original on disk stays intact
    try { await writable?.abort(); } catch {}
    return false;
  }
}

/**
 * Standard browser download fallback
 */
export function triggerFileDownload(buffer: Uint8Array, filename: string): void {
  const blob = new Blob([buffer as any], { type: 'application/x-sqlite3' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.db') || filename.endsWith('.sqlite') ? filename : `${filename}.db`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Text file download (for SQL Dumps, CSV, etc.)
 */
export function triggerTextDownload(text: string, filename: string): void {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Export table/query data to CSV
 */
export function exportToCsv(columns: string[], values: any[][], filename: string): void {
  const escapeCsv = (val: any) => {
    if (val === null || val === undefined) return '';
    const str = String(val);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const headerLine = columns.map(escapeCsv).join(',');
  const rowLines = values.map(row => row.map(escapeCsv).join(','));
  const csvContent = [headerLine, ...rowLines].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Export table/query data to JSON
 */
export function exportToJson(columns: string[], values: any[][], filename: string): void {
  const records = values.map(row => {
    const obj: Record<string, any> = {};
    columns.forEach((col, idx) => {
      obj[col] = row[idx];
    });
    return obj;
  });

  const jsonStr = JSON.stringify(records, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.json') ? filename : `${filename}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
