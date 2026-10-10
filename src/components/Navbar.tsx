import React, { useState } from 'react';
import { 
  Database, 
  FolderOpen, 
  Save, 
  ShieldCheck, 
  ShieldAlert, 
  Sparkles,
  TableProperties,
  Terminal,
  Layers,
  Activity,
  Network,
  GitCompare,
  Upload,
  Keyboard,
  Menu,
  MoreVertical
} from 'lucide-react';
import type { DatabaseMetadata, ActiveView } from '../types/database';

interface NavbarProps {
  activeDb: DatabaseMetadata | null;
  activeView: ActiveView;
  onViewChange: (view: ActiveView) => void;
  onOpenFiles: () => void;
  onSaveOrExport: () => void;
  onLoadDemo: () => void;
  onOpenImportModal: () => void;
  onOpenShortcutsModal: () => void;
  safeMode: boolean;
  onToggleSafeMode: () => void;
  onToggleMobileSidebar: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeDb,
  activeView,
  onViewChange,
  onOpenFiles,
  onSaveOrExport,
  onLoadDemo,
  onOpenImportModal,
  onOpenShortcutsModal,
  safeMode,
  onToggleSafeMode,
  onToggleMobileSidebar
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <header className="navbar">
      <div className="navbar-left">
        {/* Mobile Hamburger Button */}
        <button
          className="btn btn-ghost mobile-only-btn"
          onClick={onToggleMobileSidebar}
          title="Buka Navigasi Database"
          style={{ padding: '6px' }}
        >
          <Menu size={18} />
        </button>

        <div className="sidebar-brand">
          <div className="sidebar-brand-icon">
            <Database size={16} />
          </div>
          <span className="brand-title">SQLite Studio</span>
        </div>

        {/* View Switcher Tabs (Scrollable on Mobile) */}
        {activeDb && (
          <div className="view-tabs navbar-view-tabs" role="tablist">
            <button
              className={`view-tab-btn ${activeView === 'grid' ? 'active' : ''}`}
              onClick={() => onViewChange('grid')}
              title="Table Data Explorer"
            >
              <TableProperties size={14} />
              <span>Data</span>
            </button>
            <button
              className={`view-tab-btn ${activeView === 'sql' ? 'active' : ''}`}
              onClick={() => onViewChange('sql')}
              title="Interactive SQL Query Runner"
            >
              <Terminal size={14} />
              <span>SQL</span>
            </button>
            <button
              className={`view-tab-btn ${activeView === 'schema' ? 'active' : ''}`}
              onClick={() => onViewChange('schema')}
              title="Schema & DDL Inspector"
            >
              <Layers size={14} />
              <span>Schema</span>
            </button>
            <button
              className={`view-tab-btn ${activeView === 'erd' ? 'active' : ''}`}
              onClick={() => onViewChange('erd')}
              title="Visual ERD Relationship Diagram"
            >
              <Network size={14} />
              <span>ERD</span>
            </button>
            <button
              className={`view-tab-btn ${activeView === 'diff' ? 'active' : ''}`}
              onClick={() => onViewChange('diff')}
              title="Database & Table Diff Tool"
            >
              <GitCompare size={14} />
              <span>Diff</span>
            </button>
            <button
              className={`view-tab-btn ${activeView === 'diagnostics' ? 'active' : ''}`}
              onClick={() => onViewChange('diagnostics')}
              title="PRAGMA & Integrity Diagnostic Tools"
            >
              <Activity size={14} />
              <span>Diagnose</span>
            </button>
          </div>
        )}
      </div>

      <div className="navbar-right">
        {/* Active DB Status on Desktop */}
        {activeDb && (
          <div className="desktop-only-flex" style={{ alignItems: 'center', gap: '8px', marginRight: '6px' }}>
            {activeDb.syncMode === 'direct' ? (
              <span className="badge badge-live" title="Perubahan disimpan langsung ke file fisik di komputer">
                <Save size={11} /> Live Disk
              </span>
            ) : (
              <span className="badge badge-sandbox" title="Tersimpan di memori lokal browser.">
                Sandbox
              </span>
            )}

            {activeDb.isDirty && (
              <span className="badge badge-dirty" title="Terdapat modifikasi yang belum di-save!">
                Unsaved
              </span>
            )}
          </div>
        )}

        {/* Desktop Buttons */}
        <div className="desktop-only-flex" style={{ alignItems: 'center', gap: '6px' }}>
          <button
            className={`btn btn-sm ${safeMode ? 'btn-secondary' : 'btn-danger'}`}
            onClick={onToggleSafeMode}
            title={safeMode ? "Safe Mode Aktif" : "Safe Mode Nonaktif"}
          >
            {safeMode ? <ShieldCheck size={14} color="#10b981" /> : <ShieldAlert size={14} color="#ef4444" />}
            <span style={{ fontSize: '11.5px' }} className="hide-on-compact">{safeMode ? 'Safe ON' : 'Safe OFF'}</span>
          </button>

          {activeDb && (
            <button
              className="btn btn-sm btn-outline"
              onClick={onOpenImportModal}
              title="Import Data (CSV/JSON)"
            >
              <Upload size={13} color="var(--accent-light)" />
              <span className="hide-on-compact">Import</span>
            </button>
          )}

          <button
            className="btn btn-sm btn-outline"
            onClick={onLoadDemo}
            title="Buka Database Sampel E-Commerce"
          >
            <Sparkles size={14} color="#a855f7" />
            <span className="hide-on-compact">Demo DB</span>
          </button>

