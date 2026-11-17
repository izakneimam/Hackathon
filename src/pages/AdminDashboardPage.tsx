import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { collection, doc, getDocs, serverTimestamp, writeBatch } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { useEventData } from '../hooks/useEventData';
import { db } from '../lib/firebase';
import { handleFirestoreError, OperationType } from '../lib/firestoreError';
import { seedInitialContent } from '../lib/initialContent';
import { computeAllProjectResults } from '../lib/scoring';
import { AdminContentTab } from '../components/admin/AdminContentTab';
import { AdminEvaluationTab } from '../components/admin/AdminEvaluationTab';
import { AdminEventTab } from '../components/admin/AdminEventTab';
import { AdminRankingTab } from '../components/admin/AdminRankingTab';
import { AdminSubmissionsTab } from '../components/admin/AdminSubmissionsTab';
import { AdminUsersTeamsTab } from '../components/admin/AdminUsersTeamsTab';
import type {
  EvaluationDoc,
  ProjectDoc,
  ResultDoc,
  TeamDoc,
  UserProfile,
  UserRoleDoc,
} from '../types/hackathon';

type AdminTab = 'evento' | 'conteudo' | 'usuarios' | 'envios' | 'avaliacao' | 'ranking';

const ADMIN_TABS: { id: AdminTab; label: string; icon: string }[] = [
  { id: 'evento', label: 'Evento', icon: 'fa-sliders' },
  { id: 'conteudo', label: 'Conteúdo', icon: 'fa-layer-group' },
  { id: 'usuarios', label: 'Equipes & Usuários', icon: 'fa-users-gear' },
  { id: 'envios', label: 'Envios', icon: 'fa-folder-open' },
  { id: 'avaliacao', label: 'Avaliação', icon: 'fa-gavel' },
  { id: 'ranking', label: 'Ranking & Notas', icon: 'fa-trophy' },
];

