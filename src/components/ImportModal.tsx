import React, { useState } from 'react';
import { 
  Upload, 
  FileSpreadsheet, 
  X, 
  CheckCircle2, 
  AlertCircle 
} from 'lucide-react';
import type { TableSchema } from '../types/database';
import { executeInTransaction, executeRawQuery, formatSqlValue, escapeIdentifier } from '../services/sqliteEngine';

interface ImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  dbId: string;
  existingTables: TableSchema[];
  onImportSuccess: () => void;
}

export const ImportModal: React.FC<ImportModalProps> = ({
  isOpen,
  onClose,
  dbId,
  existingTables,
  onImportSuccess
}) => {
  const [file, setFile] = useState<File | null>(null);
  const [parsedHeaders, setParsedHeaders] = useState<string[]>([]);
  const [previewRows, setPreviewRows] = useState<any[][]>([]);
  const [allRows, setAllRows] = useState<any[][]>([]);
  const [importMode, setImportMode] = useState<'new_table' | 'append'>('new_table');
  const [newTableName, setNewTableName] = useState('');
  const [targetTable, setTargetTable] = useState(existingTables[0]?.name || '');
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  if (!isOpen) return null;

  // Simple CSV Parser
  const parseCsv = (text: string): { headers: string[]; rows: any[][] } => {
    const lines = text.split(/\r?\n/).filter(line => line.trim().length > 0);
    if (lines.length === 0) return { headers: [], rows: [] };

    const splitLine = (l: string) => {
      const row: string[] = [];
      let inQuotes = false;
      let cur = '';
      for (let i = 0; i < l.length; i++) {
        const c = l[i];
        if (c === '"') {
          inQuotes = !inQuotes;
        } else if (c === ',' && !inQuotes) {
          row.push(cur.trim());
          cur = '';
        } else {
          cur += c;
        }
      }
      row.push(cur.trim());
      return row;
    };

    const headers = splitLine(lines[0]).map(h => h.replace(/^["']|["']$/g, ''));
    const rows = lines.slice(1).map(splitLine);
    return { headers, rows };
  };

  // JSON Parser
  const parseJson = (text: string): { headers: string[]; rows: any[][] } => {
    try {
      const data = JSON.parse(text);
      if (!Array.isArray(data) || data.length === 0) {
        throw new Error('JSON harus berupa array of objects (contoh: [{"col1": "val1"}])');
      }
      const headers = Array.from(new Set(data.flatMap(obj => Object.keys(obj))));
      const rows = data.map(obj => headers.map(h => obj[h] ?? null));
      return { headers, rows };
    } catch (err: any) {
      throw new Error(`Format JSON tidak valid: ${err.message}`);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    setFile(selectedFile);
    setStatusMessage(null);
    const defaultName = selectedFile.name.replace(/\.[^/.]+$/, '').toLowerCase().replace(/[^a-z0-9_]/g, '_');
    setNewTableName(defaultName);

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const content = event.target?.result as string;
        let parsed: { headers: string[]; rows: any[][] };

        if (selectedFile.name.endsWith('.json')) {
          parsed = parseJson(content);
        } else {
          parsed = parseCsv(content);
        }

        setParsedHeaders(parsed.headers);
        setAllRows(parsed.rows);
        setPreviewRows(parsed.rows.slice(0, 5));
      } catch (err: any) {
        setStatusMessage({ type: 'error', text: err.message });
      }
    };
    reader.readAsText(selectedFile);
  };

  const inferColumnType = (values: any[]): string => {
    let hasInt = false;
    let hasReal = false;
    let hasText = false;

    for (const v of values) {
      if (v === null || v === '' || v === undefined) continue;
      if (!isNaN(Number(v))) {
        if (Number.isInteger(Number(v))) {
          hasInt = true;
        } else {
          hasReal = true;
        }
      } else {
        hasText = true;
        break;
      }
    }

    if (hasText) return 'TEXT';
    if (hasReal) return 'REAL';
    if (hasInt) return 'INTEGER';
    return 'TEXT';
  };

  const handleExecuteImport = () => {
    if (!file || parsedHeaders.length === 0 || allRows.length === 0) {
      setStatusMessage({ type: 'error', text: 'Pilih file CSV atau JSON yang valid terlebih dahulu.' });
      return;
    }

    setIsProcessing(true);
    setStatusMessage(null);

    try {
      if (importMode === 'new_table') {
        const cleanTableName = newTableName.trim().replace(/[^A-Za-z0-9_]/g, '_');
        if (!cleanTableName) {
          setStatusMessage({ type: 'error', text: 'Nama tabel tidak boleh kosong.' });
          setIsProcessing(false);
          return;
        }

        // Infer column types
        const colDefinitions = parsedHeaders.map((header, idx) => {
          const sampleValues = allRows.slice(0, 50).map(r => r[idx]);
          const inferredType = inferColumnType(sampleValues);
          return `"${header}" ${inferredType}`;
        });

        const createTableSql = `CREATE TABLE IF NOT EXISTS "${cleanTableName}" (\n  ${colDefinitions.join(',\n  ')}\n);`;
        executeRawQuery(dbId, createTableSql);

        // Generate batch inserts
        const statements: string[] = [];
        const escapedHeaders = parsedHeaders.map(h => escapeIdentifier(h)).join(', ');

        for (const row of allRows) {
          const escapedValues = row.map(val => formatSqlValue(val === '' ? null : val)).join(', ');
          statements.push(`INSERT INTO ${escapeIdentifier(cleanTableName)} (${escapedHeaders}) VALUES (${escapedValues});`);
        }

        const txRes = executeInTransaction(dbId, statements);
        if (txRes.success) {
          setStatusMessage({ type: 'success', text: `Sukses mengimpor ${allRows.length} baris ke tabel baru "${cleanTableName}"!` });
          onImportSuccess();
          setTimeout(() => onClose(), 1200);
        } else {
          setStatusMessage({ type: 'error', text: `Gagal mengimpor: ${txRes.error}` });
        }
      } else {
        // Append to existing table
        const escapedHeaders = parsedHeaders.map(h => escapeIdentifier(h)).join(', ');
        const statements: string[] = [];

        for (const row of allRows) {
          const escapedValues = row.map(val => formatSqlValue(val === '' ? null : val)).join(', ');
          statements.push(`INSERT INTO ${escapeIdentifier(targetTable)} (${escapedHeaders}) VALUES (${escapedValues});`);
        }

        const txRes = executeInTransaction(dbId, statements);
        if (txRes.success) {
          setStatusMessage({ type: 'success', text: `Sukses menambahkan ${allRows.length} baris ke tabel "${targetTable}"!` });
          onImportSuccess();
          setTimeout(() => onClose(), 1200);
        } else {
          setStatusMessage({ type: 'error', text: `Gagal mengimpor: ${txRes.error}` });
        }
      }
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || String(err) });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="modal-backdrop">
      <div className="modal-content" style={{ width: '640px' }}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FileSpreadsheet size={18} color="var(--accent-light)" />
            <h3 style={{ fontSize: '15px', fontWeight: 600 }}>Import Data (CSV / JSON) ke SQLite</h3>
          </div>
          <button className="btn btn-ghost" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* File Picker / Drop Zone */}
          <div style={{
            border: '2px dashed var(--border-default)',
            borderRadius: '10px',
            padding: '20px',
            textAlign: 'center',
            backgroundColor: 'var(--bg-input)',
            cursor: 'pointer'
          }}>
            <input
              type="file"
              accept=".csv,.json"
              onChange={handleFileUpload}
              style={{ display: 'none' }}
              id="import-file-input"
            />
            <label htmlFor="import-file-input" style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
              <Upload size={28} color="var(--accent-light)" />
              <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>
                {file ? file.name : 'Pilih atau Drag File CSV / JSON'}
              </span>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                {file ? `${(file.size / 1024).toFixed(1)} KB • ${allRows.length} baris terdeteksi` : 'Mendukung file CSV standar atau JSON Array of Objects'}
              </span>
            </label>
          </div>

          {/* Target Mode Configuration */}
          {parsedHeaders.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', gap: '12px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name="importMode"
                    checked={importMode === 'new_table'}
                    onChange={() => setImportMode('new_table')}
                  />
                  <span>Buat Tabel Baru Otomatis</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name="importMode"
                    checked={importMode === 'append'}
                    onChange={() => setImportMode('append')}
                  />
                  <span>Tambahkan ke Tabel yang Ada</span>
                </label>
              </div>

              {importMode === 'new_table' ? (
                <div>
                  <label style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
                    Nama Tabel Baru:
                  </label>
                  <input
                    className="input-field"
                    style={{ width: '100%' }}
                    value={newTableName}
                    onChange={(e) => setNewTableName(e.target.value)}
                    placeholder="nama_tabel"
                  />
                </div>
              ) : (
                <div>
                  <label style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
                    Pilih Tabel Target:
                  </label>
                  <select
                    className="input-field"
                    style={{ width: '100%' }}
                    value={targetTable}
                    onChange={(e) => setTargetTable(e.target.value)}
                  >
                    {existingTables.map(t => (
                      <option key={t.name} value={t.name}>{t.name} ({t.rowCount} baris saat ini)</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Data Preview */}
              <div>
                <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
                  Pratinjau Data ({parsedHeaders.length} Kolom, 5 Baris Pertama):
                </span>
                <div style={{ maxHeight: '140px', overflowX: 'auto', overflowY: 'auto', border: '1px solid var(--border-subtle)', borderRadius: '6px' }}>
                  <table className="data-table" style={{ fontSize: '11px' }}>
                    <thead>
                      <tr>
                        {parsedHeaders.map(h => (
                          <th key={h} style={{ padding: '6px 10px' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {previewRows.map((row, i) => (
                        <tr key={i}>
                          {row.map((cell, cIdx) => (
                            <td key={cIdx} style={{ padding: '4px 10px' }}>{String(cell ?? '')}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Status Alert */}
          {statusMessage && (
            <div style={{
              padding: '10px 14px',
              borderRadius: '8px',
              fontSize: '12.5px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              backgroundColor: statusMessage.type === 'success' ? 'var(--success-bg)' : 'var(--danger-bg)',
              color: statusMessage.type === 'success' ? 'var(--success)' : 'var(--danger)',
              border: `1px solid ${statusMessage.type === 'success' ? 'var(--success-border)' : 'var(--danger-border)'}`
            }}>
              {statusMessage.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
              <span>{statusMessage.text}</span>
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn btn-outline" onClick={onClose} disabled={isProcessing}>
            Batal
          </button>
          <button
            className="btn btn-primary"
            onClick={handleExecuteImport}
            disabled={isProcessing || !file}
          >
            {isProcessing ? 'Mengimpor...' : 'Mulai Import ke SQLite'}
          </button>
        </div>
      </div>
    </div>
  );
};
