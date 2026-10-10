import React from 'react';
import { 
  Database, 
  Table, 
  Plus, 
  X, 
  HardDrive, 
  Eye, 
  Sparkles 
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
  onLoadDemo
}) => {
  const activeDb = databases.find(d => d.id === activeDbId);

  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

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

        {/* 1. Databases Workspace Section */}
        <div className="sidebar-section">
          <span>DATABASES ({databases.length})</span>
          <button
            className="btn btn-ghost"
            style={{ padding: '2px 6px' }}
            onClick={onOpenNewDb}
            title="Buka Database Tambahan"
          >
            <Plus size={14} />
          </button>
        </div>

        <div style={{ maxHeight: '200px', overflowY: 'auto', padding: '4px 12px' }}>
          {databases.length === 0 ? (
            <div style={{ padding: '16px 8px', textAlign: 'center', color: 'var(--text-muted)' }}>
              <Database size={24} style={{ opacity: 0.4, margin: '0 auto 8px' }} />
              <p style={{ fontSize: '12px' }}>Belum ada database</p>
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
            </div>
          ) : (
            databases.map(db => (
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
                    <span className="db-name" title={db.name}>
                      {db.alias || db.name}
                    </span>
                  </div>
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
                    <span style={{ color: 'var(--danger)', fontSize: '10px', fontWeight: 600 }}>
                      • Unsaved
                    </span>
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
              <span>TABEL & VIEWS ({activeDb.tables.length})</span>
            </div>

            <div className="sidebar-scrollable">
              {activeDb.tables.length === 0 ? (
                <p style={{ fontSize: '12px', color: 'var(--text-muted)', padding: '8px' }}>
                  Tidak ada tabel di database ini.
                </p>
              ) : (
                activeDb.tables.map((tbl: TableSchema) => (
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
                <span style={{ color: activeDb.syncMode === 'direct' ? 'var(--success)' : 'var(--warning)' }}>
                  {activeDb.syncMode === 'direct' ? 'Direct Disk' : 'OPFS Sandbox'}
                </span>
              </div>
            </div>
          </>
        )}
      </aside>
    </>
  );
};
