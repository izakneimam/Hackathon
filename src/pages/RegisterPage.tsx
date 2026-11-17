import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  createUserWithEmailAndPassword,
  deleteUser,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  updateProfile,
  type UserCredential,
} from 'firebase/auth';
import { doc, getDoc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { useEventData } from '../hooks/useEventData';
import { auth, db } from '../lib/firebase';
import { handleFirestoreError, OperationType } from '../lib/firestoreError';
import { registerSchema } from '../lib/validation';

export function RegisterPage() {
  const navigate = useNavigate();
  const { refreshUserState } = useAuth();
  const { showToast } = useToast();
  const { settings, stats, loading: loadingEvent } = useEventData();

  const [leaderName, setLeaderName] = useState('');
  const [teamName, setTeamName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [lgpdAccepted, setLgpdAccepted] = useState(false);
  const [showPwd, setShowPwd] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [canOfferReset, setCanOfferReset] = useState(false);
  const [sendingReset, setSendingReset] = useState(false);

  const maxTeams = settings?.maxTeams ?? 25;
  const currentTeams = stats?.teamCount ?? 0;
  const spotsFull = !loadingEvent && settings !== null && currentTeams >= maxTeams;

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (spotsFull) {
      setErrorMsg('As vagas para esta edição do hackathon já estão esgotadas.');
      return;
    }

    const parsed = registerSchema.safeParse({
      leaderName,
      teamName,
      email,
      password,
      confirmPassword,
      lgpdAccepted,
    });

    if (!parsed.success) {
      setErrorMsg(parsed.error.issues[0]?.message || 'Verifique os campos preenchidos.');
      return;
    }

    setSubmitting(true);
    setCanOfferReset(false);
    try {
      let cred: UserCredential;
      try {
        cred = await createUserWithEmailAndPassword(auth, parsed.data.email, parsed.data.password);
      } catch (createErr: unknown) {
        const createCode = (createErr as { code?: string })?.code;
        if (createCode !== 'auth/email-already-in-use') {
          throw createErr;
        }

        // E-mail já existe no Firebase Auth: verificar se a conta foi excluída do Firestore pela organização.
        let existingCred: UserCredential;
        try {
          existingCred = await signInWithEmailAndPassword(
            auth,
            parsed.data.email,
            parsed.data.password
          );
        } catch (signInErr: unknown) {
          const signInCode = (signInErr as { code?: string })?.code;
          if (
            signInCode === 'auth/wrong-password' ||
            signInCode === 'auth/invalid-credential'
          ) {
            setCanOfferReset(true);
            setErrorMsg(
              'Este e-mail já possui registro de autenticação. Se sua conta anterior foi excluída pela organização, informe a senha antiga neste formulário para recriar seu cadastro, ou clique abaixo para redefinir a senha por e-mail e tentar novamente.'
            );
            return;
          }
          throw signInErr;
        }

        const [roleSnap, userSnap] = await Promise.all([
          getDoc(doc(db, 'userRoles', existingCred.user.uid)).catch((e) => {
            handleFirestoreError(e, OperationType.GET, `userRoles/${existingCred.user.uid}`);
            throw e;
          }),
          getDoc(doc(db, 'users', existingCred.user.uid)).catch((e) => {
            handleFirestoreError(e, OperationType.GET, `users/${existingCred.user.uid}`);
            throw e;
          }),
        ]);

        if (roleSnap.exists() || userSnap.exists()) {
          // Conta ainda está ativa no sistema: impedir sobrescrita.
          await firebaseSignOut(auth);
          setErrorMsg(
            'Este e-mail institucional já está cadastrado e ativo. Faça login ou recupere sua senha.'
          );
          return;
        }

        // Conta órfã (excluída do Firestore pelo admin): remover registro antigo do Auth e criar cadastro limpo.
        await deleteUser(existingCred.user);
        cred = await createUserWithEmailAndPassword(auth, parsed.data.email, parsed.data.password);
      }

      await updateProfile(cred.user, { displayName: parsed.data.leaderName });

      const batch = writeBatch(db);
      batch.set(doc(db, 'users', cred.user.uid), {
        uid: cred.user.uid,
        name: parsed.data.leaderName,
        email: cred.user.email || parsed.data.email,
        pendingTeamName: parsed.data.teamName,
        lgpdAccepted: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      batch.set(doc(db, 'userRoles', cred.user.uid), {
        role: 'participante',
        email: cred.user.email || parsed.data.email,
        updatedAt: serverTimestamp(),
      });

      try {
        await batch.commit();
      } catch (fsErr) {
        handleFirestoreError(fsErr, OperationType.WRITE, `users/${cred.user.uid}`);
      }

      await sendEmailVerification(cred.user, {
        url: `${window.location.origin}/login`,
      });

      await refreshUserState();
      showToast('Conta criada! Verifique seu e-mail institucional para liberar o painel da equipe.', 'success');
      navigate('/verificar-email', { replace: true });
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code;
      if (code === 'auth/email-already-in-use') {
        setErrorMsg('Este e-mail institucional já está cadastrado. Faça login ou recupere sua senha.');
      } else if (code === 'auth/weak-password') {
        setErrorMsg('A senha escolhida é muito fraca. Utilize pelo menos 6 caracteres.');
      } else if (code === 'auth/operation-not-allowed') {
        setErrorMsg('Cadastro por e-mail/senha não ativado no Firebase Console.');
      } else if (code === 'auth/too-many-requests') {
        setErrorMsg('Muitas tentativas seguidas. Aguarde alguns instantes e tente novamente.');
      } else {
        setErrorMsg(err instanceof Error ? err.message : 'Não foi possível concluir o cadastro.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleSendResetFromRegister = async () => {
    const target = email.trim();
    if (!target) return;
    setSendingReset(true);
    try {
      await sendPasswordResetEmail(auth, target, {
        url: `${window.location.origin}/registrar`,
      });
      showToast(
        'Link de redefinição enviado! Após definir a nova senha no e-mail, volte aqui e preencha o cadastro com ela.',
        'success'
      );
      setCanOfferReset(false);
    } catch {
      showToast('Não foi possível enviar o e-mail de redefinição agora. Tente novamente em instantes.', 'error');
    } finally {
      setSendingReset(false);
    }
  };

  return (
    <div className="min-h-screen bg-navy-900 bg-grid-pattern flex flex-col justify-center py-10 px-4 sm:px-6">
      <div className="max-w-xl mx-auto w-full bg-navy-800 border border-navy-600 rounded-2xl p-6 sm:p-10 shadow-2xl space-y-6">
        <div>
          <Link to="/" className="inline-flex items-center space-x-2 text-xs text-slate-400 hover:text-cyan-400 transition mb-5 font-code">
            <i className="fa-solid fa-arrow-left" />
            <span>Voltar à página do evento</span>
          </Link>

          <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-cyan-400 flex items-center justify-center shadow-lg shadow-indigo-500/20">
                <i className="fa-solid fa-users-rectangle text-slate-950 font-bold text-lg" />
              </div>
              <div>
                <span className="text-xs font-code text-cyan-400 tracking-wider uppercase block">
                  Inscrição de Equipe
                </span>
                <h1 className="font-heading font-bold text-xl text-white">Registrar Nova Equipe</h1>
              </div>
            </div>

            {!loadingEvent && settings && (
              <span
                className={`px-3 py-1 rounded-full text-xs font-code border tabular-nums ${
                  spotsFull
                    ? 'bg-rose-950/80 border-rose-500/40 text-rose-300'
                    : 'bg-indigo-950/80 border-indigo-500/30 text-indigo-300'
                }`}
              >
                Vagas: {currentTeams}/{maxTeams}
              </span>
            )}
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
            Apenas o líder da equipe cria conta de acesso. Os demais integrantes (3 a 5 no total) são adicionados após a verificação do e-mail institucional.
          </p>
        </div>

        {spotsFull ? (
          <div className="p-5 bg-rose-950/60 border border-rose-500/50 rounded-xl text-rose-200 text-xs space-y-3 text-center">
            <i className="fa-solid fa-ban text-rose-400 text-2xl block" />
            <p className="font-heading font-bold text-sm text-white">Vagas Esgotadas</p>
            <p className="text-rose-200/80 leading-relaxed">
              O limite máximo de {maxTeams} equipes inscritas para esta edição já foi atingido. Entre em contato com a organização caso surjam novas vagas.
            </p>
            <div className="pt-2">
              <Link
                to="/login"
                className="inline-block px-5 py-2.5 bg-navy-900 hover:bg-navy-700 text-slate-200 rounded-xl border border-navy-600 font-semibold transition"
              >
                Já tenho conta
              </Link>
            </div>
          </div>
        ) : (
          <>
            {errorMsg && (
              <div className="p-3.5 bg-rose-950/60 border border-rose-500/50 rounded-xl text-rose-300 text-xs space-y-2.5 animate-shake">
                <div className="flex items-start space-x-3">
                  <i className="fa-solid fa-circle-exclamation text-rose-400 text-base flex-shrink-0 mt-0.5" />
                  <span className="leading-relaxed">{errorMsg}</span>
                </div>
                {canOfferReset && (
                  <div className="pl-7">
                    <button
                      type="button"
                      disabled={sendingReset}
                      onClick={() => void handleSendResetFromRegister()}
                      className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white rounded-lg text-xs font-semibold transition inline-flex items-center space-x-2"
                    >
                      <i className={`fa-solid ${sendingReset ? 'fa-circle-notch fa-spin' : 'fa-key'}`} />
                      <span>{sendingReset ? 'Enviando link...' : 'Enviar link para redefinir senha'}</span>
                    </button>
                  </div>
                )}
              </div>
            )}

            <form onSubmit={handleRegister} className="space-y-4">
              <div>
                <label htmlFor="reg-leader-name" className="block text-xs font-medium text-slate-300 mb-1.5 font-code">
                  Nome Completo do Líder *
                </label>
                <input
                  id="reg-leader-name"
                  type="text"
                  required
                  value={leaderName}
                  onChange={(e) => setLeaderName(e.target.value)}
                  placeholder="Seu nome completo"
                  className="w-full bg-navy-900 border border-navy-600 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label htmlFor="reg-team-name" className="block text-xs font-medium text-slate-300 mb-1.5 font-code">
                  Nome da Equipe *
                </label>
                <input
                  id="reg-team-name"
                  type="text"
                  required
                  value={teamName}
                  onChange={(e) => setTeamName(e.target.value)}
                  placeholder="Ex.: Equipe Turing"
                  className="w-full bg-navy-900 border border-navy-600 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label htmlFor="reg-email" className="block text-xs font-medium text-slate-300 mb-1.5 font-code">
                  E-mail Institucional do Líder *
                </label>
                <input
                  id="reg-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="nome@estudantes.ifpr.edu.br ou nome@ifpr.edu.br"
                  className="w-full bg-navy-900 border border-navy-600 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  Permitido apenas <span className="font-code text-cyan-400">@estudantes.ifpr.edu.br</span> ou{' '}
                  <span className="font-code text-cyan-400">@ifpr.edu.br</span>.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="reg-password" className="block text-xs font-medium text-slate-300 mb-1.5 font-code">
                    Senha *
                  </label>
                  <div className="relative">
                    <input
                      id="reg-password"
                      type={showPwd ? 'text' : 'password'}
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Mínimo 6 caracteres"
                      className="w-full bg-navy-900 border border-navy-600 rounded-xl pl-4 pr-10 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
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
                  <label htmlFor="reg-confirm" className="block text-xs font-medium text-slate-300 mb-1.5 font-code">
                    Confirmar Senha *
                  </label>
                  <input
                    id="reg-confirm"
                    type={showPwd ? 'text' : 'password'}
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Repita a senha"
                    className="w-full bg-navy-900 border border-navy-600 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <label className="flex items-start space-x-3 p-3.5 bg-navy-900/70 border border-navy-600 rounded-xl cursor-pointer">
                <input
                  type="checkbox"
                  checked={lgpdAccepted}
                  onChange={(e) => setLgpdAccepted(e.target.checked)}
                  className="mt-0.5 rounded border-navy-500 bg-navy-900 text-indigo-600 focus:ring-indigo-500"
                />
                <span className="text-xs text-slate-300 leading-relaxed">
                  Declaro que li e aceito o tratamento dos meus dados pessoais e acadêmicos (e dos integrantes da minha equipe) para fins exclusivos de organização, certificação e avaliação do 1º Hackathon de Ciência da Computação – IFPR, em conformidade com a <strong>LGPD (Lei nº 13.709/2018)</strong>.
                </span>
              </label>

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-3.5 px-4 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white font-semibold rounded-xl shadow-lg shadow-indigo-600/30 transition flex items-center justify-center space-x-2 text-sm"
              >
                <span>{submitting ? 'Criando cadastro...' : 'Criar conta e cadastrar equipe'}</span>
                {submitting && <i className="fa-solid fa-circle-notch fa-spin" />}
              </button>
            </form>
          </>
        )}

        <p className="text-center text-xs text-slate-400 pt-2 border-t border-navy-700">
          Já possui cadastro?{' '}
          <Link to="/login" className="text-indigo-400 font-semibold hover:underline">
            Entrar na plataforma
          </Link>
        </p>
      </div>
    </div>
  );
}
