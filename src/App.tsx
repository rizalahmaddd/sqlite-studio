import React, { useState, useEffect, useCallback } from 'react';
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

import type { DatabaseMetadata, ActiveView, ColumnInfo, SafeGuardAlert } from './types/database';
import { 
  loadDatabase, 
  closeDatabase, 
  inspectSchema, 
  exportDatabaseBinary, 
  isWalMode,
  validateSqliteHeader,
  executeRawQuery
} from './services/sqliteEngine';
import { 
  openFileWithHandle, 
  writeBackToDisk, 
  triggerFileDownload 
} from './services/fileSystemSync';
import { createSampleEcommerceDb } from './services/sampleData';
import { Database, FolderOpen, Sparkles, Upload, TableProperties, Terminal } from 'lucide-react';

export const App: React.FC = () => {
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

  // Global Keyboard Shortcuts (Cmd/Ctrl + K)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsShortcutsModalOpen(prev => !prev);
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

      const files = e.dataTransfer?.files;
      if (!files || files.length === 0) return;

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        try {
          const arrayBuffer = await file.arrayBuffer();
          const buffer = new Uint8Array(arrayBuffer);

          const validation = validateSqliteHeader(buffer);
          if (!validation.valid) {
            alert(`File "${file.name}" tidak dapat dimuat: ${validation.reason}`);
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
            syncMode: 'sandbox',
            walDetected: walFlag,
            companionFiles: { wal: false, shm: false },
            lastModified: file.lastModified || Date.now()
          };

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
          alert(`Gagal membuka file "${file.name}".`);
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
  }, []);

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
      setDatabases(prev => [demoDb, ...prev.filter(d => d.name !== demoDb.name)]);
      setActiveDbId(demoDb.id);
      setSelectedTable(demoDb.tables[0]?.name || null);
      setActiveView('grid');
    } catch (err) {
      console.error('Failed to load demo DB:', err);
    }
  }, []);

  // Load sample on first visit if workspace is empty
  useEffect(() => {
    loadDemoDatabase();
  }, [loadDemoDatabase]);

  const handleOpenFiles = async () => {
    try {
      const picked = await openFileWithHandle();
      if (!picked) return;

      // Validate SQLite Header
      const validation = validateSqliteHeader(picked.buffer);
      if (!validation.valid) {
        alert(`File "${picked.file.name}" tidak dapat dimuat: ${validation.reason}`);
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
      alert('Gagal membuka file database SQLite.');
    }
  };

  const handleSaveOrExport = async () => {
    if (!activeDb) return;

    try {
      const binary = exportDatabaseBinary(activeDb.id);

      if (activeDb.syncMode === 'direct' && activeDb.fileHandle) {
        const success = await writeBackToDisk(activeDb.fileHandle, binary);
        if (success) {
          setDatabases(prev => prev.map(db => db.id === activeDb.id ? { ...db, isDirty: false, sizeBytes: binary.length } : db));
          alert(`Perubahan berhasil disimpan langsung ke file "${activeDb.name}" di komputer Anda!`);
        } else {
          // Fallback to download
          triggerFileDownload(binary, activeDb.name);
          setDatabases(prev => prev.map(db => db.id === activeDb.id ? { ...db, isDirty: false } : db));
        }
      } else {
        triggerFileDownload(binary, activeDb.name);
        setDatabases(prev => prev.map(db => db.id === activeDb.id ? { ...db, isDirty: false } : db));
      }
    } catch (err) {
      console.error('Failed to save or export database:', err);
      alert('Gagal menyimpan database.');
    }
  };

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

  const handleCloseDb = (id: string) => {
    const dbToClose = databases.find(d => d.id === id);
    if (dbToClose && dbToClose.isDirty) {
      if (!window.confirm(`Database "${dbToClose.name}" memiliki perubahan yang belum disimpan. Tetap tutup?`)) {
        return;
      }
    }
    closeDatabase(id);
    const updated = databases.filter(d => d.id !== id);
    setDatabases(updated);
    if (activeDbId === id) {
      if (updated.length > 0) {
        setActiveDbId(updated[0].id);
        setSelectedTable(updated[0].tables[0]?.name || null);
      } else {
        setActiveDbId(null);
        setSelectedTable(null);
      }
    }
  };

  const handleDataModified = () => {
    if (!activeDbId) return;
    const updatedTables = inspectSchema(activeDbId);
    setDatabases(prev => prev.map(db => {
      if (db.id === activeDbId) {
        return {
          ...db,
          isDirty: true,
          tables: updatedTables
        };
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
                  onRefreshSchema={handleRefreshSchema}
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
          onImportSuccess={handleRefreshSchema}
        />
      )}

      {/* Shortcuts Guide Modal */}
      <ShortcutsModal
        isOpen={isShortcutsModalOpen}
        onClose={() => setIsShortcutsModalOpen(false)}
      />
    </div>
  );
};

export default App;