          <button
            className="btn btn-sm btn-secondary"
            onClick={onOpenFiles}
            title="Buka Database SQLite dari Komputer"
          >
            <FolderOpen size={14} />
            <span className="hide-on-compact">Open DB</span>
          </button>

          {activeDb && (
            <button
              className={`btn btn-sm ${activeDb.isDirty ? 'btn-primary' : 'btn-secondary'}`}
              onClick={onSaveOrExport}
              title={activeDb.syncMode === 'direct' ? "Simpan langsung ke file di komputer (Cmd/Ctrl + S)" : "Simpan & unduh file database .db (Cmd/Ctrl + S)"}
              style={{
                boxShadow: activeDb.isDirty ? '0 0 14px rgba(99, 102, 241, 0.55)' : undefined,
                fontWeight: 600,
                border: activeDb.isDirty ? '1px solid var(--accent-light)' : undefined
              }}
            >
              <Save size={14} color={activeDb.isDirty ? '#fff' : 'var(--accent-light)'} />
              <span>{activeDb.isDirty ? 'Simpan' : activeDb.syncMode === 'direct' ? 'Save' : 'Save .db'}</span>
              <kbd 
                className="hide-on-compact"
                style={{
                  fontSize: '10px',
                  padding: '1px 5px',
                  borderRadius: '3px',
                  background: activeDb.isDirty ? 'rgba(255, 255, 255, 0.22)' : 'var(--bg-surface-elevated)',
                  color: activeDb.isDirty ? '#fff' : 'var(--text-muted)',
                  marginLeft: '2px',
                  border: '1px solid rgba(255, 255, 255, 0.15)'
                }}
              >
                ⌘S
              </kbd>
            </button>
          )}

          <button
            className="btn btn-sm btn-ghost"
            onClick={onOpenShortcutsModal}
            title="Pintasan Keyboard (Cmd/Ctrl + K)"
          >
            <Keyboard size={15} />
          </button>
        </div>

        {/* Mobile Quick Action Menu Button */}
        <div className="mobile-only-block" style={{ position: 'relative' }}>
          <button
            className="btn btn-sm btn-secondary"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            style={{ padding: '6px 8px' }}
          >
            <MoreVertical size={16} />
          </button>

          {/* Mobile Actions Dropdown Menu */}
          {mobileMenuOpen && (
            <div
              style={{
                position: 'absolute',
                top: '100%',
                right: 0,
                marginTop: '6px',
                width: '210px',
                backgroundColor: 'var(--bg-surface-elevated)',
                border: '1px solid var(--border-default)',
                borderRadius: '10px',
                boxShadow: 'var(--shadow-lg)',
                zIndex: 200,
                padding: '6px',
                display: 'flex',
                flexDirection: 'column',
                gap: '4px'
              }}
            >
              {activeDb && (
                <button
                  className="btn btn-sm btn-primary"
                  style={{ width: '100%', justifyContent: 'flex-start' }}
                  onClick={() => {
                    setMobileMenuOpen(false);
                    onSaveOrExport();
                  }}
                >
                  <Save size={13} />
                  <span>{activeDb.syncMode === 'direct' ? 'Save to Disk' : 'Simpan .db'}</span>
                </button>
              )}

              <button
                className="btn btn-sm btn-outline"
                style={{ width: '100%', justifyContent: 'flex-start' }}
                onClick={() => {
                  setMobileMenuOpen(false);
                  onOpenFiles();
                }}
              >
                <FolderOpen size={13} />
                <span>Open File .db</span>
              </button>

              <button
                className="btn btn-sm btn-outline"
                style={{ width: '100%', justifyContent: 'flex-start' }}
                onClick={() => {
                  setMobileMenuOpen(false);
                  onLoadDemo();
                }}
              >
                <Sparkles size={13} color="#a855f7" />
                <span>Muat Demo DB</span>
              </button>

              {activeDb && (
                <button
                  className="btn btn-sm btn-outline"
                  style={{ width: '100%', justifyContent: 'flex-start' }}
                  onClick={() => {
                    setMobileMenuOpen(false);
                    onOpenImportModal();
                  }}
                >
                  <Upload size={13} color="var(--accent-light)" />
                  <span>Import CSV / JSON</span>
                </button>
              )}

              {activeDb && (
                <button
                  className="btn btn-sm btn-outline"
                  style={{ width: '100%', justifyContent: 'flex-start' }}
                  onClick={() => {
                    setMobileMenuOpen(false);
                    onViewChange('diff');
                  }}
                >
                  <GitCompare size={13} color="var(--accent-light)" />
                  <span>Komparasi (Diff) DB</span>
                </button>
              )}

              <button
                className="btn btn-sm btn-outline"
                style={{ width: '100%', justifyContent: 'flex-start' }}
                onClick={() => {
                  setMobileMenuOpen(false);
                  onOpenShortcutsModal();
                }}
              >
                <Keyboard size={13} />
                <span>Pintasan Keyboard</span>
              </button>

              <div style={{ height: '1px', background: 'var(--border-subtle)', margin: '4px 0' }} />

              <button
                className={`btn btn-sm ${safeMode ? 'btn-ghost' : 'btn-danger'}`}
                style={{ width: '100%', justifyContent: 'flex-start' }}
                onClick={() => {
                  setMobileMenuOpen(false);
                  onToggleSafeMode();
                }}
              >
                {safeMode ? <ShieldCheck size={13} color="#10b981" /> : <ShieldAlert size={13} color="#ef4444" />}
                <span>Safe Mode: {safeMode ? 'ON' : 'OFF'}</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
