import { useMemo, useState } from 'react';
import { doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { useToast } from '../../contexts/ToastContext';
import { db } from '../../lib/firebase';
import { handleFirestoreError, OperationType } from '../../lib/firestoreError';
import type { EvaluationDoc, EventSettings, ProjectDoc } from '../../types/hackathon';
import { ConfirmModal } from './ConfirmModal';

interface AdminEvaluationTabProps {
  settings: EventSettings | null;
  projects: ProjectDoc[];
  evaluations: EvaluationDoc[];
  onSyncResultsAndPromote: (promoteSubmittedToEvaluated: boolean) => Promise<number>;
  onRefresh: () => Promise<void>;
}

export function AdminEvaluationTab({
  settings,
  projects,
  evaluations,
  onSyncResultsAndPromote,
  onRefresh,
}: AdminEvaluationTabProps) {
  const { showToast } = useToast();
  const [modalAction, setModalAction] = useState<'closeEval' | 'reopenEval' | 'releaseGrades' | 'hideGrades' | null>(null);
  const [processing, setProcessing] = useState(false);

  const submittedOrEvaluated = useMemo(
    () => projects.filter((p) => p.status === 'enviado' || p.status === 'avaliado'),
    [projects]
  );

  const evaluatedProjectIds = useMemo(
    () => new Set(evaluations.map((e) => e.projectId)),
    [evaluations]
  );

  const projectsWithEvalsCount = submittedOrEvaluated.filter((p) =>
    evaluatedProjectIds.has(p.teamId)
  ).length;

  const projectsWithoutEvalsCount = submittedOrEvaluated.length - projectsWithEvalsCount;

  const evaluationOpen = settings?.evaluationOpen !== false;
  const gradesReleased = Boolean(settings?.gradesReleased);

  const handleConfirmAction = async () => {
    if (!modalAction || !settings) return;
    setProcessing(true);
    try {
      if (modalAction === 'closeEval') {
        const count = await onSyncResultsAndPromote(true);
        await updateDoc(doc(db, 'settings', 'event'), {
          evaluationOpen: false,
          updatedAt: serverTimestamp(),
        }).catch((e) => handleFirestoreError(e, OperationType.UPDATE, 'settings/event'));
        showToast(
          `Avaliação encerrada! ${count} projeto(s) consolidado(s) no ranking oficial.`,
          'success'
        );
      } else if (modalAction === 'reopenEval') {
        await updateDoc(doc(db, 'settings', 'event'), {
          evaluationOpen: true,
          updatedAt: serverTimestamp(),
        }).catch((e) => handleFirestoreError(e, OperationType.UPDATE, 'settings/event'));
        showToast('Período de avaliação reaberto para os jurados.', 'info');
      } else if (modalAction === 'releaseGrades') {
        const count = await onSyncResultsAndPromote(true);
        await updateDoc(doc(db, 'settings', 'event'), {
          gradesReleased: true,
          updatedAt: serverTimestamp(),
        }).catch((e) => handleFirestoreError(e, OperationType.UPDATE, 'settings/event'));
        showToast(
          `Notas liberadas para as equipes! (${count} resultado(s) publicado(s)).`,
          'success'
        );
      } else if (modalAction === 'hideGrades') {
        await updateDoc(doc(db, 'settings', 'event'), {
          gradesReleased: false,
          updatedAt: serverTimestamp(),
        }).catch((e) => handleFirestoreError(e, OperationType.UPDATE, 'settings/event'));
        showToast('Divulgação das notas ocultada das equipes.', 'info');
      }

      await onRefresh();
      setModalAction(null);
    } catch {
      showToast('Erro ao atualizar estado da avaliação.', 'error');
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-navy-800 border border-navy-600 rounded-2xl p-4">
          <div className="text-[11px] font-code text-slate-400 uppercase">Projetos Elegíveis</div>
          <div className="text-2xl font-heading font-bold text-white mt-1 tabular-nums">
            {submittedOrEvaluated.length}
          </div>
        </div>
        <div className="bg-navy-800 border border-navy-600 rounded-2xl p-4">
          <div className="text-[11px] font-code text-slate-400 uppercase">Avaliações Registradas</div>
          <div className="text-2xl font-heading font-bold text-cyan-400 mt-1 tabular-nums">
            {evaluations.length}
          </div>
        </div>
        <div className="bg-navy-800 border border-navy-600 rounded-2xl p-4">
          <div className="text-[11px] font-code text-slate-400 uppercase">Com Nota da Banca</div>
          <div className="text-2xl font-heading font-bold text-emerald-400 mt-1 tabular-nums">
            {projectsWithEvalsCount}
          </div>
        </div>
        <div className="bg-navy-800 border border-navy-600 rounded-2xl p-4">
          <div className="text-[11px] font-code text-slate-400 uppercase">Sem Nenhuma Nota</div>
          <div className="text-2xl font-heading font-bold text-amber-400 mt-1 tabular-nums">
            {projectsWithoutEvalsCount}
          </div>
        </div>
      </div>

      {/* Controles */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Card 1: Encerrar / Reabrir Avaliação */}
        <div className="bg-navy-800 border border-navy-600 rounded-2xl p-6 space-y-4 flex flex-col justify-between">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-code text-cyan-400 uppercase">Banca Examinadora</span>
              <span
                className={`px-2.5 py-0.5 rounded-full text-[11px] font-code border ${
                  evaluationOpen
                    ? 'bg-emerald-950 text-emerald-300 border-emerald-500/30'
                    : 'bg-rose-950 text-rose-300 border-rose-500/30'
                }`}
              >
                {evaluationOpen ? 'Aberta' : 'Encerrada'}
              </span>
            </div>
            <h3 className="font-heading font-bold text-lg text-white">
              {evaluationOpen ? 'Encerrar Avaliação dos Jurados' : 'Avaliação Encerrada'}
            </h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              {evaluationOpen
                ? 'Ao encerrar a avaliação, os jurados não poderão mais alterar notas, os projetos avaliados passam para o status "avaliado" e o ranking oficial é calculado e salvo.'
                : 'A banca está bloqueada. Caso alguma equipe precise de revisão de nota, você pode reabrir temporariamente a avaliação.'}
            </p>
          </div>

          <button
            type="button"
            onClick={() => setModalAction(evaluationOpen ? 'closeEval' : 'reopenEval')}
            className={`w-full py-3 rounded-xl text-xs font-semibold shadow-lg transition flex items-center justify-center space-x-2 ${
              evaluationOpen
                ? 'bg-amber-600 hover:bg-amber-500 text-white shadow-amber-600/20'
                : 'bg-navy-900 hover:bg-navy-700 text-slate-200 border border-navy-600'
            }`}
          >
            <i className={`fa-solid ${evaluationOpen ? 'fa-lock' : 'fa-lock-open'}`} />
            <span>{evaluationOpen ? 'Encerrar Avaliação e Consolidar' : 'Reabrir Avaliação'}</span>
          </button>
        </div>

        {/* Card 2: Liberar / Ocultar Notas */}
        <div className="bg-navy-800 border border-navy-600 rounded-2xl p-6 space-y-4 flex flex-col justify-between">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-code text-indigo-400 uppercase">Transparência às Equipes</span>
              <span
                className={`px-2.5 py-0.5 rounded-full text-[11px] font-code border ${
                  gradesReleased
                    ? 'bg-emerald-950 text-emerald-300 border-emerald-500/30'
                    : 'bg-navy-900 text-slate-400 border-navy-600'
                }`}
              >
                {gradesReleased ? 'Liberadas' : 'Ocultas'}
              </span>
            </div>
            <h3 className="font-heading font-bold text-lg text-white">
              {gradesReleased ? 'Divulgação das Notas Ativa' : 'Liberar Divulgação das Notas'}
            </h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              {gradesReleased
                ? 'As equipes com status "avaliado" já visualizam sua Nota Final, posição no ranking, médias por critério e parecer dos jurados em /equipe.'
                : 'Quando estiver pronto para anunciar os resultados, libere a divulgação para que cada equipe veja suas notas e feedback no painel.'}
            </p>
          </div>

          <button
            type="button"
            onClick={() => setModalAction(gradesReleased ? 'hideGrades' : 'releaseGrades')}
            className={`w-full py-3 rounded-xl text-xs font-semibold shadow-lg transition flex items-center justify-center space-x-2 ${
              gradesReleased
                ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-rose-600/20'
                : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/20'
            }`}
          >
            <i className={`fa-solid ${gradesReleased ? 'fa-eye-slash' : 'fa-award'}`} />
            <span>
              {gradesReleased ? 'Ocultar Divulgação das Notas' : 'Liberar Divulgação das Notas'}
            </span>
          </button>
        </div>
      </div>

      <ConfirmModal
        open={Boolean(modalAction)}
        title={
          modalAction === 'closeEval'
            ? 'Encerrar Avaliação da Banca?'
            : modalAction === 'reopenEval'
            ? 'Reabrir Avaliação para Jurados?'
            : modalAction === 'releaseGrades'
            ? 'Liberar Divulgação Oficial das Notas?'
            : 'Ocultar Notas das Equipes?'
        }
        description={
          modalAction === 'closeEval'
            ? 'Isso bloqueará novas edições dos jurados, consolidará todas as notas em results e marcará os projetos avaliados como "avaliado".'
            : modalAction === 'reopenEval'
            ? 'Os jurados voltarão a poder editar avaliações de projetos com status "enviado".'
            : modalAction === 'releaseGrades'
            ? 'Todas as equipes avaliadas passarão a visualizar imediatamente sua nota final, colocação e parecer dos jurados.'
            : 'As equipes deixarão de visualizar suas notas no painel até que sejam liberadas novamente.'
        }
        confirmLabel="Confirmar"
        variant={
          modalAction === 'closeEval'
            ? 'amber'
            : modalAction === 'releaseGrades'
            ? 'emerald'
            : modalAction === 'hideGrades'
            ? 'rose'
            : 'indigo'
        }
        loading={processing}
        onConfirm={() => void handleConfirmAction()}
        onCancel={() => setModalAction(null)}
      />
    </div>
  );
}
