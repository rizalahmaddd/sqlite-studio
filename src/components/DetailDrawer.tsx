import React, { useState, useEffect, useRef } from 'react';
import { 
  X, 
  Save, 
  FileCode, 
  Download, 
  Check, 
  AlertCircle, 
  Copy,
  Upload,
  Trash2
} from 'lucide-react';
import type { ColumnInfo } from '../types/database';
import { updateCellValueWithKeys } from '../services/sqliteEngine';
import { useFeedback } from '../context/useFeedback';

interface DetailDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  dbId: string;
  tableName: string;
  column: ColumnInfo | null;
  initialValue: any;
  whereKeys: Record<string, any>;
  onSaved: () => void;
}

function parseDetailInitialValue(initialValue: any): { text: string; blob: Uint8Array | null } {
  if (initialValue instanceof Uint8Array) {
    return { text: '', blob: initialValue };
  }
  if (typeof initialValue === 'object' && initialValue !== null && 'length' in initialValue && !(initialValue instanceof Array)) {
    return { text: '', blob: new Uint8Array(initialValue) };
  }
  if (typeof initialValue === 'object' && initialValue !== null) {
    return { text: JSON.stringify(initialValue, null, 2), blob: null };
  }
  try {
    if (typeof initialValue === 'string' && (initialValue.startsWith('{') || initialValue.startsWith('['))) {
      const parsed = JSON.parse(initialValue);
      return { text: JSON.stringify(parsed, null, 2), blob: null };
    }
  } catch {
    // fallback
  }
  return {
    text: initialValue === null || initialValue === undefined ? '' : String(initialValue),
    blob: null
  };
}

