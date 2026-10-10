import { useContext } from 'react';
import { FeedbackContext } from './FeedbackContext';

export function useFeedback() {
  const context = useContext(FeedbackContext);
  if (!context) {
    throw new Error('useFeedback must be used within a FeedbackProvider');
  }
  return context;
}

export function useToast() {
  const { showToast } = useFeedback();
  return { showToast };
}

export function useDialog() {
  const { confirm, alert } = useFeedback();
  return { confirm, alert };
}
