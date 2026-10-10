import React, { useState } from 'react';
import { 
  Key, 
  ArrowRight, 
  Copy, 
  Check, 
  Table as TableIcon,
  Fingerprint
} from 'lucide-react';
import type { TableSchema } from '../types/database';

interface SchemaViewerProps {
  tables: TableSchema[];
  selectedTable: string | null;
  onSelectTable: (name: string) => void;
}

export const SchemaViewer: React.FC<SchemaViewerProps> = ({
  tables,
  selectedTable,
  onSelectTable
}) => {
  const currentTable = tables.find(t => t.name === selectedTable) || tables[0];
  const [copiedDdl, setCopiedDdl] = useState(false);

  if (!currentTable) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
        Belum ada skema tabel yang dapat ditampilkan.
      </div>
    );
  }

  const handleCopyDdl = () => {
    navigator.clipboard.writeText(currentTable.ddl);
    setCopiedDdl(true);
    setTimeout(() => setCopiedDdl(false), 2000);
  };

  return (
    <div className="schema-viewer-layout" style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      {/* Tables Sub-navigation */}
      <div className="schema-viewer-subnav" style={{ width: '220px', borderRight: '1px solid var(--border-subtle)', background: 'var(--bg-sidebar)', padding: '12px', overflowY: 'auto' }}>
        <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '8px', textTransform: 'uppercase' }}>
          Daftar Tabel ({tables.length})
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          {tables.map(tbl => (
            <div
              key={tbl.name}
              className={`table-item ${currentTable.name === tbl.name ? 'active' : ''}`}
              onClick={() => onSelectTable(tbl.name)}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <TableIcon size={13} color={currentTable.name === tbl.name ? 'var(--accent-light)' : 'var(--text-muted)'} />
                <span>{tbl.name}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Main Schema Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
        {/* Table Title */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h2 style={{ fontSize: '20px', fontWeight: 600, color: 'var(--text-primary)' }}>
              Skema Tabel: <span className="font-mono" style={{ color: 'var(--accent-light)' }}>{currentTable.name}</span>
            </h2>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
              {currentTable.columns.length} kolom • {currentTable.indexes.length} indeks • {currentTable.foreignKeys.length} relasi foreign key
            </p>
          </div>

          <button className="btn btn-sm btn-outline" onClick={handleCopyDdl}>
            {copiedDdl ? <Check size={13} color="var(--success)" /> : <Copy size={13} />}
            <span>Salin DDL SQL</span>
          </button>
        </div>

        {/* 1. Columns Definition Table */}
        <div>
          <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '10px' }}>
            Daftar Kolom & Constraint
          </h3>
          <table className="data-table" style={{ background: 'var(--bg-surface)', borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--border-subtle)' }}>
            <thead>
              <tr>
                <th style={{ width: '60px' }}>CID</th>
                <th>Nama Kolom</th>
                <th>Tipe Data</th>
                <th>Primary Key</th>
                <th>Not Null</th>
                <th>Nilai Default</th>
              </tr>
            </thead>
            <tbody>
              {currentTable.columns.map(col => (
                <tr key={col.cid}>
                  <td className="font-mono" style={{ color: 'var(--text-muted)' }}>{col.cid}</td>
                  <td style={{ fontWeight: 600 }}>{col.name}</td>
                  <td className="font-mono" style={{ color: 'var(--accent-light)' }}>{col.type || 'TEXT'}</td>
                  <td>
                    {col.pk ? (
                      <span className="badge" style={{ background: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b', gap: '4px' }}>
                        <Key size={11} /> PK
                      </span>
                    ) : (
                      <span style={{ color: 'var(--text-dim)' }}>-</span>
                    )}
                  </td>
                  <td>
                    {col.notnull ? (
                      <span style={{ color: 'var(--danger)', fontWeight: 500 }}>YES</span>
                    ) : (
                      <span style={{ color: 'var(--text-muted)' }}>NO (Nullable)</span>
                    )}
                  </td>
                  <td className="font-mono" style={{ color: 'var(--text-muted)' }}>
                    {col.dflt_value !== null && col.dflt_value !== undefined ? String(col.dflt_value) : <span style={{ color: 'var(--text-dim)' }}>None</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* 2. Foreign Keys */}
        {currentTable.foreignKeys.length > 0 && (
          <div>
            <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '10px' }}>
              Relasi Foreign Keys
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {currentTable.foreignKeys.map((fk, idx) => (
                <div key={idx} style={{ padding: '10px 14px', background: 'var(--bg-surface)', borderRadius: '6px', border: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px' }}>
                  <span className="font-mono" style={{ color: 'var(--accent-light)', fontWeight: 600 }}>{fk.from}</span>
                  <ArrowRight size={14} color="var(--text-muted)" />
                  <span>Referensi ke </span>
                  <span className="font-mono" style={{ color: 'var(--success)', fontWeight: 600 }}>{fk.table}.{fk.to}</span>
                  <span style={{ color: 'var(--text-muted)', fontSize: '11px', marginLeft: 'auto' }}>
                    ON DELETE: <b>{fk.on_delete}</b> • ON UPDATE: <b>{fk.on_update}</b>
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 3. Indexes */}
        {currentTable.indexes.length > 0 && (
          <div>
            <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '10px' }}>
              Indeks ({currentTable.indexes.length})
            </h3>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {currentTable.indexes.map((idx, i) => (
                <div key={i} style={{ padding: '8px 12px', background: 'var(--bg-surface)', borderRadius: '6px', border: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px' }}>
                  <Fingerprint size={13} color="var(--accent-light)" />
                  <span className="font-mono">{idx.name}</span>
                  {idx.unique && (
                    <span className="badge" style={{ background: 'rgba(16, 185, 129, 0.15)', color: 'var(--success)', fontSize: '10px' }}>
                      UNIQUE
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 4. DDL Script */}
        <div>
          <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '10px' }}>
            Generated DDL (CREATE TABLE)
          </h3>
          <pre style={{ padding: '16px', background: 'var(--bg-input)', borderRadius: '8px', border: '1px solid var(--border-subtle)', color: '#cbd5e1', fontFamily: 'var(--font-mono)', fontSize: '12.5px', lineHeight: '1.6', overflowX: 'auto' }}>
            {currentTable.ddl || `-- DDL tidak tersedia untuk virtual table / view`}
          </pre>
        </div>
      </div>
    </div>
  );
};
