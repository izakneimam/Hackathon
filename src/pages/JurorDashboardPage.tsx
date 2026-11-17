import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  collection,
  doc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { useEventData } from '../hooks/useEventData';
import { db } from '../lib/firebase';
import { handleFirestoreError, OperationType } from '../lib/firestoreError';
import {
  buildWeightsMap,
  computeEvaluationWeightedScore,
  CRITERION_KEYS,
  decimalToTenths,
  tenthsToDecimal,
} from '../lib/scoring';
import { formatSaoPauloDateTime } from '../lib/serverTime';
import { PROJECT_TRACKS } from '../lib/validation';
import type {
  CriterionDoc,
  CriterionKey,
  EvaluationDoc,
  EvaluationScores,
  ProjectDoc,
} from '../types/hackathon';

type StatusFilter = 'todos' | 'pendentes' | 'avaliados';

const DEFAULT_SCORES: EvaluationScores = {
  inovacao: 80,
  tecnica: 80,
  demo: 80,
  impacto: 80,
  pitch: 80,
};

const FALLBACK_CRITERIA: CriterionDoc[] = [
  {
    key: 'inovacao',
    name: 'Inovação e Criatividade',
    description: 'Originalidade da solução e abordagem criativa para o problema.',
    weight: 30,
    color: 'indigo',
    order: 1,
  },
  {
    key: 'tecnica',
    name: 'Qualidade Técnica e Código',
    description: 'Arquitetura, organização, boas práticas no Git e escolha tecnológica.',
    weight: 25,
    color: 'cyan',
    order: 2,
  },
  {
    key: 'demo',
    name: 'Protótipo / Demo Funcional',
    description: 'Funcionalidades demonstradas na prática, usabilidade e acabamento.',
    weight: 20,
    color: 'emerald',
    order: 3,
  },
  {
    key: 'impacto',
    name: 'Impacto e Viabilidade',
    description: 'Aplicabilidade real, benefício para os usuários e viabilidade.',
    weight: 15,
    color: 'amber',
    order: 4,
  },
  {
    key: 'pitch',
    name: 'Pitch e Apresentação',
    description: 'Clareza da comunicação, qualidade dos slides e domínio da equipe.',
    weight: 10,
    color: 'purple',
    order: 5,
  },
];

