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
  cloneDatabase
} from './services/sqliteEngine';
import { 
  openFileWithHandle, 
  writeBackToDisk, 
  triggerFileDownload,
  triggerTextDownload
} from './services/fileSystemSync';
import { createSampleEcommerceDb } from './services/sampleData';
import { Database, FolderOpen, Sparkles, Upload, TableProperties, Terminal } from 'lucide-react';
import { useFeedback } from './context/useFeedback';
import { 
  persistDatabaseToStorage, 
  removeDatabaseFromStorage, 
  loadAllPersistedDatabases 
} from './services/dbStorage';

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

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        let handle: FileSystemFileHandle | undefined = undefined;

        // Try getting FileSystemFileHandle from DataTransferItem (Chromium File System Access API)
        if (items && items[i] && typeof (items[i] as any).getAsFileSystemHandle === 'function') {
          try {
            const fsHandle = await (items[i] as any).getAsFileSystemHandle();
            if (fsHandle && fsHandle.kind === 'file') {
              handle = fsHandle as FileSystemFileHandle;
            }
          } catch (err) {
            console.warn('Could not acquire handle from dropped file:', err);
          }
        }

        try {
          const arrayBuffer = await file.arrayBuffer();
          const buffer = new Uint8Array(arrayBuffer);

          const validation = validateSqliteHeader(buffer);
          if (!validation.valid) {
            showToast('error', `File "${file.name}" tidak dapat dimuat: ${validation.reason}`);
            continue;
          }

          const dbId = 'db-' + Date.now() + '-' + i;
          const walFlag = isWalMode(buffer);

          await loadDatabase(dbId, buffer);
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
          persistDatabaseToStorage({
            id: dbId,
            name: file.name,
            sizeBytes: buffer.length,
            buffer,
            syncMode: handle ? 'direct' : 'sandbox',
            fileHandle: handle,
            isDirty: false,
            walDetected: walFlag,
            lastModified: file.lastModified || Date.now()
          });

          setDatabases(prev => [newDbMeta, ...prev]);
          setActiveDbId(dbId);
          setSelectedTable(tables[0]?.name || null);
          setActiveView('grid');

          if (walFlag) {
            setWalDbName(file.name);
            setWalModalOpen(true);
          }
        } catch (err) {
          console.error('Error dropping file:', err);
          showToast('error', `Gagal membuka file "${file.name}".`);
        }
      }
    };

    window.addEventListener('dragover', handleDragOver);
    window.addEventListener('dragleave', handleDragLeave);
    window.addEventListener('drop', handleDrop);

    return () => {
      window.removeEventListener('dragover', handleDragOver);
      window.removeEventListener('dragleave', handleDragLeave);
      window.removeEventListener('drop', handleDrop);
    };
  }, [showToast]);

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
      const binary = exportDatabaseBinary(demoDb.id);
      persistDatabaseToStorage({
        id: demoDb.id,
        name: demoDb.name,
        alias: demoDb.alias,
        sizeBytes: binary.length,
        buffer: binary,
        syncMode: 'sandbox',
        fileHandle: undefined,
        isDirty: false,
        walDetected: false,
        lastModified: Date.now()
      });
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
        const persisted = await loadAllPersistedDatabases();
        if (!isMounted) return;

        if (persisted.length > 0) {
          const restoredDbs: DatabaseMetadata[] = [];

          for (const rec of persisted) {
            let buffer = rec.buffer;
            const handle = rec.fileHandle;
            const syncMode = rec.syncMode;

            // If direct handle exists, attempt to re-read latest file from disk if permission is granted
            if (handle && typeof (handle as any).queryPermission === 'function') {
              try {
                const perm = await (handle as any).queryPermission({ mode: 'read' });
                if (perm === 'granted') {
                  const file = await handle.getFile();
                  const ab = await file.arrayBuffer();
                  buffer = new Uint8Array(ab);
                }
              } catch (err) {
                console.warn('Could not read from stored handle, using cached buffer', err);
              }
            }

            await loadDatabase(rec.id, buffer);
            const tables = inspectSchema(rec.id);

            restoredDbs.push({
              id: rec.id,
              name: rec.name,
              alias: rec.alias,
              sizeBytes: buffer.length,
              tables,
              isDirty: rec.isDirty,
              syncMode,
              fileHandle: handle,
              walDetected: rec.walDetected || isWalMode(buffer),
              companionFiles: { wal: false, shm: false },
              lastModified: rec.lastModified
            });
          }

          if (restoredDbs.length > 0 && isMounted) {
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
      }

      // Fallback: If workspace is empty, load demo database
      if (isMounted) {
        loadDemoDatabase();
      }
    }

    restoreWorkspace();
    return () => { isMounted = false; };
  }, [loadDemoDatabase]);

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
    try {
      const picked = await openFileWithHandle();
      if (!picked) return;

      // Validate SQLite Header
      const validation = validateSqliteHeader(picked.buffer);
      if (!validation.valid) {
        showToast('error', `File "${picked.file.name}" tidak dapat dimuat: ${validation.reason}`);
        return;
      }

      const dbId = 'db-' + Date.now();
      const walFlag = isWalMode(picked.buffer);

      await loadDatabase(dbId, picked.buffer);
      const tables = inspectSchema(dbId);

      const newDbMeta: DatabaseMetadata = {
        id: dbId,
        name: picked.file.name,
        sizeBytes: picked.buffer.length,
        tables,
        isDirty: false,
        syncMode: picked.handle ? 'direct' : 'sandbox',
        fileHandle: picked.handle,
        walDetected: walFlag,
        companionFiles: { wal: false, shm: false },
        lastModified: picked.file.lastModified || Date.now()
      };

      // Persist to IndexedDB
      persistDatabaseToStorage({
        id: dbId,
        name: picked.file.name,
        sizeBytes: picked.buffer.length,
        buffer: picked.buffer,
        syncMode: picked.handle ? 'direct' : 'sandbox',
        fileHandle: picked.handle,
        isDirty: false,
        walDetected: walFlag,
        lastModified: picked.file.lastModified || Date.now()
      });

      setDatabases(prev => [newDbMeta, ...prev]);
      setActiveDbId(dbId);
      setSelectedTable(tables[0]?.name || null);
      setActiveView('grid');

      if (walFlag) {
        setWalDbName(picked.file.name);
        setWalModalOpen(true);
      }
    } catch (err) {
      console.error('Failed to open SQLite database:', err);
      showToast('error', 'Gagal membuka file database SQLite.');
    }
  };

  const handleSaveOrExport = async (targetDbId?: string) => {
    const dbToSave = targetDbId ? (databases.find(d => d.id === targetDbId) || activeDb) : activeDb;
    if (!dbToSave) return;

    try {
      const binary = exportDatabaseBinary(dbToSave.id);
      const effectiveName = dbToSave.alias || dbToSave.name;
      const downloadFileName = effectiveName.includes('.') ? effectiveName : `${effectiveName}.db`;

      if (dbToSave.syncMode === 'direct' && dbToSave.fileHandle) {
        const success = await writeBackToDisk(dbToSave.fileHandle, binary);
        if (success) {
          setDatabases(prev => prev.map(db => db.id === dbToSave.id ? { ...db, isDirty: false, sizeBytes: binary.length } : db));
          persistDatabaseToStorage({
            id: dbToSave.id,
            name: dbToSave.name,
            alias: dbToSave.alias,
            sizeBytes: binary.length,
            buffer: binary,
            syncMode: 'direct',
            fileHandle: dbToSave.fileHandle,
            isDirty: false,
            walDetected: dbToSave.walDetected,
            lastModified: Date.now()
          });
          showToast('success', `Perubahan berhasil disimpan langsung ke file "${dbToSave.name}" di komputer Anda!`);
        } else {
          // Fallback to download
          triggerFileDownload(binary, downloadFileName);
          setDatabases(prev => prev.map(db => db.id === dbToSave.id ? { ...db, isDirty: false } : db));
          persistDatabaseToStorage({
            id: dbToSave.id,
            name: dbToSave.name,
            alias: dbToSave.alias,
            sizeBytes: binary.length,
            buffer: binary,
            syncMode: dbToSave.syncMode,
            fileHandle: dbToSave.fileHandle,
            isDirty: false,
            walDetected: dbToSave.walDetected,
            lastModified: Date.now()
          });
          showToast('info', `File database berhasil didownload: ${downloadFileName}`);
        }
      } else {
        triggerFileDownload(binary, downloadFileName);
        setDatabases(prev => prev.map(db => db.id === dbToSave.id ? { ...db, isDirty: false } : db));
        persistDatabaseToStorage({
          id: dbToSave.id,
          name: dbToSave.name,
          alias: dbToSave.alias,
          sizeBytes: binary.length,
          buffer: binary,
          syncMode: dbToSave.syncMode,
          fileHandle: dbToSave.fileHandle,
          isDirty: false,
          walDetected: dbToSave.walDetected,
          lastModified: Date.now()
        });
        showToast('success', `Database berhasil disimpan & diunduh sebagai file "${downloadFileName}".`);
      }
    } catch (err) {
      console.error('Failed to save or export database:', err);
      showToast('error', 'Gagal menyimpan database.');
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

    setDatabases(prev => prev.map(db => {
      if (db.id === id) {
        // If sandbox/memory, update name as well so exports/downloads use the new name
        const isSandbox = db.syncMode === 'sandbox' || !db.fileHandle;
        const updatedName = isSandbox ? trimmed : db.name;
        const updated: DatabaseMetadata = {
          ...db,
          name: updatedName,
          alias: trimmed
        };

        try {
          const binary = exportDatabaseBinary(db.id);
          persistDatabaseToStorage({
            id: db.id,
            name: updatedName,
            alias: trimmed,
            sizeBytes: binary.length,
            buffer: binary,
            syncMode: db.syncMode,
            fileHandle: db.fileHandle,
            isDirty: db.isDirty,
            walDetected: db.walDetected,
            lastModified: Date.now()
          });
        } catch (err) {
          console.warn('Failed to persist renamed db:', err);
        }
        return updated;
      }
      return db;
    }));
    showToast('success', `Nama database berhasil diubah menjadi "${trimmed}".`);
  };

  const handleCloneDb = async (id: string) => {
    const src = databases.find(d => d.id === id);
    if (!src) return;

    try {
      const newId = 'db-' + Date.now();
      const newName = `Copy of ${src.alias || src.name}`;
      await cloneDatabase(src.id, newId);
      const tables = inspectSchema(newId);
      const binary = exportDatabaseBinary(newId);

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

      persistDatabaseToStorage({
        id: newId,
        name: newName,
        alias: newName,
        sizeBytes: binary.length,
        buffer: binary,
        syncMode: 'sandbox',
        isDirty: true,
        walDetected: src.walDetected,
        lastModified: Date.now()
      });

      setDatabases(prev => [cloneMeta, ...prev]);
      setActiveDbId(newId);
      setSelectedTable(tables[0]?.name || null);
      showToast('success', `Database berhasil dikloning sebagai "${newName}"!`);
    } catch (err) {
      console.error('Failed to clone database:', err);
      showToast('error', 'Gagal mengkloning database.');
    }
  };

  const handleExportSqlDump = (id: string) => {
    const targetDb = databases.find(d => d.id === id);
    if (!targetDb) return;

    try {
      const sqlDump = exportDatabaseSqlDump(id);
      const dumpName = `${(targetDb.alias || targetDb.name).replace(/\.[^/.]+$/, '')}_dump.sql`;
      triggerTextDownload(sqlDump, dumpName);
      showToast('success', `File SQL Dump berhasil diekspor: ${dumpName}`);
    } catch (err) {
      console.error('Failed to export SQL Dump:', err);
      showToast('error', 'Gagal mengekspor skrip SQL Dump.');
    }
  };

  const handleDataModified = () => {
    if (!activeDbId) return;
    const updatedTables = inspectSchema(activeDbId);
    setDatabases(prev => prev.map(db => {
      if (db.id === activeDbId) {
        const updated = {
          ...db,
          isDirty: true,
          tables: updatedTables
        };
        // Auto-persist modifications to IndexedDB so changes survive reload
        try {
          const binary = exportDatabaseBinary(db.id);
          persistDatabaseToStorage({
            id: db.id,
            name: db.name,
            alias: db.alias,
            sizeBytes: binary.length,
            buffer: binary,
            syncMode: db.syncMode,
            fileHandle: db.fileHandle,
            isDirty: true,
            walDetected: db.walDetected,
            lastModified: Date.now()
          });
        } catch (err) {
          console.warn('Failed to auto-persist modified db:', err);
        }
        return updated;
      }
      return db;
    }));
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
