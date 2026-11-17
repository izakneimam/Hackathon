import React, { createContext, useCallback, useContext, useState } from 'react';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

interface ToastItem {
  id: string;
  message: string;
  type: ToastType;
}

interface ToastContextValue {
  showToast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const showToast = useCallback((message: string, type: ToastType = 'info') => {
    const id = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  }, []);

  const dismiss = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const styleMap: Record<ToastType, { border: string; icon: string }> = {
    success: {
      border: 'bg-emerald-950/95 border-emerald-500/50 text-emerald-200',
      icon: 'fa-solid fa-circle-check text-emerald-400',
    },
    error: {
      border: 'bg-rose-950/95 border-rose-500/50 text-rose-200',
      icon: 'fa-solid fa-circle-exclamation text-rose-400',
    },
    warning: {
      border: 'bg-amber-950/95 border-amber-500/50 text-amber-200',
      icon: 'fa-solid fa-triangle-exclamation text-amber-400',
    },
    info: {
      border: 'bg-navy-800/95 border-indigo-500/50 text-slate-100',
      icon: 'fa-solid fa-circle-info text-cyan-400',
    },
  };

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div
        aria-live="polite"
        className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 max-w-sm w-[calc(100%-2rem)] pointer-events-none"
      >
        {toasts.map((toast) => {
          const st = styleMap[toast.type];
          return (
            <div
              key={toast.id}
              className={`pointer-events-auto flex items-start gap-3 p-3.5 rounded-xl border shadow-2xl backdrop-blur-md text-xs animate-scaleUp ${st.border}`}
            >
              <i className={`${st.icon} text-base mt-0.5 flex-shrink-0`} />
              <p className="flex-1 leading-relaxed">{toast.message}</p>
              <button
                type="button"
                onClick={() => dismiss(toast.id)}
                className="text-slate-400 hover:text-white transition"
                aria-label="Fechar notificação"
              >
                <i className="fa-solid fa-xmark" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast deve ser usado dentro de ToastProvider.');
  return ctx;
}
