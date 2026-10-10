import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Navbar } from './components/Navbar';
import { Sidebar } from './components/Sidebar';
import { DataGrid } from './components/DataGrid';
import { DetailDrawer } from './components/DetailDrawer';
import { SqlEditor } from './components/SqlEditor';
import { SchemaViewer } from './components/SchemaViewer';
import { VisualErd } from './components/VisualErd';
import { DatabaseDiff } from './components/DatabaseDiff';
import { DiagnosticsView } from './components/DiagnosticsView';
import { SafeModeModal } from './components/SafeModeModal';
import { WalWarningModal } from './components/WalWarningModal';
import { ImportModal } from './components/ImportModal';
import { ShortcutsModal } from './components/ShortcutsModal';
import { BottomNav } from './components/BottomNav';
import { LoadingOverlay, type BusyState } from './components/LoadingOverlay';

import type { DatabaseMetadata, ActiveView, ColumnInfo, SafeGuardAlert } from './types/database';
import { 
  loadDatabase, 
  closeDatabase, 
  inspectSchema, 
  exportDatabaseBinary, 
  isWalMode,
  validateSqliteHeader,
  executeRawQuery,
  exportDatabaseSqlDump,
  getDatabaseSize
} from './services/sqliteEngine';
import { 
  openFileWithHandle, 
  readFileWithProgress,
  ensureWritePermission,
  writeBackToDisk, 
  triggerFileDownload,
  triggerTextDownload
} from './services/fileSystemSync';
import { createSampleEcommerceDb } from './services/sampleData';
import { Database, FolderOpen, Sparkles, Upload, TableProperties, Terminal } from 'lucide-react';
import { useFeedback } from './context/useFeedback';
import { 
  persistDatabase,
  updateDatabaseMeta,
  removeDatabaseFromStorage, 
  loadPersistedMetas,
  loadPersistedBuffer,
  isCacheableSize,
  type DatabaseMetaInput
} from './services/dbStorage';

const PERSIST_DEBOUNCE_MS = 1200;

function formatBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

// Lets the browser paint (e.g. the loading overlay) before a synchronous SQLite call
// blocks the main thread. The timeout covers background tabs, where rAF never fires.
function nextPaint(): Promise<void> {
  return new Promise(resolve => {
    requestAnimationFrame(() => setTimeout(resolve, 0));
    setTimeout(resolve, 100);
  });
}

function toStoredMeta(db: DatabaseMetadata, isDirty: boolean = db.isDirty): DatabaseMetaInput {
  return {
    id: db.id,
    name: db.name,
    alias: db.alias,
    sizeBytes: db.sizeBytes,
    syncMode: db.syncMode,
    fileHandle: db.fileHandle,
    isDirty,
    walDetected: db.walDetected,
    lastModified: Date.now()
  };
}

