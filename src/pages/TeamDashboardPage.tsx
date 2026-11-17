import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { useEventData } from '../hooks/useEventData';
import { db } from '../lib/firebase';
import { handleFirestoreError, OperationType } from '../lib/firestoreError';
import { formatSaoPauloDateTime, getCountdownParts, useServerTimeOffset } from '../lib/serverTime';
import {
  DEMO_URL_REGEX,
  normalizeEmail,
  PROJECT_TRACKS,
  REPO_URL_REGEX,
  teamMemberSchema,
  validateProjectForSubmission,
  type SubmissionIssue,
} from '../lib/validation';
import type {
  ProjectDoc,
  ProjectStatus,
  ResultDoc,
  ScreenshotItem,
  TeamDoc,
  TeamMemberDoc,
} from '../types/hackathon';

type WizardStep = 1 | 2 | 3 | 4;

export function TeamDashboardPage() {
  const { user, profile, ensureTeamProvisioned, signOut } = useAuth();
  const { showToast } = useToast();
  const { settings, criteria } = useEventData();
  const offsetMs = useServerTimeOffset();

  const [team, setTeam] = useState<TeamDoc | null>(null);
  const [members, setMembers] = useState<TeamMemberDoc[]>([]);
  const [project, setProject] = useState<ProjectDoc | null>(null);
  const [result, setResult] = useState<ResultDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [step, setStep] = useState<WizardStep>(1);
  const [tick, setTick] = useState(0);

  // Campos editáveis do projeto (Etapa 1 e 3)
  const [projName, setProjName] = useState('');
  const [shortDesc, setShortDesc] = useState('');
  const [fullDesc, setFullDesc] = useState('');
  const [track, setTrack] = useState<string>(PROJECT_TRACKS[0]);
  const [technologies, setTechnologies] = useState<string[]>([]);
  const [techInput, setTechInput] = useState('');
  const [githubUrl, setGithubUrl] = useState('');
  const [isRepoPublicDeclared, setIsRepoPublicDeclared] = useState(false);
  const [demoUrl, setDemoUrl] = useState('');
  const [slidesUrl, setSlidesUrl] = useState('');
  const [screenshots, setScreenshots] = useState<ScreenshotItem[]>([]);
  const [newScreenshotUrl, setNewScreenshotUrl] = useState('');
  const [newScreenshotLabel, setNewScreenshotLabel] = useState('');
  const [brokenImageUrls, setBrokenImageUrls] = useState<Record<string, boolean>>({});

  // Estados de salvamento / submissão
  const [savingDraft, setSavingDraft] = useState(false);
  const [savingScreenshots, setSavingScreenshots] = useState(false);
  const [validationIssues, setValidationIssues] = useState<SubmissionIssue[]>([]);
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [submittingProject, setSubmittingProject] = useState(false);

  // Adicionar / editar integrante (Etapa 2)
  const [memberModalOpen, setMemberModalOpen] = useState(false);
  const [editingLeaderCourse, setEditingLeaderCourse] = useState(false);
  const [leaderCourseInput, setLeaderCourseInput] = useState('');
  const [leaderSemesterInput, setLeaderSemesterInput] = useState('');
  const [newMemberName, setNewMemberName] = useState('');
  const [newMemberEmail, setNewMemberEmail] = useState('');
  const [newMemberCourse, setNewMemberCourse] = useState('');
  const [newMemberSemester, setNewMemberSemester] = useState('');
  const [newMemberExternal, setNewMemberExternal] = useState(false);
  const [savingMember, setSavingMember] = useState(false);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);
  void tick;

  const loadAll = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      if (!profile?.teamId) {
        await ensureTeamProvisioned();
      }
      const teamId = profile?.teamId || user.uid;

      const [teamSnap, projSnap, membersSnap] = await Promise.all([
        getDoc(doc(db, 'teams', teamId)).catch((e) =>
          handleFirestoreError(e, OperationType.GET, `teams/${teamId}`)
        ),
        getDoc(doc(db, 'projects', teamId)).catch((e) =>
          handleFirestoreError(e, OperationType.GET, `projects/${teamId}`)
        ),
        getDocs(query(collection(db, 'teams', teamId, 'members'), orderBy('createdAt', 'asc'))).catch((e) =>
          handleFirestoreError(e, OperationType.LIST, `teams/${teamId}/members`)
        ),
      ]);

      if (teamSnap.exists()) {
        setTeam({ id: teamSnap.id, ...teamSnap.data() } as TeamDoc);
      }

      const memberList = membersSnap.docs.map((d) => ({ id: d.id, ...d.data() } as TeamMemberDoc));
      setMembers(memberList);

      if (projSnap.exists()) {
        const p = projSnap.data() as ProjectDoc;
        setProject(p);
        setProjName(p.name || '');
        setShortDesc(p.shortDescription || '');
        setFullDesc(p.fullDescription || '');
        setTrack(p.track || PROJECT_TRACKS[0]);
        setTechnologies(Array.isArray(p.technologies) ? p.technologies : []);
        setGithubUrl(p.githubUrl || '');
        setIsRepoPublicDeclared(Boolean(p.isRepoPublicDeclared));
        setDemoUrl(p.demoUrl || '');
        setSlidesUrl(p.slidesUrl || (p.slidesPath && p.slidesPath.startsWith('http') ? p.slidesPath : '') || '');
        const shots = Array.isArray(p.screenshots) ? p.screenshots : [];
        setScreenshots(shots);

        if (p.status === 'avaliado' && settings?.gradesReleased) {
          try {
            const resSnap = await getDoc(doc(db, 'results', teamId));
            if (resSnap.exists()) {
              setResult(resSnap.data() as ResultDoc);
            }
          } catch {
            setResult(null);
          }
        } else {
          setResult(null);
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro ao carregar dados da equipe.';
      setError(msg);
      showToast(msg, 'error');
    } finally {
      setLoading(false);
    }
  }, [user, profile?.teamId, ensureTeamProvisioned, settings?.gradesReleased, showToast]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  // Status derivado: status + submissionDeadline + hora do servidor
  const deadlineMs = settings?.submissionDeadline ? settings.submissionDeadline.toMillis() : null;
  const countdown = getCountdownParts(deadlineMs, offsetMs);

  const effectiveStatus: ProjectStatus = useMemo(() => {
    if (!project) return 'rascunho';
    if (project.status === 'rascunho' && countdown.expired) {
      return 'encerrado';
    }
    return project.status;
  }, [project, countdown.expired]);

  const isEditable = effectiveStatus === 'rascunho';
  const externalCount = useMemo(() => members.filter((m) => m.isExternal).length, [members]);
  const minMembers = settings?.teamMinMembers ?? 3;
  const maxMembers = settings?.teamMaxMembers ?? 5;
  const maxExternal = settings?.maxExternalMembers ?? 1;

  // Checklist em tempo real (Etapa 4)
  const checklist = useMemo(() => {
    const step1Ok =
      projName.trim().length >= 2 &&
      shortDesc.trim().length >= 10 &&
      shortDesc.trim().length <= 200 &&
      fullDesc.trim().length >= 20;
    const repoOk = REPO_URL_REGEX.test(githubUrl.trim()) && isRepoPublicDeclared;
    const demoOk = !demoUrl.trim() || DEMO_URL_REGEX.test(demoUrl.trim());
    const slidesOk = DEMO_URL_REGEX.test(slidesUrl.trim());
    const teamOk = members.length >= minMembers && members.length <= maxMembers && externalCount <= maxExternal;
    return { step1Ok, repoOk, demoOk, slidesOk, teamOk };
  }, [
    projName,
    shortDesc,
    fullDesc,
    githubUrl,
    isRepoPublicDeclared,
    demoUrl,
    slidesUrl,
    members.length,
    minMembers,
    maxMembers,
    externalCount,
    maxExternal,
  ]);

  // --- AÇÕES DE TECNOLOGIAS ---
  const handleAddTech = () => {
    const val = techInput.trim();
    if (!val || !isEditable) return;
    if (technologies.length >= 12) {
      showToast('Máximo de 12 tecnologias permitido.', 'warning');
      return;
    }
    if (technologies.some((t) => t.toLowerCase() === val.toLowerCase())) {
      setTechInput('');
      return;
    }
    setTechnologies((prev) => [...prev, val.slice(0, 32)]);
    setTechInput('');
  };

  const handleRemoveTech = (tag: string) => {
    if (!isEditable) return;
    setTechnologies((prev) => prev.filter((t) => t !== tag));
  };

  // --- SALVAR RASCUNHO ---
  const persistProjectFields = async (overrides?: Partial<ProjectDoc>) => {
    if (!team) return;
    if (shortDesc.length > 200) {
      showToast('O resumo curto deve ter no máximo 200 caracteres.', 'error');
      return false;
    }
    const payload = {
      name: projName.slice(0, 140),
      shortDescription: shortDesc.slice(0, 200),
      fullDescription: fullDesc.slice(0, 4000),
      track,
      technologies: technologies.slice(0, 12),
      githubUrl: githubUrl.trim().slice(0, 300),
      isRepoPublicDeclared,
      demoUrl: demoUrl.trim().slice(0, 500),
      slidesUrl: (overrides?.slidesUrl ?? slidesUrl).trim().slice(0, 500),
      slidesPath: '',
      slidesName: '',
      slidesSize: 0,
      screenshots: overrides?.screenshots ?? screenshots,
      updatedAt: serverTimestamp(),
    };

    try {
      await updateDoc(doc(db, 'projects', team.id), payload);
      return true;
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `projects/${team.id}`);
    }
  };

  const handleSaveDraft = async () => {
    if (!isEditable || !team) return;
    setSavingDraft(true);
    try {
      const ok = await persistProjectFields();
      if (ok) {
        showToast('Rascunho salvo com sucesso!', 'success');
      }
    } catch {
      showToast('Erro ao salvar rascunho. Verifique se o prazo ainda está aberto.', 'error');
    } finally {
      setSavingDraft(false);
    }
  };

  // --- INTEGRANTES (ETAPA 2) ---
  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isEditable || !team || !user) return;

    if (members.length >= maxMembers) {
      showToast(`A equipe já atingiu o máximo de ${maxMembers} integrantes.`, 'error');
      return;
    }

    const parsed = teamMemberSchema.safeParse({
      name: newMemberName,
      email: newMemberEmail,
      course: newMemberCourse,
      semester: newMemberSemester,
      isExternal: newMemberExternal,
    });
    if (!parsed.success) {
      showToast(parsed.error.issues[0]?.message || 'Dados inválidos.', 'error');
      return;
    }

    if (parsed.data.isExternal && externalCount >= maxExternal) {
      showToast(`Cada equipe pode ter no máximo ${maxExternal} integrante externo.`, 'error');
      return;
    }

    const normalized = normalizeEmail(parsed.data.email);
    if (members.some((m) => m.normalizedEmail === normalized)) {
      showToast('Este e-mail já faz parte da sua equipe.', 'warning');
      return;
    }

    setSavingMember(true);
    try {
      const lockRef = doc(db, 'memberLocks', normalized);
      const lockSnap = await getDoc(lockRef);
      if (lockSnap.exists()) {
        showToast('Este estudante já está inscrito em outra equipe do hackathon.', 'error');
        return;
      }

      const memberId = `mem_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const batch = writeBatch(db);
      batch.set(doc(db, 'teams', team.id, 'members', memberId), {
        name: parsed.data.name,
        email: parsed.data.email,
        normalizedEmail: normalized,
        course: parsed.data.course,
        semester: parsed.data.semester,
        isExternal: parsed.data.isExternal,
        isLeader: false,
        createdAt: serverTimestamp(),
      });
      batch.set(lockRef, {
        teamId: team.id,
        leaderUid: user.uid,
        createdAt: serverTimestamp(),
      });

      await batch.commit();

      const membersSnap = await getDocs(
        query(collection(db, 'teams', team.id, 'members'), orderBy('createdAt', 'asc'))
      );
      setMembers(membersSnap.docs.map((d) => ({ id: d.id, ...d.data() } as TeamMemberDoc)));

      setNewMemberName('');
      setNewMemberEmail('');
      setNewMemberCourse('');
      setNewMemberSemester('');
      setNewMemberExternal(false);
      setMemberModalOpen(false);
      showToast('Integrante adicionado à equipe!', 'success');
    } catch (err) {
      console.error('Erro ao adicionar integrante:', err);
      showToast('Não foi possível adicionar o integrante. Verifique se o e-mail já pertence a outra equipe.', 'error');
    } finally {
      setSavingMember(false);
    }
  };

  const handleRemoveMember = async (member: TeamMemberDoc) => {
    if (!isEditable || !team || member.isLeader) return;
    try {
      const batch = writeBatch(db);
      batch.delete(doc(db, 'teams', team.id, 'members', member.id));
      batch.delete(doc(db, 'memberLocks', member.normalizedEmail));
      await batch.commit();
      setMembers((prev) => prev.filter((m) => m.id !== member.id));
      showToast(`${member.name} foi removido(a) da equipe.`, 'info');
    } catch {
      showToast('Erro ao remover integrante.', 'error');
    }
  };

  const handleSaveLeaderAcademic = async (leaderMember: TeamMemberDoc) => {
    if (!isEditable || !team) return;
    if (leaderCourseInput.trim().length < 2 || leaderSemesterInput.trim().length < 1) {
      showToast('Preencha curso e semestre do líder.', 'warning');
      return;
    }
    try {
      await updateDoc(doc(db, 'teams', team.id, 'members', leaderMember.id), {
        course: leaderCourseInput.trim(),
        semester: leaderSemesterInput.trim(),
      });
      setMembers((prev) =>
        prev.map((m) =>
          m.id === leaderMember.id
            ? { ...m, course: leaderCourseInput.trim(), semester: leaderSemesterInput.trim() }
            : m
        )
      );
      setEditingLeaderCourse(false);
      showToast('Dados acadêmicos do líder atualizados!', 'success');
    } catch {
      showToast('Erro ao atualizar dados do líder.', 'error');
    }
  };

  // --- SCREENSHOTS VIA LINK (ETAPA 3 — SEM STORAGE PAGO) ---
  const handleAddScreenshot = async () => {
    if (!isEditable || !team) return;
    if (screenshots.length >= 5) {
      showToast('Você pode adicionar no máximo 5 screenshots.', 'error');
      return;
    }

    const url = newScreenshotUrl.trim();
    if (!DEMO_URL_REGEX.test(url)) {
      showToast('Informe uma URL válida para a imagem (começando com https:// ou http://).', 'error');
      return;
    }
    if (url.length > 500) {
      showToast('A URL da imagem é muito longa (máximo 500 caracteres).', 'error');
      return;
    }
    if (screenshots.some((s) => s.path === url)) {
      showToast('Este link de imagem já foi adicionado.', 'warning');
      return;
    }

    const label = newScreenshotLabel.trim().slice(0, 60) || `Screenshot ${screenshots.length + 1}`;
    const updatedShots: ScreenshotItem[] = [...screenshots, { path: url, name: label, size: 0 }];

    setSavingScreenshots(true);
    try {
      const ok = await persistProjectFields({ screenshots: updatedShots });
      if (ok) {
        setScreenshots(updatedShots);
        setNewScreenshotUrl('');
        setNewScreenshotLabel('');
        showToast('Screenshot adicionado com sucesso!', 'success');
      }
    } catch {
      showToast('Não foi possível salvar o screenshot.', 'error');
    } finally {
      setSavingScreenshots(false);
    }
  };

  const handleRemoveScreenshot = async (shot: ScreenshotItem) => {
    if (!isEditable || !team) return;
    setSavingScreenshots(true);
    try {
      const updated = screenshots.filter((s) => s.path !== shot.path);
      const ok = await persistProjectFields({ screenshots: updated });
      if (ok) {
        setScreenshots(updated);
        showToast('Screenshot removido.', 'info');
      }
    } catch {
      showToast('Erro ao remover screenshot.', 'error');
    } finally {
      setSavingScreenshots(false);
    }
  };

  // --- ENVIO DEFINITIVO (VIA FIRESTORE + SECURITY RULES) ---
  const handleAttemptSubmit = async () => {
    if (!isEditable) return;

    const issues = validateProjectForSubmission({
      name: projName,
      shortDescription: shortDesc,
      fullDescription: fullDesc,
      track,
      githubUrl,
      isRepoPublicDeclared,
      demoUrl,
      slidesUrl,
      screenshotsCount: screenshots.length,
      membersCount: members.length,
      externalCount,
      minMembers,
      maxMembers,
      maxExternal,
    });

    if (issues.length > 0) {
      setValidationIssues(issues);
      setStep(issues[0].step);
      showToast('Existem pendências antes do envio definitivo.', 'error');
      return;
    }

    setValidationIssues([]);
    try {
      await persistProjectFields();
      setConfirmModalOpen(true);
    } catch {
      showToast('Não foi possível salvar os dados antes do envio.', 'error');
    }
  };

  const handleConfirmSubmission = async () => {
    if (!team || !isEditable) return;
    setSubmittingProject(true);
    try {
      await updateDoc(doc(db, 'projects', team.id), {
        name: projName.trim().slice(0, 140),
        shortDescription: shortDesc.trim().slice(0, 200),
        fullDescription: fullDesc.trim().slice(0, 4000),
        track,
        technologies: technologies.slice(0, 12),
        githubUrl: githubUrl.trim().slice(0, 300),
        isRepoPublicDeclared,
        demoUrl: demoUrl.trim().slice(0, 500),
        slidesUrl: slidesUrl.trim().slice(0, 500),
        slidesPath: '',
        slidesName: '',
        slidesSize: 0,
        screenshots: screenshots.slice(0, 5),
        status: 'enviado',
        submittedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setConfirmModalOpen(false);
      await loadAll();
      showToast('Projeto enviado com sucesso! A banca examinadora iniciará a avaliação.', 'success');
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code;
      if (code === 'permission-denied') {
        showToast(
          'Envio bloqueado pelo servidor. Verifique se o prazo ainda está aberto e se todos os campos obrigatórios estão preenchidos.',
          'error'
        );
      } else {
        showToast('Erro ao enviar projeto. Tente novamente.', 'error');
      }
    } finally {
      setSubmittingProject(false);
    }
  };

  const initials = (profile?.name || user?.displayName || 'EQ')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');

  const statusMeta: Record<
    ProjectStatus,
    { badge: string; badgeText: string; box: string; icon: string; title: string; subtitle: string }
  > = {
    rascunho: {
      badge: 'bg-amber-950 text-amber-300 border-amber-500/30',
      badgeText: 'Rascunho',
      box: 'bg-amber-950/60 border-amber-500/40 text-amber-300',
      icon: 'fa-solid fa-pen-to-square',
      title: 'Rascunho em edição',
      subtitle: 'Você ainda pode alterar os dados.',
    },
    enviado: {
      badge: 'bg-indigo-950 text-cyan-300 border-cyan-500/30',
      badgeText: 'Enviado',
      box: 'bg-indigo-950/70 border-cyan-500/40 text-cyan-200',
      icon: 'fa-solid fa-paper-plane',
      title: 'Projeto enviado',
      subtitle: 'Aguardando avaliação da banca.',
    },
    avaliado: {
      badge: 'bg-emerald-950 text-emerald-300 border-emerald-500/30',
      badgeText: 'Avaliado',
      box: 'bg-emerald-950/60 border-emerald-500/40 text-emerald-300',
      icon: 'fa-solid fa-circle-check',
      title: 'Avaliação Concluída',
      subtitle: settings?.gradesReleased
        ? 'Notas disponíveis abaixo.'
        : 'Aguardando liberação oficial da organização.',
    },
    encerrado: {
      badge: 'bg-rose-950 text-rose-300 border-rose-500/30',
      badgeText: 'Encerrado',
      box: 'bg-rose-950/60 border-rose-500/40 text-rose-300',
      icon: 'fa-solid fa-lock',
      title: 'Prazo de envio encerrado',
      subtitle: 'Edições bloqueadas pelo sistema.',
    },
  };

  const currentMeta = statusMeta[effectiveStatus];

  if (loading) {
    return (
      <div className="min-h-screen bg-navy-900 text-slate-200 flex items-center justify-center p-6">
        <div className="bg-navy-800 border border-navy-600 rounded-2xl p-8 text-center space-y-3">
          <i className="fa-solid fa-circle-notch fa-spin text-2xl text-indigo-400" />
          <p className="text-xs text-slate-400 font-code">Carregando painel da equipe...</p>
        </div>
      </div>
    );
  }

  const handleRecreateDraftProject = async () => {
    if (!team || !user) return;
    setSavingDraft(true);
    try {
      await setDoc(doc(db, 'projects', team.id), {
        teamId: team.id,
        leaderUid: user.uid,
        teamName: team.name,
        teamNumber: team.number,
        name: '',
        shortDescription: '',
        fullDescription: '',
        track: PROJECT_TRACKS[0],
        technologies: [],
        githubUrl: '',
        isRepoPublicDeclared: false,
        demoUrl: '',
        slidesUrl: '',
        slidesPath: '',
        slidesName: '',
        slidesSize: 0,
        screenshots: [],
        status: 'rascunho',
        updatedAt: serverTimestamp(),
      }).catch((e) => handleFirestoreError(e, OperationType.WRITE, `projects/${team.id}`));
      await loadAll();
      showToast('Novo rascunho de projeto iniciado!', 'success');
    } catch {
      showToast('Não foi possível criar um novo rascunho.', 'error');
    } finally {
      setSavingDraft(false);
    }
  };

  if (error || !team) {
    return (
      <div className="min-h-screen bg-navy-900 bg-grid-pattern flex items-center justify-center p-6">
        <div className="bg-rose-950/60 border border-rose-500/50 rounded-2xl p-6 max-w-md w-full text-xs text-rose-200 space-y-4">
          <p className="font-bold text-sm text-white">Não foi possível carregar sua equipe</p>
          <p>{error || 'Dados da equipe não encontrados.'}</p>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => void loadAll()}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-semibold"
            >
              Tentar novamente
            </button>
            <button
              type="button"
              onClick={() => void signOut()}
              className="px-4 py-2 bg-navy-900 text-slate-200 rounded-xl border border-navy-600"
            >
              Sair
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="min-h-screen bg-navy-900 bg-grid-pattern flex items-center justify-center p-6">
        <div className="bg-navy-800 border border-navy-600 rounded-2xl p-6 max-w-md w-full text-xs text-slate-300 space-y-4">
          <p className="font-heading font-bold text-base text-white">
            Projeto não encontrado para {team.name}
          </p>
          <p className="leading-relaxed text-slate-400">
            O envio anterior desta equipe foi removido pela organização ou ainda não foi inicializado.
          </p>
          <div className="flex flex-wrap gap-3">
            {!countdown.expired && (
              <button
                type="button"
                disabled={savingDraft}
                onClick={() => void handleRecreateDraftProject()}
                className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white rounded-xl font-semibold"
              >
                {savingDraft ? 'Criando...' : 'Iniciar Novo Rascunho'}
              </button>
            )}
            <button
              type="button"
              onClick={() => void loadAll()}
              className="px-4 py-2.5 bg-navy-900 hover:bg-navy-700 text-slate-200 rounded-xl border border-navy-600"
            >
              Atualizar
            </button>
            <button
              type="button"
              onClick={() => void signOut()}
              className="px-4 py-2.5 bg-navy-900 hover:bg-navy-700 text-slate-300 rounded-xl border border-navy-600"
            >
              Sair
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-navy-900 text-slate-200 flex flex-col">
      {/* Logged In Header */}
      <nav className="bg-navy-800 border-b border-navy-600 px-6 py-3.5 flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <span className="w-3 h-3 rounded-full bg-cyan-400 animate-pulse" />
            <span className="font-heading font-bold text-white text-sm sm:text-base">
              Equipe {team.name} #{String(team.number).padStart(2, '0')}
            </span>
          </div>
          <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-code border ${currentMeta.badge}`}>
            {currentMeta.badgeText}
          </span>
        </div>

        <div className="flex items-center space-x-3">
          <Link
            to="/"
            className="hidden md:inline-block text-xs text-slate-400 hover:text-cyan-400 transition mr-2 font-code"
          >
            Evento
          </Link>
          <div className="text-right hidden sm:block">
            <div className="text-xs font-medium text-white">{profile?.name || user?.displayName} (Líder)</div>
            <div className="text-[10px] text-slate-400 font-code">{user?.email}</div>
          </div>
          <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center font-bold text-xs text-white border border-indigo-400">
            {initials || 'EQ'}
          </div>
          <button
            type="button"
            onClick={() => void signOut()}
            title="Sair"
            className="text-slate-400 hover:text-white p-1.5"
          >
            <i className="fa-solid fa-right-from-bracket" />
          </button>
        </div>
      </nav>

      {/* Dashboard Content Container */}
      <div className="p-4 sm:p-8 max-w-7xl mx-auto w-full flex-1">
        {/* Wizard Progress Tracker (4 Steps) */}
        <div className="mb-8 bg-navy-800 p-4 sm:p-6 rounded-2xl border border-navy-600">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { id: 1 as WizardStep, title: 'Dados do Projeto', sub: 'Informações principais' },
              { id: 2 as WizardStep, title: 'Equipe', sub: `${minMembers} a ${maxMembers} integrantes` },
              { id: 3 as WizardStep, title: 'Arquivos & Links', sub: 'GitHub, Pitch, Screenshots' },
              { id: 4 as WizardStep, title: 'Revisão & Envio', sub: 'Checklist final' },
            ].map((tab) => {
              const active = step === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setStep(tab.id)}
                  className={`flex items-center space-x-3 p-3 rounded-xl text-left transition ${
                    active
                      ? 'bg-indigo-600 text-white shadow'
                      : 'bg-navy-900 text-slate-400 hover:text-white border border-navy-700'
                  }`}
                >
                  <span
                    className={`w-7 h-7 rounded-lg font-code text-xs font-bold flex items-center justify-center flex-shrink-0 ${
                      active ? 'bg-white/20' : 'bg-navy-800'
                    }`}
                  >
                    {tab.id}
                  </span>
                  <div className="overflow-hidden">
                    <div className="text-xs font-semibold truncate">{tab.title}</div>
                    <div className={`text-[10px] truncate ${active ? 'opacity-80' : 'opacity-70'}`}>{tab.sub}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Main Grid Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Form Wizard Content Column */}
          <div className="lg:col-span-8 space-y-6">
            {/* Validation Banner */}
            {validationIssues.length > 0 && (
              <div className="p-4 bg-rose-950/60 border border-rose-500/50 rounded-xl text-rose-300 text-xs space-y-2">
                <div className="flex items-center space-x-2">
                  <i className="fa-solid fa-triangle-exclamation text-rose-400 text-base flex-shrink-0" />
                  <p className="font-bold">Atenção: existem pendências no preenchimento!</p>
                </div>
                <ul className="space-y-1 pl-6 list-disc">
                  {validationIssues.map((issue, idx) => (
                    <li key={idx}>
                      <button
                        type="button"
                        onClick={() => setStep(issue.step)}
                        className="text-left hover:underline text-rose-200"
                      >
                        {issue.message} <span className="font-code text-rose-400">[Ir à Etapa {issue.step}]</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* ETAPA 1: DADOS DO PROJETO */}
            {step === 1 && (
              <div className="bg-navy-800 p-6 rounded-2xl border border-navy-600 space-y-5">
                <h3 className="font-heading font-bold text-white text-base border-b border-navy-700 pb-3 flex items-center space-x-2">
                  <i className="fa-solid fa-circle-info text-indigo-400" />
                  <span>Etapa 1: Dados do Projeto</span>
                </h3>

                <div>
                  <label htmlFor="proj-name" className="block text-xs font-medium text-slate-300 mb-1.5 font-code">
                    Nome do Projeto *
                  </label>
                  <input
                    id="proj-name"
                    type="text"
                    disabled={!isEditable}
                    maxLength={140}
                    value={projName}
                    onChange={(e) => setProjName(e.target.value)}
                    placeholder="Ex.: Plataforma de Tutoria Gamificada"
                    className="w-full bg-navy-900 border border-navy-600 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 disabled:opacity-60"
                  />
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1.5">
                    <label htmlFor="proj-short-desc" className="block text-xs font-medium text-slate-300 font-code">
                      Resumo Curto (Apresentação rápida) *
                    </label>
                    <span
                      className={`text-[11px] font-code tabular-nums ${
                        shortDesc.length > 200 ? 'text-rose-400 font-bold' : 'text-slate-400'
                      }`}
                    >
                      {shortDesc.length}/200
                    </span>
                  </div>
                  <textarea
                    id="proj-short-desc"
                    rows={2}
                    disabled={!isEditable}
                    maxLength={200}
                    value={shortDesc}
                    onChange={(e) => setShortDesc(e.target.value)}
                    placeholder="Descreva em até 200 caracteres o objetivo principal da solução..."
                    className="w-full bg-navy-900 border border-navy-600 rounded-xl p-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 disabled:opacity-60"
                  />
                </div>

                <div>
                  <label htmlFor="proj-full-desc" className="block text-xs font-medium text-slate-300 mb-1.5 font-code">
                    Descrição Completa e Escopo *
                  </label>
                  <textarea
                    id="proj-full-desc"
                    rows={5}
                    disabled={!isEditable}
                    maxLength={4000}
                    value={fullDesc}
                    onChange={(e) => setFullDesc(e.target.value)}
                    placeholder="Detalhe o problema resolvido, arquitetura proposta, funcionalidades e impacto esperado..."
                    className="w-full bg-navy-900 border border-navy-600 rounded-xl p-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 disabled:opacity-60"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="proj-track" className="block text-xs font-medium text-slate-300 mb-1.5 font-code">
                      Trilha / Tema Principal *
                    </label>
                    <select
                      id="proj-track"
                      disabled={!isEditable}
                      value={track}
                      onChange={(e) => setTrack(e.target.value)}
                      className="w-full bg-navy-900 border border-navy-600 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 disabled:opacity-60"
                    >
                      {PROJECT_TRACKS.map((tr) => (
                        <option key={tr} value={tr}>
                          {tr}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1.5 font-code">
                      Tecnologias Usadas (Tags)
                    </label>
                    <div className="bg-navy-900 border border-navy-600 rounded-xl p-2 flex flex-wrap items-center gap-1.5 min-h-[42px]">
                      {technologies.map((tag) => (
                        <span
                          key={tag}
                          className="bg-indigo-950 text-indigo-300 border border-indigo-500/30 px-2 py-0.5 rounded text-xs font-code flex items-center space-x-1"
                        >
                          <span>{tag}</span>
                          {isEditable && (
                            <button
                              type="button"
                              onClick={() => handleRemoveTech(tag)}
                              aria-label={`Remover ${tag}`}
                              className="hover:text-white"
                            >
                              <i className="fa-solid fa-xmark text-[10px]" />
                            </button>
                          )}
                        </span>
                      ))}
                      {isEditable && (
                        <input
                          type="text"
                          value={techInput}
                          onChange={(e) => setTechInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleAddTech();
                            }
                          }}
                          placeholder="+ Digite e Enter"
                          className="bg-transparent text-xs text-white placeholder-slate-500 focus:outline-none px-2 py-1 font-code flex-1 min-w-[100px]"
                        />
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ETAPA 2: EQUIPE */}
            {step === 2 && (
              <div className="bg-navy-800 p-6 rounded-2xl border border-navy-600 space-y-5">
                <div className="flex flex-wrap justify-between items-center gap-3 border-b border-navy-700 pb-3">
                  <div>
                    <h3 className="font-heading font-bold text-white text-base flex items-center space-x-2">
                      <i className="fa-solid fa-users text-indigo-400" />
                      <span>
                        Etapa 2: Integrantes da Equipe ({minMembers} a {maxMembers})
                      </span>
                    </h3>
                    <p className="text-[11px] text-slate-400 mt-0.5 font-code">
                      {members.length}/{maxMembers} integrantes • {externalCount}/{maxExternal} externo(s)
                    </p>
                  </div>

                  {isEditable && (
                    <button
                      type="button"
                      disabled={members.length >= maxMembers}
                      onClick={() => setMemberModalOpen(true)}
                      className="px-3 py-1.5 bg-indigo-600/30 hover:bg-indigo-600/50 disabled:opacity-40 text-indigo-300 border border-indigo-500/40 rounded-lg text-xs font-medium transition flex items-center space-x-1.5"
                    >
                      <i className="fa-solid fa-user-plus" />
                      <span>Adicionar integrante</span>
                    </button>
                  )}
                </div>

                <div className="space-y-3">
                  {members.map((m, idx) => {
                    const mInitials = m.name
                      .split(' ')
                      .filter(Boolean)
                      .slice(0, 2)
                      .map((p) => p[0]?.toUpperCase())
                      .join('');
                    const avatarColors = ['bg-indigo-600', 'bg-cyan-600', 'bg-purple-600', 'bg-emerald-600', 'bg-amber-600'];
                    const avatarClass = avatarColors[idx % avatarColors.length];

                    return (
                      <div
                        key={m.id}
                        className="bg-navy-900 p-4 rounded-xl border border-navy-600 flex flex-wrap items-center justify-between gap-3"
                      >
                        <div className="flex items-center space-x-3">
                          <div className={`w-9 h-9 rounded-full ${avatarClass} flex items-center justify-center font-bold text-xs text-white flex-shrink-0`}>
                            {mInitials || 'IN'}
                          </div>
                          <div>
                            <div className="text-sm font-semibold text-white flex flex-wrap items-center gap-2">
                              <span>{m.name}</span>
                              {m.isLeader && (
                                <span className="bg-cyan-950 text-cyan-300 border border-cyan-500/30 text-[10px] px-2 py-0.5 rounded font-code">
                                  Líder
                                </span>
                              )}
                              {m.isExternal && (
                                <span className="bg-purple-950 text-purple-300 border border-purple-500/30 text-[10px] px-2 py-0.5 rounded font-code">
                                  Externo
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-slate-400 font-code break-all">
                              {m.email} • {m.course} ({m.semester})
                            </div>
                          </div>
                        </div>

                        {m.isLeader ? (
                          <div className="flex items-center space-x-3">
                            {isEditable && (
                              <button
                                type="button"
                                onClick={() => {
                                  setLeaderCourseInput(m.course);
                                  setLeaderSemesterInput(m.semester);
                                  setEditingLeaderCourse((prev) => !prev);
                                }}
                                className="text-xs text-indigo-400 hover:text-indigo-300 font-code"
                              >
                                Editar curso
                              </button>
                            )}
                            <span className="text-xs text-slate-500 font-code">(Inscrição principal)</span>
                          </div>
                        ) : (
                          isEditable && (
                            <button
                              type="button"
                              onClick={() => void handleRemoveMember(m)}
                              title="Remover integrante"
                              className="text-slate-400 hover:text-rose-400 text-xs p-2 transition"
                            >
                              <i className="fa-solid fa-trash-can" />
                            </button>
                          )
                        )}
                      </div>
                    );
                  })}

                  {/* Inline edição de curso/semestre do líder */}
                  {editingLeaderCourse && isEditable && (
                    <div className="bg-navy-900/80 border border-indigo-500/40 rounded-xl p-4 space-y-3">
                      <div className="text-xs font-code text-cyan-400">Atualizar curso e semestre do líder</div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <input
                          type="text"
                          value={leaderCourseInput}
                          onChange={(e) => setLeaderCourseInput(e.target.value)}
                          placeholder="Curso (ex.: Ciência da Computação)"
                          className="bg-navy-800 border border-navy-600 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                        />
                        <input
                          type="text"
                          value={leaderSemesterInput}
                          onChange={(e) => setLeaderSemesterInput(e.target.value)}
                          placeholder="Semestre (ex.: 4º Semestre)"
                          className="bg-navy-800 border border-navy-600 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                        />
                      </div>
                      <div className="flex justify-end space-x-2">
                        <button
                          type="button"
                          onClick={() => setEditingLeaderCourse(false)}
                          className="px-3 py-1.5 text-xs text-slate-400 hover:text-white"
                        >
                          Cancelar
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const leader = members.find((m) => m.isLeader);
                            if (leader) void handleSaveLeaderAcademic(leader);
                          }}
                          className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold"
                        >
                          Salvar
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ETAPA 3: ARQUIVOS E LINKS */}
            {step === 3 && (
              <div className="bg-navy-800 p-6 rounded-2xl border border-navy-600 space-y-5">
                <h3 className="font-heading font-bold text-white text-base border-b border-navy-700 pb-3 flex items-center space-x-2">
                  <i className="fa-solid fa-folder-open text-indigo-400" />
                  <span>Etapa 3: Repositório, Mídia e Apresentação</span>
                </h3>

                <div>
                  <label htmlFor="input-github-url" className="block text-xs font-medium text-slate-300 mb-1.5 font-code">
                    Link do Repositório (GitHub / GitLab) *
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                      <i className="fa-brands fa-github" />
                    </div>
                    <input
                      id="input-github-url"
                      type="url"
                      disabled={!isEditable}
                      value={githubUrl}
                      onChange={(e) => setGithubUrl(e.target.value)}
                      placeholder="https://github.com/sua-equipe/seu-projeto"
                      className="w-full bg-navy-900 border border-navy-600 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 font-code disabled:opacity-60"
                    />
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1">
                    Certifique-se de que o repositório esteja configurado como <strong>público</strong>.
                  </p>

                  <label className="mt-3 flex items-center space-x-2.5 text-xs text-slate-200 cursor-pointer">
                    <input
                      type="checkbox"
                      disabled={!isEditable}
                      checked={isRepoPublicDeclared}
                      onChange={(e) => setIsRepoPublicDeclared(e.target.checked)}
                      className="rounded border-navy-500 bg-navy-900 text-indigo-600 focus:ring-indigo-500"
                    />
                    <span>Declaro que o repositório está público</span>
                  </label>
                </div>

                <div>
                  <label htmlFor="input-demo-url" className="block text-xs font-medium text-slate-300 mb-1.5 font-code">
                    Link da Demonstração On-line ou Vídeo Pitch (opcional)
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                      <i className="fa-solid fa-globe" />
                    </div>
                    <input
                      id="input-demo-url"
                      type="url"
                      disabled={!isEditable}
                      value={demoUrl}
                      onChange={(e) => setDemoUrl(e.target.value)}
                      placeholder="https://seu-projeto-demo.vercel.app"
                      className="w-full bg-navy-900 border border-navy-600 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 font-code disabled:opacity-60"
                    />
                  </div>
                </div>

                {/* Link dos Slides do Pitch */}
                <div>
                  <label htmlFor="input-slides-url" className="block text-xs font-medium text-slate-300 mb-1.5 font-code">
                    Link dos Slides do Pitch (Google Drive, Canva, PDF on-line) *
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                      <i className="fa-solid fa-file-pdf" />
                    </div>
                    <input
                      id="input-slides-url"
                      type="url"
                      disabled={!isEditable}
                      value={slidesUrl}
                      onChange={(e) => setSlidesUrl(e.target.value)}
                      placeholder="https://drive.google.com/file/d/.../view"
                      className="w-full bg-navy-900 border border-navy-600 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 font-code disabled:opacity-60"
                    />
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2 mt-1.5">
                    <p className="text-[11px] text-slate-400">
                      Hospede seu PDF/apresentação no Google Drive (e-mail @estudantes.ifpr.edu.br), Canva ou GitHub e deixe visível como <strong>"Qualquer pessoa com o link"</strong>.
                    </p>
                    {DEMO_URL_REGEX.test(slidesUrl.trim()) && (
                      <a
                        href={slidesUrl.trim()}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center space-x-1.5 px-3 py-1 bg-navy-900 hover:bg-navy-700 border border-navy-600 rounded-lg text-[11px] text-cyan-400 font-code flex-shrink-0"
                      >
                        <i className="fa-solid fa-arrow-up-right-from-square" />
                        <span>Testar link dos slides</span>
                      </a>
                    )}
                  </div>
                </div>

                {/* Screenshots via Link */}
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1 font-code">
                      Capturas de Tela / Screenshots (Até 5 links de imagens — opcional)
                    </label>
                    <p className="text-[11px] text-slate-400">
                      Cole links públicos de imagens (ex.: pasta/imagem no GitHub, Imgur ou Google Drive).
                    </p>
                  </div>

                  {isEditable && screenshots.length < 5 && (
                    <div className="bg-navy-900/70 border border-navy-600 rounded-xl p-3 space-y-2.5">
                      <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
                        <input
                          type="url"
                          value={newScreenshotUrl}
                          onChange={(e) => setNewScreenshotUrl(e.target.value)}
                          placeholder="https://raw.githubusercontent.com/.../tela.png"
                          className="sm:col-span-7 bg-navy-900 border border-navy-600 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 font-code"
                        />
                        <input
                          type="text"
                          value={newScreenshotLabel}
                          onChange={(e) => setNewScreenshotLabel(e.target.value)}
                          placeholder="Legenda (ex.: Tela inicial)"
                          maxLength={60}
                          className="sm:col-span-3 bg-navy-900 border border-navy-600 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                        />
                        <button
                          type="button"
                          disabled={savingScreenshots}
                          onClick={() => void handleAddScreenshot()}
                          className="sm:col-span-2 px-3 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white rounded-lg text-xs font-semibold transition flex items-center justify-center space-x-1"
                        >
                          <i className={`fa-solid ${savingScreenshots ? 'fa-circle-notch fa-spin' : 'fa-plus'}`} />
                          <span>Adicionar</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {screenshots.length > 0 ? (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {screenshots.map((shot) => {
                        const isBroken = Boolean(brokenImageUrls[shot.path]);
                        return (
                          <div
                            key={shot.path}
                            className="bg-navy-900 border border-navy-600 rounded-lg p-2 text-center text-xs text-slate-400 font-code relative group"
                          >
                            {!isBroken ? (
                              <img
                                src={shot.path}
                                alt={shot.name}
                                onError={() =>
                                  setBrokenImageUrls((prev) => ({ ...prev, [shot.path]: true }))
                                }
                                className="w-full h-24 object-cover rounded mb-1.5 border border-navy-700"
                              />
                            ) : (
                              <div className="w-full h-24 flex flex-col items-center justify-center bg-navy-800 rounded mb-1.5 px-2">
                                <i className="fa-solid fa-image text-cyan-400 text-lg mb-1" />
                                <span className="text-[10px] text-slate-400">Link anexado</span>
                              </div>
                            )}
                            <div className="flex items-center justify-between gap-2">
                              <span className="truncate text-[11px] text-slate-300">{shot.name}</span>
                              <a
                                href={shot.path}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[10px] text-cyan-400 hover:underline flex-shrink-0"
                              >
                                Abrir
                              </a>
                            </div>
                            {isEditable && (
                              <button
                                type="button"
                                disabled={savingScreenshots}
                                onClick={() => void handleRemoveScreenshot(shot)}
                                aria-label={`Remover ${shot.name}`}
                                className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-rose-950/90 border border-rose-500/50 text-rose-300 hover:text-white flex items-center justify-center text-[10px]"
                              >
                                <i className="fa-solid fa-xmark" />
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="border-2 border-dashed border-navy-700 rounded-xl p-4 text-center text-xs text-slate-500 font-code">
                      Nenhum screenshot adicionado ({screenshots.length}/5).
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ETAPA 4: REVISÃO E ENVIO */}
            {step === 4 && (
              <div className="bg-navy-800 p-6 rounded-2xl border border-navy-600 space-y-6">
                <h3 className="font-heading font-bold text-white text-base border-b border-navy-700 pb-3 flex items-center space-x-2">
                  <i className="fa-solid fa-clipboard-check text-indigo-400" />
                  <span>Etapa 4: Revisão Final e Confirmação</span>
                </h3>

                <div className="space-y-4 text-xs">
                  <div className="bg-navy-900 p-4 rounded-xl border border-navy-600 space-y-1.5">
                    <span className="text-slate-400 font-code block">PROJETO</span>
                    <div className="text-sm font-bold text-white">
                      {projName.trim() || 'Nome do projeto não preenchido'}
                    </div>
                    <div className="text-slate-300">Trilha: {track}</div>
                    {shortDesc.trim() && <p className="text-slate-400 pt-1">{shortDesc}</p>}
                  </div>

                  {/* Checklist Rules */}
                  <div className="bg-navy-900 p-4 rounded-xl border border-navy-600 space-y-2.5 font-code">
                    <span className="text-slate-400 block mb-2 font-sans font-semibold">
                      Checklist de Requisitos para Submissão:
                    </span>

                    <button
                      type="button"
                      onClick={() => setStep(1)}
                      className={`w-full text-left flex items-center space-x-2 ${
                        checklist.step1Ok ? 'text-emerald-400' : 'text-amber-300'
                      }`}
                    >
                      <i className={`fa-solid ${checklist.step1Ok ? 'fa-check-circle' : 'fa-circle-dot'}`} />
                      <span>Dados do projeto preenchidos (nome, resumo até 200 chars e descrição)</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setStep(3)}
                      className={`w-full text-left flex items-center space-x-2 ${
                        checklist.repoOk ? 'text-emerald-400' : 'text-amber-300'
                      }`}
                    >
                      <i className={`fa-solid ${checklist.repoOk ? 'fa-check-circle' : 'fa-circle-dot'}`} />
                      <span>Repositório GitHub/GitLab informado e declarado como PÚBLICO</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setStep(3)}
                      className={`w-full text-left flex items-center space-x-2 ${
                        checklist.demoOk ? 'text-emerald-400' : 'text-rose-400'
                      }`}
                    >
                      <i className={`fa-solid ${checklist.demoOk ? 'fa-check-circle' : 'fa-circle-exclamation'}`} />
                      <span>Link da demonstração/vídeo válido (opcional)</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setStep(3)}
                      className={`w-full text-left flex items-center space-x-2 ${
                        checklist.slidesOk ? 'text-emerald-400' : 'text-amber-300'
                      }`}
                    >
                      <i className={`fa-solid ${checklist.slidesOk ? 'fa-check-circle' : 'fa-circle-dot'}`} />
                      <span>Link público dos slides do pitch informado</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setStep(2)}
                      className={`w-full text-left flex items-center space-x-2 ${
                        checklist.teamOk ? 'text-emerald-400' : 'text-amber-300'
                      }`}
                    >
                      <i className={`fa-solid ${checklist.teamOk ? 'fa-check-circle' : 'fa-circle-dot'}`} />
                      <span>
                        Equipe completa ({minMembers} a {maxMembers} integrantes • atual: {members.length})
                      </span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Dashboard Action Footer Buttons */}
            {isEditable ? (
              <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => void handleSaveDraft()}
                  disabled={savingDraft}
                  className="px-5 py-3 bg-navy-800 hover:bg-navy-700 disabled:opacity-60 text-slate-200 font-semibold rounded-xl border border-navy-600 text-xs transition flex items-center space-x-2"
                >
                  {savingDraft ? (
                    <i className="fa-solid fa-circle-notch fa-spin" />
                  ) : (
                    <i className="fa-solid fa-floppy-disk" />
                  )}
                  <span>{savingDraft ? 'Salvando...' : 'Salvar Rascunho'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => void handleAttemptSubmit()}
                  className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl shadow-lg shadow-indigo-600/30 text-xs transition flex items-center space-x-2"
                >
                  <i className="fa-solid fa-paper-plane" />
                  <span>Enviar Projeto Definitivo</span>
                </button>
              </div>
            ) : (
              <div className="bg-navy-800 border border-navy-600 rounded-xl p-4 text-xs text-slate-400 flex items-center space-x-2">
                <i className="fa-solid fa-lock text-slate-500" />
                <span>
                  Edições bloqueadas porque o projeto está com status <strong className="text-white">{currentMeta.badgeText}</strong>.
                </span>
              </div>
            )}
          </div>

          {/* Sticky Right Sidebar */}
          <div className="lg:col-span-4 space-y-6">
            {/* Countdown Card */}
            <div className="bg-navy-800 p-5 rounded-2xl border border-navy-600">
              <div className="text-xs font-code text-cyan-400 mb-2 flex items-center space-x-2">
                <i className="fa-solid fa-clock" />
                <span>PRAZO DE ENVIO</span>
              </div>
              <div className="text-2xl font-bold font-code text-white mb-1 tabular-nums">
                {countdown.expired
                  ? 'Prazo encerrado'
                  : `${countdown.days}d ${countdown.hours}h ${countdown.mins}m ${countdown.secs}s`}
              </div>
              <p className="text-[11px] text-slate-400">
                {deadlineMs
                  ? `Encerramento em ${formatSaoPauloDateTime(deadlineMs)} (Horário de Brasília).`
                  : 'Encerramento das submissões no sistema.'}
              </p>
            </div>

            {/* Project Status Card */}
            <div className="bg-navy-800 p-5 rounded-2xl border border-navy-600">
              <div className="text-xs font-code text-slate-400 mb-2">STATUS DO PROJETO</div>
              <div className={`p-3 rounded-xl border text-xs flex items-center space-x-3 ${currentMeta.box}`}>
                <i className={`${currentMeta.icon} text-base`} />
                <div>
                  <div className="font-bold">{currentMeta.title}</div>
                  <div className="text-[10px] opacity-80">{currentMeta.subtitle}</div>
                </div>
              </div>
            </div>

            {/* Evaluation Results Card */}
            <div className="bg-navy-800 p-5 rounded-2xl border border-navy-600">
              <div className="text-xs font-code text-indigo-400 mb-3 flex items-center justify-between">
                <span>AVALIAÇÃO DA BANCA</span>
                <i className="fa-solid fa-award" />
              </div>

              {effectiveStatus === 'avaliado' && settings?.gradesReleased && result ? (
                <div className="space-y-3 font-code text-xs">
                  <div className="bg-navy-900 p-3 rounded-xl border border-indigo-500/30 text-center">
                    <div className="text-[10px] text-slate-400 uppercase">Nota Final Calculada</div>
                    <div className="text-3xl font-bold text-cyan-400 my-1 tabular-nums">
                      {result.finalScore.toFixed(2)} <span className="text-xs text-slate-500">/ 10</span>
                    </div>
                    <span className="inline-block px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 text-[10px] border border-emerald-500/30">
                      {result.rank}º Lugar Geral
                    </span>
                  </div>

                  <div className="space-y-1.5 text-[11px]">
                    {criteria.map((c) => {
                      const val = result.averageCriteria?.[c.key] ?? 0;
                      return (
                        <div key={c.key} className="flex justify-between text-slate-300">
                          <span>
                            {c.name} ({c.weight}%):
                          </span>
                          <span className="font-bold text-white tabular-nums">{val.toFixed(1)}</span>
                        </div>
                      );
                    })}
                  </div>

                  {result.comments && result.comments.length > 0 && (
                    <div className="bg-navy-900 p-3 rounded-xl border border-navy-700 text-[11px] font-sans text-slate-300 space-y-2">
                      <span className="font-bold text-white block">Parecer dos Jurados:</span>
                      {result.comments.map((cmt, idx) => (
                        <p key={idx} className="text-slate-300 leading-relaxed">
                          “{cmt}”
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-6 border-2 border-dashed border-navy-700 rounded-xl p-4">
                  <i className="fa-solid fa-hourglass-half text-2xl text-slate-600 mb-2 block" />
                  <p className="text-xs text-slate-400">
                    As notas e feedbacks aparecerão aqui após o julgamento da banca examinadora.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Modal Adicionar Integrante */}
      {memberModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-navy-800 border border-navy-600 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4 animate-scaleUp">
            <div className="flex items-center justify-between border-b border-navy-700 pb-3">
              <h3 className="font-heading font-bold text-white text-base">Adicionar Integrante</h3>
              <button
                type="button"
                onClick={() => setMemberModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <i className="fa-solid fa-xmark" />
              </button>
            </div>
            <form onSubmit={handleAddMember} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-slate-300 font-code mb-1">Nome Completo *</label>
                <input
                  type="text"
                  required
                  value={newMemberName}
                  onChange={(e) => setNewMemberName(e.target.value)}
                  placeholder="Nome completo do integrante"
                  className="w-full bg-navy-900 border border-navy-600 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="block text-slate-300 font-code mb-1">E-mail *</label>
                <input
                  type="email"
                  required
                  value={newMemberEmail}
                  onChange={(e) => setNewMemberEmail(e.target.value)}
                  placeholder="integrante@estudantes.ifpr.edu.br"
                  className="w-full bg-navy-900 border border-navy-600 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-code mb-1">Curso *</label>
                  <input
                    type="text"
                    required
                    value={newMemberCourse}
                    onChange={(e) => setNewMemberCourse(e.target.value)}
                    placeholder="Ex.: Ciência da Computação"
                    className="w-full bg-navy-900 border border-navy-600 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-code mb-1">Semestre *</label>
                  <input
                    type="text"
                    required
                    value={newMemberSemester}
                    onChange={(e) => setNewMemberSemester(e.target.value)}
                    placeholder="Ex.: 2º Semestre"
                    className="w-full bg-navy-900 border border-navy-600 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>
              <label className="flex items-center space-x-2.5 text-slate-300 pt-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={newMemberExternal}
                  disabled={externalCount >= maxExternal}
                  onChange={(e) => setNewMemberExternal(e.target.checked)}
                  className="rounded border-navy-500 bg-navy-900 text-indigo-600 focus:ring-indigo-500"
                />
                <span>
                  Integrante externo ao IFPR (máx. {maxExternal} por equipe)
                </span>
              </label>

              <div className="flex items-center space-x-3 pt-2">
                <button
                  type="button"
                  onClick={() => setMemberModalOpen(false)}
                  className="w-1/2 py-2.5 bg-navy-900 hover:bg-navy-700 text-slate-300 rounded-xl border border-navy-600 font-semibold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingMember}
                  className="w-1/2 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white rounded-xl font-semibold shadow-lg shadow-indigo-600/30"
                >
                  {savingMember ? 'Salvando...' : 'Adicionar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      {confirmModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-navy-800 border border-navy-600 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4 animate-scaleUp">
            <div className="w-12 h-12 rounded-full bg-indigo-950 border border-indigo-500/30 flex items-center justify-center text-indigo-400 text-xl mx-auto">
              <i className="fa-solid fa-paper-plane" />
            </div>
            <div className="text-center">
              <h3 className="font-heading font-bold text-lg text-white">Confirmar Envio do Projeto?</h3>
              <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                Você está prestes a submeter o projeto <strong>{projName}</strong>. Certifique-se de que o repositório no GitHub/GitLab está público e todos os integrantes estão corretos. Após o envio, não será possível editar.
              </p>
            </div>
            <div className="flex items-center space-x-3 pt-2">
              <button
                type="button"
                disabled={submittingProject}
                onClick={() => setConfirmModalOpen(false)}
                className="w-1/2 py-2.5 bg-navy-900 hover:bg-navy-700 text-slate-300 rounded-xl border border-navy-600 text-xs font-semibold"
              >
                Revisar Dados
              </button>
              <button
                type="button"
                disabled={submittingProject}
                onClick={() => void handleConfirmSubmission()}
                className="w-1/2 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white rounded-xl text-xs font-semibold shadow-lg shadow-indigo-600/30 flex items-center justify-center space-x-1.5"
              >
                {submittingProject && <i className="fa-solid fa-circle-notch fa-spin" />}
                <span>{submittingProject ? 'Enviando...' : 'Sim, Enviar Agora'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
