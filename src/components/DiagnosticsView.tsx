import React, { useState } from 'react';
import { 
  ShieldCheck, 
  Database, 
  FileCheck2, 
  CheckCircle2, 
  Play, 
  RotateCcw 
} from 'lucide-react';
import { executeRawQuery } from '../services/sqliteEngine';
import type { QueryResult } from '../types/database';

interface DiagnosticsViewProps {
  dbId: string;
  onRefreshSchema: () => void;
}

export const DiagnosticsView: React.FC<DiagnosticsViewProps> = ({
  dbId,
  onRefreshSchema
}) => {
  const [runningTool, setRunningTool] = useState<string | null>(null);
  const [diagnosticResult, setDiagnosticResult] = useState<{ title: string; result: QueryResult } | null>(null);

  const runDiagnostic = (title: string, sql: string) => {
    setRunningTool(title);
    setTimeout(() => {
      const res = executeRawQuery(dbId, sql);
      setDiagnosticResult({ title, result: res });
      setRunningTool(null);
      if (sql.includes('VACUUM') || sql.includes('checkpoint')) {
        onRefreshSchema();
      }
    }, 150);
  };

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '24px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div>
        <h2 style={{ fontSize: '20px', fontWeight: 600, color: 'var(--text-primary)' }}>
          SQLite Diagnostics & PRAGMA Tools
        </h2>
        <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>
          Jalankan pemeliharaan database, verifikasi integritas halaman, defragmentasi, dan checkpoint WAL langsung di browser.
        </p>
      </div>

      {/* Grid of Diagnostic Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
        {/* 1. Integrity Check */}
        <div style={{ padding: '18px', background: 'var(--bg-surface)', borderRadius: '10px', border: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ padding: '8px', borderRadius: '8px', background: 'rgba(16, 185, 129, 0.15)', color: 'var(--success)' }}>
              <ShieldCheck size={18} />
            </div>
            <div>
              <h4 style={{ fontSize: '14px', fontWeight: 600 }}>Integrity Check</h4>
              <span className="font-mono" style={{ fontSize: '11px', color: 'var(--text-muted)' }}>PRAGMA integrity_check</span>
            </div>
          </div>
          <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
            Memindai seluruh B-Tree dan halaman disk database untuk mendeteksi korupsi atau data rusak.
          </p>
          <button
            className="btn btn-sm btn-secondary"
            style={{ marginTop: 'auto' }}
            disabled={runningTool !== null}
            onClick={() => runDiagnostic('Integrity Check', 'PRAGMA integrity_check;')}
          >
            <Play size={12} fill="currentColor" />
            <span>{runningTool === 'Integrity Check' ? 'Memindai...' : 'Jalankan Scan'}</span>
          </button>
        </div>

        {/* 2. VACUUM (Defragmentation) */}
        <div style={{ padding: '18px', background: 'var(--bg-surface)', borderRadius: '10px', border: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ padding: '8px', borderRadius: '8px', background: 'rgba(99, 102, 241, 0.15)', color: 'var(--accent-light)' }}>
              <Database size={18} />
            </div>
            <div>
              <h4 style={{ fontSize: '14px', fontWeight: 600 }}>VACUUM & Clean</h4>
              <span className="font-mono" style={{ fontSize: '11px', color: 'var(--text-muted)' }}>VACUUM;</span>
            </div>
          </div>
          <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
            Membangun ulang database untuk mengklaim kembali ruang kosong dari baris yang dihapus dan memadatkan file.
          </p>
          <button
            className="btn btn-sm btn-secondary"
            style={{ marginTop: 'auto' }}
            disabled={runningTool !== null}
            onClick={() => runDiagnostic('VACUUM Clean', 'VACUUM;')}
          >
            <Play size={12} fill="currentColor" />
            <span>{runningTool === 'VACUUM Clean' ? 'Memproses...' : 'Jalankan VACUUM'}</span>
          </button>
        </div>

        {/* 3. Foreign Key Check */}
        <div style={{ padding: '18px', background: 'var(--bg-surface)', borderRadius: '10px', border: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ padding: '8px', borderRadius: '8px', background: 'rgba(245, 158, 11, 0.15)', color: 'var(--warning)' }}>
              <FileCheck2 size={18} />
            </div>
            <div>
              <h4 style={{ fontSize: '14px', fontWeight: 600 }}>Foreign Key Check</h4>
              <span className="font-mono" style={{ fontSize: '11px', color: 'var(--text-muted)' }}>PRAGMA foreign_key_check</span>
            </div>
          </div>
          <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
            Memeriksa baris data yang memiliki referensi foreign key yang hilang atau rusak (*orphan records*).
          </p>
          <button
            className="btn btn-sm btn-secondary"
            style={{ marginTop: 'auto' }}
            disabled={runningTool !== null}
            onClick={() => runDiagnostic('Foreign Key Check', 'PRAGMA foreign_key_check;')}
          >
            <Play size={12} fill="currentColor" />
            <span>{runningTool === 'Foreign Key Check' ? 'Memeriksa...' : 'Periksa Relasi'}</span>
          </button>
        </div>

        {/* 4. WAL Checkpoint */}
        <div style={{ padding: '18px', background: 'var(--bg-surface)', borderRadius: '10px', border: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ padding: '8px', borderRadius: '8px', background: 'rgba(14, 165, 233, 0.15)', color: 'var(--info)' }}>
              <RotateCcw size={18} />
            </div>
            <div>
              <h4 style={{ fontSize: '14px', fontWeight: 600 }}>WAL Checkpoint</h4>
              <span className="font-mono" style={{ fontSize: '11px', color: 'var(--text-muted)' }}>PRAGMA wal_checkpoint(FULL)</span>
            </div>
          </div>
          <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
            Menggabungkan log transaksi yang tertunda dari file `.db-wal` ke file database utama.
          </p>
          <button
            className="btn btn-sm btn-secondary"
            style={{ marginTop: 'auto' }}
            disabled={runningTool !== null}
            onClick={() => runDiagnostic('WAL Checkpoint', 'PRAGMA wal_checkpoint(FULL);')}
          >
            <Play size={12} fill="currentColor" />
            <span>{runningTool === 'WAL Checkpoint' ? 'Checkpointing...' : 'Jalankan Checkpoint'}</span>
          </button>
        </div>
      </div>

      {/* Result Panel */}
      {diagnosticResult && (
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: '10px', padding: '18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontWeight: 600, fontSize: '15px' }}>Hasil: {diagnosticResult.title}</span>
              <span className="badge badge-count font-mono">{diagnosticResult.result.executionTimeMs} ms</span>
            </div>
          </div>

          {diagnosticResult.result.error ? (
            <div style={{ color: 'var(--danger)', background: 'var(--danger-bg)', padding: '12px', borderRadius: '6px', fontSize: '13px' }}>
              {diagnosticResult.result.error}
            </div>
          ) : diagnosticResult.result.values.length > 0 ? (
            <table className="data-table">
              <thead>
                <tr>
                  {diagnosticResult.result.columns.map((c, i) => (
                    <th key={i}>{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {diagnosticResult.result.values.map((row, rIdx) => (
                  <tr key={rIdx}>
                    {row.map((val, cIdx) => (
                      <td key={cIdx} style={{ color: String(val) === 'ok' ? 'var(--success)' : 'inherit' }}>
                        {String(val)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div style={{ color: 'var(--success)', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', padding: '8px 0' }}>
              <CheckCircle2 size={16} />
              <span>Perintah berhasil dijalankan tanpa error atau anomali yang ditemukan.</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
