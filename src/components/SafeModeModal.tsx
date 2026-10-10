import React from 'react';
import { AlertTriangle, ShieldAlert, X } from 'lucide-react';
import type { SafeGuardAlert } from '../types/database';

interface SafeModeModalProps {
  alert: SafeGuardAlert | null;
  onCancel: () => void;
  onConfirm: () => void;
}

export const SafeModeModal: React.FC<SafeModeModalProps> = ({
  alert,
  onCancel,
  onConfirm
}) => {
  if (!alert) return null;

  return (
    <div className="modal-backdrop">
      <div className="modal-content" style={{ borderColor: 'var(--danger-border)', width: '540px' }}>
        <div className="modal-header" style={{ background: 'var(--danger-bg)', borderBottomColor: 'var(--danger-border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <ShieldAlert size={20} color="var(--danger)" />
            <h3 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--danger)' }}>
              Peringatan Safe Mode: Query Berbahaya Terdeteksi!
            </h3>
          </div>
          <button className="btn btn-ghost" onClick={onCancel}>
            <X size={16} />
          </button>
        </div>

        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <p style={{ fontSize: '13px', color: 'var(--text-primary)' }}>
            Anda mencoba menjalankan perintah <b>{alert.statementType}</b> pada tabel <code style={{ color: 'var(--accent-light)' }}>{alert.tableName}</code> <b>tanpa klausa WHERE</b>!
          </p>

          <div style={{ padding: '12px', background: 'var(--bg-input)', borderRadius: '6px', border: '1px solid var(--border-subtle)', fontFamily: 'var(--font-mono)', fontSize: '12.5px', color: '#f87171', overflowX: 'auto' }}>
            {alert.query}
          </div>

          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', padding: '10px 12px', borderRadius: '6px', background: 'rgba(239, 68, 68, 0.08)', border: '1px solid var(--danger-border)', fontSize: '12px', color: 'var(--text-secondary)' }}>
            <AlertTriangle size={16} color="var(--danger)" style={{ flexShrink: 0, marginTop: '2px' }} />
            <span>
              Perintah ini berpotensi <b>mengubah atau menghapus SELURUH record</b> dalam tabel tersebut tanpa dapat dibatalkan jika sudah di-commit ke file asli.
            </span>
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn btn-outline" onClick={onCancel}>
            Batalkan Eksekusi
          </button>
          <button className="btn btn-danger" onClick={onConfirm}>
            Saya Mengerti, Tetap Jalankan
          </button>
        </div>
      </div>
    </div>
  );
};
