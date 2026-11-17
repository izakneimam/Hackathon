import React from 'react';

interface ConfirmModalProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'indigo' | 'rose' | 'amber' | 'emerald';
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmModal({
  open,
  title,
  description,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  variant = 'indigo',
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  if (!open) return null;

  const badgeStyle: Record<string, string> = {
    indigo: 'bg-indigo-950 border-indigo-500/30 text-indigo-400',
    rose: 'bg-rose-950 border-rose-500/40 text-rose-400',
    amber: 'bg-amber-950 border-amber-500/40 text-amber-400',
    emerald: 'bg-emerald-950 border-emerald-500/40 text-emerald-400',
  };

  const buttonStyle: Record<string, string> = {
    indigo: 'bg-indigo-600 hover:bg-indigo-500 shadow-indigo-600/30',
    rose: 'bg-rose-600 hover:bg-rose-500 shadow-rose-600/30',
    amber: 'bg-amber-600 hover:bg-amber-500 shadow-amber-600/30',
    emerald: 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-600/30',
  };

  const iconName: Record<string, string> = {
    indigo: 'fa-circle-question',
    rose: 'fa-triangle-exclamation',
    amber: 'fa-lock',
    emerald: 'fa-circle-check',
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-navy-800 border border-navy-600 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4 animate-scaleUp">
        <div
          className={`w-12 h-12 rounded-full border flex items-center justify-center text-xl mx-auto ${badgeStyle[variant]}`}
        >
          <i className={`fa-solid ${iconName[variant]}`} />
        </div>
        <div className="text-center space-y-2">
          <h3 className="font-heading font-bold text-lg text-white">{title}</h3>
          <p className="text-xs text-slate-300 leading-relaxed">{description}</p>
        </div>
        <div className="flex items-center space-x-3 pt-2">
          <button
            type="button"
            disabled={loading}
            onClick={onCancel}
            className="w-1/2 py-2.5 bg-navy-900 hover:bg-navy-700 disabled:opacity-60 text-slate-300 rounded-xl border border-navy-600 text-xs font-semibold transition"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={onConfirm}
            className={`w-1/2 py-2.5 disabled:opacity-60 text-white rounded-xl text-xs font-semibold shadow-lg transition flex items-center justify-center space-x-1.5 ${buttonStyle[variant]}`}
          >
            {loading && <i className="fa-solid fa-circle-notch fa-spin" />}
            <span>{loading ? 'Processando...' : confirmLabel}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
