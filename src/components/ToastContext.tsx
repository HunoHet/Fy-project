import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';

interface Toast {
  id: number;
  message: string;
  variant: 'default' | 'success' | 'purple' | 'green' | 'error';
}

interface ToastContextValue {
  showToast: (message: string, variant?: Toast['variant']) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback((message: string, variant: Toast['variant'] = 'default') => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, message, variant }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 2800);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-4 z-[100] flex flex-col items-center gap-2 px-4">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto animate-toast-in rounded-2xl px-5 py-3 text-sm font-semibold shadow-2xl backdrop-blur-xl ${
              t.variant === 'green'
                ? 'border border-green-400/50 bg-green-500/20 text-green-300'
                : t.variant === 'error'
                ? 'border border-red-400/40 bg-red-500/15 text-red-200'
                : t.variant === 'purple'
                ? 'border border-purple-400/50 bg-purple-500/20 text-purple-200'
                : t.variant === 'success'
                ? 'border border-emerald-400/50 bg-emerald-500/20 text-emerald-200'
                : 'border border-white/20 bg-white/10 text-white'
            }`}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
