import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { sendPasswordResetEmail, signInWithEmailAndPassword } from 'firebase/auth';
import { getDashboardPathForRole, getRoleLabel, useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { useEventData } from '../hooks/useEventData';
import { auth } from '../lib/firebase';
import { loginSchema } from '../lib/validation';
import type { UserRoleType } from '../types/hackathon';

export function LoginPage() {
  const navigate = useNavigate();
  const { refreshUserState, signOut } = useAuth();
  const { showToast } = useToast();
  const { settings, publicJurors } = useEventData();

  const [selectedRole, setSelectedRole] = useState<UserRoleType>('participante');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Modal de recuperação de senha
  const [resetModalOpen, setResetModalOpen] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetSending, setResetSending] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const parsed = loginSchema.safeParse({ email, password });
    if (!parsed.success) {
      setErrorMessage(parsed.error.issues[0]?.message || 'Verifique os dados informados.');
      return;
    }

    setIsLoading(true);
    try {
      await signInWithEmailAndPassword(auth, parsed.data.email, parsed.data.password);
      const { user, role } = await refreshUserState();

      if (!user) {
        setErrorMessage('Falha ao carregar sessão autenticada. Tente novamente.');
        return;
      }

      if (!role) {
        await signOut();
        setErrorMessage(
          'Conta sem perfil atribuído na plataforma. Caso sua conta tenha sido removida pela organização, faça um novo cadastro em "Registre sua equipe".'
        );
        return;
      }

      if (role !== selectedRole) {
        showToast(
          `Perfil selecionado não corresponde à sua conta (${getRoleLabel(role)}). Redirecionando para o painel correto.`,
          'warning'
        );
      }

      if (role === 'participante' && !user.emailVerified) {
        navigate('/verificar-email', { replace: true });
        return;
      }

      navigate(getDashboardPathForRole(role), { replace: true });
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code;
      if (code === 'auth/operation-not-allowed') {
        setErrorMessage(
          'Login por e-mail/senha ainda não ativado no Firebase Authentication. Ative o provedor no console.'
        );
      } else if (code === 'auth/too-many-requests') {
        setErrorMessage('Muitas tentativas seguidas. Aguarde alguns instantes antes de tentar novamente.');
      } else {
        setErrorMessage('E-mail institucional ou senha incorretos. Tente novamente.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    const target = resetEmail.trim();
    if (!target) {
      showToast('Informe seu e-mail para receber o link de redefinição.', 'warning');
      return;
    }
    setResetSending(true);
    try {
      await sendPasswordResetEmail(auth, target, {
        url: `${window.location.origin}/login`,
      });
      showToast('Se o e-mail estiver cadastrado, as instruções de recuperação foram enviadas.', 'success');
      setResetModalOpen(false);
      setResetEmail('');
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code;
      if (code === 'auth/invalid-email') {
        showToast('Formato de e-mail inválido.', 'error');
      } else {
        showToast('Se o e-mail estiver cadastrado, as instruções foram enviadas.', 'info');
        setResetModalOpen(false);
      }
    } finally {
      setResetSending(false);
    }
  };

  const teamsLabel = settings?.loginTeamsRangeLabel || '15–25';
  const durationLabel = settings?.loginDurationLabel || '24–48h';
  const jurorsCount = publicJurors.length > 0 ? publicJurors.length : 4;

  return (
    <div className="min-h-screen flex flex-col justify-between bg-navy-900 bg-grid-pattern relative">
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 min-h-screen">
        {/* Left Column: Login Form */}
        <div className="lg:col-span-6 p-6 sm:p-12 md:p-16 flex flex-col justify-center max-w-xl mx-auto w-full">
          {/* Header / Logo */}
          <div className="mb-8">
            <Link to="/" className="inline-flex items-center space-x-2 text-xs text-slate-400 hover:text-cyan-400 transition mb-6 font-code">
              <i className="fa-solid fa-arrow-left" />
              <span>Voltar à página do evento</span>
            </Link>

            <div className="flex items-center space-x-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-cyan-400 flex items-center justify-center shadow-lg shadow-indigo-500/20">
                <i className="fa-solid fa-code text-slate-950 font-bold text-lg" />
              </div>
              <div>
                <span className="text-xs font-code text-cyan-400 tracking-wider uppercase block">
                  {settings?.campusLabel || 'IFPR Campus Pinhais / Curitiba'}
                </span>
                <h1 className="font-heading font-bold text-lg text-white">
                  {settings?.eventSubtitle || 'Hackathon Ciência da Computação'}
                </h1>
              </div>
            </div>
            <p className="text-slate-400 text-sm">
              Acesse a plataforma oficial do evento para gerenciar sua equipe e envios.
            </p>
          </div>

          {/* Role Switcher */}
          <div className="bg-navy-800 p-1 rounded-xl border border-navy-600 grid grid-cols-3 gap-1 mb-6">
            <button
              type="button"
              onClick={() => setSelectedRole('participante')}
              className={`py-2 px-3 rounded-lg text-xs font-semibold text-center transition-all ${
                selectedRole === 'participante'
                  ? 'bg-indigo-600 text-white shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <i className="fa-solid fa-user-group me-1.5" />
              Participante
            </button>
            <button
              type="button"
              onClick={() => setSelectedRole('jurado')}
              className={`py-2 px-3 rounded-lg text-xs font-semibold text-center transition-all ${
                selectedRole === 'jurado'
                  ? 'bg-indigo-600 text-white shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <i className="fa-solid fa-gavel me-1.5" />
              Jurado
            </button>
            <button
              type="button"
              onClick={() => setSelectedRole('organizacao')}
              className={`py-2 px-3 rounded-lg text-xs font-semibold text-center transition-all ${
                selectedRole === 'organizacao'
                  ? 'bg-indigo-600 text-white shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <i className="fa-solid fa-shield-halved me-1.5" />
              Organização
            </button>
          </div>

          {/* Credential Error Alert Box */}
          {errorMessage && (
            <div className="mb-6 p-3.5 bg-rose-950/60 border border-rose-500/50 rounded-xl text-rose-300 text-xs flex items-center space-x-3 animate-shake">
              <i className="fa-solid fa-circle-exclamation text-rose-400 text-base flex-shrink-0" />
              <div>
                <p className="font-semibold">Erro de autenticação</p>
                <p className="text-rose-300/80">{errorMessage}</p>
              </div>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="login-email" className="block text-xs font-medium text-slate-300 mb-1.5 font-code">
                E-mail Institucional
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                  <i className="fa-solid fa-envelope" />
                </div>
                <input
                  type="email"
                  id="login-email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="seu.nome@estudantes.ifpr.edu.br"
                  className="w-full bg-navy-800 border border-navy-600 rounded-xl pl-10 pr-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition"
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between items-center mb-1.5">
                <label htmlFor="login-password" className="block text-xs font-medium text-slate-300 font-code">
                  Senha
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setResetEmail(email);
                    setResetModalOpen(true);
                  }}
                  className="text-xs text-indigo-400 hover:text-indigo-300 hover:underline"
                >
                  Esqueci minha senha
                </button>
              </div>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                  <i className="fa-solid fa-lock" />
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  id="login-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full bg-navy-800 border border-navy-600 rounded-xl pl-10 pr-10 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label="Mostrar ou ocultar senha"
                  className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-200"
                >
                  <i className={`fa-solid ${showPassword ? 'fa-eye-slash' : 'fa-eye'}`} />
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3.5 px-4 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white font-medium rounded-xl shadow-lg shadow-indigo-600/30 transition duration-200 flex items-center justify-center space-x-2"
            >
              <span>{isLoading ? 'Autenticando...' : 'Entrar na Plataforma'}</span>
              {isLoading && <i className="fa-solid fa-circle-notch fa-spin" />}
            </button>

            <div className="relative flex py-2 items-center">
              <div className="flex-grow border-t border-navy-600" />
              <span className="flex-shrink mx-4 text-xs text-slate-500 font-code">ou</span>
              <div className="flex-grow border-t border-navy-600" />
            </div>

            <button
              type="button"
              disabled
              aria-disabled="true"
              className="w-full py-3 px-4 bg-navy-800/60 text-slate-400 font-medium rounded-xl border border-navy-600 flex items-center justify-center space-x-2 text-xs sm:text-sm opacity-70 cursor-not-allowed"
            >
              <i className="fa-solid fa-building-columns text-cyan-400/70" />
              <span>Entrar com conta institucional (SUAP / IFPR)</span>
              <span className="ml-1.5 px-2 py-0.5 rounded bg-navy-900 border border-navy-600 text-[10px] font-code text-cyan-400">
                em breve
              </span>
            </button>
          </form>

          {/* Footer Link */}
          <p className="mt-8 text-center text-xs text-slate-400">
            Ainda não tem conta?{' '}
            <Link to="/registrar" className="text-indigo-400 font-semibold hover:underline">
              Registre sua equipe
            </Link>
          </p>
        </div>

        {/* Right Panel: Visual Showcase */}
        <div className="lg:col-span-6 bg-gradient-to-br from-navy-800 via-navy-900 to-[#070A15] p-8 sm:p-12 lg:p-16 border-t lg:border-t-0 lg:border-l border-navy-600 flex flex-col justify-between relative overflow-hidden">
          <div className="absolute -top-24 -right-24 w-96 h-96 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -bottom-24 -left-24 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />

          {/* Top Tag */}
          <div className="flex items-center space-x-2">
            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-code font-medium bg-indigo-950 text-indigo-400 border border-indigo-500/30">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping me-2" />
              Presencial • Evento Acadêmico
            </span>
          </div>

          {/* Middle Content */}
          <div className="my-12">
            <div className="text-cyan-400 font-code text-sm font-semibold mb-3 tracking-wide">
              {'{ IFPR_HACKATHON_2026 }'}
            </div>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-heading font-bold text-white leading-tight mb-4">
              Construa.
              <br />
              Entregue.
              <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 via-cyan-400 to-emerald-400">
                Seja avaliado.
              </span>
            </h2>
            <p className="text-slate-300 text-sm sm:text-base leading-relaxed max-w-lg mb-8">
              {settings?.loginShowcaseDescription ||
                'Maratona intensiva de programação e solução de problemas para alunos de Ciência da Computação e cursos correlatos do IFPR.'}
            </p>

            {/* Key Figures Grid */}
            <div className="grid grid-cols-3 gap-4 border-t border-navy-600 pt-6">
              <div>
                <div className="font-heading font-bold text-2xl sm:text-3xl text-white font-code tabular-nums">
                  {teamsLabel}
                </div>
                <div className="text-xs text-slate-400 mt-1">Equipes inscritas</div>
              </div>
              <div>
                <div className="font-heading font-bold text-2xl sm:text-3xl text-cyan-400 font-code tabular-nums">
                  {durationLabel}
                </div>
                <div className="text-xs text-slate-400 mt-1">Imersão total</div>
              </div>
              <div>
                <div className="font-heading font-bold text-2xl sm:text-3xl text-indigo-400 font-code tabular-nums">
                  [ {jurorsCount} ]
                </div>
                <div className="text-xs text-slate-400 mt-1">Jurados especialistas</div>
              </div>
            </div>
          </div>

          {/* Bottom Code Snippet Box */}
          <div className="bg-navy-950/80 border border-navy-600 rounded-xl p-4 font-code text-xs text-slate-300">
            <div className="flex items-center space-x-2 text-slate-500 mb-2 border-b border-navy-700/50 pb-2">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500/80 inline-block" />
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500/80 inline-block" />
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/80 inline-block" />
              <span className="ml-2 text-[11px]">hackathon_config.py</span>
            </div>
            <p>
              <span className="text-purple-400">class</span>{' '}
              <span className="text-cyan-300">HackathonIFPR</span>:
            </p>
            <p className="pl-4">
              <span className="text-indigo-300">modalidade</span> ={' '}
              <span className="text-emerald-300">"Presencial"</span>
            </p>
            <p className="pl-4">
              <span className="text-indigo-300">avaliacao</span> ={' '}
              <span className="text-emerald-300">"Banca de Jurados por Criterios"</span>
            </p>
            <p className="pl-4">
              <span className="text-indigo-300">status</span> ={' '}
              <span className="text-cyan-400">"Inscricoes_Abertas"</span>{' '}
              <span className="animate-cursor text-cyan-400">|</span>
            </p>
          </div>
        </div>
      </div>

      {/* Password Reset Modal */}
      {resetModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-navy-800 border border-navy-600 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4 animate-scaleUp">
            <div className="flex items-center justify-between border-b border-navy-700 pb-3">
              <h3 className="font-heading font-bold text-white text-base flex items-center space-x-2">
                <i className="fa-solid fa-key text-indigo-400" />
                <span>Recuperar senha</span>
              </h3>
              <button
                type="button"
                onClick={() => setResetModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <i className="fa-solid fa-xmark" />
              </button>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Informe o e-mail institucional cadastrado. Enviaremos um link seguro para você definir uma nova senha.
            </p>
            <form onSubmit={handleResetPassword} className="space-y-4">
              <input
                type="email"
                required
                value={resetEmail}
                onChange={(e) => setResetEmail(e.target.value)}
                placeholder="seu.nome@estudantes.ifpr.edu.br"
                className="w-full bg-navy-900 border border-navy-600 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
              />
              <div className="flex items-center space-x-3">
                <button
                  type="button"
                  onClick={() => setResetModalOpen(false)}
                  className="w-1/2 py-2.5 bg-navy-900 hover:bg-navy-700 text-slate-300 rounded-xl border border-navy-600 text-xs font-semibold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={resetSending}
                  className="w-1/2 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white rounded-xl text-xs font-semibold shadow-lg shadow-indigo-600/30"
                >
                  {resetSending ? 'Enviando...' : 'Enviar link'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