export const DetailDrawer: React.FC<DetailDrawerProps> = ({
  isOpen,
  onClose,
  dbId,
  tableName,
  column,
  initialValue,
  whereKeys,
  onSaved
}) => {
  const { showToast } = useFeedback();
  const [value, setValue] = useState<string>(() => parseDetailInitialValue(initialValue).text);
  const [blobBuffer, setBlobBuffer] = useState<Uint8Array | null>(() => parseDetailInitialValue(initialValue).blob);
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [isCopied, setIsCopied] = useState(false);
  const prevValRef = useRef(initialValue);

  useEffect(() => {
    if (prevValRef.current !== initialValue) {
      prevValRef.current = initialValue;
      const parsed = parseDetailInitialValue(initialValue);
      setBlobBuffer(parsed.blob);
      setValue(parsed.text);
      setJsonError(null);
    }
  }, [initialValue]);

  if (!isOpen || !column) return null;

  const isBlob = blobBuffer !== null || column.type.toUpperCase().includes('BLOB');

  // Check if BLOB is an image
  let isImage = false;
  let imageBase64 = '';
  if (blobBuffer && blobBuffer.length > 0) {
    if (blobBuffer[0] === 0x89 && blobBuffer[1] === 0x50 && blobBuffer[2] === 0x4e && blobBuffer[3] === 0x47) {
      isImage = true;
      const binStr = Array.from(blobBuffer).map(b => String.fromCharCode(b)).join('');
      imageBase64 = `data:image/png;base64,${btoa(binStr)}`;
    } else if (blobBuffer[0] === 0xff && blobBuffer[1] === 0xd8) {
      isImage = true;
      const binStr = Array.from(blobBuffer).map(b => String.fromCharCode(b)).join('');
      imageBase64 = `data:image/jpeg;base64,${btoa(binStr)}`;
    }
  }

  // Render Hex View
  const renderHexView = () => {
    if (!blobBuffer || blobBuffer.length === 0) {
      return <p style={{ color: 'var(--text-muted)', padding: '16px 0' }}>BLOB kosong atau NULL (0 bytes)</p>;
    }

    const rows: { offset: string; hex: string; ascii: string }[] = [];
    const limit = Math.min(blobBuffer.length, 1024);

    for (let i = 0; i < limit; i += 16) {
      const offset = i.toString(16).padStart(8, '0');
      const chunk = Array.from(blobBuffer.slice(i, i + 16));
      const hex = chunk.map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
      const ascii = chunk.map(b => (b >= 32 && b <= 126 ? String.fromCharCode(b) : '.')).join('');
      rows.push({ offset, hex, ascii });
    }

    return (
      <div className="hex-grid">
        {rows.map((r, idx) => (
          <div key={idx} className="hex-row">
            <span className="hex-addr">{r.offset}</span>
            <span className="hex-bytes">{r.hex.padEnd(48, ' ')}</span>
            <span className="hex-ascii">{r.ascii}</span>
          </div>
        ))}
        {blobBuffer.length > 1024 && (
          <div style={{ color: 'var(--text-muted)', marginTop: '8px', fontSize: '11px' }}>
            ...dan {(blobBuffer.length - 1024).toLocaleString()} bytes lainnya.
          </div>
        )}
      </div>
    );
  };

  const handleFormatJson = () => {
    try {
      const parsed = JSON.parse(value);
      setValue(JSON.stringify(parsed, null, 2));
      setJsonError(null);
    } catch (err: any) {
      setJsonError(`Invalid JSON: ${err.message}`);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(value);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  // Upload new file to BLOB column
  const handleUploadBlobFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const buffer = event.target?.result as ArrayBuffer;
      const bytes = new Uint8Array(buffer);
      setBlobBuffer(bytes);

      const res = updateCellValueWithKeys(dbId, tableName, whereKeys, column.name, bytes);
      if (res.success) {
        showToast('success', 'File BLOB berhasil disimpan.');
        onSaved();
      } else {
        showToast('error', `Gagal menyimpan file BLOB: ${res.error}`);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleClearBlob = () => {
    setBlobBuffer(null);
    const res = updateCellValueWithKeys(dbId, tableName, whereKeys, column.name, null);
    if (res.success) {
      showToast('success', 'Data BLOB berhasil dikosongkan.');
      onSaved();
    } else {
      showToast('error', `Gagal mengosongkan BLOB: ${res.error}`);
    }
  };

  const handleSave = () => {
    let finalValue: any = value;
    if (value.trim().startsWith('{') || value.trim().startsWith('[')) {
      try {
        JSON.parse(value);
        setJsonError(null);
      } catch (err: any) {
        setJsonError(`Warning: Format JSON tidak valid (${err.message}). Simpan tetap dilanjutkan.`);
      }
    }

    const res = updateCellValueWithKeys(dbId, tableName, whereKeys, column.name, finalValue);
    if (res.success) {
      showToast('success', 'Perubahan berhasil disimpan.');
      onSaved();
      onClose();
    } else {
      showToast('error', `Gagal menyimpan: ${res.error}`);
    }
  };

  const handleDownloadBlob = () => {
    if (!blobBuffer) return;
    const blob = new Blob([blobBuffer as any], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${tableName}_${column.name}_blob.bin`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const rowKeyDisplay = Object.entries(whereKeys).map(([k, v]) => `${k}=${v}`).join(', ');

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <div className="drawer-panel" onClick={(e) => e.stopPropagation()}>
        {/* Drawer Header */}
        <div className="drawer-header">
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className="drawer-title">{column.name}</span>
              <span className="badge badge-count font-mono">{column.type}</span>
            </div>
            <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
              Tabel: <b style={{ color: 'var(--text-secondary)' }}>{tableName}</b> • Baris: <b style={{ color: 'var(--accent-light)' }}>{rowKeyDisplay}</b>
            </p>
          </div>
          <button className="btn btn-ghost" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {/* Drawer Content */}
        <div className="drawer-body">
          {isBlob ? (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>
                  BLOB INSPECTOR {blobBuffer ? `(${blobBuffer.length.toLocaleString()} bytes)` : '(NULL)'}
                </span>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <label className="btn btn-sm btn-primary" style={{ cursor: 'pointer' }}>
                    <Upload size={12} /> Upload File
                    <input type="file" onChange={handleUploadBlobFile} style={{ display: 'none' }} />
                  </label>
                  {blobBuffer && (
                    <button className="btn btn-sm btn-outline" onClick={handleDownloadBlob} title="Download file binary">
                      <Download size={12} />
                    </button>
                  )}
                  {blobBuffer && (
                    <button className="btn btn-sm btn-danger" onClick={handleClearBlob} title="Set ke NULL">
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>
              </div>

              {isImage && (
                <div style={{ marginBottom: '16px', background: 'var(--bg-input)', padding: '12px', borderRadius: '8px', textAlign: 'center' }}>
                  <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '8px' }}>Image Preview</p>
                  <img src={imageBase64} alt="BLOB Preview" style={{ maxWidth: '100%', maxHeight: '180px', borderRadius: '4px' }} />
                </div>
              )}

              {renderHexView()}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>
                  TEXT / JSON CONTENT
                </span>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button className="btn btn-sm btn-outline" onClick={handleFormatJson} title="Format / Prettify JSON">
                    <FileCode size={13} /> Format JSON
                  </button>
                  <button className="btn btn-sm btn-ghost" onClick={handleCopy} title="Salin teks">
                    {isCopied ? <Check size={13} color="var(--success)" /> : <Copy size={13} />}
                  </button>
                </div>
              </div>

              {jsonError && (
                <div style={{ padding: '8px 12px', borderRadius: '6px', background: 'var(--danger-bg)', border: '1px solid var(--danger-border)', color: 'var(--danger)', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <AlertCircle size={14} />
                  <span>{jsonError}</span>
                </div>
              )}

              <textarea
                className="input-field font-mono"
                style={{
                  flex: 1,
                  minHeight: '340px',
                  resize: 'none',
                  fontSize: '13px',
                  lineHeight: '1.5',
                  backgroundColor: 'var(--bg-input)'
                }}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="Masukkan nilai cell..."
              />
            </div>
          )}
        </div>

        {/* Drawer Footer */}
        <div className="drawer-footer">
          <button className="btn btn-outline" onClick={onClose}>
            Tutup
          </button>
          {!isBlob && (
            <button className="btn btn-primary" onClick={handleSave}>
              <Save size={14} /> Simpan Perubahan
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
