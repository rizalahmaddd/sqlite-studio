import { createContext } from 'react';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastItem {
  id: string;
  type: ToastType;
  title?: string;
  message: string;
  duration?: number;
}

export interface ConfirmDialogOptions {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  type?: 'danger' | 'warning' | 'info';
}

export interface AlertDialogOptions {
  title: string;
  message: string;
  confirmText?: string;
  type?: 'error' | 'warning' | 'info';
}

export interface FeedbackContextType {
  showToast: (type: ToastType, message: string, title?: string, duration?: number) => void;
  confirm: (options: ConfirmDialogOptions) => Promise<boolean>;
  alert: (options: AlertDialogOptions | string) => Promise<void>;
}

export const FeedbackContext = createContext<FeedbackContextType | null>(null);
