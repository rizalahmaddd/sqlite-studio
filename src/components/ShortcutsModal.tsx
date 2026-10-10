import React from 'react';
import { Keyboard, X } from 'lucide-react';

interface ShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ShortcutsModal: React.FC<ShortcutsModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  const shortcuts = [
    { key: 'Cmd/Ctrl + Enter', desc: 'Jalankan query SQL di SQL Editor' },
    { key: 'Double Click Cell', desc: 'Edit langsung nilai cell di tabel data' },
    { key: 'Enter (saat edit)', desc: 'Simpan perubahan cell' },
    { key: 'Esc (saat edit)', desc: 'Batalkan perubahan cell' },
    { key: 'Cmd/Ctrl + K', desc: 'Buka modal panduan pintasan keyboard ini' },
  ];

  return (
    <div className="modal-backdrop">
      <div className="modal-content" style={{ width: '480px' }}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Keyboard size={18} color="var(--accent-light)" />
            <h3 style={{ fontSize: '15px', fontWeight: 600 }}>Pintasan Keyboard (Shortcuts)</h3>
          </div>
          <button className="btn btn-ghost" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {shortcuts.map((s, idx) => (
            <div
              key={idx}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '8px 12px',
                borderRadius: '6px',
                background: 'var(--bg-input)',
                border: '1px solid var(--border-subtle)'
              }}
            >
              <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{s.desc}</span>
              <kbd style={{
                padding: '3px 8px',
                background: 'var(--bg-surface-elevated)',
                border: '1px solid var(--border-default)',
                borderRadius: '4px',
                fontFamily: 'var(--font-mono)',
                fontSize: '11px',
                color: 'var(--text-primary)'
              }}>
                {s.key}
              </kbd>
            </div>
          ))}
        </div>

        <div className="modal-footer">
          <button className="btn btn-primary" onClick={onClose}>
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
};