export function AdminDashboardPage() {
  const { user, profile, role, signOut } = useAuth();
  const { showToast } = useToast();
  const {
    settings,
    stats,
    criteria,
    scheduleItems,
    rules,
    faqItems,
    publicJurors,
    loading: eventLoading,
    refetch,
  } = useEventData();

  const [activeTab, setActiveTab] = useState<AdminTab>('evento');
  const [seeding, setSeeding] = useState(false);
  const [adminLoading, setAdminLoading] = useState(true);
  const [adminError, setAdminError] = useState<string | null>(null);

  const [users, setUsers] = useState<UserProfile[]>([]);
  const [rolesMap, setRolesMap] = useState<Record<string, UserRoleDoc>>({});
  const [teams, setTeams] = useState<TeamDoc[]>([]);
  const [projects, setProjects] = useState<ProjectDoc[]>([]);
  const [evaluations, setEvaluations] = useState<EvaluationDoc[]>([]);
  const [results, setResults] = useState<ResultDoc[]>([]);

  const projectsMap = useMemo(() => {
    const map: Record<string, ProjectDoc> = {};
    for (const p of projects) {
      map[p.teamId] = p;
    }
    return map;
  }, [projects]);

  const loadAdminData = useCallback(async () => {
    if (role !== 'organizacao') {
      setAdminLoading(false);
      return;
    }

    setAdminLoading(true);
    setAdminError(null);
    try {
      const [usersSnap, rolesSnap, teamsSnap, projectsSnap, evalsSnap, resultsSnap] =
        await Promise.all([
          getDocs(collection(db, 'users')).catch((e) => {
            handleFirestoreError(e, OperationType.LIST, 'users');
            throw e;
          }),
          getDocs(collection(db, 'userRoles')).catch((e) => {
            handleFirestoreError(e, OperationType.LIST, 'userRoles');
            throw e;
          }),
          getDocs(collection(db, 'teams')).catch((e) => {
            handleFirestoreError(e, OperationType.LIST, 'teams');
            throw e;
          }),
          getDocs(collection(db, 'projects')).catch((e) => {
            handleFirestoreError(e, OperationType.LIST, 'projects');
            throw e;
          }),
          getDocs(collection(db, 'evaluations')).catch((e) => {
            handleFirestoreError(e, OperationType.LIST, 'evaluations');
            throw e;
          }),
          getDocs(collection(db, 'results')).catch((e) => {
            handleFirestoreError(e, OperationType.LIST, 'results');
            throw e;
          }),
        ]);

      setUsers(
        usersSnap.docs.map((d) => ({ uid: d.id, ...(d.data() as Omit<UserProfile, 'uid'>) }))
      );

      const nextRoles: Record<string, UserRoleDoc> = {};
      for (const d of rolesSnap.docs) {
        nextRoles[d.id] = d.data() as UserRoleDoc;
      }
      setRolesMap(nextRoles);

      setTeams(teamsSnap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<TeamDoc, 'id'>) })));
      setProjects(projectsSnap.docs.map((d) => d.data() as ProjectDoc));
      setEvaluations(
        evalsSnap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<EvaluationDoc, 'id'>) }))
      );
      setResults(resultsSnap.docs.map((d) => d.data() as ResultDoc));
    } catch {
      setAdminError('Não foi possível carregar todos os dados administrativos do Firestore.');
    } finally {
      setAdminLoading(false);
    }
  }, [role]);

  useEffect(() => {
    void loadAdminData();
  }, [loadAdminData]);

  const refreshAll = useCallback(async () => {
    await Promise.all([refetch(), loadAdminData()]);
  }, [refetch, loadAdminData]);

  const handleSeedInitialContent = async () => {
    if (role !== 'organizacao') {
      showToast('Apenas usuários com perfil Organização podem carregar o conteúdo inicial.', 'error');
      return;
    }

    setSeeding(true);
    try {
      await seedInitialContent();
      await refreshAll();
      showToast('Conteúdo inicial carregado no Firestore com sucesso!', 'success');
    } catch (err) {
      console.error('Erro ao carregar conteúdo inicial:', err);
      showToast(
        'Não foi possível gravar o conteúdo inicial. Verifique suas permissões no Firestore.',
        'error'
      );
    } finally {
      setSeeding(false);
    }
  };

  const syncResultsAndPromoteEvaluated = async (
    promoteSubmittedToEvaluated: boolean
  ): Promise<number> => {
    const computed = computeAllProjectResults({
      projects,
      evaluations,
      criteria,
    });

    const computedIds = new Set(computed.map((r) => r.projectId));

    type BatchOp =
      | { kind: 'setResult'; data: ResultDoc }
      | { kind: 'deleteResult'; projectId: string }
      | { kind: 'promoteProject'; projectId: string };

    const ops: BatchOp[] = [];

    for (const res of computed) {
      ops.push({ kind: 'setResult', data: res });
      if (promoteSubmittedToEvaluated) {
        const proj = projectsMap[res.projectId];
        if (proj && proj.status === 'enviado') {
          ops.push({ kind: 'promoteProject', projectId: res.projectId });
        }
      }
    }

    for (const existingRes of results) {
      if (!computedIds.has(existingRes.projectId)) {
        ops.push({ kind: 'deleteResult', projectId: existingRes.projectId });
      }
    }

    const CHUNK_SIZE = 400;
    for (let i = 0; i < ops.length; i += CHUNK_SIZE) {
      const slice = ops.slice(i, i + CHUNK_SIZE);
      const batch = writeBatch(db);

      for (const op of slice) {
        if (op.kind === 'setResult') {
          batch.set(doc(db, 'results', op.data.projectId), {
            ...op.data,
            updatedAt: serverTimestamp(),
          });
        } else if (op.kind === 'deleteResult') {
          batch.delete(doc(db, 'results', op.projectId));
        } else if (op.kind === 'promoteProject') {
          batch.update(doc(db, 'projects', op.projectId), {
            status: 'avaliado',
            updatedAt: serverTimestamp(),
          });
        }
      }

      await batch.commit().catch((err) => {
        handleFirestoreError(err, OperationType.WRITE, 'results');
        throw err;
      });
    }

    await loadAdminData();
    return computed.length;
  };

  const isLoadingInitial = (eventLoading || adminLoading) && users.length === 0 && !settings;

  return (
    <div className="min-h-screen bg-navy-900 text-slate-200 flex flex-col">
      {/* Top Navbar */}
      <nav className="bg-navy-800 border-b border-navy-600 px-4 sm:px-6 py-3.5 flex items-center justify-between gap-3 sticky top-0 z-30">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center font-code font-bold text-white text-xs shadow-lg shadow-indigo-600/30">
            {'{IF}'}
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="font-heading font-bold text-white text-sm sm:text-base">
                Painel da Organização
              </span>
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-code bg-cyan-950 text-cyan-300 border border-cyan-500/30">
                Organização
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-2 sm:space-x-3">
          <button
            type="button"
            onClick={() => void refreshAll()}
            disabled={adminLoading}
            title="Atualizar dados"
            className="px-3 py-1.5 bg-navy-900 hover:bg-navy-700 border border-navy-600 rounded-xl text-xs font-code text-slate-300 hover:text-white transition flex items-center space-x-1.5"
          >
            <i className={`fa-solid fa-rotate ${adminLoading ? 'fa-spin' : ''}`} />
            <span className="hidden md:inline">Atualizar</span>
          </button>

          <Link
            to="/"
            className="px-3 py-1.5 bg-navy-900 hover:bg-navy-700 border border-navy-600 rounded-xl text-xs font-semibold text-slate-300 hover:text-white transition flex items-center space-x-1.5"
          >
            <i className="fa-solid fa-arrow-up-right-from-square text-[10px]" />
            <span className="hidden sm:inline">Evento</span>
          </Link>

          <div className="text-right hidden md:block pl-2 border-l border-navy-700">
            <div className="text-xs font-medium text-white">
              {profile?.name || user?.displayName || 'Organização'}
            </div>
            <div className="text-[10px] text-slate-400 font-code">{user?.email}</div>
          </div>

          <button
            type="button"
            onClick={() => void signOut()}
            title="Sair"
            className="text-slate-400 hover:text-white p-2 rounded-lg hover:bg-navy-700/60 transition"
          >
            <i className="fa-solid fa-right-from-bracket" />
          </button>
        </div>
      </nav>

      {/* Navegação das 6 Abas */}
      <div className="bg-navy-800/60 border-b border-navy-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-2.5 flex items-center gap-2 overflow-x-auto">
          {ADMIN_TABS.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition flex items-center space-x-2 ${
                  isActive
                    ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/25'
                    : 'bg-navy-900/70 text-slate-400 hover:text-white border border-navy-700'
                }`}
              >
                <i className={`fa-solid ${tab.icon}`} />
                <span>{tab.label}</span>
                {tab.id === 'envios' && projects.length > 0 && (
                  <span className="px-1.5 py-0.5 rounded bg-navy-800/80 font-code text-[10px] tabular-nums">
                    {projects.filter((p) => p.status === 'enviado' || p.status === 'avaliado').length}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Conteúdo Principal */}
      <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full space-y-6">
        {adminError && (
          <div className="bg-rose-950/50 border border-rose-500/40 rounded-2xl p-4 flex items-center justify-between gap-3 text-xs text-rose-200">
            <div className="flex items-center space-x-2">
              <i className="fa-solid fa-triangle-exclamation text-rose-400" />
              <span>{adminError}</span>
            </div>
            <button
              type="button"
              onClick={() => void refreshAll()}
              className="px-3 py-1.5 bg-rose-900/60 hover:bg-rose-900 rounded-lg font-code"
            >
              Tentar novamente
            </button>
          </div>
        )}

        {isLoadingInitial ? (
          <div className="bg-navy-800 border border-navy-600 rounded-2xl p-12 text-center space-y-3">
            <i className="fa-solid fa-circle-notch fa-spin text-2xl text-indigo-400" />
            <p className="text-xs font-code text-slate-400">
              Carregando painel administrativo...
            </p>
          </div>
        ) : (
          <>
            {activeTab === 'evento' && (
              <AdminEventTab
                settings={settings}
                stats={stats}
                criteriaCount={criteria.length}
                scheduleCount={scheduleItems.length}
                jurorsCount={publicJurors.length}
                rulesCount={rules.length}
                faqCount={faqItems.length}
                seeding={seeding}
                onSeedInitialContent={handleSeedInitialContent}
                onSaved={refreshAll}
              />
            )}

            {activeTab === 'conteudo' && (
              <AdminContentTab
                criteria={criteria}
                scheduleItems={scheduleItems}
                publicJurors={publicJurors}
                rules={rules}
                faqItems={faqItems}
                onRefresh={refreshAll}
              />
            )}

            {activeTab === 'usuarios' && (
              <AdminUsersTeamsTab
                users={users}
                rolesMap={rolesMap}
                teams={teams}
                projectsMap={projectsMap}
                onRefresh={refreshAll}
              />
            )}

            {activeTab === 'envios' && (
              <AdminSubmissionsTab
                settings={settings}
                projects={projects}
                onRefresh={refreshAll}
              />
            )}

            {activeTab === 'avaliacao' && (
              <AdminEvaluationTab
                settings={settings}
                projects={projects}
                evaluations={evaluations}
                onSyncResultsAndPromote={syncResultsAndPromoteEvaluated}
                onRefresh={refreshAll}
              />
            )}

            {activeTab === 'ranking' && (
              <AdminRankingTab
                criteria={criteria}
                results={results}
                evaluations={evaluations}
                onRecalculate={() => syncResultsAndPromoteEvaluated(false)}
              />
            )}
          </>
        )}
      </main>
    </div>
  );
}