export const App: React.FC = () => {
  const { showToast, confirm } = useFeedback();
  const [databases, setDatabases] = useState<DatabaseMetadata[]>([]);
  const [activeDbId, setActiveDbId] = useState<string | null>(null);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<ActiveView>('grid');
  const [safeMode, setSafeMode] = useState<boolean>(true);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState<boolean>(false);

  // Global Drag and Drop state
  const [isDragOver, setIsDragOver] = useState(false);

  // Safe Mode Trigger State
  const [safeGuardAlert, setSafeGuardAlert] = useState<SafeGuardAlert | null>(null);
  const [pendingSafeProceed, setPendingSafeProceed] = useState<(() => void) | null>(null);

  // WAL Modal State
  const [walModalOpen, setWalModalOpen] = useState(false);
  const [walDbName, setWalDbName] = useState('');

  // Import Modal & Shortcuts Modal
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isShortcutsModalOpen, setIsShortcutsModalOpen] = useState(false);

  // Side Detail Drawer State
  const [drawerState, setDrawerState] = useState<{
    isOpen: boolean;
    column: ColumnInfo | null;
    initialValue: any;
    whereKeys: Record<string, any>;
  }>({
    isOpen: false,
    column: null,
    initialValue: null,
    whereKeys: {}
  });

  const activeDb = databases.find(d => d.id === activeDbId) || null;
  const currentTableSchema = activeDb?.tables.find(t => t.name === selectedTable) || activeDb?.tables[0] || null;

  const handleSaveRef = useRef<((id?: string) => Promise<void>) | null>(null);

  const [busy, setBusy] = useState<BusyState | null>(null);
  const busyRef = useRef(false);
  const databasesRef = useRef(databases);
  const persistTimers = useRef(new Map<string, number>());
  const openFileRef = useRef<((file: File, handle?: FileSystemFileHandle) => Promise<boolean>) | null>(null);

  useEffect(() => {
    databasesRef.current = databases;
  }, [databases]);

  const showBusy = useCallback(async (state: BusyState) => {
    setBusy(state);
    await nextPaint();
  }, []);

  const withBusy = useCallback(async <T,>(work: () => Promise<T>): Promise<T | undefined> => {
    if (busyRef.current) return undefined;
    busyRef.current = true;
    try {
      return await work();
    } finally {
      busyRef.current = false;
      setBusy(null);
    }
  }, []);

  const cancelScheduledPersist = useCallback((dbId: string) => {
    const timer = persistTimers.current.get(dbId);
    if (timer !== undefined) {
      window.clearTimeout(timer);
      persistTimers.current.delete(dbId);
    }
  }, []);

  // Exporting the whole database on every single edit is what made big files crawl,
  // so the IndexedDB copy is refreshed once edits settle, and skipped for huge files.
  const schedulePersist = useCallback((dbId: string) => {
    cancelScheduledPersist(dbId);
    const timer = window.setTimeout(() => {
      persistTimers.current.delete(dbId);
      const db = databasesRef.current.find(d => d.id === dbId);
      if (!db) return;
      try {
        const sizeBytes = getDatabaseSize(dbId);
        const meta = { ...toStoredMeta(db), sizeBytes: sizeBytes || db.sizeBytes };
        persistDatabase(meta, isCacheableSize(sizeBytes) ? exportDatabaseBinary(dbId) : undefined);
      } catch (err) {
        console.warn('Failed to auto-persist modified db:', err);
      }
    }, PERSIST_DEBOUNCE_MS);
    persistTimers.current.set(dbId, timer);
  }, [cancelScheduledPersist]);

  const openDatabaseFile = async (file: File, handle?: FileSystemFileHandle): Promise<boolean> => {
    // Only the header is needed to reject a wrong file, so do that before reading it all
    const header = new Uint8Array(await file.slice(0, 100).arrayBuffer());
    const validation = validateSqliteHeader(header);
    if (!validation.valid) {
      showToast('error', `File "${file.name}" tidak dapat dimuat: ${validation.reason}`);
      return false;
    }

    const dbId = 'db-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7);
    const walFlag = isWalMode(header);
    const sizeLabel = formatBytes(file.size);

    let buffer: Uint8Array;
    try {
      setBusy({ label: 'Membaca file database', detail: `${file.name} · ${sizeLabel}`, progress: 0 });
      buffer = await readFileWithProgress(file, progress => {
        setBusy({ label: 'Membaca file database', detail: `${file.name} · ${sizeLabel}`, progress });
      });
    } catch (err) {
      console.error('Failed to read database file:', err);
      showToast(
        'error',
        err instanceof RangeError
          ? `Memori perangkat tidak cukup untuk membuka "${file.name}" (${sizeLabel}).`
          : `Gagal membaca file "${file.name}".`
      );
      return false;
    }

    try {
      await showBusy({ label: 'Membuka database', detail: `${file.name} · ${sizeLabel}` });
      await loadDatabase(dbId, buffer);
      await showBusy({ label: 'Membaca struktur tabel', detail: file.name });
      const tables = inspectSchema(dbId);

      const newDbMeta: DatabaseMetadata = {
        id: dbId,
        name: file.name,
        sizeBytes: buffer.length,
        tables,
        isDirty: false,
        syncMode: handle ? 'direct' : 'sandbox',
        fileHandle: handle,
        walDetected: walFlag,
        companionFiles: { wal: false, shm: false },
        lastModified: file.lastModified || Date.now()
      };

      // Persist to IndexedDB so it survives page reload
      persistDatabase(toStoredMeta(newDbMeta), buffer);

      setDatabases(prev => [newDbMeta, ...prev]);
      setActiveDbId(dbId);
      setSelectedTable(tables[0]?.name || null);
      setActiveView('grid');

      if (walFlag) {
        setWalDbName(file.name);
        setWalModalOpen(true);
      }
      return true;
    } catch (err) {
      console.error('Failed to open SQLite database:', err);
      closeDatabase(dbId);
      showToast('error', `Gagal membuka "${file.name}" (${sizeLabel}). File mungkin rusak atau memori perangkat tidak cukup.`);
      return false;
    }
  };

  useEffect(() => {
    openFileRef.current = openDatabaseFile;
  });

  // Global Keyboard Shortcuts (Cmd/Ctrl + K, Cmd/Ctrl + S)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsShortcutsModalOpen(prev => !prev);
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        handleSaveRef.current?.();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Global Drag and Drop handler for .db files
  useEffect(() => {
    const handleDragOver = (e: DragEvent) => {
      e.preventDefault();
      setIsDragOver(true);
    };

    const handleDragLeave = (e: DragEvent) => {
      if (e.relatedTarget === null) {
        setIsDragOver(false);
      }
    };

    const handleDrop = async (e: DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);

      const items = e.dataTransfer?.items;
      const files = e.dataTransfer?.files;
      if (!files || files.length === 0) return;

      // DataTransfer items are only usable synchronously inside the drop event,
      // so every handle has to be requested before the first await.
      const dropped = Array.from(files).map((file, i) => {
        const item = items?.[i] as any;
        const handlePromise: Promise<any> = typeof item?.getAsFileSystemHandle === 'function'
          ? item.getAsFileSystemHandle().catch((err: unknown) => {
              console.warn('Could not acquire handle from dropped file:', err);
              return null;
            })
          : Promise.resolve(null);
        return { file, handlePromise };
      });

      await withBusy(async () => {
        for (const { file, handlePromise } of dropped) {
          const fsHandle = await handlePromise;
          const handle = fsHandle?.kind === 'file' ? (fsHandle as FileSystemFileHandle) : undefined;
          await openFileRef.current?.(file, handle);
        }
      });
    };

    window.addEventListener('dragover', handleDragOver);
    window.addEventListener('dragleave', handleDragLeave);
    window.addEventListener('drop', handleDrop);

    return () => {
      window.removeEventListener('dragover', handleDragOver);
      window.removeEventListener('dragleave', handleDragLeave);
      window.removeEventListener('drop', handleDrop);
    };
  }, [withBusy]);

  // Warn on tab close if there are unsaved changes
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      const hasUnsaved = databases.some(db => db.isDirty);
      if (hasUnsaved) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [databases]);

  const loadDemoDatabase = useCallback(async () => {
    try {
      const demoDb = await createSampleEcommerceDb();
      persistDatabase(toStoredMeta(demoDb), exportDatabaseBinary(demoDb.id));
      setDatabases(prev => [demoDb, ...prev.filter(d => d.id !== demoDb.id)]);
      setActiveDbId(demoDb.id);
      setSelectedTable(demoDb.tables[0]?.name || null);
      setActiveView('grid');
    } catch (err) {
      console.error('Failed to load demo DB:', err);
    }
  }, []);

  // Restore workspace from IndexedDB on startup (survives reload)
  useEffect(() => {
    let isMounted = true;

    async function restoreWorkspace() {
      try {
        const persisted = await loadPersistedMetas();
        if (!isMounted) return;

        if (persisted.length > 0) {
          const restoredDbs: DatabaseMetadata[] = [];
          const skipped: string[] = [];

          for (let i = 0; i < persisted.length; i++) {
            const rec = persisted[i];
            const handle = rec.fileHandle;
            const label = 'Memulihkan workspace';
            const detail = `${rec.alias || rec.name} · ${formatBytes(rec.sizeBytes)} (${i + 1}/${persisted.length})`;
            setBusy({ label, detail });

            let buffer: Uint8Array | null = null;

            // Unsaved edits only exist in the cached copy, so the disk file is preferred
            // only when there is nothing unsaved to lose.
            const keepCachedEdits = rec.isDirty && rec.hasBuffer;
            if (!keepCachedEdits && handle && typeof (handle as any).queryPermission === 'function') {
              try {
                const perm = await (handle as any).queryPermission({ mode: 'read' });
                if (perm === 'granted') {
                  const file = await handle.getFile();
                  buffer = await readFileWithProgress(file, progress => {
                    if (isMounted) setBusy({ label, detail, progress });
                  });
                }
              } catch (err) {
                console.warn('Could not read from stored handle, using cached buffer', err);
              }
            }

            if (!buffer && rec.hasBuffer) {
              buffer = await loadPersistedBuffer(rec.id);
            }
            if (!isMounted) return;

            if (!buffer) {
              skipped.push(rec.alias || rec.name);
              removeDatabaseFromStorage(rec.id);
              continue;
            }

            try {
              setBusy({ label, detail });
              await nextPaint();
              await loadDatabase(rec.id, buffer);
              if (!isMounted) return;
              const tables = inspectSchema(rec.id);

              restoredDbs.push({
                id: rec.id,
                name: rec.name,
                alias: rec.alias,
                sizeBytes: buffer.length,
                tables,
                isDirty: rec.isDirty && rec.hasBuffer,
                syncMode: rec.syncMode,
                fileHandle: handle,
                walDetected: rec.walDetected || isWalMode(buffer),
                companionFiles: { wal: false, shm: false },
                lastModified: rec.lastModified
              });
            } catch (err) {
              console.warn(`Failed to restore database "${rec.name}":`, err);
              skipped.push(rec.alias || rec.name);
              closeDatabase(rec.id);
            }
          }

          if (skipped.length > 0) {
            showToast(
              'info',
              `Tidak dipulihkan otomatis: ${skipped.join(', ')}. Database berukuran besar tidak disalin ke penyimpanan browser, silakan buka ulang filenya.`,
              undefined,
              9000
            );
          }

          if (restoredDbs.length > 0) {
            setDatabases(restoredDbs);
            const savedActiveId = localStorage.getItem('sqlite_studio_active_db');
            const targetDb = (savedActiveId && restoredDbs.find(d => d.id === savedActiveId)) || restoredDbs[0];
            setActiveDbId(targetDb.id);
            const savedTable = localStorage.getItem('sqlite_studio_active_table');
            const tableExists = savedTable && targetDb.tables.some(t => t.name === savedTable);
            setSelectedTable(tableExists ? savedTable : (targetDb.tables[0]?.name || null));
            return;
          }
        }
      } catch (err) {
        console.warn('Failed to restore workspace from IndexedDB:', err);
      } finally {
        if (isMounted) setBusy(null);
      }

      // Fallback: If workspace is empty, load demo database
      if (isMounted) {
        loadDemoDatabase();
      }
    }

    restoreWorkspace();
    return () => { isMounted = false; };
  }, [loadDemoDatabase, showToast]);

  // Keep active database and selected table in localStorage so reloads restore exact view
  useEffect(() => {
    if (activeDbId) {
      localStorage.setItem('sqlite_studio_active_db', activeDbId);
    }
  }, [activeDbId]);

  useEffect(() => {
    if (selectedTable) {
      localStorage.setItem('sqlite_studio_active_table', selectedTable);
    }
  }, [selectedTable]);

  const handleOpenFiles = async () => {
    if (busyRef.current) return;
    try {
      const picked = await openFileWithHandle();
      if (!picked) return;
      await withBusy(() => openDatabaseFile(picked.file, picked.handle));
    } catch (err) {
      console.error('Failed to open SQLite database:', err);
      showToast('error', 'Gagal membuka file database SQLite.');
    }
  };

  const handleSaveOrExport = async (targetDbId?: string) => {
    if (busyRef.current) return;
    const dbToSave = targetDbId ? (databases.find(d => d.id === targetDbId) || activeDb) : activeDb;
    if (!dbToSave) return;

    const displayName = dbToSave.alias || dbToSave.name;
    const downloadFileName = displayName.includes('.') ? displayName : `${displayName}.db`;
    const handle = dbToSave.syncMode === 'direct' ? dbToSave.fileHandle : undefined;

    // Must run before the export: browsers only allow the write-permission prompt for a
    // few seconds after the click/shortcut. Exporting a big database takes longer than
    // that, which used to make saving silently fall back to a download.
    let writeToDisk = false;
    if (handle) {
      writeToDisk = await ensureWritePermission(handle);
      if (!writeToDisk) {
        const download = await confirm({
          title: 'Tidak Ada Izin Menulis ke File',
          message: `Browser tidak memberi izin menulis langsung ke "${dbToSave.name}". Unduh salinan database sebagai file baru?`,
          confirmText: 'Unduh Salinan',
          cancelText: 'Batal',
          type: 'warning'
        });
        if (!download) return;
      }
    }

    let binary: Uint8Array | null = null;
    let written = false;

    await withBusy(async () => {
      try {
        await showBusy({ label: 'Menyiapkan data database', detail: displayName });
        binary = exportDatabaseBinary(dbToSave.id);
      } catch (err) {
        console.error('Failed to export database:', err);
        return;
      }

      if (writeToDisk) {
        const detail = `${dbToSave.name} · ${formatBytes(binary.length)}`;
        setBusy({ label: 'Menyimpan ke file', detail, progress: 0 });
        written = await writeBackToDisk(handle, binary, progress => {
          setBusy({ label: 'Menyimpan ke file', detail, progress });
        });
      }
    });

    const saved = binary as Uint8Array | null;
    if (!saved) {
      showToast('error', 'Gagal menyimpan database. Memori perangkat mungkin tidak cukup.');
      return;
    }

    if (writeToDisk && !written) {
      const download = await confirm({
        title: 'Gagal Menulis ke File',
        message: `Penulisan langsung ke "${dbToSave.name}" gagal, file asli tidak berubah. Unduh salinan database sebagai file baru?`,
        confirmText: 'Unduh Salinan',
        cancelText: 'Batal',
        type: 'warning'
      });
      if (!download) return;
    }

    if (!written) {
      triggerFileDownload(saved, downloadFileName);
    }

    cancelScheduledPersist(dbToSave.id);
    const savedDb: DatabaseMetadata = { ...dbToSave, isDirty: false, sizeBytes: saved.length };
    setDatabases(prev => prev.map(db => db.id === dbToSave.id ? { ...db, isDirty: false, sizeBytes: saved.length } : db));
    persistDatabase(toStoredMeta(savedDb), saved);

    if (written) {
      showToast('success', `Perubahan berhasil disimpan langsung ke file "${dbToSave.name}" di perangkat Anda!`);
    } else if (handle) {
      showToast('info', `Salinan database diunduh sebagai "${downloadFileName}". File asli tidak berubah.`);
    } else {
      showToast('success', `Database berhasil disimpan & diunduh sebagai file "${downloadFileName}".`);
    }
  };

    useEffect(() => {
    handleSaveRef.current = handleSaveOrExport;
  });

  const handleSelectDb = (id: string) => {
    setActiveDbId(id);
    const db = databases.find(d => d.id === id);
    if (db && db.tables.length > 0) {
      setSelectedTable(db.tables[0].name);
    }
  };

  const handleSelectTable = (name: string) => {
    setSelectedTable(name);
    setActiveView('grid');
  };

  const handleCloseDb = async (id: string) => {
    const dbToClose = databases.find(d => d.id === id);
    if (!dbToClose) return;

    if (dbToClose.isDirty) {
      const ok = await confirm({
        title: 'Tutup Database (Belum Disimpan)',
        message: `Database "${dbToClose.alias || dbToClose.name}" memiliki perubahan yang belum disimpan! Jika ditutup sekarang, perubahan sesi ini tidak akan tersimpan. Tetap ingin menutup database ini?`,
        confirmText: 'Tetap Tutup',
        cancelText: 'Batal',
        type: 'danger'
      });
      if (!ok) return;
    } else {
      const ok = await confirm({
        title: 'Tutup Database',
        message: `Tutup database "${dbToClose.alias || dbToClose.name}" dari workspace? (File fisik asli di komputer Anda tetap aman dan tidak akan terhapus).`,
        confirmText: 'Tutup Database',
        cancelText: 'Batal',
        type: 'warning'
      });
      if (!ok) return;
    }

    cancelScheduledPersist(id);
    closeDatabase(id);
    removeDatabaseFromStorage(id);
    const updated = databases.filter(d => d.id !== id);
    setDatabases(updated);
    showToast('info', `Database "${dbToClose.alias || dbToClose.name}" telah ditutup dari workspace.`);

    if (activeDbId === id) {
      if (updated.length > 0) {
        setActiveDbId(updated[0].id);
        setSelectedTable(updated[0].tables[0]?.name || null);
      } else {
        setActiveDbId(null);
        setSelectedTable(null);
        localStorage.removeItem('sqlite_studio_active_db');
        localStorage.removeItem('sqlite_studio_active_table');
      }
    }
  };

  const handleRenameDb = (id: string, newAlias: string) => {
    const trimmed = newAlias.trim();
    if (!trimmed) return;

    const target = databases.find(db => db.id === id);
    if (!target) return;

    // If sandbox/memory, update name as well so exports/downloads use the new name
    const isSandbox = target.syncMode === 'sandbox' || !target.fileHandle;
    const updatedName = isSandbox ? trimmed : target.name;

    setDatabases(prev => prev.map(db => db.id === id ? { ...db, name: updatedName, alias: trimmed } : db));
    updateDatabaseMeta(id, { name: updatedName, alias: trimmed });
    showToast('success', `Nama database berhasil diubah menjadi "${trimmed}".`);
  };

  const handleCloneDb = async (id: string) => {
    const src = databases.find(d => d.id === id);
    if (!src) return;

    await withBusy(async () => {
      try {
        const newId = 'db-' + Date.now();
        const newName = `Copy of ${src.alias || src.name}`;
        await showBusy({ label: 'Menggandakan database', detail: `${src.alias || src.name} · ${formatBytes(src.sizeBytes)}` });
        const binary = exportDatabaseBinary(src.id);
        await loadDatabase(newId, binary);
        const tables = inspectSchema(newId);

        const cloneMeta: DatabaseMetadata = {
          id: newId,
          name: newName,
          alias: newName,
          sizeBytes: binary.length,
          tables,
          isDirty: true,
          syncMode: 'sandbox',
          walDetected: src.walDetected,
          companionFiles: { wal: false, shm: false },
          lastModified: Date.now()
        };

        persistDatabase(toStoredMeta(cloneMeta), binary);

        setDatabases(prev => [cloneMeta, ...prev]);
        setActiveDbId(newId);
        setSelectedTable(tables[0]?.name || null);
        showToast('success', `Database berhasil dikloning sebagai "${newName}"!`);
      } catch (err) {
        console.error('Failed to clone database:', err);
        showToast('error', 'Gagal mengkloning database.');
      }
    });
  };

  const handleExportSqlDump = async (id: string) => {
    const targetDb = databases.find(d => d.id === id);
    if (!targetDb) return;

    await withBusy(async () => {
      try {
        await showBusy({ label: 'Membuat SQL Dump', detail: targetDb.alias || targetDb.name });
        const sqlDump = exportDatabaseSqlDump(id);
        const dumpName = `${(targetDb.alias || targetDb.name).replace(/\.[^/.]+$/, '')}_dump.sql`;
        triggerTextDownload(sqlDump, dumpName);
        showToast('success', `File SQL Dump berhasil diekspor: ${dumpName}`);
      } catch (err) {
        console.error('Failed to export SQL Dump:', err);
        showToast('error', 'Gagal mengekspor skrip SQL Dump. Database mungkin terlalu besar untuk memori perangkat.');
      }
    });
  };

  const handleDataModified = () => {
    if (!activeDbId) return;
    const updatedTables = inspectSchema(activeDbId);
    setDatabases(prev => prev.map(db => db.id === activeDbId ? { ...db, isDirty: true, tables: updatedTables } : db));
    schedulePersist(activeDbId);
  };

  const handleRefreshSchema = () => {
    if (!activeDbId) return;
    const updatedTables = inspectSchema(activeDbId);
    setDatabases(prev => prev.map(db => {
      if (db.id === activeDbId) {
        return {
          ...db,
          tables: updatedTables
        };
      }
      return db;
    }));
  };

  const handleOpenDetailDrawer = (column: ColumnInfo, value: any, whereKeys: Record<string, any>) => {
    setDrawerState({
      isOpen: true,
      column,
      initialValue: value,
      whereKeys
    });
  };

  const handleRunWalCheckpoint = () => {
    if (!activeDbId) return;
    executeRawQuery(activeDbId, 'PRAGMA wal_checkpoint(FULL);');
    handleRefreshSchema();
  };

  return (
    <div className="app-container" style={{ position: 'relative' }}>
      <LoadingOverlay state={busy} />

      {/* Global Drag and Drop Overlay */}
      {isDragOver && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(15, 20, 34, 0.88)',
          backdropFilter: 'blur(4px)',
          zIndex: 9999,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '16px',
          border: '3px dashed var(--accent-light)'
        }}>
          <Upload size={54} color="var(--accent-light)" className="animate-bounce" />
          <h2 style={{ fontSize: '22px', fontWeight: 600, color: 'var(--text-primary)' }}>
            Lepaskan file .db / .sqlite di sini
          </h2>
          <p style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
            File akan langsung dimuat ke SQLite Studio secara lokal dan privat
          </p>
        </div>
      )}

      {/* Top Navbar */}
      <Navbar
        activeDb={activeDb}
        activeView={activeView}
        onViewChange={setActiveView}
        onOpenFiles={handleOpenFiles}
        onSaveOrExport={handleSaveOrExport}
        onLoadDemo={loadDemoDatabase}
        onOpenImportModal={() => setIsImportModalOpen(true)}
        onOpenShortcutsModal={() => setIsShortcutsModalOpen(true)}
        safeMode={safeMode}
        onToggleSafeMode={() => setSafeMode(!safeMode)}
        onToggleMobileSidebar={() => setIsMobileSidebarOpen(prev => !prev)}
      />

      <div className="app-body">
        {/* Left Sidebar Workspace */}
        <Sidebar
          databases={databases}
          activeDbId={activeDbId}
          selectedTable={selectedTable}
          isOpenMobile={isMobileSidebarOpen}
          onCloseMobile={() => setIsMobileSidebarOpen(false)}
          onSelectDb={handleSelectDb}
          onSelectTable={handleSelectTable}
          onCloseDb={handleCloseDb}
          onOpenNewDb={handleOpenFiles}
          onLoadDemo={loadDemoDatabase}
          onSaveDb={handleSaveOrExport}
          onRenameDb={handleRenameDb}
          onCloneDb={handleCloneDb}
          onExportSqlDump={handleExportSqlDump}
        />

        {/* Main Content Workspace */}
        <main className="main-workspace">
          {!activeDb ? (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', gap: '16px' }}>
              <Database size={48} style={{ opacity: 0.3 }} />
              <div style={{ textAlign: 'center' }}>
                <h3 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>
                  Selamat Datang di SQLite Studio
                </h3>
                <p style={{ fontSize: '13px', maxWidth: '420px', lineHeight: '1.5' }}>
                  Kelola database SQLite langsung di browser secara 100% lokal dan privat tanpa mengirim data ke server.
                </p>
              </div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button className="btn btn-secondary" onClick={handleOpenFiles}>
                  <FolderOpen size={15} />
                  <span>Buka File Database (.db)</span>
                </button>
                <button className="btn btn-primary" onClick={loadDemoDatabase}>
                  <Sparkles size={15} />
                  <span>Muat Sampel E-Commerce</span>
                </button>
              </div>
            </div>
          ) : (
            <>
              {activeView === 'grid' && (
                currentTableSchema ? (
                  <DataGrid
                    key={`${activeDb.id}-${currentTableSchema.name}`}
                    dbId={activeDb.id}
                    table={currentTableSchema}
                    onDataModified={handleDataModified}
                    onOpenDetailDrawer={handleOpenDetailDrawer}
                    onJumpToTable={(tblName) => handleSelectTable(tblName)}
                  />
                ) : (
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', gap: '14px', padding: '30px', textAlign: 'center' }}>
                    <TableProperties size={40} style={{ opacity: 0.3 }} />
                    <div>
                      <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>
                        Database Belum Memiliki Tabel
                      </h3>
                      <p style={{ fontSize: '13px', maxWidth: '380px', lineHeight: '1.5' }}>
                        Database "{activeDb.name}" masih kosong. Anda dapat membuat tabel baru via SQL Editor atau mengimpor data CSV / JSON.
                      </p>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'center' }}>
                      <button className="btn btn-secondary" onClick={() => setActiveView('sql')}>
                        <Terminal size={14} /> Buka SQL Editor
                      </button>
                      <button className="btn btn-primary" onClick={() => setIsImportModalOpen(true)}>
                        <Upload size={14} /> Import CSV / JSON
                      </button>
                    </div>
                  </div>
                )
              )}

              {activeView === 'sql' && (
                <SqlEditor
                  dbId={activeDb.id}
                  safeMode={safeMode}
                  onSafeModeTrigger={(alert, proceed) => {
                    setSafeGuardAlert(alert);
                    setPendingSafeProceed(() => proceed);
                  }}
                  onQuerySuccess={handleDataModified}
                />
              )}

              {activeView === 'schema' && (
                <SchemaViewer
                  tables={activeDb.tables}
                  selectedTable={selectedTable}
                  onSelectTable={(name) => setSelectedTable(name)}
                />
              )}

              {activeView === 'erd' && (
                <VisualErd
                  tables={activeDb.tables}
                  onSelectTable={handleSelectTable}
                />
              )}

              {activeView === 'diff' && (
                <DatabaseDiff
                  databases={databases}
                  activeDbId={activeDb.id}
                  onOpenNewDb={handleOpenFiles}
                />
              )}

              {activeView === 'diagnostics' && (
                <DiagnosticsView
                  dbId={activeDb.id}
                  onRefreshSchema={handleDataModified}
                />
              )}
            </>
          )}
        </main>
      </div>

      {/* Side Detail / JSON / Hex Drawer */}
      {activeDb && currentTableSchema && (
        <DetailDrawer
          isOpen={drawerState.isOpen}
          onClose={() => setDrawerState({ ...drawerState, isOpen: false })}
          dbId={activeDb.id}
          tableName={currentTableSchema.name}
          column={drawerState.column}
          initialValue={drawerState.initialValue}
          whereKeys={drawerState.whereKeys}
          onSaved={handleDataModified}
        />
      )}

      {/* Safe Mode Modal */}
      <SafeModeModal
        alert={safeGuardAlert}
        onCancel={() => {
          setSafeGuardAlert(null);
          setPendingSafeProceed(null);
        }}
        onConfirm={() => {
          if (pendingSafeProceed) pendingSafeProceed();
          setSafeGuardAlert(null);
          setPendingSafeProceed(null);
        }}
      />

      {/* WAL Mode Warning Modal */}
      <WalWarningModal
        isOpen={walModalOpen}
        dbName={walDbName}
        onClose={() => setWalModalOpen(false)}
        onRunCheckpoint={handleRunWalCheckpoint}
      />

      {/* Import CSV / JSON Wizard Modal */}
      {activeDb && (
        <ImportModal
          isOpen={isImportModalOpen}
          onClose={() => setIsImportModalOpen(false)}
          dbId={activeDb.id}
          existingTables={activeDb.tables}
          onImportSuccess={handleDataModified}
        />
      )}

      {/* Shortcuts Guide Modal */}
      <ShortcutsModal
        isOpen={isShortcutsModalOpen}
        onClose={() => setIsShortcutsModalOpen(false)}
      />

      {/* Native Mobile Bottom Navigation */}
      <BottomNav
        activeView={activeView}
        onViewChange={setActiveView}
        onToggleMobileSidebar={() => setIsMobileSidebarOpen(prev => !prev)}
        activeDb={activeDb}
      />
    </div>
  );
};

export default App;
