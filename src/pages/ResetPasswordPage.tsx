import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { confirmPasswordReset, sendPasswordResetEmail, verifyPasswordResetCode } from 'firebase/auth';
import { useToast } from '../contexts/ToastContext';
import { auth } from '../lib/firebase';
import { resetPasswordSchema } from '../lib/validation';

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const oobCode = searchParams.get('oobCode');
  const { showToast } = useToast();

  const [verifyingCode, setVerifyingCode] = useState(Boolean(oobCode));
  const [codeError, setCodeError] = useState<string | null>(null);
  const [targetEmail, setTargetEmail] = useState<string | null>(null);

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  // Modo solicitar envio quando acessado diretamente sem oobCode
  const [requestEmail, setRequestEmail] = useState('');
  const [requestSent, setRequestSent] = useState(false);

  useEffect(() => {
    if (!oobCode) return;
    let active = true;
    setVerifyingCode(true);
    verifyPasswordResetCode(auth, oobCode)
      .then((email) => {
        if (active) {
          setTargetEmail(email);
          setCodeError(null);
        }
      })
      .catch(() => {
        if (active) {
          setCodeError('Este link de redefinição é inválido ou já expirou. Solicite um novo link.');
        }
      })
      .finally(() => {
        if (active) setVerifyingCode(false);
      });

    return () => {
      active = false;
    };
  }, [oobCode]);

  const handleConfirmReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!oobCode) return;

    const parsed = resetPasswordSchema.safeParse({ password, confirmPassword });
    if (!parsed.success) {
      showToast(parsed.error.issues[0]?.message || 'Verifique a nova senha.', 'error');
      return;
    }

    setSubmitting(true);
    try {
      await confirmPasswordReset(auth, oobCode, parsed.data.password);
      setSuccess(true);
      showToast('Senha redefinida com sucesso!', 'success');
    } catch {
      setCodeError('Não foi possível redefinir a senha. O link pode ter expirado.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRequestLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!requestEmail.trim()) return;
    setSubmitting(true);
    try {
      await sendPasswordResetEmail(auth, requestEmail.trim(), {
        url: `${window.location.origin}/login`,
      });
      setRequestSent(true);
      showToast('Se o e-mail estiver cadastrado, o link de redefinição foi enviado.', 'success');
    } catch {
      showToast('Verifique o e-mail informado e tente novamente.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-navy-900 bg-grid-pattern flex items-center justify-center p-4 sm:p-6">
      <div className="max-w-md w-full bg-navy-800 border border-navy-600 rounded-2xl p-6 sm:p-8 shadow-2xl space-y-5">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-cyan-400 flex items-center justify-center shadow-lg">
            <i className="fa-solid fa-key text-slate-950 font-bold" />
          </div>
          <div>
            <span className="text-xs font-code text-cyan-400 uppercase block">Segurança da Conta</span>
            <h1 className="font-heading font-bold text-lg text-white">Redefinir Senha</h1>
          </div>
        </div>

        {verifyingCode ? (
          <div className="py-8 text-center space-y-3">
            <i className="fa-solid fa-circle-notch fa-spin text-2xl text-indigo-400" />
            <p className="text-xs text-slate-400 font-code">Validando código de recuperação...</p>
          </div>
        ) : success ? (
          <div className="space-y-4 text-center py-4">
            <div className="w-12 h-12 rounded-full bg-emerald-950 border border-emerald-500/40 flex items-center justify-center text-emerald-400 text-xl mx-auto">
              <i className="fa-solid fa-circle-check" />
            </div>
            <h2 className="font-heading font-bold text-base text-white">Senha atualizada!</h2>
            <p className="text-xs text-slate-400">Você já pode acessar a plataforma utilizando sua nova senha.</p>
            <Link
              to="/login"
              className="block w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold transition"
            >
              Ir para o Login
            </Link>
          </div>
        ) : oobCode && codeError ? (
          <div className="space-y-4">
            <div className="p-4 bg-rose-950/60 border border-rose-500/50 rounded-xl text-rose-300 text-xs flex items-center space-x-3">
              <i className="fa-solid fa-circle-exclamation text-rose-400 text-base flex-shrink-0" />
              <span>{codeError}</span>
            </div>
            <Link
              to="/login"
              className="block w-full text-center py-3 bg-navy-900 hover:bg-navy-700 text-slate-200 rounded-xl border border-navy-600 text-xs font-semibold transition"
            >
              Voltar ao Login
            </Link>
          </div>
        ) : oobCode ? (
          <form onSubmit={handleConfirmReset} className="space-y-4">
            {targetEmail && (
              <p className="text-xs text-slate-400">
                Defina uma nova senha para <strong className="text-white font-code">{targetEmail}</strong>.
              </p>
            )}
            <div>
              <label htmlFor="reset-pwd" className="block text-xs font-medium text-slate-300 mb-1.5 font-code">
                Nova Senha
              </label>
              <div className="relative">
                <input
                  id="reset-pwd"
                  type={showPwd ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                  className="w-full bg-navy-900 border border-navy-600 rounded-xl pl-4 pr-10 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500"
                />
                <button
                  type="button"
                  onClick={() => setShowPwd((p) => !p)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-white"
                >
                  <i className={`fa-solid ${showPwd ? 'fa-eye-slash' : 'fa-eye'}`} />
                </button>
              </div>
            </div>

            <div>
              <label htmlFor="reset-confirm" className="block text-xs font-medium text-slate-300 mb-1.5 font-code">
                Confirmar Nova Senha
              </label>
              <input
                id="reset-confirm"
                type={showPwd ? 'text' : 'password'}
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Repita a nova senha"
                className="w-full bg-navy-900 border border-navy-600 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white rounded-xl text-xs font-semibold shadow-lg shadow-indigo-600/30 transition flex items-center justify-center space-x-2"
            >
              <span>{submitting ? 'Salvando...' : 'Confirmar Nova Senha'}</span>
              {submitting && <i className="fa-solid fa-circle-notch fa-spin" />}
            </button>
          </form>
        ) : requestSent ? (
          <div className="space-y-4 text-center py-2">
            <p className="text-xs text-slate-300 leading-relaxed">
              Verifique a caixa de entrada de <strong className="text-white font-code">{requestEmail}</strong> e clique no link enviado para redefinir sua senha.
            </p>
            <Link
              to="/login"
              className="block w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold transition"
            >
              Voltar ao Login
            </Link>
          </div>
        ) : (
          <form onSubmit={handleRequestLink} className="space-y-4">
            <p className="text-xs text-slate-400 leading-relaxed">
              Informe seu e-mail cadastrado para receber o link de redefinição de senha.
            </p>
            <input
              type="email"
              required
              value={requestEmail}
              onChange={(e) => setRequestEmail(e.target.value)}
              placeholder="seu.nome@estudantes.ifpr.edu.br"
              className="w-full bg-navy-900 border border-navy-600 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
            />
            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white rounded-xl text-xs font-semibold transition"
            >
              {submitting ? 'Enviando...' : 'Enviar link de redefinição'}
            </button>
            <Link
              to="/login"
              className="block text-center text-xs text-slate-400 hover:text-white transition pt-1"
            >
              Voltar ao Login
            </Link>
          </form>
        )}
      </div>
    </div>
  );
}
