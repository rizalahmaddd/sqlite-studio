// IndexedDB persistence service for SQLite Studio
// Ensures open databases survive page reloads and tab closures

export interface StoredDatabaseRecord {
  id: string;
  name: string;
  alias?: string;
  sizeBytes: number;
  buffer: Uint8Array;
  syncMode: 'direct' | 'sandbox';
  fileHandle?: FileSystemFileHandle;
  isDirty: boolean;
  walDetected?: boolean;
  lastModified: number;
}

const DB_NAME = 'sqlite_studio_storage';
const STORE_NAME = 'databases';
const DB_VERSION = 1;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      return reject(new Error('IndexedDB not supported'));
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Persist database metadata and binary content to IndexedDB
 */
export async function persistDatabaseToStorage(record: StoredDatabaseRecord): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);

      try {
        store.put(record);
      } catch {
        // Fallback without fileHandle if Structured Clone fails on handles in certain browsers
        const fallbackRecord = { ...record, fileHandle: undefined };
        store.put(fallbackRecord);
      }

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn('Failed to persist database to IndexedDB:', err);
  }
}

/**
 * Remove a closed database from IndexedDB
 */
export async function removeDatabaseFromStorage(id: string): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn('Failed to remove database from IndexedDB:', err);
  }
}

/**
 * Load all persisted databases from IndexedDB on startup
 */
export async function loadAllPersistedDatabases(): Promise<StoredDatabaseRecord[]> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('Failed to load databases from IndexedDB:', err);
    return [];
  }
}
