import React, { useState, useEffect, useCallback } from 'react';
import { 
  Plus, 
  Trash2, 
  Download, 
  Search, 
  ChevronLeft, 
  ChevronRight, 
  Key, 
  FileText, 
  Binary, 
  Braces, 
  Check, 
  X, 
  RefreshCw,
  Eye,
  Copy,
  ExternalLink
} from 'lucide-react';
import type { TableSchema, ColumnInfo } from '../types/database';
import { 
  executeRawQuery, 
  updateCellValueWithKeys, 
  deleteRowsWithKeys, 
  insertRecord,
  escapeIdentifier,
  getRelatedRecordSummary 
} from '../services/sqliteEngine';
import { exportToCsv, exportToJson } from '../services/fileSystemSync';
import { SmartFormField } from './SmartFormField';
import { useFeedback } from '../context/useFeedback';

interface DataGridProps {
  dbId: string;
  table: TableSchema;
  onDataModified: () => void;
  onOpenDetailDrawer: (column: ColumnInfo, value: any, whereKeys: Record<string, any>) => void;
  onJumpToTable?: (tableName: string, filterValue?: string) => void;
}

export const DataGrid: React.FC<DataGridProps> = ({
  dbId,
  table,
  onDataModified,
  onOpenDetailDrawer,
  onJumpToTable
}) => {
  const { showToast, confirm } = useFeedback();
  const [data, setData] = useState<{ columns: string[]; values: any[][] }>({ columns: [], values: [] });
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortOrder, setSortOrder] = useState<'ASC' | 'DESC'>('ASC');
  
  // Pagination
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [totalRows, setTotalRows] = useState(table.rowCount);

  // Selection
  const [selectedRowIndices, setSelectedRowIndices] = useState<Set<number>>(new Set());

  // Inline Cell Editing
  const [editingCell, setEditingCell] = useState<{ rowIndex: number; colIndex: number; value: any } | null>(null);

  // Add Record Modal
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newRowValues, setNewRowValues] = useState<Record<string, any>>({});

  const isView = table.type === 'view';
  const hasNoExplicitPk = table.primaryKeys.length === 0 && !isView;

  // Extract identifying whereKeys for a given row
  const getRowWhereKeys = (row: any[]): Record<string, any> => {
    const keys: Record<string, any> = {};
    if (table.primaryKeys.length > 0) {
      table.primaryKeys.forEach(pkCol => {
        const colIdx = data.columns.indexOf(pkCol);
        if (colIdx >= 0) {
          keys[pkCol] = row[colIdx];
        }
      });
    } else {
      const rowidIdx = data.columns.indexOf('__studio_rowid__');
      if (rowidIdx >= 0) {
        keys['__studio_rowid__'] = row[rowidIdx];
      }
    }
    return keys;
  };

  // Fetch Table Data
  const loadTableData = useCallback(() => {
    setLoading(true);
    try {
      let whereClause = '';
      if (searchQuery.trim()) {
        const escaped = searchQuery.replace(/'/g, "''");
        const conditions = table.columns.map(c => `CAST(${escapeIdentifier(c.name)} AS TEXT) LIKE '%${escaped}%'`);
        whereClause = `WHERE ${conditions.join(' OR ')}`;
      }

      if (whereClause) {
        const countRes = executeRawQuery(dbId, `SELECT COUNT(*) FROM ${escapeIdentifier(table.name)} ${whereClause};`);
        if (countRes.values.length > 0) {
          setTotalRows(Number(countRes.values[0][0]));
        }
      } else {
        setTotalRows(table.rowCount);
      }

      // Order Clause
      let orderClause = '';
      if (sortColumn) {
        orderClause = `ORDER BY ${escapeIdentifier(sortColumn)} ${sortOrder}`;
      } else if (table.primaryKeys.length > 0) {
        orderClause = `ORDER BY ${table.primaryKeys.map(k => `${escapeIdentifier(k)} ASC`).join(', ')}`;
      }

      const offset = (page - 1) * pageSize;
      const selectFields = hasNoExplicitPk ? `rowid AS __studio_rowid__, *` : `*`;
      const query = `SELECT ${selectFields} FROM ${escapeIdentifier(table.name)} ${whereClause} ${orderClause} LIMIT ${pageSize} OFFSET ${offset};`;
      const res = executeRawQuery(dbId, query);

      setData({
        columns: res.columns,
        values: res.values
      });
    } catch (err) {
      console.error('Error fetching table rows:', err);
    } finally {
      setLoading(false);
    }
  }, [dbId, table.name, table.columns, table.primaryKeys, table.rowCount, searchQuery, sortColumn, sortOrder, page, pageSize, hasNoExplicitPk]);

  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect
    loadTableData();
  }, [loadTableData]);

  // Handle Sort
  const handleSort = (colName: string) => {
    if (colName === '__studio_rowid__') return;
    setPage(1);
    setSelectedRowIndices(new Set());
    setEditingCell(null);
    if (sortColumn === colName) {
      if (sortOrder === 'ASC') {
        setSortOrder('DESC');
      } else {
        setSortColumn(null);
        setSortOrder('ASC');
      }
    } else {
      setSortColumn(colName);
      setSortOrder('ASC');
    }
  };

  // Inline Cell Save
  const handleSaveCell = (rowIndex: number, colIndex: number) => {
    if (!editingCell || isView) return;
    const colName = data.columns[colIndex];
    if (colName === '__studio_rowid__') return;

    const row = data.values[rowIndex];
    const whereKeys = getRowWhereKeys(row);

    const res = updateCellValueWithKeys(dbId, table.name, whereKeys, colName, editingCell.value);
    if (res.success) {
      const newValues = [...data.values];
      newValues[rowIndex][colIndex] = editingCell.value;
      setData({ ...data, values: newValues });
      setEditingCell(null);
      onDataModified();
    } else {
      showToast('error', `Gagal mengupdate cell: ${res.error}`);
    }
  };

  // Batch Delete
  const handleDeleteSelected = async () => {
    if (selectedRowIndices.size === 0 || isView) return;
    const count = selectedRowIndices.size;
    const ok = await confirm({
      title: 'Hapus Baris Terpilih',
      message: `Yakin ingin menghapus ${count} baris terpilih dari tabel "${table.name}"? Data yang dihapus tidak dapat dipulihkan.`,
      confirmText: `Hapus ${count} Baris`,
      cancelText: 'Batal',
      type: 'danger'
    });
    if (!ok) {
      return;
    }

    const rowsKeysToDelete: Record<string, any>[] = [];
    selectedRowIndices.forEach(idx => {
      const row = data.values[idx];
      if (row) {
        rowsKeysToDelete.push(getRowWhereKeys(row));
      }
    });

    const res = deleteRowsWithKeys(dbId, table.name, rowsKeysToDelete);
    if (res.success) {
      setSelectedRowIndices(new Set());
      showToast('success', `${count} baris berhasil dihapus dari "${table.name}".`);
      if (data.values.length === count && page > 1) {
        setPage(prev => Math.max(1, prev - 1));
      } else {
        loadTableData();
      }
      onDataModified();
    } else {
      showToast('error', `Gagal menghapus baris: ${res.error}`);
    }
  };

  // Duplicate Selected Row
  const handleDuplicateRow = () => {
    if (selectedRowIndices.size !== 1 || isView) return;
    const idx = Array.from(selectedRowIndices)[0];
    const row = data.values[idx];
    if (!row) return;

    const duplicated: Record<string, any> = {};
    table.columns.forEach(col => {
      // Skip auto increment primary keys
      if (col.pk && col.type.toUpperCase().includes('INT')) return;
      const cIdx = data.columns.indexOf(col.name);
      if (cIdx >= 0) {
        duplicated[col.name] = row[cIdx];
      }
    });

    setNewRowValues(duplicated);
    setIsAddModalOpen(true);
  };

  // Add Record Submit
  const handleAddRowSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isView) return;

    const recordToInsert: Record<string, any> = {};
    Object.entries(newRowValues).forEach(([key, val]) => {
      const col = table.columns.find(c => c.name === key);
      if (col?.pk && col.type.toUpperCase().includes('INT')) return;
      if (val !== undefined) {
        recordToInsert[key] = val === '' ? null : val;
      }
    });

    const res = insertRecord(dbId, table.name, recordToInsert);
    if (res.success) {
      setIsAddModalOpen(false);
      setNewRowValues({});
      loadTableData();
      onDataModified();
      showToast('success', `Baris baru berhasil ditambahkan ke tabel "${table.name}".`);
    } else {
      showToast('error', `Gagal menambah baris baru: ${res.error}`);
    }
  };

  const isJsonString = (str: any): boolean => {
    if (typeof str !== 'string' || str.length < 2) return false;
    const trimmed = str.trim();
    if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
      try {
        JSON.parse(trimmed);
        return true;
      } catch {
        return false;
      }
    }
    return false;
  };

  const isBlobValue = (val: any): boolean => {
    return val instanceof Uint8Array || (typeof val === 'object' && val !== null && 'length' in val && !(val instanceof Array));
  };

  const displayColumns = data.columns.filter(c => c !== '__studio_rowid__');
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));

  return (
    <div className="grid-container">
      {/* View Mode Warning Banner */}
      {isView && (
        <div style={{
          padding: '8px 16px',
          backgroundColor: 'var(--warning-bg)',
          borderBottom: '1px solid var(--warning-border)',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          fontSize: '12px',
          color: 'var(--warning)'
        }}>
          <Eye size={14} />
          <span><b>Mode View (Read-Only):</b> "{table.name}" adalah View virtual. Operasi modifikasi dinonaktifkan oleh SQLite.</span>
        </div>
      )}

      {/* 1. Grid Action Toolbar */}
      <div className="grid-toolbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div className="search-input-wrap">
            <Search size={14} />
            <input
              type="text"
              className="input-field search-input"
              placeholder={`Cari di ${table.name}...`}
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setPage(1);
                setSelectedRowIndices(new Set());
                setEditingCell(null);
              }}
            />
          </div>

          <button
            className="btn btn-sm btn-secondary"
            onClick={loadTableData}
            title="Refresh Data Tabel"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            <span>Refresh</span>
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          {!isView && selectedRowIndices.size === 1 && (
            <button
              className="btn btn-sm btn-secondary"
              onClick={handleDuplicateRow}
              title="Duplikasi baris yang dipilih untuk membuat data baru"
            >
              <Copy size={13} />
              <span>Duplikasi Baris</span>
            </button>
          )}

          {!isView && selectedRowIndices.size > 0 && (
            <button
              className="btn btn-sm btn-danger"
              onClick={handleDeleteSelected}
              title="Hapus baris yang dicentang"
            >
              <Trash2 size={13} />
              <span>Hapus ({selectedRowIndices.size})</span>
            </button>
          )}

          {!isView && (
            <button
              className="btn btn-sm btn-primary"
              onClick={() => {
                setNewRowValues({});
                setIsAddModalOpen(true);
              }}
            >
              <Plus size={14} />
              <span>Tambah Baris</span>
            </button>
          )}

          {/* Export Dropdowns */}
          <button
            className="btn btn-sm btn-outline"
            onClick={() => exportToCsv(displayColumns, data.values.map(r => displayColumns.map(c => r[data.columns.indexOf(c)])), `${table.name}.csv`)}
            title="Export ke CSV"
          >
            <Download size={13} />
            <span>CSV</span>
          </button>
          <button
            className="btn btn-sm btn-outline"
            onClick={() => exportToJson(displayColumns, data.values.map(r => displayColumns.map(c => r[data.columns.indexOf(c)])), `${table.name}.json`)}
            title="Export ke JSON"
          >
            <Download size={13} />
            <span>JSON</span>
          </button>
        </div>
      </div>

      {/* 2. Interactive Data Table Grid */}
      <div className="table-wrapper">
        <table className="data-table">
          <thead>
            <tr>
              {!isView && (
                <th style={{ width: '40px', textAlign: 'center' }}>
                  <input
                    type="checkbox"
                    checked={data.values.length > 0 && selectedRowIndices.size === data.values.length}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedRowIndices(new Set(data.values.map((_, i) => i)));
                      } else {
                        setSelectedRowIndices(new Set());
                      }
                    }}
                  />
                </th>
              )}
              {displayColumns.map((colName) => {
                const colMeta = table.columns.find(c => c.name === colName);
                const isPk = colMeta?.pk;
                const isFk = table.foreignKeys.some(f => f.from === colName);

                return (
                  <th
                    key={colName}
                    onClick={() => handleSort(colName)}
                    style={{ cursor: 'pointer' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      {isPk && <Key size={12} color="#f59e0b" />}
                      <span>{colName}</span>
                      <span style={{ fontSize: '10px', color: 'var(--text-dim)', fontWeight: 400 }}>
                        {isFk ? 'FK ↗' : colMeta?.type || ''}
                      </span>
                      {sortColumn === colName && (
                        <span style={{ color: 'var(--accent-light)', fontSize: '11px' }}>
                          {sortOrder === 'ASC' ? '▲' : '▼'}
                        </span>
                      )}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {data.values.length === 0 ? (
              <tr>
                <td colSpan={displayColumns.length + 1} style={{ textAlign: 'center', padding: '32px', color: 'var(--text-muted)' }}>
                  {loading ? 'Memuat data...' : 'Tidak ada data di tabel ini'}
                </td>
              </tr>
            ) : (
              data.values.map((row, rIdx) => {
                const isSelected = selectedRowIndices.has(rIdx);
                const whereKeys = getRowWhereKeys(row);

                return (
                  <tr key={rIdx} className={isSelected ? 'selected' : ''}>
                    {!isView && (
                      <td style={{ textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => {
                            const next = new Set(selectedRowIndices);
                            if (next.has(rIdx)) next.delete(rIdx);
                            else next.add(rIdx);
                            setSelectedRowIndices(next);
                          }}
                        />
                      </td>
                    )}
                    {displayColumns.map((colName) => {
                      const cIdx = data.columns.indexOf(colName);
                      const cellVal = row[cIdx];
                      const colMeta = table.columns.find(c => c.name === colName);
                      const isEditing = !isView && editingCell?.rowIndex === rIdx && editingCell?.colIndex === cIdx;

                      const fk = table.foreignKeys.find(f => f.from === colName);
                      const isBlob = isBlobValue(cellVal);
                      const isJson = isJsonString(cellVal);
                      const isLongText = typeof cellVal === 'string' && cellVal.length > 50;

                      if (isEditing) {
                        const colInfo = table.columns.find(c => c.name === colName);
                        const isBooleanCol = colInfo ? (/bool/i.test(colInfo.type) || /^(is_|has_|enable_|aktif)/i.test(colInfo.name)) : false;
                        const isPureDateCol = colInfo ? (colInfo.type.toUpperCase() === 'DATE' || (/(_date|birth_date|tanggal)$/i.test(colInfo.name) && !/(_at|time|timestamp)$/i.test(colInfo.name))) : false;
                        const isDateTimeCol = colInfo ? (!isPureDateCol && (/date|time/i.test(colInfo.type) || /(_at|_date|timestamp)$/i.test(colInfo.name))) : false;
                        const isNumberCol = colInfo ? (colInfo.type.toUpperCase().includes('INT') || /^(real|float|double|decimal|numeric)$/i.test(colInfo.type)) : false;

                        if (isBooleanCol) {
                          const isTrue = editingCell.value === 1 || editingCell.value === true || editingCell.value === '1';
                          return (
                            <td key={colName} style={{ padding: '4px', backgroundColor: 'var(--bg-surface-elevated)' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <button
                                  type="button"
                                  className={`btn btn-sm ${isTrue ? 'btn-primary' : 'btn-outline'}`}
                                  style={{ padding: '2px 8px', fontSize: '11px', height: '26px' }}
                                  onClick={() => setEditingCell({ ...editingCell, value: 1 })}
                                >
                                  True (1)
                                </button>
                                <button
                                  type="button"
                                  className={`btn btn-sm ${!isTrue && editingCell.value !== null ? 'btn-danger' : 'btn-outline'}`}
                                  style={{ padding: '2px 8px', fontSize: '11px', height: '26px' }}
                                  onClick={() => setEditingCell({ ...editingCell, value: 0 })}
                                >
                                  False (0)
                                </button>
                                <button
                                  className="btn btn-sm btn-ghost"
                                  onClick={() => handleSaveCell(rIdx, cIdx)}
                                  title="Simpan"
                                  style={{ color: 'var(--success)', padding: '2px 4px' }}
                                >
                                  <Check size={14} />
                                </button>
                                <button
                                  className="btn btn-sm btn-ghost"
                                  onClick={() => setEditingCell(null)}
                                  title="Batal"
                                  style={{ padding: '2px 4px' }}
                                >
                                  <X size={14} />
                                </button>
                              </div>
                            </td>
                          );
                        }

                        return (
                          <td key={colName} style={{ padding: '4px', backgroundColor: 'var(--bg-surface-elevated)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <input
                                autoFocus
                                type={isPureDateCol ? 'date' : isDateTimeCol ? 'datetime-local' : isNumberCol ? 'text' : 'text'}
                                inputMode={isNumberCol ? 'decimal' : undefined}
                                className="input-field"
                                style={{ width: '100%', padding: '4px 8px', fontSize: '12px' }}
                                value={
                                  editingCell.value === null
                                    ? ''
                                    : isDateTimeCol
                                    ? String(editingCell.value).replace(' ', 'T').slice(0, 16)
                                    : editingCell.value
                                }
                                onChange={(e) => {
                                  let val: any = e.target.value;
                                  if (isDateTimeCol && val) {
                                    val = val.replace('T', ' ');
                                    if (val.length === 16) val += ':00';
                                  }
                                  setEditingCell({ ...editingCell, value: val });
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') handleSaveCell(rIdx, cIdx);
                                  if (e.key === 'Escape') setEditingCell(null);
                                  if (isNumberCol) {
                                    if (['Backspace', 'Delete', 'Tab', 'Escape', 'Enter', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
                                    if (e.ctrlKey || e.metaKey) return;
                                    if (e.key === '-' && !String(editingCell.value).includes('-')) return;
                                    if ((e.key === '.' || e.key === ',') && !String(editingCell.value).includes('.')) return;
                                    if (!/^\d$/.test(e.key)) {
                                      e.preventDefault();
                                    }
                                  }
                                }}
                              />
                              <button
                                className="btn btn-sm btn-ghost"
                                onClick={() => setEditingCell({ ...editingCell, value: null })}
                                title="Set ke NULL"
                                style={{ fontSize: '10px', color: 'var(--warning)' }}
                              >
                                NULL
                              </button>
                              <button
                                className="btn btn-sm btn-ghost"
                                onClick={() => handleSaveCell(rIdx, cIdx)}
                                title="Simpan"
                                style={{ color: 'var(--success)' }}
                              >
                                <Check size={13} />
                              </button>
                              <button
                                className="btn btn-sm btn-ghost"
                                onClick={() => setEditingCell(null)}
                                title="Batal"
                              >
                                <X size={13} />
                              </button>
                            </div>
                          </td>
                        );
                      }

                      // Check related preview for Foreign Keys
                      const relatedSummary = fk && cellVal !== null && cellVal !== undefined 
                        ? getRelatedRecordSummary(dbId, fk.table, fk.to, cellVal) 
                        : null;

                      return (
                        <td
                          key={colName}
                          className={!isView ? 'editable' : ''}
                          onDoubleClick={() => {
                            if (isView) return;
                            if (colMeta && (isBlob || isJson || isLongText)) {
                              onOpenDetailDrawer(colMeta, cellVal, whereKeys);
                            } else {
                              setEditingCell({ rowIndex: rIdx, colIndex: cIdx, value: cellVal });
                            }
                          }}
                          title={relatedSummary ? `Relasi ke ${fk?.table}: "${relatedSummary}"` : (!isView ? "Klik 2x untuk edit atau lihat detail" : "View Read-Only")}
                        >
                          {cellVal === null || cellVal === undefined ? (
                            <span className="cell-null">NULL</span>
                          ) : isBlob ? (
                            <span
                              className="cell-blob-badge"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (colMeta) onOpenDetailDrawer(colMeta, cellVal, whereKeys);
                              }}
                            >
                              <Binary size={11} />
                              <span>BLOB</span>
                            </span>
                          ) : isJson ? (
                            <span
                              className="cell-json-badge"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (colMeta) onOpenDetailDrawer(colMeta, cellVal, whereKeys);
                              }}
                            >
                              <Braces size={11} />
                              <span>JSON</span>
                            </span>
                          ) : isLongText ? (
                            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <span>{String(cellVal).slice(0, 45)}...</span>
                              <FileText
                                size={12}
                                color="var(--accent-light)"
                                style={{ cursor: 'pointer' }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (colMeta) onOpenDetailDrawer(colMeta, cellVal, whereKeys);
                                }}
                              />
                            </span>
                          ) : fk ? (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                              <span>{String(cellVal)}</span>
                              {relatedSummary && (
                                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                                  ({relatedSummary})
                                </span>
                              )}
                              {onJumpToTable && (
                                <button
                                  type="button"
                                  className="btn btn-ghost"
                                  style={{ padding: '2px', color: 'var(--accent-light)' }}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onJumpToTable(fk.table, String(cellVal));
                                  }}
                                  title={`Buka tabel ${fk.table} (ID: ${cellVal})`}
                                >
                                  <ExternalLink size={11} />
                                </button>
                              )}
                            </span>
                          ) : (
                            String(cellVal)
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* 3. Grid Footer & Pagination */}
      <div className="grid-footer">
        <div>
          <span>Menampilkan baris </span>
          <span className="font-mono">
            {totalRows === 0 ? 0 : (page - 1) * pageSize + 1} - {Math.min(page * pageSize, totalRows)}
          </span>
          <span> dari </span>
          <span className="font-mono">{totalRows.toLocaleString()}</span>
        </div>

        <div className="pagination-controls">
          <label style={{ marginRight: '8px' }}>
            <span>Per halaman: </span>
            <select
              className="input-field"
              style={{ padding: '2px 6px', fontSize: '12px' }}
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(1);
              }}
            >
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
              <option value={500}>500</option>
            </select>
          </label>

          <button
            className="btn btn-sm btn-ghost"
            disabled={page <= 1}
            onClick={() => setPage(p => Math.max(1, p - 1))}
          >
            <ChevronLeft size={14} />
          </button>
          <span>Halaman {page} dari {totalPages}</span>
          <button
            className="btn btn-sm btn-ghost"
            disabled={page >= totalPages}
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
          >
            <ChevronRight size={14} />
          </button>
        </div>
      </div>

      {/* 4. Smart Add / Duplicate Record Modal */}
      {isAddModalOpen && !isView && (
        <div className="modal-backdrop">
          <div className="modal-content" style={{ width: '560px' }}>
            <div className="modal-header">
              <h3 style={{ fontSize: '15px', fontWeight: 600 }}>Tambah Baris ke "{table.name}"</h3>
              <button className="btn btn-ghost" onClick={() => setIsAddModalOpen(false)}>
                <X size={16} />
              </button>
            </div>
            <form onSubmit={handleAddRowSubmit}>
              <div className="modal-body" style={{ maxHeight: '65vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {table.columns.map(col => {
                  const fk = table.foreignKeys.find(f => f.from === col.name);
                  return (
                    <div key={col.name}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', fontSize: '12px' }}>
                        <label style={{ fontWeight: 500, color: 'var(--text-primary)' }}>
                          {col.name} {col.pk && <span style={{ color: '#f59e0b' }}>(PK)</span>}
                        </label>
                        <span style={{ color: 'var(--text-muted)' }}>
                          {fk ? `FK ➔ ${fk.table}(${fk.to})` : col.type}
                        </span>
                      </div>

                      <SmartFormField
                        dbId={dbId}
                        tableName={table.name}
                        column={col}
                        foreignKey={fk}
                        value={newRowValues[col.name] ?? ''}
                        onChange={(val) => setNewRowValues({ ...newRowValues, [col.name]: val })}
                      />
                    </div>
                  );
                })}
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-outline" onClick={() => setIsAddModalOpen(false)}>
                  Batal
                </button>
                <button type="submit" className="btn btn-primary">
                  Simpan Baris Baru
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
