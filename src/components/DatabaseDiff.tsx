import React, { useState } from 'react';
import { 
  GitCompare, 
  ArrowRight, 
  Table as TableIcon
} from 'lucide-react';
import type { DatabaseMetadata } from '../types/database';

interface DatabaseDiffProps {
  databases: DatabaseMetadata[];
  activeDbId: string | null;
  onOpenNewDb?: () => void;
}

export const DatabaseDiff: React.FC<DatabaseDiffProps> = ({ databases, activeDbId, onOpenNewDb }) => {
  const [sourceDbId, setSourceDbId] = useState<string>(activeDbId || databases[0]?.id || '');
  const [targetDbId, setTargetDbId] = useState<string>(
    databases.find(d => d.id !== activeDbId)?.id || databases[0]?.id || ''
  );

  const sourceDb = databases.find(d => d.id === sourceDbId);
  const targetDb = databases.find(d => d.id === targetDbId);

  if (databases.length < 2 && (!sourceDb || sourceDb.tables.length < 2)) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', gap: '12px', padding: '40px' }}>
        <GitCompare size={40} style={{ opacity: 0.3 }} />
        <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)' }}>
          Fitur Komparasi Skema (Schema Diff)
        </h3>
        <p style={{ fontSize: '13px', maxWidth: '400px', textAlign: 'center', lineHeight: '1.5' }}>
          Buka minimal 2 file database di workspace atau muat beberapa database untuk membandingkan skema, tipe kolom, dan jumlah baris secara berdampingan.
        </p>
        {onOpenNewDb && (
          <button className="btn btn-primary" style={{ marginTop: '8px' }} onClick={onOpenNewDb}>
            Buka File Database Kedua (.db)
          </button>
        )}
      </div>
    );
  }

  // Compute Diff
  const sourceTableNames = new Set(sourceDb?.tables.map(t => t.name) || []);
  const targetTableNames = new Set(targetDb?.tables.map(t => t.name) || []);

  const allTableNames = Array.from(new Set([...sourceTableNames, ...targetTableNames])).sort();

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Diff Header */}
      <div>
        <h2 style={{ fontSize: '20px', fontWeight: 600, color: 'var(--text-primary)' }}>
          Database & Schema Comparison (Diff Tool)
        </h2>
        <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>
          Bandingkan struktur tabel, tipe data kolom, dan jumlah baris antara dua database SQLite secara otomatis.
        </p>
      </div>

      {/* Selectors Bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '16px',
        flexWrap: 'wrap',
        backgroundColor: 'var(--bg-surface)',
        padding: '16px',
        borderRadius: '10px',
        border: '1px solid var(--border-subtle)'
      }}>
        <div style={{ flex: '1 1 240px' }}>
          <label style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
            Database Sumber (Base / A):
          </label>
          <select
            className="input-field"
            style={{ width: '100%' }}
            value={sourceDbId}
            onChange={(e) => setSourceDbId(e.target.value)}
          >
            {databases.map(d => (
              <option key={d.id} value={d.id}>{d.alias || d.name} ({d.tables.length} tabel)</option>
            ))}
          </select>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', paddingTop: '20px' }}>
          <ArrowRight size={20} color="var(--text-muted)" />
        </div>

        <div style={{ flex: '1 1 240px' }}>
          <label style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
            Database Target (Compare / B):
          </label>
          <select
            className="input-field"
            style={{ width: '100%' }}
            value={targetDbId}
            onChange={(e) => setTargetDbId(e.target.value)}
          >
            {databases.map(d => (
              <option key={d.id} value={d.id}>{d.alias || d.name} ({d.tables.length} tabel)</option>
            ))}
          </select>
        </div>
      </div>

      {/* Diff Table List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {allTableNames.map(tblName => {
          const tblSource = sourceDb?.tables.find(t => t.name === tblName);
          const tblTarget = targetDb?.tables.find(t => t.name === tblName);

          const isMissingInTarget = !tblTarget;
          const isMissingInSource = !tblSource;

          // Column Diff if exists in both
          const sourceCols = new Map(tblSource?.columns.map(c => [c.name, c]) || []);
          const targetCols = new Map(tblTarget?.columns.map(c => [c.name, c]) || []);
          const allColNames = Array.from(new Set([...sourceCols.keys(), ...targetCols.keys()]));

          const hasSchemaDiff = allColNames.some(cName => {
            const sc = sourceCols.get(cName);
            const tc = targetCols.get(cName);
            return !sc || !tc || sc.type !== tc.type || sc.pk !== tc.pk;
          });

          return (
            <div
              key={tblName}
              style={{
                backgroundColor: 'var(--bg-surface)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '8px',
                overflow: 'hidden'
              }}
            >
              {/* Card Header */}
              <div style={{
                padding: '12px 16px',
                backgroundColor: 'var(--bg-sidebar)',
                borderBottom: '1px solid var(--border-subtle)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <TableIcon size={15} color="var(--accent-light)" />
                  <span style={{ fontWeight: 600, fontSize: '14px', color: 'var(--text-primary)' }}>
                    {tblName}
                  </span>
                </div>

                <div>
                  {isMissingInTarget ? (
                    <span className="badge badge-dirty">Hanya ada di Database A (Missing di B)</span>
                  ) : isMissingInSource ? (
                    <span className="badge badge-live">Hanya ada di Database B (New di B)</span>
                  ) : hasSchemaDiff ? (
                    <span className="badge badge-sandbox">Perbedaan Skema Terdeteksi</span>
                  ) : (
                    <span className="badge" style={{ background: 'var(--success-bg)', color: 'var(--success)' }}>
                      Skema Identik
                    </span>
                  )}
                </div>
              </div>

              {/* Table comparison details */}
              {tblSource && tblTarget && (
                <div style={{ padding: '14px 16px' }}>
                  <div style={{ display: 'flex', gap: '24px', marginBottom: '12px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                    <span>Jumlah Baris A: <b className="font-mono" style={{ color: 'var(--text-primary)' }}>{tblSource.rowCount.toLocaleString()}</b></span>
                    <span>Jumlah Baris B: <b className="font-mono" style={{ color: 'var(--text-primary)' }}>{tblTarget.rowCount.toLocaleString()}</b></span>
                    {tblSource.rowCount !== tblTarget.rowCount && (
                      <span style={{ color: 'var(--warning)', fontWeight: 500 }}>
                        (Selisih {Math.abs(tblSource.rowCount - tblTarget.rowCount).toLocaleString()} baris)
                      </span>
                    )}
                  </div>

                  <table className="data-table" style={{ fontSize: '12px' }}>
                    <thead>
                      <tr>
                        <th>Kolom</th>
                        <th>Tipe di Database A</th>
                        <th>Tipe di Database B</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {allColNames.map(cName => {
                        const sc = sourceCols.get(cName);
                        const tc = targetCols.get(cName);

                        let statusBadge = (
                          <span style={{ color: 'var(--success)' }}>Cocok</span>
                        );

                        if (!sc) {
                          statusBadge = <span style={{ color: 'var(--info)' }}>+ Kolom Baru di B</span>;
                        } else if (!tc) {
                          statusBadge = <span style={{ color: 'var(--danger)' }}>- Kolom Hilang di B</span>;
                        } else if (sc.type !== tc.type) {
                          statusBadge = <span style={{ color: 'var(--warning)' }}>Tipe Berubah ({sc.type} → {tc.type})</span>;
                        }

                        return (
                          <tr key={cName}>
                            <td style={{ fontWeight: 600 }}>{cName}</td>
                            <td className="font-mono" style={{ color: sc ? 'var(--text-primary)' : 'var(--text-dim)' }}>
                              {sc ? `${sc.type} ${sc.pk ? '(PK)' : ''}` : '(Tidak ada)'}
                            </td>
                            <td className="font-mono" style={{ color: tc ? 'var(--text-primary)' : 'var(--text-dim)' }}>
                              {tc ? `${tc.type} ${tc.pk ? '(PK)' : ''}` : '(Tidak ada)'}
                            </td>
                            <td>{statusBadge}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
