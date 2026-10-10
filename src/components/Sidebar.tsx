import React, { useState, useRef, useEffect } from 'react';
import { 
  Database, 
  Table, 
  Plus, 
  X, 
  HardDrive, 
  Eye, 
  Sparkles,
  Save,
  Search,
  MoreVertical,
  Edit2,
  Copy,
  FileCode,
  Check
} from 'lucide-react';
import type { DatabaseMetadata, TableSchema } from '../types/database';

interface SidebarProps {
  databases: DatabaseMetadata[];
  activeDbId: string | null;
  selectedTable: string | null;
  isOpenMobile: boolean;
  onCloseMobile: () => void;
  onSelectDb: (id: string) => void;
  onSelectTable: (tableName: string) => void;
  onCloseDb: (id: string) => void;
  onOpenNewDb: () => void;
  onLoadDemo: () => void;
  onSaveDb?: (id?: string) => void;
  onRenameDb?: (id: string, newAlias: string) => void;
  onCloneDb?: (id: string) => void;
  onExportSqlDump?: (id: string) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  databases,
  activeDbId,
  selectedTable,
  isOpenMobile,
  onCloseMobile,
  onSelectDb,
  onSelectTable,
  onCloseDb,
  onOpenNewDb,
  onLoadDemo,
  onSaveDb,
  onRenameDb,
  onCloneDb,
  onExportSqlDump
}) => {
  const activeDb = databases.find(d => d.id === activeDbId);
  const [searchQuery, setSearchQuery] = useState('');
  const [menuOpenDbId, setMenuOpenDbId] = useState<string | null>(null);
  const [editingDbId, setEditingDbId] = useState<string | null>(null);
  const [editAliasValue, setEditAliasValue] = useState('');
  const menuRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    if (!menuOpenDbId) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpenDbId(null);
      }
    };
    window.addEventListener('mousedown', handleClickOutside);
    return () => window.removeEventListener('mousedown', handleClickOutside);
  }, [menuOpenDbId]);

  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const startEditing = (db: DatabaseMetadata) => {
    setEditingDbId(db.id);
    setEditAliasValue(db.alias || db.name);
    setMenuOpenDbId(null);
  };

  const handleSaveRename = (dbId: string) => {
    if (onRenameDb) {
      onRenameDb(dbId, editAliasValue);
    }
    setEditingDbId(null);
  };

  const filteredDatabases = databases.filter(d => 
    (d.alias || d.name).toLowerCase().includes(searchQuery.toLowerCase()) ||
    d.tables.some(t => t.name.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const filteredTables = (activeDb?.tables || []).filter(t => 
    t.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <>
      {/* Mobile Backdrop Overlay */}
      {isOpenMobile && (
        <div 
          className="sidebar-backdrop"
          onClick={onCloseMobile}
        />
      )}

      <aside className={`sidebar ${isOpenMobile ? 'mobile-open' : ''}`}>
        {/* Mobile Header with Close Button */}
        <div className="mobile-sidebar-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600 }}>
            <Database size={16} color="var(--accent-light)" />
            <span>Katalog Database</span>
          </div>
          <button className="btn btn-ghost" onClick={onCloseMobile} style={{ padding: '4px' }}>
            <X size={18} />
          </button>
        </div>

        {/* Global Sidebar Search Input */}
        <div className="sidebar-search-box">
          <Search size={13} color="var(--text-muted)" style={{ flexShrink: 0 }} />
          <input 
            type="text"
            className="sidebar-search-input"
            placeholder="Cari database / tabel..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button 
              className="btn btn-ghost" 
              style={{ padding: '1px' }} 
              onClick={() => setSearchQuery('')}
            >
              <X size={11} />
            </button>
          )}
        </div>

        {/* 1. Databases Workspace Section */}
        <div className="sidebar-section">
          <span>DATABASES ({filteredDatabases.length})</span>
          <button
            className="btn btn-ghost"
            style={{ padding: '2px 6px' }}
            onClick={onOpenNewDb}
            title="Buka Database Tambahan"
          >
            <Plus size={14} />
          </button>
        </div>

        <div style={{ maxHeight: '220px', overflowY: 'auto', padding: '4px 12px' }}>
          {filteredDatabases.length === 0 ? (
            <div style={{ padding: '16px 8px', textAlign: 'center', color: 'var(--text-muted)' }}>
              <Database size={24} style={{ opacity: 0.4, margin: '0 auto 8px' }} />
              <p style={{ fontSize: '12px' }}>
                {searchQuery ? 'Database tidak ditemukan' : 'Belum ada database'}
              </p>
              {!searchQuery && (
                <button
                  className="btn btn-sm btn-primary"
                  style={{ marginTop: '8px', width: '100%' }}
                  onClick={() => {
                    onLoadDemo();
                    onCloseMobile();
                  }}
                >
                  <Sparkles size={13} /> Muat Contoh DB
                </button>
              )}
            </div>
          ) : (
            filteredDatabases.map(db => (
              <div
                key={db.id}
                className={`db-item ${db.id === activeDbId ? 'active' : ''}`}
                onClick={() => {
                  onSelectDb(db.id);
                }}
              >
                <div className="db-item-header">
                  <div className="db-title-wrap">
                    <HardDrive size={14} color={db.id === activeDbId ? 'var(--accent-light)' : 'var(--text-muted)'} />
                    {editingDbId === db.id ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flex: 1 }} onClick={e => e.stopPropagation()}>
                        <input
                          type="text"
                          className="input-field"
                          style={{ height: '22px', fontSize: '11.5px', padding: '2px 6px' }}
                          value={editAliasValue}
                          autoFocus
                          onChange={e => setEditAliasValue(e.target.value)}
                          onBlur={() => handleSaveRename(db.id)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') handleSaveRename(db.id);
                            if (e.key === 'Escape') setEditingDbId(null);
                          }}
                        />
                        <button 
                          className="btn btn-ghost" 
                          style={{ padding: '2px' }} 
                          onMouseDown={e => {
                            e.preventDefault();
                            handleSaveRename(db.id);
                          }}
                          onClick={() => handleSaveRename(db.id)}
                          title="Simpan nama"
                        >
                          <Check size={12} color="var(--success)" />
                        </button>
                      </div>
                    ) : (
                      <span 
                        className="db-name" 
                        title={`${db.alias || db.name} (Dobel klik untuk ubah nama)`}
                        onDoubleClick={(e) => {
                          e.stopPropagation();
                          startEditing(db);
                        }}
                      >
                        {db.alias || db.name}
                      </span>
                    )}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '2px', position: 'relative' }}>
                    {/* Database More Options Menu */}
                    <button
                      className="btn btn-ghost"
                      style={{ padding: '3px' }}
                      onClick={(e) => {
                        e.stopPropagation();
                        setMenuOpenDbId(menuOpenDbId === db.id ? null : db.id);
                      }}
                      title="Opsi Database"
                    >
                      <MoreVertical size={13} />
                    </button>

                    {menuOpenDbId === db.id && (
                      <div ref={menuRef} className="sidebar-menu-dropdown" onClick={e => e.stopPropagation()}>
                        <button
                          className="sidebar-menu-item"
                          onClick={() => startEditing(db)}
                        >
                          <Edit2 size={12} />
                          <span>Ubah Nama (Rename)</span>
                        </button>

                        {onCloneDb && (
                          <button
                            className="sidebar-menu-item"
                            onClick={() => {
                              setMenuOpenDbId(null);
                              onCloneDb(db.id);
                            }}
                          >
                            <Copy size={12} />
                            <span>Kloning Database</span>
                          </button>
                        )}

                        {onExportSqlDump && (
                          <button
                            className="sidebar-menu-item"
                            onClick={() => {
                              setMenuOpenDbId(null);
                              onExportSqlDump(db.id);
                            }}
                          >
                            <FileCode size={12} />
                            <span>Ekspor SQL Dump (.sql)</span>
                          </button>
                        )}

                        {onSaveDb && (
                          <button
                            className="sidebar-menu-item"
                            onClick={() => {
                              setMenuOpenDbId(null);
                              onSaveDb(db.id);
                            }}
                          >
                            <Save size={12} />
                            <span>Simpan / Unduh .db</span>
                          </button>
                        )}

                        <div style={{ height: '1px', backgroundColor: 'var(--border-subtle)', margin: '2px 0' }} />

                        <button
                          className="sidebar-menu-item danger"
                          onClick={() => {
                            setMenuOpenDbId(null);
                            onCloseDb(db.id);
                          }}
                        >
                          <X size={12} />
                          <span>Tutup Database</span>
                        </button>
                      </div>
                    )}

                    {/* Quick Close Button */}
                    <button
                      className="btn btn-ghost"
                      style={{ padding: '2px' }}
                      onClick={(e) => {
                        e.stopPropagation();
                        onCloseDb(db.id);
                      }}
                      title="Tutup Database dari Workspace"
                    >
                      <X size={12} />
                    </button>
                  </div>
                </div>

                <div className="db-meta">
                  <span>{formatSize(db.sizeBytes)}</span>
                  <span>•</span>
                  <span>{db.tables.length} tabel</span>
                  {db.walDetected && (
                    <span className="badge badge-warning" style={{ fontSize: '10px' }} title="Database dalam format WAL">
                      WAL
                    </span>
                  )}
                  {db.isDirty && (
                    <button
                      className="btn btn-xs btn-primary"
                      style={{
                        padding: '1px 6px',
                        fontSize: '10px',
                        height: '19px',
                        gap: '3px',
                        borderRadius: '4px',
                        fontWeight: 600,
                        marginLeft: 'auto',
                        boxShadow: '0 0 8px rgba(99, 102, 241, 0.45)'
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        onSaveDb?.(db.id);
                      }}
                      title="Simpan database ini sekarang (Cmd/Ctrl + S)"
                    >
                      <Save size={10} />
                      <span>Simpan</span>
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        {/* 2. Tables & Views Section for Active Database */}
        {activeDb && (
          <>
            <div className="sidebar-section" style={{ borderTop: '1px solid var(--border-subtle)', marginTop: '6px' }}>
              <span>TABEL & VIEWS ({filteredTables.length})</span>
            </div>

            <div className="sidebar-scrollable">
              {filteredTables.length === 0 ? (
                <p style={{ fontSize: '12px', color: 'var(--text-muted)', padding: '8px' }}>
                  {searchQuery ? 'Tabel tidak ditemukan' : 'Tidak ada tabel di database ini.'}
                </p>
              ) : (
                filteredTables.map((tbl: TableSchema) => (
                  <div
                    key={tbl.name}
                    className={`table-item ${selectedTable === tbl.name ? 'active' : ''}`}
                    onClick={() => {
                      onSelectTable(tbl.name);
                      onCloseMobile();
                    }}
                    title={`${tbl.name} (${tbl.rowCount} rows)`}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flex: 1 }}>
                      {tbl.type === 'view' ? (
                        <Eye size={13} color="var(--info)" />
                      ) : (
                        <Table size={13} color={selectedTable === tbl.name ? 'var(--accent-light)' : 'var(--text-muted)'} />
                      )}
                      <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {tbl.name}
                      </span>
                    </div>

                    <span className="badge badge-count font-mono" style={{ fontSize: '11px' }}>
                      {tbl.rowCount.toLocaleString()}
                    </span>
                  </div>
                ))
              )}
            </div>

            {/* Quick Database Specs Card at bottom */}
            <div style={{ padding: '12px', borderTop: '1px solid var(--border-subtle)', fontSize: '11px', color: 'var(--text-muted)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span>Tipe File:</span>
                <span className="font-mono" style={{ color: 'var(--text-secondary)' }}>SQLite v3</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span>Sync Mode:</span>
                <span style={{ color: activeDb.syncMode === 'direct' ? 'var(--success)' : 'var(--warning)', fontWeight: 600 }}>
                  {activeDb.syncMode === 'direct' ? 'Direct Disk' : 'OPFS Sandbox'}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Total Tabel:</span>
                <span style={{ color: 'var(--text-primary)' }}>{activeDb.tables.length} objek</span>
              </div>
            </div>
          </>
        )}
      </aside>
    </>
  );
};