export function JurorDashboardPage() {
  const { user, profile, signOut } = useAuth();
  const { showToast } = useToast();
  const { settings, criteria: loadedCriteria, loading: loadingEvent } = useEventData();

  const criteria = loadedCriteria.length > 0 ? loadedCriteria : FALLBACK_CRITERIA;
  const weightsMap = useMemo(() => buildWeightsMap(criteria), [criteria]);

  const [projects, setProjects] = useState<ProjectDoc[]>([]);
  const [evaluationsMap, setEvaluationsMap] = useState<Record<string, EvaluationDoc>>({});
  const [loadingData, setLoadingData] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filtros
  const [searchTerm, setSearchTerm] = useState('');
  const [trackFilter, setTrackFilter] = useState<string>('todas');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('todos');
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [brokenImages, setBrokenImages] = useState<Record<string, boolean>>({});

  // Estado do formulário de avaliação do projeto selecionado
  const [scores, setScores] = useState<EvaluationScores>(DEFAULT_SCORES);
  const [comment, setComment] = useState('');
  const [savingEvaluation, setSavingEvaluation] = useState(false);

  const loadJurorData = useCallback(async () => {
    if (!user) return;
    setLoadingData(true);
    setError(null);
    try {
      const [projSnap, evalSnap] = await Promise.all([
        getDocs(query(collection(db, 'projects'), where('status', '==', 'enviado'))).catch((e) =>
          handleFirestoreError(e, OperationType.LIST, 'projects')
        ),
        getDocs(query(collection(db, 'evaluations'), where('jurorUid', '==', user.uid))).catch((e) =>
          handleFirestoreError(e, OperationType.LIST, 'evaluations')
        ),
      ]);

      const projList = projSnap.docs
        .map((d) => d.data() as ProjectDoc)
        .sort((a, b) => a.teamNumber - b.teamNumber);

      const evalsByProj: Record<string, EvaluationDoc> = {};
      for (const d of evalSnap.docs) {
        const data = d.data() as Omit<EvaluationDoc, 'id'>;
        evalsByProj[data.projectId] = { id: d.id, ...data };
      }

      setProjects(projList);
      setEvaluationsMap(evalsByProj);
      setSelectedProjectId((prev) => {
        if (prev && projList.some((p) => p.teamId === prev)) return prev;
        return projList[0]?.teamId ?? null;
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Não foi possível carregar os projetos enviados.';
      setError(msg);
      showToast(msg, 'error');
    } finally {
      setLoadingData(false);
    }
  }, [user, showToast]);

  useEffect(() => {
    void loadJurorData();
  }, [loadJurorData]);

  const selectedProject = useMemo(
    () => projects.find((p) => p.teamId === selectedProjectId) || null,
    [projects, selectedProjectId]
  );

  // Sincroniza formulário quando troca o projeto selecionado ou carrega avaliações
  useEffect(() => {
    if (!selectedProjectId) return;
    const existing = evaluationsMap[selectedProjectId];
    if (existing) {
      setScores({
        inovacao: Number(existing.scores?.inovacao ?? 0),
        tecnica: Number(existing.scores?.tecnica ?? 0),
        demo: Number(existing.scores?.demo ?? 0),
        impacto: Number(existing.scores?.impacto ?? 0),
        pitch: Number(existing.scores?.pitch ?? 0),
      });
      setComment(existing.comment || '');
    } else {
      setScores({ ...DEFAULT_SCORES });
      setComment('');
    }
  }, [selectedProjectId, evaluationsMap]);

  const filteredProjects = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return projects.filter((p) => {
      if (trackFilter !== 'todas' && p.track !== trackFilter) return false;
      const isEvaluated = Boolean(evaluationsMap[p.teamId]);
      if (statusFilter === 'pendentes' && isEvaluated) return false;
      if (statusFilter === 'avaliados' && !isEvaluated) return false;
      if (term) {
        const matchesName = (p.name || '').toLowerCase().includes(term);
        const matchesTeam = (p.teamName || '').toLowerCase().includes(term);
        const matchesNum = `#${String(p.teamNumber).padStart(2, '0')}`.includes(term);
        if (!matchesName && !matchesTeam && !matchesNum) return false;
      }
      return true;
    });
  }, [projects, evaluationsMap, trackFilter, statusFilter, searchTerm]);

  const evaluatedCount = useMemo(
    () => projects.filter((p) => Boolean(evaluationsMap[p.teamId])).length,
    [projects, evaluationsMap]
  );

  const pendingCount = Math.max(0, projects.length - evaluatedCount);
  const evaluationOpen = settings?.evaluationOpen !== false;
  const canSubmitScore = Boolean(selectedProject && evaluationOpen && selectedProject.status === 'enviado');

  const liveWeightedScore = useMemo(
    () => computeEvaluationWeightedScore(scores, weightsMap),
    [scores, weightsMap]
  );

  const handleScoreTenthsChange = (key: CriterionKey, tenthsValue: number) => {
    const clamped = Math.max(0, Math.min(100, Math.round(tenthsValue)));
    setScores((prev) => ({ ...prev, [key]: clamped }));
  };

  const handleScoreDecimalInput = (key: CriterionKey, rawValue: string) => {
    if (rawValue === '') {
      setScores((prev) => ({ ...prev, [key]: 0 }));
      return;
    }
    const normalized = rawValue.replace(',', '.');
    const parsed = Number(normalized);
    if (Number.isNaN(parsed)) return;
    handleScoreTenthsChange(key, decimalToTenths(parsed));
  };

  const handleSaveEvaluation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !selectedProject) return;

    if (!evaluationOpen) {
      showToast('O período de avaliação foi encerrado pela organização.', 'error');
      return;
    }

    for (const k of CRITERION_KEYS) {
      const val = scores[k];
      if (!Number.isInteger(val) || val < 0 || val > 100) {
        showToast('Todas as notas devem estar entre 0,0 e 10,0.', 'error');
        return;
      }
    }

    const evalId = `${selectedProject.teamId}_${user.uid}`;
    const evalRef = doc(db, 'evaluations', evalId);
    const existing = evaluationsMap[selectedProject.teamId];
    const jurorName = (profile?.name || user.displayName || user.email || 'Jurado').trim().slice(0, 120);
    const trimmedComment = comment.trim().slice(0, 2000);

    setSavingEvaluation(true);
    try {
      if (existing) {
        await updateDoc(evalRef, {
          scores,
          comment: trimmedComment,
          jurorName,
          updatedAt: serverTimestamp(),
        });
      } else {
        await setDoc(evalRef, {
          projectId: selectedProject.teamId,
          jurorUid: user.uid,
          jurorName,
          scores,
          comment: trimmedComment,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }

      await loadJurorData();
      showToast(
        existing ? 'Avaliação atualizada com sucesso!' : 'Avaliação registrada com sucesso!',
        'success'
      );
    } catch (err) {
      console.error('Erro ao salvar avaliação:', err);
      showToast(
        'Não foi possível gravar sua avaliação. Verifique se a avaliação ainda está aberta.',
        'error'
      );
    } finally {
      setSavingEvaluation(false);
    }
  };

  const colorAccentMap: Record<string, string> = {
    indigo: 'text-indigo-400 border-indigo-500/30 bg-indigo-950/60',
    cyan: 'text-cyan-400 border-cyan-500/30 bg-cyan-950/60',
    emerald: 'text-emerald-400 border-emerald-500/30 bg-emerald-950/60',
    amber: 'text-amber-400 border-amber-500/30 bg-amber-950/60',
    purple: 'text-purple-400 border-purple-500/30 bg-purple-950/60',
  };

  const slidesLink = selectedProject?.slidesUrl || (selectedProject?.slidesPath?.startsWith('http') ? selectedProject.slidesPath : '');

  if (loadingData || loadingEvent) {
    return (
      <div className="min-h-screen bg-navy-900 text-slate-200 flex items-center justify-center p-6">
        <div className="bg-navy-800 border border-navy-600 rounded-2xl p-8 text-center space-y-3">
          <i className="fa-solid fa-circle-notch fa-spin text-2xl text-indigo-400" />
          <p className="text-xs text-slate-400 font-code">Carregando projetos enviados para avaliação...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-navy-900 text-slate-200 flex flex-col">
      {/* Navbar */}
      <nav className="bg-navy-800 border-b border-navy-600 px-6 py-3.5 flex items-center justify-between gap-4">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center font-code font-bold text-white text-xs">
            {'{IF}'}
          </div>
          <span className="font-heading font-bold text-white text-sm sm:text-base">
            Painel do Jurado
          </span>
          <span
            className={`px-2.5 py-0.5 rounded-full text-[11px] font-code border ${
              evaluationOpen
                ? 'bg-emerald-950 text-emerald-300 border-emerald-500/30'
                : 'bg-rose-950 text-rose-300 border-rose-500/30'
            }`}
          >
            {evaluationOpen ? 'Avaliação Aberta' : 'Avaliação Encerrada'}
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
            <div className="text-xs font-medium text-white">{profile?.name || user?.displayName || 'Jurado'}</div>
            <div className="text-[10px] text-slate-400 font-code">{user?.email}</div>
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

      <main className="flex-1 p-4 sm:p-8 max-w-7xl mx-auto w-full space-y-6">
        {/* Banner se avaliação encerrada */}
        {!evaluationOpen && (
          <div className="p-4 bg-amber-950/60 border border-amber-500/40 rounded-2xl text-amber-200 text-xs flex items-center space-x-3">
            <i className="fa-solid fa-lock text-amber-400 text-base flex-shrink-0" />
            <div>
              <p className="font-bold">Período de avaliação encerrado pela organização</p>
              <p className="text-amber-200/80">
                Você ainda pode consultar suas notas enviadas, mas novas avaliações ou alterações estão bloqueadas.
              </p>
            </div>
          </div>
        )}

        {error && (
          <div className="p-4 bg-rose-950/60 border border-rose-500/50 rounded-2xl text-rose-200 text-xs flex items-center justify-between gap-4">
            <div className="flex items-center space-x-3">
              <i className="fa-solid fa-circle-exclamation text-rose-400 text-base" />
              <span>{error}</span>
            </div>
            <button
              type="button"
              onClick={() => void loadJurorData()}
              className="px-3 py-1.5 bg-navy-900 hover:bg-navy-700 rounded-lg border border-navy-600 text-white font-semibold"
            >
              Tentar novamente
            </button>
          </div>
        )}

        {/* Resumo do Jurado */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-navy-800 border border-navy-600 rounded-2xl p-4">
            <div className="text-[11px] font-code text-slate-400 uppercase">Projetos Enviados</div>
            <div className="text-2xl font-heading font-bold text-white mt-1 tabular-nums">{projects.length}</div>
          </div>
          <div className="bg-navy-800 border border-navy-600 rounded-2xl p-4">
            <div className="text-[11px] font-code text-slate-400 uppercase">Avaliados por Você</div>
            <div className="text-2xl font-heading font-bold text-emerald-400 mt-1 tabular-nums">{evaluatedCount}</div>
          </div>
          <div className="bg-navy-800 border border-navy-600 rounded-2xl p-4">
            <div className="text-[11px] font-code text-slate-400 uppercase">Pendentes</div>
            <div className="text-2xl font-heading font-bold text-amber-400 mt-1 tabular-nums">{pendingCount}</div>
          </div>
          <div className="bg-navy-800 border border-navy-600 rounded-2xl p-4">
            <div className="text-[11px] font-code text-slate-400 uppercase">Progresso</div>
            <div className="text-2xl font-heading font-bold text-cyan-400 mt-1 tabular-nums">
              {projects.length > 0 ? Math.round((evaluatedCount / projects.length) * 100) : 0}%
            </div>
          </div>
        </div>

        {/* Layout Principal 2 Colunas */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Coluna Esquerda: Lista e Filtros */}
          <div className="lg:col-span-5 bg-navy-800 border border-navy-600 rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-navy-700 pb-3">
              <h2 className="font-heading font-bold text-white text-sm flex items-center space-x-2">
                <i className="fa-solid fa-layer-group text-indigo-400" />
                <span>Projetos Submetidos</span>
              </h2>
              <button
                type="button"
                onClick={() => void loadJurorData()}
                title="Atualizar lista"
                className="text-xs text-slate-400 hover:text-cyan-400 font-code"
              >
                <i className="fa-solid fa-rotate" /> Atualizar
              </button>
            </div>

            {/* Busca */}
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                <i className="fa-solid fa-magnifying-glass text-xs" />
              </div>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar projeto, equipe ou #número..."
                className="w-full bg-navy-900 border border-navy-600 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
              />
            </div>

            {/* Filtro de Trilha */}
            <div>
              <select
                value={trackFilter}
                onChange={(e) => setTrackFilter(e.target.value)}
                className="w-full bg-navy-900 border border-navy-600 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
              >
                <option value="todas">Todas as trilhas</option>
                {PROJECT_TRACKS.map((tr) => (
                  <option key={tr} value={tr}>
                    {tr}
                  </option>
                ))}
              </select>
            </div>

            {/* Filtro de Status */}
            <div className="bg-navy-900 p-1 rounded-xl border border-navy-600 grid grid-cols-3 gap-1">
              {(
                [
                  { id: 'todos', label: 'Todos' },
                  { id: 'pendentes', label: 'Pendentes' },
                  { id: 'avaliados', label: 'Avaliados' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setStatusFilter(tab.id)}
                  className={`py-1.5 px-2 rounded-lg text-[11px] font-semibold transition ${
                    statusFilter === tab.id
                      ? 'bg-indigo-600 text-white shadow'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Lista de Projetos */}
            <div className="space-y-2.5 max-h-[600px] overflow-y-auto pr-1">
              {filteredProjects.length === 0 ? (
                <div className="text-center py-10 border-2 border-dashed border-navy-700 rounded-xl p-4">
                  <i className="fa-solid fa-inbox text-2xl text-slate-600 mb-2 block" />
                  <p className="text-xs text-slate-400">
                    {projects.length === 0
                      ? 'Nenhum projeto enviado disponível para avaliação no momento.'
                      : 'Nenhum projeto encontrado para os filtros aplicados.'}
                  </p>
                </div>
              ) : (
                filteredProjects.map((proj) => {
                  const ev = evaluationsMap[proj.teamId];
                  const weighted = ev ? computeEvaluationWeightedScore(ev.scores, weightsMap) : null;
                  const active = selectedProjectId === proj.teamId;

                  return (
                    <button
                      key={proj.teamId}
                      type="button"
                      onClick={() => setSelectedProjectId(proj.teamId)}
                      className={`w-full text-left p-3.5 rounded-xl border transition space-y-1.5 ${
                        active
                          ? 'bg-indigo-950/60 border-indigo-500 shadow-lg shadow-indigo-950/30'
                          : 'bg-navy-900 border-navy-600 hover:border-navy-500'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-code text-cyan-400 truncate">
                          Equipe {proj.teamName} #{String(proj.teamNumber).padStart(2, '0')}
                        </span>
                        {ev && weighted !== null ? (
                          <span className="px-2 py-0.5 rounded bg-emerald-950 border border-emerald-500/30 text-emerald-300 text-[10px] font-code flex-shrink-0 tabular-nums">
                            Avaliado • {weighted.toFixed(2)}
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded bg-amber-950 border border-amber-500/30 text-amber-300 text-[10px] font-code flex-shrink-0">
                            Pendente
                          </span>
                        )}
                      </div>
                      <div className="font-heading font-bold text-sm text-white truncate">
                        {proj.name || 'Projeto sem título'}
                      </div>
                      <div className="text-[11px] text-slate-400 truncate">{proj.track}</div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Coluna Direita: Detalhes do Projeto + Formulário de Notas */}
          <div className="lg:col-span-7 space-y-6">
            {!selectedProject ? (
              <div className="bg-navy-800 border border-navy-600 rounded-2xl p-10 text-center space-y-3">
                <i className="fa-solid fa-gavel text-3xl text-slate-600" />
                <h3 className="font-heading font-bold text-white text-base">Selecione um projeto</h3>
                <p className="text-xs text-slate-400 max-w-md mx-auto">
                  Escolha um dos projetos enviados na lista ao lado para visualizar o repositório, slides, descrição e atribuir suas notas por critério.
                </p>
              </div>
            ) : (
              <>
                {/* Card Detalhes do Projeto */}
                <div className="bg-navy-800 border border-navy-600 rounded-2xl p-6 space-y-5">
                  <div className="flex flex-wrap items-start justify-between gap-3 border-b border-navy-700 pb-4">
                    <div>
                      <div className="flex flex-wrap items-center gap-2 mb-1.5">
                        <span className="px-2.5 py-0.5 rounded-full bg-indigo-950 border border-indigo-500/30 text-indigo-300 text-[11px] font-code">
                          Equipe {selectedProject.teamName} #{String(selectedProject.teamNumber).padStart(2, '0')}
                        </span>
                        <span className="px-2.5 py-0.5 rounded-full bg-cyan-950 border border-cyan-500/30 text-cyan-300 text-[11px] font-code">
                          {selectedProject.track}
                        </span>
                      </div>
                      <h2 className="font-heading font-bold text-xl text-white">
                        {selectedProject.name}
                      </h2>
                    </div>

                    {selectedProject.submittedAt && (
                      <div className="text-[11px] font-code text-slate-400 text-right">
                        <div>Enviado em</div>
                        <div className="text-slate-300">
                          {formatSaoPauloDateTime(selectedProject.submittedAt.toMillis())}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Resumo e Descrição */}
                  <div className="space-y-3 text-xs">
                    <div className="bg-navy-900 border border-navy-700 rounded-xl p-3.5">
                      <span className="text-[10px] font-code text-cyan-400 uppercase block mb-1">
                        Resumo Curto
                      </span>
                      <p className="text-slate-200 leading-relaxed">{selectedProject.shortDescription}</p>
                    </div>

                    <div className="bg-navy-900 border border-navy-700 rounded-xl p-3.5">
                      <span className="text-[10px] font-code text-indigo-400 uppercase block mb-1">
                        Descrição Completa e Escopo
                      </span>
                      <p className="text-slate-300 leading-relaxed whitespace-pre-line">
                        {selectedProject.fullDescription}
                      </p>
                    </div>
                  </div>

                  {/* Tecnologias */}
                  {selectedProject.technologies && selectedProject.technologies.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[11px] font-code text-slate-400 mr-1">Stack:</span>
                      {selectedProject.technologies.map((tech) => (
                        <span
                          key={tech}
                          className="bg-navy-900 border border-navy-600 px-2.5 py-0.5 rounded text-[11px] font-code text-indigo-300"
                        >
                          {tech}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Links de Avaliação */}
                  <div className="flex flex-wrap gap-3 pt-1">
                    {selectedProject.githubUrl && (
                      <a
                        href={selectedProject.githubUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-4 py-2.5 bg-navy-900 hover:bg-navy-700 border border-navy-600 rounded-xl text-xs font-semibold text-white transition flex items-center space-x-2"
                      >
                        <i className="fa-brands fa-github text-base" />
                        <span>Repositório</span>
                        <i className="fa-solid fa-arrow-up-right-from-square text-[10px] text-slate-400" />
                      </a>
                    )}

                    {selectedProject.demoUrl && (
                      <a
                        href={selectedProject.demoUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-4 py-2.5 bg-navy-900 hover:bg-navy-700 border border-navy-600 rounded-xl text-xs font-semibold text-cyan-300 transition flex items-center space-x-2"
                      >
                        <i className="fa-solid fa-globe" />
                        <span>Demo / Vídeo</span>
                        <i className="fa-solid fa-arrow-up-right-from-square text-[10px] text-slate-400" />
                      </a>
                    )}

                    {slidesLink && (
                      <a
                        href={slidesLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-4 py-2.5 bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/40 rounded-xl text-xs font-semibold text-indigo-200 transition flex items-center space-x-2"
                      >
                        <i className="fa-solid fa-file-pdf text-indigo-400" />
                        <span>Slides do Pitch</span>
                        <i className="fa-solid fa-arrow-up-right-from-square text-[10px]" />
                      </a>
                    )}
                  </div>

                  {/* Screenshots */}
                  {selectedProject.screenshots && selectedProject.screenshots.length > 0 && (
                    <div className="space-y-2 pt-2 border-t border-navy-700">
                      <div className="text-[11px] font-code text-slate-400 uppercase">
                        Capturas de Tela ({selectedProject.screenshots.length})
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        {selectedProject.screenshots.map((shot) => {
                          const broken = Boolean(brokenImages[shot.path]);
                          return (
                            <a
                              key={shot.path}
                              href={shot.path}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="bg-navy-900 border border-navy-600 hover:border-indigo-500 rounded-xl p-2 transition block"
                            >
                              {!broken ? (
                                <img
                                  src={shot.path}
                                  alt={shot.name}
                                  onError={() =>
                                    setBrokenImages((prev) => ({ ...prev, [shot.path]: true }))
                                  }
                                  className="w-full h-24 object-cover rounded mb-1.5 border border-navy-700"
                                />
                              ) : (
                                <div className="w-full h-24 flex items-center justify-center bg-navy-800 rounded mb-1.5">
                                  <i className="fa-solid fa-image text-cyan-400 text-lg" />
                                </div>
                              )}
                              <div className="truncate text-[11px] text-slate-300 font-code">{shot.name}</div>
                            </a>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                {/* Formulário de Avaliação */}
                <form
                  onSubmit={handleSaveEvaluation}
                  className="bg-navy-800 border border-navy-600 rounded-2xl p-6 space-y-5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-navy-700 pb-3">
                    <div>
                      <h3 className="font-heading font-bold text-white text-base flex items-center space-x-2">
                        <i className="fa-solid fa-clipboard-check text-cyan-400" />
                        <span>Avaliação por Critérios</span>
                      </h3>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        Atribua notas de <span className="font-code text-white">0,0</span> a{' '}
                        <span className="font-code text-white">10,0</span> (precisão em décimos).
                      </p>
                    </div>

                    <div className="bg-navy-900 border border-indigo-500/40 rounded-xl px-4 py-2 text-right">
                      <div className="text-[10px] font-code text-slate-400 uppercase">Prévia Ponderada</div>
                      <div className="text-xl font-heading font-bold text-cyan-400 font-code tabular-nums">
                        {liveWeightedScore.toFixed(2)}{' '}
                        <span className="text-xs text-slate-500">/ 10</span>
                      </div>
                    </div>
                  </div>

                  {/* Critérios */}
                  <div className="space-y-4">
                    {criteria.map((c) => {
                      const tenths = scores[c.key] ?? 0;
                      const decimalVal = tenthsToDecimal(tenths);
                      const badgeCls = colorAccentMap[c.color] || colorAccentMap.indigo;

                      return (
                        <div
                          key={c.key}
                          className="bg-navy-900 border border-navy-600 rounded-xl p-4 space-y-3"
                        >
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div className="max-w-md">
                              <div className="flex items-center space-x-2">
                                <span className="text-sm font-bold text-white">{c.name}</span>
                                <span className={`px-2 py-0.5 rounded border text-[10px] font-code ${badgeCls}`}>
                                  Peso {c.weight}%
                                </span>
                              </div>
                              <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                                {c.description}
                              </p>
                            </div>

                            <div className="flex items-center space-x-2">
                              <input
                                type="number"
                                min={0}
                                max={10}
                                step={0.1}
                                disabled={!canSubmitScore}
                                value={decimalVal.toFixed(1)}
                                onChange={(e) => handleScoreDecimalInput(c.key, e.target.value)}
                                className="w-20 bg-navy-800 border border-navy-600 rounded-lg px-2.5 py-1.5 text-sm font-code font-bold text-white text-center focus:outline-none focus:border-indigo-500 disabled:opacity-60 tabular-nums"
                              />
                              <span className="text-xs font-code text-slate-500">/ 10</span>
                            </div>
                          </div>

                          <input
                            type="range"
                            min={0}
                            max={100}
                            step={1}
                            disabled={!canSubmitScore}
                            value={tenths}
                            onChange={(e) => handleScoreTenthsChange(c.key, Number(e.target.value))}
                            className="w-full accent-indigo-500 cursor-pointer disabled:opacity-60"
                          />
                        </div>
                      );
                    })}
                  </div>

                  {/* Parecer */}
                  <div>
                    <div className="flex justify-between items-center mb-1.5">
                      <label htmlFor="juror-comment" className="block text-xs font-medium text-slate-300 font-code">
                        Parecer / Feedback para a Equipe
                      </label>
                      <span className="text-[11px] font-code text-slate-400 tabular-nums">
                        {comment.length}/2000
                      </span>
                    </div>
                    <textarea
                      id="juror-comment"
                      rows={4}
                      maxLength={2000}
                      disabled={!canSubmitScore}
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                      placeholder="Destaque pontos fortes do projeto, aspectos técnicos e sugestões de melhoria..."
                      className="w-full bg-navy-900 border border-navy-600 rounded-xl p-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 disabled:opacity-60"
                    />
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-navy-700">
                    <span className="text-[11px] text-slate-400 font-code">
                      {evaluationsMap[selectedProject.teamId]
                        ? 'Você já avaliou este projeto. Você pode atualizar enquanto a banca estiver aberta.'
                        : 'Avaliação sigilosa: outros jurados não visualizam suas notas.'}
                    </span>

                    <button
                      type="submit"
                      disabled={!canSubmitScore || savingEvaluation}
                      className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold rounded-xl shadow-lg shadow-indigo-600/30 text-xs transition flex items-center space-x-2"
                    >
                      {savingEvaluation ? (
                        <i className="fa-solid fa-circle-notch fa-spin" />
                      ) : (
                        <i className="fa-solid fa-check-double" />
                      )}
                      <span>
                        {savingEvaluation
                          ? 'Salvando...'
                          : evaluationsMap[selectedProject.teamId]
                          ? 'Atualizar Avaliação'
                          : 'Salvar Avaliação'}
                      </span>
                    </button>
                  </div>
                </form>
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
