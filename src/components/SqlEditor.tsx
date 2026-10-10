import React, { useState } from 'react';
import { 
  Play, 
  Clock, 
  CheckCircle2, 
  AlertTriangle, 
  Download, 
  Sparkles, 
  Copy, 
  Check,
  History,
  Bookmark,
  BookmarkPlus,
  Trash2,
  Search
} from 'lucide-react';
import type { QueryResult, SafeGuardAlert, QueryHistoryItem, CustomSnippet } from '../types/database';
import { executeRawQuery, checkDestructiveQuery } from '../services/sqliteEngine';
import { exportToCsv, exportToJson } from '../services/fileSystemSync';

interface SqlEditorProps {
  dbId: string;
  safeMode: boolean;
  onSafeModeTrigger: (alert: SafeGuardAlert, proceedCallback: () => void) => void;
  onQuerySuccess: () => void;
}

export const SqlEditor: React.FC<SqlEditorProps> = ({
  dbId,
  safeMode,
  onSafeModeTrigger,
  onQuerySuccess
}) => {
  const [query, setQuery] = useState(`-- Tulis query SQL di sini (Cmd/Ctrl + Enter untuk eksekusi)
SELECT 
  c.id, 
  c.name, 
  c.email, 
  COUNT(o.id) AS total_orders, 
  COALESCE(SUM(o.total_amount), 0.0) AS total_spent
FROM customers c
LEFT JOIN orders o ON c.id = o.customer_id
GROUP BY c.id
ORDER BY total_spent DESC;`);

  const [result, setResult] = useState<QueryResult | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [bottomTab, setBottomTab] = useState<'result' | 'history' | 'snippets'>('result');

const DEFAULT_SNIPPETS: CustomSnippet[] = [
  {
    id: 'snip-1',
    title: 'Top 10 Tabel Terbesar',
    description: 'Menghitung estimasi jumlah baris semua tabel',
    sql: `SELECT name, type FROM sqlite_master WHERE type='table' ORDER BY name;`
  },
  {
    id: 'snip-2',
    title: 'Analisis Ukuran Halaman & Cache',
    description: 'Mengecek ukuran page dan jumlah page database',
    sql: `SELECT page_count * page_size as total_bytes, page_size, page_count FROM pragma_page_count(), pragma_page_size();`
  },
  {
    id: 'snip-3',
    title: 'Template INSERT Transaksional',
    description: 'Contoh blok transaksi aman dengan rollback',
    sql: `BEGIN TRANSACTION;\n-- INSERT statements here\nCOMMIT;`
  }
];

  // Query History & Snippets state
  const [history, setHistory] = useState<QueryHistoryItem[]>(() => {
    try {
      const savedHist = localStorage.getItem('sqlite_studio_query_history');
      return savedHist ? JSON.parse(savedHist) : [];
    } catch {
      return [];
    }
  });
  const [snippets, setSnippets] = useState<CustomSnippet[]>(() => {
    try {
      const savedSnips = localStorage.getItem('sqlite_studio_snippets');
      if (savedSnips) return JSON.parse(savedSnips);
      localStorage.setItem('sqlite_studio_snippets', JSON.stringify(DEFAULT_SNIPPETS));
      return DEFAULT_SNIPPETS;
    } catch {
      return DEFAULT_SNIPPETS;
    }
  });
  const [newSnippetTitle, setNewSnippetTitle] = useState('');
  const [snippetSearch, setSnippetSearch] = useState('');
  const [isSnippetModalOpen, setIsSnippetModalOpen] = useState(false);

  const saveHistoryItem = (item: QueryHistoryItem) => {
    const updated = [item, ...history.slice(0, 49)];
    setHistory(updated);
    try {
      localStorage.setItem('sqlite_studio_query_history', JSON.stringify(updated));
    } catch {}
  };

  // Execute SQL
  const handleExecute = (overrideSql?: string) => {
    const targetSql = (overrideSql || query).trim();
    if (!targetSql) return;

    if (safeMode) {
      const danger = checkDestructiveQuery(targetSql);
      if (danger) {
        onSafeModeTrigger(danger, () => runActualQuery(targetSql));
        return;
      }
    }

    runActualQuery(targetSql);
  };

  const runActualQuery = (sqlToRun: string) => {
    setIsRunning(true);
    try {
      const res = executeRawQuery(dbId, sqlToRun);
      setResult(res);
      setBottomTab('result');

      saveHistoryItem({
        id: 'hist-' + Date.now(),
        sql: sqlToRun,
        timestamp: Date.now(),
        executionTimeMs: res.executionTimeMs,
        error: res.error,
        rowCount: res.values.length
      });

      if (!res.error) {
        onQuerySuccess();
      }
    } finally {
      setIsRunning(false);
    }
  };

  // Explain Query Plan
  const handleExplainPlan = () => {
    if (!query.trim()) return;
    const explainSql = `EXPLAIN QUERY PLAN ${query.trim()};`;
    runActualQuery(explainSql);
  };

  const handleCopyResult = () => {
    if (!result || result.values.length === 0) return;
    const text = result.values.map(r => r.join('\t')).join('\n');
    navigator.clipboard.writeText(text);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  const handleSaveSnippet = () => {
    if (!newSnippetTitle.trim()) return;
    const newSnip: CustomSnippet = {
      id: 'snip-' + Date.now(),
      title: newSnippetTitle.trim(),
      description: 'Disimpan dari SQL Editor',
      sql: query
    };
    const updated = [newSnip, ...snippets];
    setSnippets(updated);
    localStorage.setItem('sqlite_studio_snippets', JSON.stringify(updated));
    setNewSnippetTitle('');
    setIsSnippetModalOpen(false);
    setBottomTab('snippets');
  };

  const handleDeleteSnippet = (id: string) => {
    const updated = snippets.filter(s => s.id !== id);
    setSnippets(updated);
    localStorage.setItem('sqlite_studio_snippets', JSON.stringify(updated));
  };

  const filteredSnippets = snippets.filter(s => 
    s.title.toLowerCase().includes(snippetSearch.toLowerCase()) || 
    s.sql.toLowerCase().includes(snippetSearch.toLowerCase())
  );

  return (
    <div className="editor-container">
      {/* Editor Top Toolbar */}
      <div className="editor-toolbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            className="btn btn-sm btn-primary"
            onClick={() => handleExecute()}
            disabled={isRunning}
            title="Jalankan Query (Cmd/Ctrl + Enter)"
          >
            <Play size={13} fill="currentColor" />
            <span>Run Query</span>
          </button>

          <button
            className="btn btn-sm btn-secondary"
            onClick={handleExplainPlan}
            title="Analisis Query Plan (Deteksi penggunaan Index vs Table Scan)"
          >
            <Sparkles size={13} color="var(--accent-light)" />
            <span>Explain Plan</span>
          </button>

          <button
            className="btn btn-sm btn-outline"
            onClick={() => setIsSnippetModalOpen(true)}
            title="Simpan query aktif ke Snippets"
          >
            <BookmarkPlus size={13} />
            <span>Simpan Snippet</span>
          </button>
        </div>

        {/* Bottom Tab Selectors */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <div className="view-tabs" style={{ padding: '2px' }}>
            <button
              className={`view-tab-btn ${bottomTab === 'result' ? 'active' : ''}`}
              style={{ padding: '4px 8px', fontSize: '12px' }}
              onClick={() => setBottomTab('result')}
            >
              Hasil
            </button>
            <button
              className={`view-tab-btn ${bottomTab === 'history' ? 'active' : ''}`}
              style={{ padding: '4px 8px', fontSize: '12px', gap: '4px' }}
              onClick={() => setBottomTab('history')}
            >
              <History size={12} />
              <span>History ({history.length})</span>
            </button>
            <button
              className={`view-tab-btn ${bottomTab === 'snippets' ? 'active' : ''}`}
              style={{ padding: '4px 8px', fontSize: '12px', gap: '4px' }}
              onClick={() => setBottomTab('snippets')}
            >
              <Bookmark size={12} />
              <span>Snippets ({snippets.length})</span>
            </button>
          </div>

          {bottomTab === 'result' && result && !result.error && (
            <>
              <button
                className="btn btn-sm btn-outline"
                onClick={() => exportToCsv(result.columns, result.values, 'query_result.csv')}
                title="Export Hasil ke CSV"
              >
                <Download size={13} />
                <span>CSV</span>
              </button>
              <button
                className="btn btn-sm btn-outline"
                onClick={() => exportToJson(result.columns, result.values, 'query_result.json')}
                title="Export Hasil ke JSON"
              >
                <Download size={13} />
                <span>JSON</span>
              </button>
              <button
                className="btn btn-sm btn-ghost"
                onClick={handleCopyResult}
                title="Salin Data ke Clipboard"
              >
                {isCopied ? <Check size={13} color="var(--success)" /> : <Copy size={13} />}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Editor Split: Query Textarea + Results/History/Snippets */}
      <div className="editor-split">
        <div className="sql-textarea-wrap" style={{ height: '200px' }}>
          <textarea
            className="sql-textarea"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                e.preventDefault();
                handleExecute();
              }
            }}
            placeholder="Ketik query SQL di sini..."
          />
        </div>

        {/* Execution Stats Bar */}
        <div className="query-stats-bar">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {result ? (
              result.error ? (
                <span style={{ color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <AlertTriangle size={13} /> Query Error
                </span>
              ) : (
                <span style={{ color: 'var(--success)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <CheckCircle2 size={13} /> Berhasil dieksekusi
                </span>
              )
            ) : (
              <span>Siap mengeksekusi</span>
            )}

            {result && (
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Clock size={12} />
                <span className="font-mono">{result.executionTimeMs} ms</span>
              </span>
            )}

            {result && result.rowsAffected !== undefined && (
              <span>
                Row terpengaruh: <b className="font-mono">{result.rowsAffected}</b>
              </span>
            )}
          </div>

          <div>
            {result && result.columns.length > 0 && (
              <span>
                Hasil: <b className="font-mono">{result.values.length}</b> baris • <b className="font-mono">{result.columns.length}</b> kolom
              </span>
            )}
          </div>
        </div>

        {/* Bottom Tab Content: Result / History / Snippets */}
        <div className="table-wrapper" style={{ flex: 1 }}>
          {bottomTab === 'result' ? (
            result?.error ? (
              <div style={{ padding: '24px', color: 'var(--danger)', background: 'var(--danger-bg)', margin: '16px', borderRadius: '8px', border: '1px solid var(--danger-border)', fontFamily: 'var(--font-mono)', fontSize: '13px' }}>
                <div style={{ fontWeight: 600, marginBottom: '6px' }}>SQLite Error:</div>
                <div>{result.error}</div>
              </div>
            ) : result && result.columns.length > 0 ? (
              <table className="data-table">
                <thead>
                  <tr>
                    {result.columns.map((c, idx) => (
                      <th key={idx}>{c}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.values.map((row, rIdx) => (
                    <tr key={rIdx}>
                      {row.map((cell, cIdx) => (
                        <td key={cIdx}>
                          {cell === null ? (
                            <span className="cell-null">NULL</span>
                          ) : typeof cell === 'object' ? (
                            JSON.stringify(cell)
                          ) : (
                            String(cell)
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : result && result.columns.length === 0 ? (
              <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)' }}>
                Query selesai tanpa menghasilkan kumpulan baris data (rows affected: {result.rowsAffected || 0}).
              </div>
            ) : (
              <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                Tekan <kbd style={{ padding: '2px 6px', background: 'var(--bg-surface-elevated)', borderRadius: '4px', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' }}>Cmd / Ctrl + Enter</kbd> untuk mengeksekusi query.
              </div>
            )
          ) : bottomTab === 'history' ? (
            <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ fontSize: '13px', fontWeight: 600 }}>Riwayat Eksekusi Query Terakhir ({history.length})</span>
                <button
                  className="btn btn-sm btn-ghost"
                  onClick={() => {
                    setHistory([]);
                    localStorage.removeItem('sqlite_studio_query_history');
                  }}
                >
                  <Trash2 size={12} /> Hapus Riwayat
                </button>
              </div>

              {history.length === 0 ? (
                <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '20px' }}>Belum ada query yang dijalankan.</p>
              ) : (
                history.map(item => (
                  <div
                    key={item.id}
                    style={{
                      padding: '10px 14px',
                      backgroundColor: 'var(--bg-surface)',
                      borderRadius: '8px',
                      border: '1px solid var(--border-subtle)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '12px'
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <pre className="font-mono" style={{ fontSize: '12px', color: item.error ? 'var(--danger)' : '#cbd5e1', overflowX: 'auto', whiteSpace: 'nowrap' }}>
                        {item.sql}
                      </pre>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px', display: 'flex', gap: '10px' }}>
                        <span>{new Date(item.timestamp).toLocaleTimeString()}</span>
                        <span>•</span>
                        <span>{item.executionTimeMs} ms</span>
                        <span>•</span>
                        <span>{item.rowCount ?? 0} rows</span>
                      </div>
                    </div>

                    <button
                      className="btn btn-sm btn-secondary"
                      onClick={() => {
                        setQuery(item.sql);
                        handleExecute(item.sql);
                      }}
                    >
                      <Play size={11} fill="currentColor" /> Jalankan Lagi
                    </button>
                  </div>
                ))
              )}
            </div>
          ) : (
            <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div className="search-input-wrap">
                  <Search size={14} />
                  <input
                    type="text"
                    className="input-field search-input"
                    placeholder="Cari Snippet..."
                    value={snippetSearch}
                    onChange={(e) => setSnippetSearch(e.target.value)}
                  />
                </div>
                <button className="btn btn-sm btn-primary" onClick={() => setIsSnippetModalOpen(true)}>
                  + Simpan Snippet Baru
                </button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '12px' }}>
                {filteredSnippets.map(snip => (
                  <div
                    key={snip.id}
                    style={{
                      padding: '12px 14px',
                      backgroundColor: 'var(--bg-surface)',
                      borderRadius: '8px',
                      border: '1px solid var(--border-subtle)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text-primary)' }}>{snip.title}</span>
                      <button
                        className="btn btn-ghost"
                        style={{ padding: '2px' }}
                        onClick={() => handleDeleteSnippet(snip.id)}
                        title="Hapus Snippet"
                      >
                        <Trash2 size={12} color="var(--text-muted)" />
                      </button>
                    </div>

                    <p style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{snip.description}</p>

                    <pre style={{ padding: '6px 8px', background: 'var(--bg-input)', borderRadius: '4px', fontSize: '11px', color: '#cbd5e1', overflowX: 'auto', maxHeight: '60px' }}>
                      {snip.sql}
                    </pre>

                    <button
                      className="btn btn-sm btn-secondary"
                      style={{ marginTop: 'auto' }}
                      onClick={() => {
                        setQuery(snip.sql);
                        setBottomTab('result');
                      }}
                    >
                      Masukkan ke Editor
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Save Snippet Modal */}
      {isSnippetModalOpen && (
        <div className="modal-backdrop">
          <div className="modal-content" style={{ width: '480px' }}>
            <div className="modal-header">
              <h3 style={{ fontSize: '15px', fontWeight: 600 }}>Simpan Query ke Snippets</h3>
              <button className="btn btn-ghost" onClick={() => setIsSnippetModalOpen(false)}>
                &times;
              </button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
                  Judul Snippet:
                </label>
                <input
                  className="input-field"
                  style={{ width: '100%' }}
                  placeholder="Contoh: Query Analisis Penjualan Bulanan"
                  value={newSnippetTitle}
                  onChange={(e) => setNewSnippetTitle(e.target.value)}
                  autoFocus
                />
              </div>

              <div>
                <label style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
                  Query SQL:
                </label>
                <pre style={{ padding: '10px', background: 'var(--bg-input)', borderRadius: '6px', fontSize: '12px', maxHeight: '120px', overflowY: 'auto' }}>
                  {query}
                </pre>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setIsSnippetModalOpen(false)}>
                Batal
              </button>
              <button className="btn btn-primary" onClick={handleSaveSnippet}>
                Simpan Snippet
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
