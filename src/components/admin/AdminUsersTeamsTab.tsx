import { useMemo, useState } from 'react';
import { collection, doc, getDocs, orderBy, query, serverTimestamp, setDoc } from 'firebase/firestore';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { adminDeleteTeam, adminDeleteUser } from '../../lib/adminActions';
import { db } from '../../lib/firebase';
import { handleFirestoreError, OperationType } from '../../lib/firestoreError';
import type {
  ProjectDoc,
  TeamDoc,
  TeamMemberDoc,
  UserProfile,
  UserRoleDoc,
  UserRoleType,
} from '../../types/hackathon';
import { ConfirmModal } from './ConfirmModal';

export interface AdminUserRow {
  uid: string;
  email: string;
  name: string;
  role: UserRoleType;
  teamId?: string;
}

interface AdminUsersTeamsTabProps {
  users: UserProfile[];
  rolesMap: Record<string, UserRoleDoc>;
  teams: TeamDoc[];
  projectsMap: Record<string, ProjectDoc>;
  onRefresh: () => Promise<void>;
}

export function AdminUsersTeamsTab({
  users,
  rolesMap,
  teams,
  projectsMap,
  onRefresh,
}: AdminUsersTeamsTabProps) {
  const { user: currentUser } = useAuth();
  const { showToast } = useToast();

  const [subView, setSubView] = useState<'users' | 'teams'>('users');
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<'todos' | UserRoleType>('todos');

  const [pendingRoleChange, setPendingRoleChange] = useState<{
    uid: string;
    email: string;
    currentRole: UserRoleType;
    nextRole: UserRoleType;
  } | null>(null);
  const [updatingRole, setUpdatingRole] = useState(false);

  // Expansão de integrantes por equipe
  const [expandedTeamId, setExpandedTeamId] = useState<string | null>(null);
  const [membersCache, setMembersCache] = useState<Record<string, TeamMemberDoc[]>>({});
  const [loadingMembersId, setLoadingMembersId] = useState<string | null>(null);

  // Exclusão de usuário ou equipe
  const [pendingDeleteUser, setPendingDeleteUser] = useState<AdminUserRow | null>(null);
  const [pendingDeleteTeam, setPendingDeleteTeam] = useState<TeamDoc | null>(null);
  const [deletingTarget, setDeletingTarget] = useState(false);

  const userRows = useMemo<AdminUserRow[]>(() => {
    const profileMap = new Map<string, UserProfile>();
    for (const u of users) profileMap.set(u.uid, u);

    const allUids = new Set<string>([...profileMap.keys(), ...Object.keys(rolesMap)]);
    const list: AdminUserRow[] = [];

    for (const uid of allUids) {
      const prof = profileMap.get(uid);
      const roleDoc = rolesMap[uid];
      list.push({
        uid,
        email: roleDoc?.email || prof?.email || '(sem e-mail)',
        name: prof?.name || '(Conta criada no Console)',
        role: roleDoc?.role || 'participante',
        teamId: prof?.teamId,
      });
    }

    return list.sort((a, b) => a.email.localeCompare(b.email));
  }, [users, rolesMap]);

  const filteredUsers = useMemo(() => {
    const term = search.trim().toLowerCase();
    return userRows.filter((u) => {
      if (roleFilter !== 'todos' && u.role !== roleFilter) return false;
      if (term) {
        const hit =
          u.email.toLowerCase().includes(term) ||
          u.name.toLowerCase().includes(term) ||
          u.uid.toLowerCase().includes(term);
        if (!hit) return false;
      }
      return true;
    });
  }, [userRows, roleFilter, search]);

  const filteredTeams = useMemo(() => {
    const term = search.trim().toLowerCase();
    return [...teams]
      .sort((a, b) => a.number - b.number)
      .filter((t) => {
        if (!term) return true;
        return (
          t.name.toLowerCase().includes(term) ||
          t.leaderName.toLowerCase().includes(term) ||
          t.leaderEmail.toLowerCase().includes(term) ||
          `#${String(t.number).padStart(2, '0')}`.includes(term)
        );
      });
  }, [teams, search]);

  const handleConfirmRoleChange = async () => {
    if (!pendingRoleChange) return;
    setUpdatingRole(true);
    try {
      await setDoc(doc(db, 'userRoles', pendingRoleChange.uid), {
        role: pendingRoleChange.nextRole,
        email: pendingRoleChange.email,
        updatedAt: serverTimestamp(),
      });
      await onRefresh();
      showToast(
        `Papel de ${pendingRoleChange.email} alterado para ${pendingRoleChange.nextRole}.`,
        'success'
      );
      setPendingRoleChange(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `userRoles/${pendingRoleChange.uid}`);
      showToast('Não foi possível alterar o papel do usuário.', 'error');
    } finally {
      setUpdatingRole(false);
    }
  };

  const handleToggleTeamMembers = async (teamId: string) => {
    if (expandedTeamId === teamId) {
      setExpandedTeamId(null);
      return;
    }
    setExpandedTeamId(teamId);
    if (membersCache[teamId]) return;

    setLoadingMembersId(teamId);
    try {
      const snap = await getDocs(
        query(collection(db, 'teams', teamId, 'members'), orderBy('createdAt', 'asc'))
      );
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as TeamMemberDoc));
      setMembersCache((prev) => ({ ...prev, [teamId]: list }));
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, `teams/${teamId}/members`);
      showToast('Erro ao carregar integrantes da equipe.', 'error');
    } finally {
      setLoadingMembersId(null);
    }
  };

  const handleConfirmDeleteUser = async () => {
    if (!pendingDeleteUser) return;
    setDeletingTarget(true);
    try {
      await adminDeleteUser(pendingDeleteUser.uid, pendingDeleteUser.email);
      await onRefresh();
      showToast(`Usuário "${pendingDeleteUser.email}" removido do Firestore com sucesso.`, 'success');
      setPendingDeleteUser(null);
    } catch (err) {
      const msg =
        err instanceof Error && err.message.includes('própria conta')
          ? err.message
          : 'Erro ao excluir usuário. Verifique suas permissões no Firestore.';
      showToast(msg, 'error');
    } finally {
      setDeletingTarget(false);
    }
  };

  const handleConfirmDeleteTeam = async () => {
    if (!pendingDeleteTeam) return;
    setDeletingTarget(true);
    try {
      await adminDeleteTeam(pendingDeleteTeam.id);
      setMembersCache((prev) => {
        const next = { ...prev };
        delete next[pendingDeleteTeam.id];
        return next;
      });
      if (expandedTeamId === pendingDeleteTeam.id) {
        setExpandedTeamId(null);
      }
      await onRefresh();
      showToast(
        `Equipe #${String(pendingDeleteTeam.number).padStart(2, '0')} "${pendingDeleteTeam.name}" excluída com sucesso.`,
        'success'
      );
      setPendingDeleteTeam(null);
    } catch {
      showToast('Erro ao excluir equipe e registros vinculados.', 'error');
    } finally {
      setDeletingTarget(false);
    }
  };

  const ownedTeamByPendingUser = useMemo(() => {
    if (!pendingDeleteUser) return null;
    return (
      teams.find(
        (t) => t.leaderUid === pendingDeleteUser.uid || t.id === pendingDeleteUser.uid
      ) || null
    );
  }, [pendingDeleteUser, teams]);

  const roleBadgeClass: Record<UserRoleType, string> = {
    participante: 'bg-indigo-950 text-indigo-300 border-indigo-500/30',
    jurado: 'bg-emerald-950 text-emerald-300 border-emerald-500/30',
    organizacao: 'bg-cyan-950 text-cyan-300 border-cyan-500/30',
  };

  return (
    <div className="space-y-5">
      {/* Sub-tabs e busca */}
      <div className="bg-navy-800 border border-navy-600 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="bg-navy-900 p-1 rounded-xl border border-navy-600 inline-flex gap-1">
          <button
            type="button"
            onClick={() => setSubView('users')}
            className={`px-4 py-2 rounded-lg text-xs font-semibold transition ${
              subView === 'users' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'
            }`}
          >
            <i className="fa-solid fa-user-shield me-1.5" />
            Usuários & Papéis ({userRows.length})
          </button>
          <button
            type="button"
            onClick={() => setSubView('teams')}
            className={`px-4 py-2 rounded-lg text-xs font-semibold transition ${
              subView === 'teams' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'
            }`}
          >
            <i className="fa-solid fa-users me-1.5" />
            Equipes ({teams.length})
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-3 flex-1 justify-end">
          {subView === 'users' && (
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value as 'todos' | UserRoleType)}
              className="bg-navy-900 border border-navy-600 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
            >
              <option value="todos">Todos os papéis</option>
              <option value="participante">Participante</option>
              <option value="jurado">Jurado</option>
              <option value="organizacao">Organização</option>
            </select>
          )}
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={
              subView === 'users' ? 'Buscar por e-mail, nome ou UID...' : 'Buscar equipe ou líder...'
            }
            className="w-full sm:w-64 bg-navy-900 border border-navy-600 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
          />
        </div>
      </div>

      {/* Lista de Usuários */}
      {subView === 'users' && (
        <div className="bg-navy-800 border border-navy-600 rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-navy-900/80 border-b border-navy-600 font-code text-slate-400 uppercase text-[11px]">
                <tr>
                  <th className="py-3 px-4">Nome / E-mail</th>
                  <th className="py-3 px-4">UID</th>
                  <th className="py-3 px-4">Papel Atual</th>
                  <th className="py-3 px-4 text-right">Alterar Papel</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-navy-700">
                {filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-8 text-center text-slate-400">
                      Nenhum usuário encontrado.
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map((u) => {
                    const isSelf = currentUser?.uid === u.uid;
                    return (
                      <tr key={u.uid} className="hover:bg-navy-900/40">
                        <td className="py-3 px-4">
                          <div className="font-semibold text-white">
                            {u.name}{' '}
                            {isSelf && (
                              <span className="ml-1 text-[10px] font-code text-cyan-400">(Você)</span>
                            )}
                          </div>
                          <div className="text-slate-400 font-code text-[11px]">{u.email}</div>
                        </td>
                        <td className="py-3 px-4 font-code text-[11px] text-slate-500">{u.uid}</td>
                        <td className="py-3 px-4">
                          <span
                            className={`px-2.5 py-0.5 rounded-full border font-code text-[11px] ${roleBadgeClass[u.role]}`}
                          >
                            {u.role}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="inline-flex items-center justify-end gap-2">
                            <select
                              aria-label={`Alterar papel de ${u.email}`}
                              value={u.role}
                              onChange={(e) => {
                                const nextRole = e.target.value as UserRoleType;
                                if (nextRole === u.role) return;
                                setPendingRoleChange({
                                  uid: u.uid,
                                  email: u.email,
                                  currentRole: u.role,
                                  nextRole,
                                });
                              }}
                              className="bg-navy-900 border border-navy-600 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500"
                            >
                              <option value="participante">participante</option>
                              <option value="jurado">jurado</option>
                              <option value="organizacao">organizacao</option>
                            </select>

                            {!isSelf && (
                              <button
                                type="button"
                                title={`Excluir usuário ${u.email}`}
                                onClick={() => setPendingDeleteUser(u)}
                                className="p-2 bg-navy-900 hover:bg-rose-950/70 border border-navy-600 hover:border-rose-500/40 rounded-lg text-slate-400 hover:text-rose-400 transition"
                              >
                                <i className="fa-solid fa-trash-can" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Lista de Equipes */}
      {subView === 'teams' && (
        <div className="space-y-3">
          {filteredTeams.length === 0 ? (
            <div className="bg-navy-800 border border-navy-600 rounded-2xl p-8 text-center text-xs text-slate-400">
              Nenhuma equipe encontrada.
            </div>
          ) : (
            filteredTeams.map((t) => {
              const proj = projectsMap[t.id];
              const isOpen = expandedTeamId === t.id;
              const teamMembers = membersCache[t.id] || [];

              return (
                <div key={t.id} className="bg-navy-800 border border-navy-600 rounded-2xl p-5 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="font-code text-xs text-cyan-400 font-bold">
                          #{String(t.number).padStart(2, '0')}
                        </span>
                        <h4 className="font-heading font-bold text-white text-sm">{t.name}</h4>
                        {proj && (
                          <span className="px-2 py-0.5 rounded bg-navy-900 border border-navy-600 text-[10px] font-code text-indigo-300">
                            {proj.status}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-400 font-code mt-1">
                        Líder: {t.leaderName} ({t.leaderEmail})
                      </div>
                    </div>

                    <div className="flex items-center space-x-2">
                      <button
                        type="button"
                        onClick={() => void handleToggleTeamMembers(t.id)}
                        className="px-3.5 py-2 bg-navy-900 hover:bg-navy-700 border border-navy-600 rounded-xl text-xs text-slate-200 font-semibold transition flex items-center space-x-2"
                      >
                        <i className={`fa-solid ${isOpen ? 'fa-chevron-up' : 'fa-chevron-down'}`} />
                        <span>{isOpen ? 'Ocultar integrantes' : 'Ver integrantes'}</span>
                      </button>

                      <button
                        type="button"
                        title={`Excluir equipe ${t.name}`}
                        onClick={() => setPendingDeleteTeam(t)}
                        className="px-3 py-2 bg-navy-900 hover:bg-rose-950/70 border border-navy-600 hover:border-rose-500/40 rounded-xl text-xs text-rose-400 font-semibold transition flex items-center space-x-1.5"
                      >
                        <i className="fa-solid fa-trash-can" />
                        <span className="hidden sm:inline">Excluir</span>
                      </button>
                    </div>
                  </div>

                  {isOpen && (
                    <div className="pt-3 border-t border-navy-700 space-y-2">
                      {loadingMembersId === t.id ? (
                        <div className="text-xs text-slate-400 font-code py-2">
                          <i className="fa-solid fa-circle-notch fa-spin me-2" />
                          Carregando integrantes...
                        </div>
                      ) : teamMembers.length === 0 ? (
                        <div className="text-xs text-slate-400">Nenhum integrante encontrado.</div>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                          {teamMembers.map((m) => (
                            <div
                              key={m.id}
                              className="bg-navy-900 border border-navy-700 rounded-xl p-3 text-xs space-y-1"
                            >
                              <div className="font-semibold text-white flex items-center gap-2">
                                <span>{m.name}</span>
                                {m.isLeader && (
                                  <span className="px-1.5 py-0.5 rounded bg-cyan-950 text-cyan-300 text-[10px] font-code">
                                    Líder
                                  </span>
                                )}
                                {m.isExternal && (
                                  <span className="px-1.5 py-0.5 rounded bg-purple-950 text-purple-300 text-[10px] font-code">
                                    Externo
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] text-slate-400 font-code">{m.email}</div>
                              <div className="text-[11px] text-slate-500">
                                {m.course} ({m.semester})
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      <ConfirmModal
        open={Boolean(pendingRoleChange)}
        title="Confirmar Alteração de Papel?"
        description={
          pendingRoleChange
            ? currentUser?.uid === pendingRoleChange.uid
              ? `ATENÇÃO: Você está alterando o SEU PRÓPRIO papel (${pendingRoleChange.email}) para "${pendingRoleChange.nextRole}". Você perderá acesso imediato ao painel /admin!`
              : `Alterar o papel de "${pendingRoleChange.email}" de "${pendingRoleChange.currentRole}" para "${pendingRoleChange.nextRole}"?`
            : ''
        }
        confirmLabel="Confirmar Alteração"
        variant={pendingRoleChange && currentUser?.uid === pendingRoleChange.uid ? 'rose' : 'indigo'}
        loading={updatingRole}
        onConfirm={() => void handleConfirmRoleChange()}
        onCancel={() => setPendingRoleChange(null)}
      />

      <ConfirmModal
        open={Boolean(pendingDeleteUser)}
        title="Excluir Usuário do Sistema?"
        description={
          pendingDeleteUser
            ? `${
                ownedTeamByPendingUser
                  ? `Este usuário lidera a equipe #${String(ownedTeamByPendingUser.number).padStart(2, '0')} "${ownedTeamByPendingUser.name}" — ela, seus integrantes, projeto e avaliações também serão excluídos. `
                  : pendingDeleteUser.role === 'jurado'
                  ? 'Eventuais avaliações enviadas por este jurado também serão excluídas. '
                  : ''
              }Todos os dados e permissões de "${pendingDeleteUser.email}" no Firestore serão removidos imediatamente (bloqueando o acesso). Caso essa pessoa precise se cadastrar novamente no futuro com o mesmo e-mail, ela poderá refazer o cadastro normalmente na tela de registro (/registrar) informando a senha anterior ou redefinindo a senha por e-mail.`
            : ''
        }
        confirmLabel="Sim, Excluir Usuário"
        variant="rose"
        loading={deletingTarget}
        onConfirm={() => void handleConfirmDeleteUser()}
        onCancel={() => setPendingDeleteUser(null)}
      />

      <ConfirmModal
        open={Boolean(pendingDeleteTeam)}
        title="Excluir Equipe e Dados Vinculados?"
        description={
          pendingDeleteTeam
            ? `Tem certeza que deseja excluir a equipe #${String(pendingDeleteTeam.number).padStart(2, '0')} "${pendingDeleteTeam.name}"? Isso removerá integrantes, liberará os e-mails vinculados, excluirá o projeto, avaliações e resultado associado, e atualizará o contador de inscrições.`
            : ''
        }
        confirmLabel="Sim, Excluir Equipe"
        variant="rose"
        loading={deletingTarget}
        onConfirm={() => void handleConfirmDeleteTeam()}
        onCancel={() => setPendingDeleteTeam(null)}
      />
    </div>
  );
}
