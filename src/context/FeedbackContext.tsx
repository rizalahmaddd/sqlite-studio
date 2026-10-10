import React, { useState, useCallback, useRef, useEffect } from 'react';
import { 
  CheckCircle2, 
  AlertCircle, 
  AlertTriangle, 
  Info, 
  X,
  HelpCircle
} from 'lucide-react';
import { 
  FeedbackContext,
  type ToastType, 
  type ToastItem, 
  type ConfirmDialogOptions, 
  type AlertDialogOptions 
} from './feedbackContextDef';

export type { ToastType, ToastItem, ConfirmDialogOptions, AlertDialogOptions };

// --- Provider Component ---
export const FeedbackProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Toast State
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  // Dialog State
  const [dialogState, setDialogState] = useState<{
    isOpen: boolean;
    isConfirm: boolean;
    title: string;
    message: string;
    confirmText: string;
    cancelText: string;
    type: 'danger' | 'warning' | 'info' | 'error';
  }>({
    isOpen: false,
    isConfirm: false,
    title: '',
    message: '',
    confirmText: 'OK',
    cancelText: 'Batal',
    type: 'info'
  });

  const confirmButtonRef = useRef<HTMLButtonElement>(null);
  const resolveRef = useRef<((val: boolean) => void) | null>(null);

  // 1. Toast Implementation
  const showToast = useCallback((type: ToastType, message: string, title?: string, duration = 4000) => {
    const id = 'toast-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7);
    const newToast: ToastItem = { id, type, message, title, duration };

    setToasts(prev => [...prev.slice(-4), newToast]); // Keep max 5 toasts

    if (duration > 0) {
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== id));
      }, duration);
    }
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  // 2. Confirm Dialog Implementation
  const confirm = useCallback((options: ConfirmDialogOptions): Promise<boolean> => {
    return new Promise(resolve => {
      resolveRef.current = resolve;
      setDialogState({
        isOpen: true,
        isConfirm: true,
        title: options.title,
        message: options.message,
        confirmText: options.confirmText || 'Konfirmasi',
        cancelText: options.cancelText || 'Batal',
        type: options.type || 'danger'
      });
    });
  }, []);

  // 3. Alert Dialog Implementation
  const alert = useCallback((options: AlertDialogOptions | string): Promise<void> => {
    return new Promise(resolve => {
      const isString = typeof options === 'string';
      const title = isString ? 'Perhatian' : options.title;
      const message = isString ? options : options.message;
      const type = isString ? 'info' : (options.type || 'info');
      const confirmText = isString ? 'Mengerti' : (options.confirmText || 'Mengerti');

      resolveRef.current = () => resolve();
      setDialogState({
        isOpen: true,
        isConfirm: false,
        title,
        message,
        confirmText,
        cancelText: 'Tutup',
        type
      });
    });
  }, []);

  // Handle Dialog Responses
  const handleDialogConfirm = useCallback(() => {
    if (resolveRef.current) {
      resolveRef.current(true);
      resolveRef.current = null;
    }
    setDialogState(prev => ({ ...prev, isOpen: false }));
  }, []);

  const handleDialogCancel = useCallback(() => {
    if (resolveRef.current) {
      resolveRef.current(false);
      resolveRef.current = null;
    }
    setDialogState(prev => ({ ...prev, isOpen: false }));
  }, []);

  // Keyboard shortcut for dialog
  useEffect(() => {
    if (!dialogState.isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        handleDialogCancel();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        handleDialogConfirm();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    // Auto-focus confirm button
    setTimeout(() => confirmButtonRef.current?.focus(), 50);

    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [dialogState.isOpen, handleDialogConfirm, handleDialogCancel]);

  return (
    <FeedbackContext.Provider value={{ showToast, confirm, alert }}>
      {children}

      {/* --- Toast Container --- */}
      <div 
        className="toast-container" 
        style={{
          position: 'fixed',
          top: '20px',
          right: '20px',
          zIndex: 99999,
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
          pointerEvents: 'none',
          maxWidth: '420px',
          width: 'calc(100vw - 32px)'
        }}
      >
        {toasts.map(toast => {
          const typeColors = {
            success: {
              border: 'rgba(16, 185, 129, 0.4)',
              bg: 'rgba(6, 78, 59, 0.92)',
              icon: <CheckCircle2 size={19} color="#34d399" style={{ flexShrink: 0 }} />,
              defaultTitle: 'Berhasil'
            },
            error: {
              border: 'rgba(239, 68, 68, 0.45)',
              bg: 'rgba(127, 29, 29, 0.94)',
              icon: <AlertCircle size={19} color="#f87171" style={{ flexShrink: 0 }} />,
              defaultTitle: 'Terjadi Kesalahan'
            },
            warning: {
              border: 'rgba(245, 158, 11, 0.4)',
              bg: 'rgba(120, 53, 15, 0.92)',
              icon: <AlertTriangle size={19} color="#fbbf24" style={{ flexShrink: 0 }} />,
              defaultTitle: 'Peringatan'
            },
            info: {
              border: 'rgba(99, 102, 241, 0.4)',
              bg: 'rgba(30, 27, 75, 0.94)',
              icon: <Info size={19} color="#818cf8" style={{ flexShrink: 0 }} />,
              defaultTitle: 'Informasi'
            }
          }[toast.type];

          return (
            <div
              key={toast.id}
              className="toast-item"
              style={{
                pointerEvents: 'auto',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '12px',
                padding: '13px 15px',
                backgroundColor: typeColors.bg,
                backdropFilter: 'blur(12px)',
                border: `1px solid ${typeColors.border}`,
                borderRadius: '10px',
                boxShadow: '0 12px 30px rgba(0, 0, 0, 0.45), 0 2px 8px rgba(0, 0, 0, 0.25)',
                color: '#fff',
                animation: 'toastSlideIn 240ms cubic-bezier(0.16, 1, 0.3, 1) forwards'
              }}
            >
              <div style={{ marginTop: '2px' }}>{typeColors.icon}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '13px', fontWeight: 600, color: '#f8fafc', marginBottom: '2px' }}>
                  {toast.title || typeColors.defaultTitle}
                </div>
                <div style={{ fontSize: '12.5px', color: '#e2e8f0', lineHeight: '1.45', wordBreak: 'break-word' }}>
                  {toast.message}
                </div>
              </div>
              <button
                onClick={() => removeToast(toast.id)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'rgba(255, 255, 255, 0.6)',
                  cursor: 'pointer',
                  padding: '2px',
                  borderRadius: '4px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'color 150ms'
                }}
                onMouseEnter={e => (e.currentTarget.style.color = '#fff')}
                onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255, 255, 255, 0.6)')}
              >
                <X size={15} />
              </button>
            </div>
          );
        })}
      </div>

      {/* --- Unified Dialog Modal --- */}
      {dialogState.isOpen && (
        <div 
          className="modal-backdrop" 
          style={{ zIndex: 99998, animation: 'fadeIn 150ms ease-out' }}
          onClick={handleDialogCancel}
        >
          <div
            className="modal-content"
            style={{
              width: '460px',
              maxWidth: '92vw',
              borderRadius: '14px',
              overflow: 'hidden',
              animation: 'scaleIn 180ms cubic-bezier(0.16, 1, 0.3, 1) forwards'
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div 
              className="modal-header"
              style={{
                padding: '16px 20px',
                borderBottom: '1px solid var(--border-subtle)',
                display: 'flex',
                alignItems: 'center',
                gap: '12px'
              }}
            >
              <div 
                style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '10px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  backgroundColor: dialogState.type === 'danger' || dialogState.type === 'error'
                    ? 'rgba(239, 68, 68, 0.15)' 
                    : dialogState.type === 'warning'
                    ? 'rgba(245, 158, 11, 0.15)'
                    : 'rgba(99, 102, 241, 0.15)'
                }}
              >
                {dialogState.type === 'danger' || dialogState.type === 'error' ? (
                  <AlertCircle size={20} color="var(--danger)" />
                ) : dialogState.type === 'warning' ? (
                  <AlertTriangle size={20} color="var(--warning)" />
                ) : (
                  <HelpCircle size={20} color="var(--accent-light)" />
                )}
              </div>
              <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)', margin: 0, flex: 1 }}>
                {dialogState.title}
              </h3>
              <button className="btn btn-ghost" onClick={handleDialogCancel} style={{ padding: '6px' }}>
                <X size={16} />
              </button>
            </div>

            {/* Body */}
            <div className="modal-body" style={{ padding: '20px', color: 'var(--text-secondary)', fontSize: '13.5px', lineHeight: '1.5' }}>
              <p style={{ margin: 0, wordBreak: 'break-word', color: 'var(--text-primary)' }}>
                {dialogState.message}
              </p>
            </div>

            {/* Footer */}
            <div className="modal-footer" style={{ padding: '14px 20px', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              {dialogState.isConfirm && (
                <button 
                  className="btn btn-secondary" 
                  onClick={handleDialogCancel}
                  style={{ minWidth: '80px' }}
                >
                  {dialogState.cancelText}
                </button>
              )}
              <button
                ref={confirmButtonRef}
                className={dialogState.type === 'danger' || dialogState.type === 'error' ? 'btn btn-danger' : 'btn btn-primary'}
                onClick={handleDialogConfirm}
                style={{ minWidth: '90px' }}
              >
                {dialogState.confirmText}
              </button>
            </div>
          </div>
        </div>
      )}
    </FeedbackContext.Provider>
  );
};
