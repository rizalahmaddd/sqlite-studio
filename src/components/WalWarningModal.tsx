import React from 'react';
import { AlertCircle, RotateCcw, X } from 'lucide-react';

interface WalWarningModalProps {
  isOpen: boolean;
  dbName: string;
  onClose: () => void;
  onRunCheckpoint: () => void;
}

export const WalWarningModal: React.FC<WalWarningModalProps> = ({
  isOpen,
  dbName,
  onClose,
  onRunCheckpoint
}) => {
  if (!isOpen) return null;

  return (
    <div className="modal-backdrop">
      <div className="modal-content" style={{ borderColor: 'var(--warning-border)', width: '520px' }}>
        <div className="modal-header" style={{ background: 'var(--warning-bg)', borderBottomColor: 'var(--warning-border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <AlertCircle size={20} color="var(--warning)" />
            <h3 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--warning)' }}>
              Mode WAL Terdeteksi pada {dbName}
            </h3>
          </div>
          <button className="btn btn-ghost" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '13px' }}>
          <p style={{ color: 'var(--text-primary)' }}>
            Header file database ini menunjukkan penggunaan mode <b>Write-Ahead Logging (WAL)</b>.
          </p>
          <p style={{ color: 'var(--text-secondary)', lineHeight: '1.5' }}>
            Pada mode WAL, perubahan data terakhir biasanya disimpan pada file pendamping <code style={{ color: 'var(--accent-light)' }}>{dbName}-wal</code>. Jika Anda membuka file <code style={{ color: 'var(--accent-light)' }}>.db</code> saja tanpa menggabungkan log WAL, beberapa baris data baru mungkin belum tercermin.
          </p>
          <div style={{ padding: '10px 12px', background: 'var(--bg-input)', borderRadius: '6px', border: '1px solid var(--border-subtle)', color: 'var(--text-muted)', fontSize: '12px' }}>
            💡 <b>Rekomendasi:</b> Anda dapat menjalankan perintah <code>PRAGMA wal_checkpoint(FULL)</code> untuk menggabungkan seluruh transaksi ke file utama sekarang.
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn btn-outline" onClick={onClose}>
            Tutup & Lanjutkan
          </button>
          <button
            className="btn btn-primary"
            onClick={() => {
              onRunCheckpoint();
              onClose();
            }}
          >
            <RotateCcw size={14} />
            <span>Jalankan Checkpoint Sekarang</span>
          </button>
        </div>
      </div>
    </div>
  );
};
