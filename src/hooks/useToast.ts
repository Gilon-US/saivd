import { toast } from 'sonner';

type ToastVariant = 'default' | 'success' | 'error' | 'warning' | 'info';

interface ToastOptions {
  title?: string;
  description?: string;
  variant?: ToastVariant;
  duration?: number;
}

export function useToast() {
  const showToast = ({
    title,
    description,
    variant = 'default',
    duration = 5000,
  }: ToastOptions) => {
    switch (variant) {
      case 'success':
        toast.success(title, {
          description,
          duration,
        });
        break;
      case 'error':
        toast.error(title, {
          description,
          duration,
        });
        break;
      case 'warning':
        toast.warning(title, {
          description,
          duration,
        });
        break;
      case 'info':
        toast.info(title, {
          description,
          duration,
        });
        break;
      default:
        toast(title, {
          description,
          duration,
        });
        break;
    }
  };

  return {
    toast: showToast,
  };
}
