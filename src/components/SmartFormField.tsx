import React, { useState, useMemo } from 'react';
import { 
  Link2, 
  Search, 
  Clock, 
  Calendar,
  Check, 
  X, 
  ChevronDown,
  Sparkles,
  Upload,
  Mail,
  Phone,
  Globe,
  Star,
  Hash,
  DollarSign,
  Edit3,
  ExternalLink
} from 'lucide-react';
import type { ColumnInfo, ForeignKeyInfo } from '../types/database';
import { getRelatedTableRecords, getDistinctColumnValues } from '../services/sqliteEngine';
import { useFeedback } from '../context/useFeedback';

interface SmartFormFieldProps {
  dbId: string;
  tableName: string;
  column: ColumnInfo;
  foreignKey?: ForeignKeyInfo;
  value: any;
  onChange: (newValue: any) => void;
}

export const SmartFormField: React.FC<SmartFormFieldProps> = ({
  dbId,
  tableName,
  column,
  foreignKey,
  value,
  onChange
}) => {
  const { showToast } = useFeedback();
  // 1. Column Type & Semantic Analysis
  const isAutoIncrement = column.pk && column.type.toUpperCase().includes('INT');
  
  // Date & Time classification
  const isPureDate = column.type.toUpperCase() === 'DATE' || (/(_date|birth_date|start_date|end_date|due_date|tanggal)$/i.test(column.name) && !/(_at|_time|timestamp)$/i.test(column.name));
  const isDateTime = !isPureDate && (/date|time/i.test(column.type) || /(_at|_date|timestamp)$/i.test(column.name));
  const isAnyDate = isPureDate || isDateTime;

  // Semantic types
  const isBooleanType = /bool/i.test(column.type) || /^(is_|has_|enable_|aktif)/i.test(column.name);
  const isBlobType = column.type.toUpperCase().includes('BLOB');
  const isJsonType = /json|metadata|specs|settings|config/i.test(column.name);
  const isRatingType = /^(rating|stars|bintang|score)$/i.test(column.name);
  const isEmailType = /email/i.test(column.name);
  const isPhoneType = /^(phone|tel|mobile|no_hp|telepon)$/i.test(column.name);
  const isUrlType = /^(url|website|link|web|avatar_url|image_url)$/i.test(column.name);
  const isColorType = /^(color|theme_color|hex_color|warna)$/i.test(column.name);
  const isCurrencyType = /^(price|balance|total|total_amount|subtotal|unit_price|amount|fee|salary|cost|saldo|harga)$/i.test(column.name);
  const isIntegerType = !column.pk && (column.type.toUpperCase().includes('INT') || /^(quantity|stock|qty|count|order_count|inventory|age|year|tahun|umur|jumlah)$/i.test(column.name));
  const isRealType = /^(real|float|double|decimal|numeric)$/i.test(column.type);
  const isMultilineText = !isJsonType && !isAnyDate && (column.type.toUpperCase() === 'TEXT' || column.type === '') && /^(description|desc|notes|note|comment|komentar|bio|body|review|address|alamat|content|keterangan|pesan|message)$/i.test(column.name);

  // STRICT FILTER: Only suggest chips for true enum/category/status columns
  const isEnumLikeColumn = /^(status|category|role|type|priority|state|gender|tier|level|stage|genre|currency)$/i.test(column.name);

  // States
  const [fkSearch, setFkSearch] = useState('');
  const [isFkOpen, setIsFkOpen] = useState(false);
  const [isManualDateText, setIsManualDateText] = useState(false);

  const fkOptions = useMemo(() => {
    if (foreignKey) {
      return getRelatedTableRecords(dbId, foreignKey.table, foreignKey.to);
    }
    return [];
  }, [dbId, foreignKey]);

  const distinctOptions = useMemo(() => {
    if (!foreignKey && isEnumLikeColumn) {
      return getDistinctColumnValues(dbId, tableName, column.name);
    }
    return [];
  }, [dbId, tableName, column.name, foreignKey, isEnumLikeColumn]);

  // Selected FK Label
  const selectedFkOption = useMemo(() => {
    if (!foreignKey || value === null || value === undefined || value === '') return null;
    return fkOptions.find(opt => String(opt.value) === String(value)) || null;
  }, [fkOptions, foreignKey, value]);

  const filteredFkOptions = useMemo(() => {
    if (!fkSearch.trim()) return fkOptions;
    const q = fkSearch.toLowerCase();
    return fkOptions.filter(opt => 
      opt.label.toLowerCase().includes(q) || 
      String(opt.value).toLowerCase().includes(q) ||
      (opt.detail && opt.detail.toLowerCase().includes(q))
    );
  }, [fkOptions, fkSearch]);

  // Strict Number Keystroke Prevention
  const handleNumberKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, allowDecimal: boolean, allowNegative: boolean) => {
    // Navigation / Edit controls
    if (['Backspace', 'Delete', 'Tab', 'Escape', 'Enter', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key)) {
      return;
    }
    // Clipboard / Select shortcuts (Ctrl/Cmd + C, V, A, X)
    if (e.ctrlKey || e.metaKey) {
      return;
    }
    // Minus sign
    if (allowNegative && e.key === '-' && !e.currentTarget.value.includes('-') && e.currentTarget.selectionStart === 0) {
      return;
    }
    // Decimal point
    if (allowDecimal && (e.key === '.' || e.key === ',') && !e.currentTarget.value.includes('.')) {
      return;
    }
    // BLOCK ALL LETTERS AND OTHER CHARACTERS
    if (!/^\d$/.test(e.key)) {
      e.preventDefault();
    }
  };

  const handleNumberPaste = (e: React.ClipboardEvent<HTMLInputElement>, allowDecimal: boolean, allowNegative: boolean) => {
    e.preventDefault();
    const text = e.clipboardData.getData('text').trim();
    const regex = allowDecimal ? (allowNegative ? /[^\d.-]/g : /[^\d.]/g) : (allowNegative ? /[^\d-]/g : /\D/g);
    const sanitized = text.replace(regex, '');
    if (sanitized === '' || sanitized === '-') {
      onChange(null);
    } else {
      const num = allowDecimal ? parseFloat(sanitized) : parseInt(sanitized, 10);
      onChange(isNaN(num) ? null : num);
    }
  };

  // Date Formatting Helpers
  const formatToDateTimeLocal = (val: any): string => {
    if (val === null || val === undefined || val === '') return '';
    const str = String(val).trim();
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(str)) {
      return str.slice(0, 16);
    }
    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(str)) {
      return str.replace(' ', 'T').slice(0, 16);
    }
    const d = new Date(str);
    if (!isNaN(d.getTime())) {
      const pad = (n: number) => n.toString().padStart(2, '0');
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }
    return '';
  };

  const formatToDateOnly = (val: any): string => {
    if (val === null || val === undefined || val === '') return '';
    const str = String(val).trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
      return str.slice(0, 10);
    }
    const d = new Date(str);
    if (!isNaN(d.getTime())) {
      const pad = (n: number) => n.toString().padStart(2, '0');
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    }
    return '';
  };

  const handleSetCurrentTimestamp = () => {
    const now = new Date();
    const pad = (n: number) => n.toString().padStart(2, '0');
    const formatted = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
    onChange(formatted);
  };

  const handleSetTodayDate = () => {
    const now = new Date();
    const pad = (n: number) => n.toString().padStart(2, '0');
    const formatted = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    onChange(formatted);
  };

  // Handle BLOB file selection in form
  const handleBlobFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const buffer = event.target?.result as ArrayBuffer;
      onChange(new Uint8Array(buffer));
    };
    reader.readAsArrayBuffer(file);
  };

  // 1. AUTO INCREMENT PK
  if (isAutoIncrement) {
    return (
      <input
        disabled
        className="input-field"
        style={{ width: '100%', opacity: 0.6 }}
        placeholder="(Auto Increment / Dihasilkan Otomatis)"
      />
    );
  }

  // 2. FOREIGN KEY SEARCHABLE PICKER
  if (foreignKey) {
    return (
      <div style={{ position: 'relative' }}>
        <div
          onClick={() => setIsFkOpen(!isFkOpen)}
          style={{
            backgroundColor: 'var(--bg-input)',
            border: `1px solid ${isFkOpen ? 'var(--border-focus)' : 'var(--border-subtle)'}`,
            borderRadius: '8px',
            padding: '8px 12px',
            minHeight: '40px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            cursor: 'pointer',
            transition: 'all 0.15s'
          }}
        >
          {selectedFkOption ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flex: 1 }}>
              <span className="badge" style={{ background: 'rgba(99, 102, 241, 0.2)', color: 'var(--accent-light)', fontSize: '11px' }}>
                ID: {selectedFkOption.value}
              </span>
              <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {selectedFkOption.label}
              </span>
              {selectedFkOption.detail && (
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  ({selectedFkOption.detail})
                </span>
              )}
            </div>
          ) : value !== '' && value !== null && value !== undefined ? (
            <span style={{ fontSize: '13px', color: 'var(--text-primary)' }}>ID: {String(value)}</span>
          ) : (
            <span style={{ fontSize: '13px', color: 'var(--text-dim)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Link2 size={13} color="var(--accent-light)" />
              <span>Cari relasi ke {foreignKey.table}...</span>
            </span>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            {value !== '' && value !== null && value !== undefined && (
              <button
                type="button"
                className="btn btn-ghost"
                style={{ padding: '2px' }}
                onClick={(e) => {
                  e.stopPropagation();
                  onChange(null);
                }}
                title="Hapus Relasi"
              >
                <X size={13} color="var(--text-muted)" />
              </button>
            )}
            <ChevronDown size={14} color="var(--text-muted)" />
          </div>
        </div>

        {isFkOpen && (
          <div
            style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              right: 0,
              marginTop: '4px',
              backgroundColor: 'var(--bg-surface-elevated)',
              border: '1px solid var(--border-default)',
              borderRadius: '8px',
              boxShadow: '0 10px 25px rgba(0, 0, 0, 0.5)',
              zIndex: 100,
              maxHeight: '260px',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden'
            }}
          >
            <div style={{ padding: '8px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', gap: '6px', background: 'var(--bg-sidebar)' }}>
              <Search size={13} color="var(--text-muted)" />
              <input
                autoFocus
                className="input-field"
                style={{ flex: 1, padding: '6px 8px', fontSize: '13px' }}
                placeholder={`Cari nama, ID, atau judul di tabel ${foreignKey.table}...`}
                value={fkSearch}
                onChange={(e) => setFkSearch(e.target.value)}
              />
            </div>

            <div style={{ overflowY: 'auto', flex: 1, padding: '4px' }}>
              {filteredFkOptions.length === 0 ? (
                <div style={{ padding: '16px', textAlign: 'center', fontSize: '12px', color: 'var(--text-muted)' }}>
                  Tidak ada record cocok di tabel {foreignKey.table}.
                </div>
              ) : (
                filteredFkOptions.map((opt) => (
                  <div
                    key={String(opt.value)}
                    onClick={() => {
                      onChange(opt.value);
                      setIsFkOpen(false);
                      setFkSearch('');
                    }}
                    style={{
                      padding: '8px 10px',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      backgroundColor: String(opt.value) === String(value) ? 'rgba(99, 102, 241, 0.15)' : 'transparent',
                      transition: 'background-color 0.1s'
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-surface-hover)')}
                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = String(opt.value) === String(value) ? 'rgba(99, 102, 241, 0.15)' : 'transparent')}
                  >
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>
                        {opt.label}
                      </div>
                      {opt.detail && (
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                          {opt.detail}
                        </div>
                      )}
                    </div>
                    <span className="badge font-mono" style={{ fontSize: '10px', background: 'var(--bg-input)' }}>
                      ID: {opt.value}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  // 3. BOOLEAN TOGGLE SWITCH (Interactive iOS / SaaS Toggle Switch)
  if (isBooleanType) {
    const isTrue = value === 1 || value === true || value === '1' || value === 'true';
    const isNull = value === null || value === undefined || value === '';

    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px', minHeight: '40px' }}>
        <button
          type="button"
          role="switch"
          aria-checked={isTrue}
          onClick={() => onChange(isTrue ? 0 : 1)}
          style={{
            width: '46px',
            height: '24px',
            borderRadius: '9999px',
            backgroundColor: isTrue ? 'var(--success)' : 'var(--bg-surface-elevated)',
            border: `1px solid ${isTrue ? 'var(--success)' : 'var(--border-default)'}`,
            position: 'relative',
            cursor: 'pointer',
            transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
            display: 'flex',
            alignItems: 'center',
            padding: '2px',
            boxShadow: isTrue ? '0 0 10px rgba(16, 185, 129, 0.3)' : 'none',
            outline: 'none'
          }}
        >
          <div
            style={{
              width: '18px',
              height: '18px',
              borderRadius: '50%',
              backgroundColor: '#ffffff',
              transform: isTrue ? 'translateX(22px)' : 'translateX(2px)',
              transition: 'transform 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
              boxShadow: '0 2px 4px rgba(0,0,0,0.4)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            {isTrue ? (
              <Check size={10} color="var(--success)" strokeWidth={3} />
            ) : (
              <X size={10} color="#64748b" strokeWidth={3} />
            )}
          </div>
        </button>

        <span
          onClick={() => onChange(isTrue ? 0 : 1)}
          style={{
            fontSize: '13px',
            fontWeight: 600,
            cursor: 'pointer',
            color: isNull ? 'var(--text-dim)' : isTrue ? 'var(--success)' : 'var(--text-muted)',
            userSelect: 'none'
          }}
        >
          {isNull ? 'Belum ditentukan (NULL)' : isTrue ? 'TRUE (Aktif)' : 'FALSE (Nonaktif)'}
        </span>

        {!column.notnull && (
          <button
            type="button"
            className="btn btn-sm btn-ghost"
            onClick={() => onChange(null)}
            title="Set nilai ke NULL"
            style={{
              fontSize: '11px',
              color: isNull ? 'var(--warning)' : 'var(--text-muted)',
              background: isNull ? 'var(--warning-bg)' : 'transparent',
              border: isNull ? '1px solid var(--warning-border)' : '1px solid transparent',
              padding: '2px 8px',
              borderRadius: '4px'
            }}
          >
            {isNull ? 'Nilai NULL' : 'Set NULL'}
          </button>
        )}
      </div>
    );
  }

  // 4. DATE PICKER / DATETIME-LOCAL PICKER (INTERACTIVE CALENDAR)
  if (isAnyDate) {
    return (
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {isManualDateText ? (
            <input
              className="input-field font-mono"
              style={{ flex: 1, minHeight: '40px', fontSize: '13px' }}
              placeholder={isPureDate ? "YYYY-MM-DD" : "YYYY-MM-DD HH:MM:SS"}
              value={value === null || value === undefined ? '' : String(value)}
              onChange={(e) => onChange(e.target.value)}
            />
          ) : isPureDate ? (
            <input
              type="date"
              className="input-field font-mono"
              style={{ flex: 1, minHeight: '40px', fontSize: '13px' }}
              value={formatToDateOnly(value)}
              onChange={(e) => onChange(e.target.value ? e.target.value : null)}
            />
          ) : (
            <input
              type="datetime-local"
              className="input-field font-mono"
              style={{ flex: 1, minHeight: '40px', fontSize: '13px' }}
              value={formatToDateTimeLocal(value)}
              onChange={(e) => {
                if (!e.target.value) {
                  onChange(null);
                } else {
                  const val = e.target.value.replace('T', ' ');
                  onChange(val.length === 16 ? `${val}:00` : val);
                }
              }}
            />
          )}

          {/* Quick Shortcuts */}
          {isPureDate ? (
            <button
              type="button"
              className="btn btn-sm btn-secondary"
              onClick={handleSetTodayDate}
              title="Isi dengan tanggal hari ini"
              style={{ minHeight: '40px', whiteSpace: 'nowrap' }}
            >
              <Calendar size={13} color="var(--accent-light)" />
              <span>Hari Ini</span>
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-sm btn-secondary"
              onClick={handleSetCurrentTimestamp}
              title="Isi waktu saat ini otomatis"
              style={{ minHeight: '40px', whiteSpace: 'nowrap' }}
            >
              <Clock size={13} color="var(--accent-light)" />
              <span>Sekarang</span>
            </button>
          )}

          {/* Clear to NULL if nullable */}
          {!column.notnull && value !== null && value !== undefined && value !== '' && (
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              onClick={() => onChange(null)}
              title="Kosongkan (NULL)"
              style={{ minHeight: '40px', padding: '6px' }}
            >
              <X size={14} color="var(--text-muted)" />
            </button>
          )}

          {/* Toggle Manual Text Input */}
          <button
            type="button"
            className="btn btn-sm btn-ghost"
            onClick={() => setIsManualDateText(!isManualDateText)}
            title={isManualDateText ? "Gunakan Kalender / Date Picker" : "Ketik Teks / Format Kustom Manual"}
            style={{ minHeight: '40px', padding: '6px' }}
          >
            <Edit3 size={13} color={isManualDateText ? 'var(--accent-light)' : 'var(--text-dim)'} />
          </button>
        </div>
      </div>
    );
  }

  // 5. RATING SELECTOR (1 to 5 Stars)
  if (isRatingType) {
    const numVal = Number(value) || 0;
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minHeight: '40px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          {[1, 2, 3, 4, 5].map((star) => (
            <button
              key={star}
              type="button"
              className="btn btn-ghost"
              style={{ padding: '4px', cursor: 'pointer' }}
              onClick={() => onChange(star)}
              title={`Rating ${star} / 5`}
            >
              <Star
                size={22}
                color={numVal >= star ? '#f59e0b' : 'var(--text-muted)'}
                fill={numVal >= star ? '#f59e0b' : 'none'}
              />
            </button>
          ))}
        </div>
        <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', minWidth: '90px' }}>
          {numVal > 0 ? `${numVal} / 5 Bintang` : '(Belum dinilai)'}
        </span>
        {numVal > 0 && !column.notnull && (
          <button
            type="button"
            className="btn btn-sm btn-ghost"
            style={{ fontSize: '11px', color: 'var(--text-muted)' }}
            onClick={() => onChange(null)}
          >
            Reset
          </button>
        )}
      </div>
    );
  }

  // 6. BLOB INPUT (File Picker / Clean Status)
  if (isBlobType) {
    const hasBlob = value instanceof Uint8Array || (typeof value === 'object' && value !== null && 'length' in value);
    const blobSize = hasBlob ? (value.length || 0) : 0;

    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minHeight: '40px' }}>
        <label className="btn btn-sm btn-secondary" style={{ cursor: 'pointer', minHeight: '38px' }}>
          <Upload size={13} />
          <span>{hasBlob ? `Ganti File (${blobSize} bytes)` : 'Pilih File Binary/Gambar'}</span>
          <input type="file" onChange={handleBlobFilePick} style={{ display: 'none' }} />
        </label>
        {hasBlob && (
          <button
            type="button"
            className="btn btn-sm btn-ghost"
            style={{ color: 'var(--danger)', fontSize: '11px' }}
            onClick={() => onChange(null)}
          >
            Kosongkan (NULL)
          </button>
        )}
      </div>
    );
  }

  // 7. JSON / METADATA
  if (isJsonType) {
    const handleFormatJson = () => {
      try {
        if (!value) return;
        const parsed = typeof value === 'object' ? value : JSON.parse(value);
        onChange(JSON.stringify(parsed, null, 2));
        showToast('success', 'Format JSON berhasil dirapikan.');
      } catch {
        showToast('warning', 'Format JSON tidak valid!');
      }
    };

    return (
      <div>
        <div style={{ position: 'relative' }}>
          <textarea
            className="input-field font-mono"
            style={{ width: '100%', minHeight: '74px', fontSize: '12px', resize: 'vertical' }}
            placeholder='{"key": "value"} (Opsional)'
            value={value === null || value === undefined ? '' : typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value)}
            onChange={(e) => onChange(e.target.value)}
          />
          {value && (
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              style={{ position: 'absolute', top: '6px', right: '6px', fontSize: '11px', padding: '2px 6px' }}
              onClick={handleFormatJson}
              title="Rapikan Format JSON"
            >
              Format JSON
            </button>
          )}
        </div>
      </div>
    );
  }

  // 8. MULTILINE TEXTAREA (Description, Notes, Comments, Address)
  if (isMultilineText) {
    return (
      <textarea
        rows={3}
        className="input-field"
        style={{ width: '100%', minHeight: '72px', fontSize: '13px', resize: 'vertical', lineHeight: '1.5' }}
        placeholder={column.notnull ? 'Wajib diisi...' : 'Tulis teks / catatan lengkap (Opsional)...'}
        value={value === null || value === undefined ? '' : String(value)}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }

  // 9. EMAIL FIELD
  if (isEmailType) {
    const isValidEmail = !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value));
    return (
      <div>
        <div className="input-with-icon">
          <div className="input-icon-left">
            <Mail size={14} color={value && !isValidEmail ? 'var(--danger)' : 'var(--text-muted)'} />
          </div>
          <input
            type="email"
            className="input-field"
            style={{
              width: '100%',
              minHeight: '40px',
              fontSize: '14px',
              borderColor: value && !isValidEmail ? 'var(--danger)' : undefined
            }}
            placeholder="nama@email.com"
            value={value === null || value === undefined ? '' : String(value)}
            onChange={(e) => onChange(e.target.value)}
          />
        </div>
        {value && !isValidEmail && (
          <span style={{ fontSize: '11px', color: 'var(--danger)', marginTop: '3px', display: 'block' }}>
            Format email belum valid (contoh: user@domain.com)
          </span>
        )}
      </div>
    );
  }

  // 10. PHONE FIELD
  if (isPhoneType) {
    return (
      <div className="input-with-icon">
        <div className="input-icon-left">
          <Phone size={14} />
        </div>
        <input
          type="tel"
          inputMode="tel"
          className="input-field font-mono"
          style={{ width: '100%', minHeight: '40px', fontSize: '14px' }}
          placeholder="+62 812 3456 789"
          value={value === null || value === undefined ? '' : String(value)}
          onKeyDown={(e) => {
            if (['Backspace', 'Delete', 'Tab', 'Escape', 'Enter', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
            if (e.ctrlKey || e.metaKey) return;
            if (!/[\d+\-()\s]/.test(e.key)) e.preventDefault();
          }}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
    );
  }

  // 11. URL FIELD
  if (isUrlType) {
    const hasValidUrl = typeof value === 'string' && (value.startsWith('http://') || value.startsWith('https://'));
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <div className="input-with-icon" style={{ flex: 1 }}>
          <div className="input-icon-left">
            <Globe size={14} />
          </div>
          <input
            type="url"
            className="input-field"
            style={{ width: '100%', minHeight: '40px', fontSize: '14px' }}
            placeholder="https://example.com/file.jpg"
            value={value === null || value === undefined ? '' : String(value)}
            onChange={(e) => onChange(e.target.value)}
          />
        </div>
        {hasValidUrl && (
          <a
            href={value}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-sm btn-outline"
            style={{ minHeight: '40px', padding: '0 10px', display: 'flex', alignItems: 'center' }}
            title="Buka tautan di tab baru"
          >
            <ExternalLink size={13} />
          </a>
        )}
      </div>
    );
  }

  // 12. COLOR PICKER
  if (isColorType) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <input
          type="color"
          value={value ? String(value) : '#6366f1'}
          onChange={(e) => onChange(e.target.value)}
          style={{ width: '40px', height: '40px', padding: '2px', border: '1px solid var(--border-subtle)', borderRadius: '8px', cursor: 'pointer', background: 'transparent' }}
        />
        <input
          className="input-field font-mono"
          style={{ flex: 1, minHeight: '40px', fontSize: '13px' }}
          placeholder="#6366f1"
          value={value === null || value === undefined ? '' : String(value)}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
    );
  }

  // 13. CURRENCY / PRICE / BALANCE (Floating Point with Strict Key Block)
  if (isCurrencyType) {
    return (
      <div className="input-with-icon">
        <div className="input-icon-left">
          <DollarSign size={14} />
        </div>
        <input
          type="text"
          inputMode="decimal"
          className="input-field font-mono"
          style={{ width: '100%', minHeight: '40px', fontSize: '14px' }}
          placeholder="0.00"
          value={value === null || value === undefined ? '' : String(value)}
          onKeyDown={(e) => handleNumberKeyDown(e, true, false)}
          onPaste={(e) => handleNumberPaste(e, true, false)}
          onChange={(e) => {
            const val = e.target.value.replace(/,/g, '.');
            if (val === '') {
              onChange(null);
            } else if (/^\d*\.?\d*$/.test(val)) {
              onChange(val);
            }
          }}
          onBlur={(e) => {
            const val = e.target.value;
            if (val !== '') {
              const num = parseFloat(val);
              onChange(isNaN(num) ? null : num);
            }
          }}
        />
      </div>
    );
  }

  // 14. INTEGER / QUANTITY / STOCK / COUNTS (Integer with Strict Key Block)
  if (isIntegerType) {
    const isUnsigned = /^(quantity|stock|qty|count|order_count|inventory|age|year|tahun|umur|jumlah)$/i.test(column.name);
    return (
      <div className="input-with-icon">
        <div className="input-icon-left">
          <Hash size={14} />
        </div>
        <input
          type="text"
          inputMode="numeric"
          className="input-field font-mono"
          style={{ width: '100%', minHeight: '40px', fontSize: '14px' }}
          placeholder="0"
          value={value === null || value === undefined ? '' : String(value)}
          onKeyDown={(e) => handleNumberKeyDown(e, false, !isUnsigned)}
          onPaste={(e) => handleNumberPaste(e, false, !isUnsigned)}
          onChange={(e) => {
            const val = e.target.value;
            if (val === '' || (!isUnsigned && val === '-')) {
              onChange(null);
            } else if (isUnsigned ? /^\d+$/.test(val) : /^-?\d+$/.test(val)) {
              onChange(parseInt(val, 10));
            }
          }}
        />
      </div>
    );
  }

  // 15. REAL / FLOAT / DECIMAL (Decimals with Strict Key Block)
  if (isRealType) {
    return (
      <div className="input-with-icon">
        <div className="input-icon-left">
          <Hash size={14} />
        </div>
        <input
          type="text"
          inputMode="decimal"
          className="input-field font-mono"
          style={{ width: '100%', minHeight: '40px', fontSize: '14px' }}
          placeholder="0.00"
          value={value === null || value === undefined ? '' : String(value)}
          onKeyDown={(e) => handleNumberKeyDown(e, true, true)}
          onPaste={(e) => handleNumberPaste(e, true, true)}
          onChange={(e) => {
            const val = e.target.value.replace(/,/g, '.');
            if (val === '' || val === '-') {
              onChange(null);
            } else if (/^-?\d*\.?\d*$/.test(val)) {
              onChange(val);
            }
          }}
          onBlur={(e) => {
            const val = e.target.value;
            if (val !== '' && val !== '-') {
              const num = parseFloat(val);
              onChange(isNaN(num) ? null : num);
            }
          }}
        />
      </div>
    );
  }

  // 16. STANDARD INPUT (With Enum/Category Chips if applicable)
  return (
    <div>
      <input
        className="input-field"
        style={{ width: '100%', minHeight: '40px', fontSize: '14px' }}
        placeholder={column.notnull ? 'Wajib diisi' : 'Opsional (NULL jika kosong)'}
        value={value === null || value === undefined ? '' : String(value)}
        onChange={(e) => onChange(e.target.value)}
      />

      {/* Chips ONLY shown when column is truly status / category / role */}
      {isEnumLikeColumn && distinctOptions.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px', marginTop: '6px' }}>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '3px' }}>
            <Sparkles size={11} color="var(--accent-light)" /> Pilihan:
          </span>
          {distinctOptions.map((opt) => (
            <button
              key={opt}
              type="button"
              className="badge"
              style={{
                cursor: 'pointer',
                background: String(value) === opt ? 'var(--accent-primary)' : 'var(--bg-input)',
                color: String(value) === opt ? '#ffffff' : 'var(--text-secondary)',
                border: '1px solid var(--border-subtle)',
                fontSize: '11px',
                padding: '3px 8px'
              }}
              onClick={() => onChange(opt)}
            >
              {opt}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
