import React from 'react';
import { 
  FolderOpen, 
  TableProperties, 
  Terminal, 
  Layers, 
  Network, 
  Activity
} from 'lucide-react';
import type { ActiveView, DatabaseMetadata } from '../types/database';

interface BottomNavProps {
  activeView: ActiveView;
  onViewChange: (view: ActiveView) => void;
  onToggleMobileSidebar: () => void;
  activeDb: DatabaseMetadata | null;
}

export const BottomNav: React.FC<BottomNavProps> = ({
  activeView,
  onViewChange,
  onToggleMobileSidebar,
  activeDb
}) => {
  return (
    <nav className="bottom-nav" aria-label="Mobile Bottom Navigation">
      <button 
        type="button"
        className="bottom-nav-item"
        onClick={onToggleMobileSidebar}
        title="Daftar Database & Tabel"
      >
        <div className="bottom-nav-icon-wrap" style={{ position: 'relative' }}>
          <FolderOpen size={18} />
          {activeDb?.isDirty && (
            <span 
              style={{
                position: 'absolute',
                top: '2px',
                right: '2px',
                width: '7px',
                height: '7px',
                backgroundColor: 'var(--danger)',
                borderRadius: '50%',
                border: '1.5px solid var(--bg-sidebar)'
              }} 
            />
          )}
        </div>
        <span>Database</span>
      </button>

      <button 
        type="button"
        className={`bottom-nav-item ${activeView === 'grid' ? 'active' : ''}`}
        onClick={() => onViewChange('grid')}
        title="Tabel Data"
      >
        <div className="bottom-nav-icon-wrap">
          <TableProperties size={18} />
        </div>
        <span>Data</span>
      </button>

      <button 
        type="button"
        className={`bottom-nav-item ${activeView === 'sql' ? 'active' : ''}`}
        onClick={() => onViewChange('sql')}
        title="SQL Query Runner"
      >
        <div className="bottom-nav-icon-wrap">
          <Terminal size={18} />
        </div>
        <span>SQL</span>
      </button>

      <button 
        type="button"
        className={`bottom-nav-item ${activeView === 'schema' ? 'active' : ''}`}
        onClick={() => onViewChange('schema')}
        title="Struktur Schema"
      >
        <div className="bottom-nav-icon-wrap">
          <Layers size={18} />
        </div>
        <span>Schema</span>
      </button>

      <button 
        type="button"
        className={`bottom-nav-item ${activeView === 'erd' ? 'active' : ''}`}
        onClick={() => onViewChange('erd')}
        title="Relasi ERD"
      >
        <div className="bottom-nav-icon-wrap">
          <Network size={18} />
        </div>
        <span>ERD</span>
      </button>

      <button 
        type="button"
        className={`bottom-nav-item ${activeView === 'diagnostics' ? 'active' : ''}`}
        onClick={() => onViewChange('diagnostics')}
        title="Diagnosa PRAGMA"
      >
        <div className="bottom-nav-icon-wrap">
          <Activity size={18} />
        </div>
        <span>Diagnose</span>
      </button>
    </nav>
  );
};
