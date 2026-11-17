import { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { sendEmailVerification } from 'firebase/auth';
import { getDashboardPathForRole, useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';

export function VerifyEmailPage() {
  const navigate = useNavigate();
  const { user, role, loading, refreshUserState, ensureTeamProvisioned, signOut } = useAuth();
  const { showToast } = useToast();

  const [checking, setChecking] = useState(false);
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  if (loading) {
    return (
      <div className="min-h-screen bg-navy-900 bg-grid-pattern flex items-center justify-center p-6">
        <div className="bg-navy-800 border border-navy-600 rounded-2xl p-6 flex items-center space-x-3 text-sm text-slate-300">
          <i className="fa-solid fa-circle-notch fa-spin text-indigo-400" />
          <span className="font-code">Carregando...</span>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (role && role !== 'participante') {
    return <Navigate to={getDashboardPathForRole(role)} replace />;
  }

  const handleConfirmCheck = async () => {
    setChecking(true);
    try {
      const { user: refreshedUser } = await refreshUserState();
      if (!refreshedUser?.emailVerified) {
        showToast('Seu e-mail ainda não foi confirmado. Clique no link enviado à sua caixa de entrada.', 'warning');
        return;
      }
      await ensureTeamProvisioned();
      showToast('E-mail confirmado com sucesso! Equipe liberada.', 'success');
      navigate('/equipe', { replace: true });
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Erro ao verificar confirmação de e-mail.', 'error');
    } finally {
      setChecking(false);
    }
  };

  const handleResend = async () => {
    if (!user || cooldown > 0) return;
    setResending(true);
    try {
      await sendEmailVerification(user, {
        url: `${window.location.origin}/login`,
      });
      showToast('E-mail de verificação reenviado! Verifique sua caixa de entrada e spam.', 'success');
      setCooldown(60);
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code;
      if (code === 'auth/too-many-requests') {
        showToast('Muitas solicitações. Aguarde alguns minutos antes de reenviar.', 'warning');
      } else {
        showToast('Não foi possível reenviar o e-mail agora. Tente novamente.', 'error');
      }
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="min-h-screen bg-navy-900 bg-grid-pattern flex items-center justify-center p-4 sm:p-6">
      <div className="max-w-md w-full bg-navy-800 border border-navy-600 rounded-2xl p-6 sm:p-8 shadow-2xl text-center space-y-5">
        <div className="w-14 h-14 rounded-2xl bg-indigo-950 border border-indigo-500/30 flex items-center justify-center text-cyan-400 text-2xl mx-auto">
          <i className="fa-solid fa-envelope-open-text" />
        </div>

        <div className="space-y-2">
          <span className="text-xs font-code text-cyan-400 uppercase tracking-wider">Verificação Obrigatória</span>
          <h1 className="font-heading font-bold text-xl text-white">Confirme seu e-mail</h1>
          <p className="text-xs text-slate-400 leading-relaxed">
            Enviamos um link de confirmação para{' '}
            <strong className="text-white font-code">{user.email}</strong>. Confirme seu endereço institucional para criar sua equipe e enviar o projeto.
          </p>
        </div>

        <div className="bg-navy-900 border border-navy-700 rounded-xl p-3.5 text-[11px] text-slate-400 text-left space-y-1.5">
          <div className="flex items-start space-x-2">
            <i className="fa-solid fa-circle-info text-indigo-400 mt-0.5" />
            <span>Abra seu webmail do IFPR e clique no link de verificação recebido.</span>
          </div>
          <div className="flex items-start space-x-2">
            <i className="fa-solid fa-circle-info text-indigo-400 mt-0.5" />
            <span>Caso não encontre na caixa de entrada, verifique a pasta de Spam ou Lixo Eletrônico.</span>
          </div>
        </div>

        <div className="space-y-3 pt-2">
          <button
            type="button"
            onClick={() => void handleConfirmCheck()}
            disabled={checking}
            className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white font-semibold rounded-xl shadow-lg shadow-indigo-600/30 text-xs transition flex items-center justify-center space-x-2"
          >
            {checking ? (
              <>
                <i className="fa-solid fa-circle-notch fa-spin" />
                <span>Verificando...</span>
              </>
            ) : (
              <>
                <i className="fa-solid fa-circle-check" />
                <span>Já confirmei meu e-mail</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={() => void handleResend()}
            disabled={resending || cooldown > 0}
            className="w-full py-3 px-4 bg-navy-900 hover:bg-navy-700 disabled:opacity-60 text-slate-200 font-semibold rounded-xl border border-navy-600 text-xs transition"
          >
            {resending
              ? 'Reenviando...'
              : cooldown > 0
                ? `Reenviar e-mail em ${cooldown}s`
                : 'Reenviar e-mail de verificação'}
          </button>

          <button
            type="button"
            onClick={() => void signOut()}
            className="w-full py-2 text-xs text-slate-400 hover:text-white transition"
          >
            Sair desta conta
          </button>
        </div>
      </div>
    </div>
  );
}
