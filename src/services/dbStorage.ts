// IndexedDB persistence service for SQLite Studio
// Ensures open databases survive page reloads and tab closures

export interface StoredDatabaseMeta {
  id: string;
  name: string;
  alias?: string;
  sizeBytes: number;
  syncMode: 'direct' | 'sandbox';
  fileHandle?: FileSystemFileHandle;
  isDirty: boolean;
  walDetected?: boolean;
  lastModified: number;
  hasBuffer: boolean;
}

export type DatabaseMetaInput = Omit<StoredDatabaseMeta, 'hasBuffer'>;

const DB_NAME = 'sqlite_studio_storage';
const META_STORE = 'databases';
const BUFFER_STORE = 'buffers';
const DB_VERSION = 2;

// Copying a bigger file into IndexedDB takes seconds and can kill the tab on phones,
// so large databases are only kept in memory (and re-read from disk when possible).
export const MAX_CACHED_DB_BYTES = 128 * 1024 * 1024;

export function isCacheableSize(bytes: number): boolean {
  return bytes <= MAX_CACHED_DB_BYTES;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      return reject(new Error('IndexedDB not supported'));
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (e) => {
      const db = request.result;
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(BUFFER_STORE)) {
        db.createObjectStore(BUFFER_STORE, { keyPath: 'id' });
      }

      // v1 kept the binary inside the metadata record; split it out so listing
      // the workspace no longer loads every database into memory.
      if (e.oldVersion === 1 && request.transaction) {
        const metaStore = request.transaction.objectStore(META_STORE);
        const bufferStore = request.transaction.objectStore(BUFFER_STORE);
        metaStore.openCursor().onsuccess = (ev) => {
          const cursor = (ev.target as IDBRequest<IDBCursorWithValue | null>).result;
          if (!cursor) return;
          const { buffer, ...meta } = cursor.value;
          if (buffer) {
            bufferStore.put({ id: meta.id, buffer });
          }
          cursor.update({ ...meta, hasBuffer: Boolean(buffer) });
          cursor.continue();
        };
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  dbPromise.catch(() => {
    dbPromise = null;
  });
  return dbPromise;
}

function runTransaction(
  stores: string[],
  mode: IDBTransactionMode,
  work: (tx: IDBTransaction) => void
): Promise<void> {
  return openDB().then(db => new Promise<void>((resolve, reject) => {
    const tx = db.transaction(stores, mode);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
    work(tx);
  }));
}

function putMeta(store: IDBObjectStore, meta: StoredDatabaseMeta): void {
  try {
    store.put(meta);
  } catch {
    // Fallback without fileHandle if Structured Clone fails on handles in certain browsers
    store.put({ ...meta, fileHandle: undefined });
  }
}

/**
 * Persist database metadata, plus its binary content when it is small enough to cache.
 * Without a cacheable buffer any previously cached copy is dropped so it cannot go stale.
 */
export async function persistDatabase(meta: DatabaseMetaInput, buffer?: Uint8Array): Promise<void> {
  let hasBuffer = false;

  try {
    if (buffer && isCacheableSize(buffer.length)) {
      await runTransaction([BUFFER_STORE], 'readwrite', tx => {
        tx.objectStore(BUFFER_STORE).put({ id: meta.id, buffer });
      });
      hasBuffer = true;
    }
  } catch (err) {
    console.warn('Failed to cache database content in IndexedDB:', err);
  }

  try {
    await runTransaction([META_STORE, BUFFER_STORE], 'readwrite', tx => {
      if (!hasBuffer) {
        tx.objectStore(BUFFER_STORE).delete(meta.id);
      }
      putMeta(tx.objectStore(META_STORE), { ...meta, hasBuffer });
    });
  } catch (err) {
    console.warn('Failed to persist database to IndexedDB:', err);
  }
}

/**
 * Update metadata fields only, leaving the cached binary untouched
 */
export async function updateDatabaseMeta(id: string, patch: Partial<DatabaseMetaInput>): Promise<void> {
  try {
    await runTransaction([META_STORE], 'readwrite', tx => {
      const store = tx.objectStore(META_STORE);
      const req = store.get(id);
      req.onsuccess = () => {
        if (req.result) {
          putMeta(store, { ...req.result, ...patch });
        }
      };
    });
  } catch (err) {
    console.warn('Failed to update database metadata in IndexedDB:', err);
  }
}

/**
 * Remove a closed database from IndexedDB
 */
export async function removeDatabaseFromStorage(id: string): Promise<void> {
  try {
    await runTransaction([META_STORE, BUFFER_STORE], 'readwrite', tx => {
      tx.objectStore(META_STORE).delete(id);
      tx.objectStore(BUFFER_STORE).delete(id);
    });
  } catch (err) {
    console.warn('Failed to remove database from IndexedDB:', err);
  }
}

/**
 * List persisted databases (metadata only) on startup
 */
export async function loadPersistedMetas(): Promise<StoredDatabaseMeta[]> {
  try {
    const db = await openDB();
    return await new Promise((resolve, reject) => {
      const req = db.transaction(META_STORE, 'readonly').objectStore(META_STORE).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('Failed to load databases from IndexedDB:', err);
    return [];
  }
}

/**
 * Load the cached binary content of a single database
 */
export async function loadPersistedBuffer(id: string): Promise<Uint8Array | null> {
  try {
    const db = await openDB();
    return await new Promise((resolve, reject) => {
      const req = db.transaction(BUFFER_STORE, 'readonly').objectStore(BUFFER_STORE).get(id);
      req.onsuccess = () => resolve(req.result?.buffer ?? null);
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('Failed to load database content from IndexedDB:', err);
    return null;
  }
}
