// File System Access API & Export Services for Direct Disk Sync & Download

export interface PickedFileResult {
  file: File;
  handle?: FileSystemFileHandle;
  buffer: Uint8Array;
}

/**
 * Check if browser supports File System Access API
 */
export function isFileSystemAccessSupported(): boolean {
  return typeof window !== 'undefined' && 'showOpenFilePicker' in window;
}

/**
 * Open file via File System Access API (Chromium) or Fallback Input
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
      const arrayBuffer = await file.arrayBuffer();
      return {
        file,
        handle,
        buffer: new Uint8Array(arrayBuffer)
      };
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
    input.onchange = async () => {
      if (input.files && input.files[0]) {
        const file = input.files[0];
        const arrayBuffer = await file.arrayBuffer();
        resolve({
          file,
          buffer: new Uint8Array(arrayBuffer)
        });
      } else {
        resolve(null);
      }
    };
    input.click();
  });
}

/**
 * Direct sync back to the user's local disk file via FileSystemFileHandle
 */
export async function writeBackToDisk(handle: any, buffer: Uint8Array): Promise<boolean> {
  try {
    if (!handle || typeof handle.createWritable !== 'function') {
      return false;
    }
    // Check or request write permission (required for dropped handles or when permission expires)
    if (typeof handle.queryPermission === 'function') {
      const status = await handle.queryPermission({ mode: 'readwrite' });
      if (status !== 'granted') {
        const req = await handle.requestPermission({ mode: 'readwrite' });
        if (req !== 'granted') {
          return false;
        }
      }
    }
    const writable = await handle.createWritable();
    await writable.write(buffer);
    await writable.close();
    return true;
  } catch (err) {
    console.error('Failed to write directly to disk handle:', err);
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
