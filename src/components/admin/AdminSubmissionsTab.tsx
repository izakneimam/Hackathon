import { useMemo, useState } from 'react';
import { doc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { useToast } from '../../contexts/ToastContext';
import { adminDeleteProject } from '../../lib/adminActions';
import { db } from '../../lib/firebase';
import { handleFirestoreError, OperationType } from '../../lib/firestoreError';
import { formatSaoPauloDateTime, getServerNowMs } from '../../lib/serverTime';
import { PROJECT_TRACKS } from '../../lib/validation';
import type { EventSettings, ProjectDoc, ProjectStatus } from '../../types/hackathon';
import { ConfirmModal } from './ConfirmModal';

interface AdminSubmissionsTabProps {
  settings: EventSettings | null;
  projects: ProjectDoc[];
  onRefresh: () => Promise<void>;
}

export function AdminSubmissionsTab({ settings, projects, onRefresh }: AdminSubmissionsTabProps) {
  const { showToast } = useToast();
  const [statusFilter, setStatusFilter] = useState<'todos' | ProjectStatus>('todos');
  const [trackFilter, setTrackFilter] = useState<string>('todas');
  const [search, setSearch] = useState('');
  const [closeModalOpen, setCloseModalOpen] = useState(false);
  const [closingDrafts, setClosingDrafts] = useState(false);
  const [pendingDeleteProject, setPendingDeleteProject] = useState<ProjectDoc | null>(null);
  const [deletingProject, setDeletingProject] = useState(false);

  const deadlinePassed = settings?.submissionDeadline
    ? getServerNowMs() > settings.submissionDeadline.toMillis()
    : false;
  const expiredDrafts = useMemo(
    () => projects.filter((p) => p.status === 'rascunho'),
    [projects]
  );

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return [...projects]
      .sort((a, b) => a.teamNumber - b.teamNumber)
      .filter((p) => {
        if (statusFilter !== 'todos' && p.status !== statusFilter) return false;
        if (trackFilter !== 'todas' && p.track !== trackFilter) return false;
        if (term) {
          const hit =
            (p.name || '').toLowerCase().includes(term) ||
            (p.teamName || '').toLowerCase().includes(term) ||
            `#${String(p.teamNumber).padStart(2, '0')}`.includes(term);
          if (!hit) return false;
        }
        return true;
      });
  }, [projects, statusFilter, trackFilter, search]);

  const handleCloseExpiredDrafts = async () => {
    if (expiredDrafts.length === 0) return;
    setClosingDrafts(true);
    try {
      const batch = writeBatch(db);
      for (const p of expiredDrafts) {
        batch.update(doc(db, 'projects', p.teamId), {
          status: 'encerrado',
          updatedAt: serverTimestamp(),
        });
      }
      await batch.commit();
      await onRefresh();
      setCloseModalOpen(false);
      showToast(`${expiredDrafts.length} rascunho(s) encerrado(s) com sucesso.`, 'success');
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'projects');
      showToast('Erro ao encerrar rascunhos.', 'error');
    } finally {
      setClosingDrafts(false);
    }
  };

  const handleConfirmDeleteProject = async () => {
    if (!pendingDeleteProject) return;
    setDeletingProject(true);
    try {
      await adminDeleteProject(pendingDeleteProject.teamId);
      await onRefresh();
      showToast(
        `Projeto "${pendingDeleteProject.name || pendingDeleteProject.teamName}" excluído com sucesso.`,
        'success'
      );
      setPendingDeleteProject(null);
    } catch {
      showToast('Erro ao excluir projeto e avaliações vinculadas.', 'error');
    } finally {
      setDeletingProject(false);
    }
  };

  const statusBadge: Record<ProjectStatus, string> = {
    rascunho: 'bg-amber-950 text-amber-300 border-amber-500/30',
    enviado: 'bg-indigo-950 text-cyan-300 border-cyan-500/30',
    avaliado: 'bg-emerald-950 text-emerald-300 border-emerald-500/30',
    encerrado: 'bg-rose-950 text-rose-300 border-rose-500/30',
  };

  return (
    <div className="space-y-5">
      {/* Filtros */}
      <div className="bg-navy-800 border border-navy-600 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as 'todos' | ProjectStatus)}
            className="bg-navy-900 border border-navy-600 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
          >
            <option value="todos">Todos os status ({projects.length})</option>
            <option value="rascunho">Rascunho</option>
            <option value="enviado">Enviado</option>
            <option value="avaliado">Avaliado</option>
            <option value="encerrado">Encerrado</option>
          </select>

          <select
            value={trackFilter}
            onChange={(e) => setTrackFilter(e.target.value)}
            className="bg-navy-900 border border-navy-600 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
          >
            <option value="todas">Todas as trilhas</option>
            {PROJECT_TRACKS.map((tr) => (
              <option key={tr} value={tr}>
                {tr}
              </option>
            ))}
          </select>

          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar projeto ou equipe..."
            className="bg-navy-900 border border-navy-600 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
          />
        </div>

        {deadlinePassed && expiredDrafts.length > 0 && (
          <button
            type="button"
            onClick={() => setCloseModalOpen(true)}
            className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-semibold transition flex items-center space-x-2"
          >
            <i className="fa-solid fa-lock" />
            <span>Encerrar {expiredDrafts.length} rascunho(s) expirado(s)</span>
          </button>
        )}
      </div>

      {/* Tabela */}
      <div className="bg-navy-800 border border-navy-600 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-navy-900/80 border-b border-navy-600 font-code text-slate-400 uppercase text-[11px]">
              <tr>
                <th className="py-3 px-4">Equipe</th>
                <th className="py-3 px-4">Projeto / Trilha</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Links & Mídia</th>
                <th className="py-3 px-4 text-right">Envio / Atualização</th>
                <th className="py-3 px-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-navy-700">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400">
                    Nenhum envio encontrado.
                  </td>
                </tr>
              ) : (
                filtered.map((p) => {
                  const slidesLink = p.slidesUrl || (p.slidesPath?.startsWith('http') ? p.slidesPath : '');
                  return (
                    <tr key={p.teamId} className="hover:bg-navy-900/40">
                      <td className="py-3.5 px-4">
                        <div className="font-code text-cyan-400 font-bold">
                          #{String(p.teamNumber).padStart(2, '0')} {p.teamName}
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-white">{p.name || '(Sem título)'}</div>
                        <div className="text-[11px] text-slate-400">{p.track}</div>
                      </td>
                      <td className="py-3.5 px-4">
                        <span
                          className={`px-2.5 py-0.5 rounded-full border font-code text-[11px] ${statusBadge[p.status]}`}
                        >
                          {p.status}
                        </span>
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="flex flex-wrap gap-2 font-code text-[11px]">
                          {p.githubUrl && (
                            <a
                              href={p.githubUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="px-2 py-0.5 rounded bg-navy-900 border border-navy-600 text-slate-200 hover:text-cyan-400"
                            >
                              Git
                            </a>
                          )}
                          {p.demoUrl && (
                            <a
                              href={p.demoUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="px-2 py-0.5 rounded bg-navy-900 border border-navy-600 text-cyan-300 hover:underline"
                            >
                              Demo
                            </a>
                          )}
                          {slidesLink && (
                            <a
                              href={slidesLink}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="px-2 py-0.5 rounded bg-indigo-950 border border-indigo-500/40 text-indigo-300 hover:underline"
                            >
                              Slides
                            </a>
                          )}
                          {p.screenshots && p.screenshots.length > 0 && (
                            <span className="px-2 py-0.5 rounded bg-navy-900 border border-navy-700 text-slate-400">
                              {p.screenshots.length} foto(s)
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-right font-code text-[11px] text-slate-400">
                        {p.submittedAt
                          ? `Env: ${formatSaoPauloDateTime(p.submittedAt.toMillis())}`
                          : p.updatedAt
                          ? `Atu: ${formatSaoPauloDateTime(p.updatedAt.toMillis())}`
                          : '—'}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <button
                          type="button"
                          title={`Excluir projeto de ${p.teamName}`}
                          onClick={() => setPendingDeleteProject(p)}
                          className="p-2 bg-navy-900 hover:bg-rose-950/70 border border-navy-600 hover:border-rose-500/40 rounded-lg text-slate-400 hover:text-rose-400 transition"
                        >
                          <i className="fa-solid fa-trash-can" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <ConfirmModal
        open={closeModalOpen}
        title="Encerrar Rascunhos Expirados?"
        description={`O prazo de entrega já encerrou. Deseja alterar ${expiredDrafts.length} projeto(s) ainda em "rascunho" para "encerrado"?`}
        confirmLabel="Sim, Encerrar Rascunhos"
        variant="rose"
        loading={closingDrafts}
        onConfirm={() => void handleCloseExpiredDrafts()}
        onCancel={() => setCloseModalOpen(false)}
      />

      <ConfirmModal
        open={Boolean(pendingDeleteProject)}
        title="Excluir Projeto?"
        description={
          pendingDeleteProject
            ? `Tem certeza que deseja excluir o projeto "${pendingDeleteProject.name || '(Sem título)'}" da equipe #${String(pendingDeleteProject.teamNumber).padStart(2, '0')} (${pendingDeleteProject.teamName})? Todas as avaliações de jurados e o resultado consolidado deste projeto também serão excluídos.`
            : ''
        }
        confirmLabel="Sim, Excluir Projeto"
        variant="rose"
        loading={deletingProject}
        onConfirm={() => void handleConfirmDeleteProject()}
        onCancel={() => setPendingDeleteProject(null)}
      />
    </div>
  );
}
