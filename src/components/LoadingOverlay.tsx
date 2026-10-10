import React from 'react';

export interface BusyState {
  label: string;
  detail?: string;
  /** 0..1 when the amount of work is known, otherwise an indeterminate bar is shown */
  progress?: number;
}

interface LoadingOverlayProps {
  state: BusyState | null;
}

export const LoadingOverlay: React.FC<LoadingOverlayProps> = ({ state }) => {
  if (!state) return null;

  const percent = state.progress === undefined
    ? null
    : Math.round(Math.min(1, Math.max(0, state.progress)) * 100);

  return (
    <div className="busy-overlay" role="alertdialog" aria-modal="true" aria-busy="true" aria-live="polite">
      <div className="busy-card">
        <div className="busy-spinner" aria-hidden="true" />
        <div className="busy-text">
          <div className="busy-label">{state.label}</div>
          {state.detail && <div className="busy-detail">{state.detail}</div>}
        </div>
        <div
          className="busy-track"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent ?? undefined}
        >
          {percent === null ? (
            <div className="busy-bar busy-bar-indeterminate" />
          ) : (
            <div className="busy-bar" style={{ transform: `scaleX(${percent / 100})` }} />
          )}
        </div>
        <div className="busy-percent font-mono">
          {percent === null ? 'Mohon tunggu, jangan tutup tab ini' : `${percent}%`}
        </div>
      </div>
    </div>
  );
};
