import React, { useMemo, useState } from 'react';
import { useToast } from '../../contexts/ToastContext';
import { buildWeightsMap, computeEvaluationWeightedScore, tenthsToDecimal } from '../../lib/scoring';
import type { CriterionDoc, EvaluationDoc, ResultDoc } from '../../types/hackathon';

interface AdminRankingTabProps {
  criteria: CriterionDoc[];
  results: ResultDoc[];
  evaluations: EvaluationDoc[];
  onRecalculate: () => Promise<number>;
}

export function AdminRankingTab({
  criteria,
  results,
  evaluations,
  onRecalculate,
}: AdminRankingTabProps) {
  const { showToast } = useToast();
  const [recalculating, setRecalculating] = useState(false);
  const [expandedProjectId, setExpandedProjectId] = useState<string | null>(null);

  const weightsMap = useMemo(() => buildWeightsMap(criteria), [criteria]);
  const sortedResults = useMemo(
    () => [...results].sort((a, b) => a.rank - b.rank),
    [results]
  );

  const evalsByProject = useMemo(() => {
    const map = new Map<string, EvaluationDoc[]>();
    for (const ev of evaluations) {
      const arr = map.get(ev.projectId) || [];
      arr.push(ev);
      map.set(ev.projectId, arr);
    }
    return map;
  }, [evaluations]);

  const handleRecalculate = async () => {
    setRecalculating(true);
    try {
      const count = await onRecalculate();
      showToast(`Ranking recalculado com sucesso (${count} projeto(s) ranqueado(s)).`, 'success');
    } catch {
      showToast('Erro ao recalcular ranking.', 'error');
    } finally {
      setRecalculating(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="bg-navy-800 border border-navy-600 rounded-2xl p-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="font-heading font-bold text-white text-base flex items-center space-x-2">
            <i className="fa-solid fa-trophy text-amber-400" />
            <span>Classificação Geral e Notas Detalhadas</span>
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Desempate oficial: Nota Final → Média Inovação → Média Técnica → Envio mais antigo.
          </p>
        </div>

        <button
          type="button"
          disabled={recalculating}
          onClick={() => void handleRecalculate()}
          className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white rounded-xl text-xs font-semibold shadow-lg shadow-indigo-600/30 transition flex items-center space-x-2"
        >
          <i className={`fa-solid ${recalculating ? 'fa-circle-notch fa-spin' : 'fa-calculator'}`} />
          <span>{recalculating ? 'Calculando...' : 'Recalcular Ranking Agora'}</span>
        </button>
      </div>

      {sortedResults.length === 0 ? (
        <div className="bg-navy-800 border border-navy-600 rounded-2xl p-10 text-center space-y-3">
          <i className="fa-solid fa-ranking-star text-3xl text-slate-600" />
          <p className="text-sm font-bold text-white">Nenhum resultado consolidado ainda</p>
          <p className="text-xs text-slate-400 max-w-md mx-auto">
            Assim que houver avaliações registradas por jurados, clique em <strong>Recalcular Ranking Agora</strong> ou encerre a avaliação na aba anterior.
          </p>
        </div>
      ) : (
        <div className="bg-navy-800 border border-navy-600 rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-navy-900/80 border-b border-navy-600 font-code text-slate-400 uppercase text-[11px]">
                <tr>
                  <th className="py-3 px-4">Posição</th>
                  <th className="py-3 px-4">Equipe & Projeto</th>
                  <th className="py-3 px-4 text-center">Jurados</th>
                  {criteria.map((c) => (
                    <th key={c.key} className="py-3 px-3 text-center">
                      {c.key} ({c.weight}%)
                    </th>
                  ))}
                  <th className="py-3 px-4 text-right">Nota Final</th>
                  <th className="py-3 px-4 text-right">Detalhes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-navy-700">
                {sortedResults.map((res) => {
                  const isExpanded = expandedProjectId === res.projectId;
                  const projEvals = evalsByProject.get(res.projectId) || [];
                  const podiumColor =
                    res.rank === 1
                      ? 'bg-amber-950 text-amber-300 border-amber-500/40'
                      : res.rank === 2
                      ? 'bg-slate-800 text-slate-200 border-slate-500/40'
                      : res.rank === 3
                      ? 'bg-orange-950 text-orange-300 border-orange-500/40'
                      : 'bg-navy-900 text-slate-400 border-navy-600';

                  return (
                    <React.Fragment key={res.projectId}>
                      <tr className="hover:bg-navy-900/40">
                        <td className="py-3.5 px-4">
                          <span className={`px-2.5 py-1 rounded-lg border font-code font-bold ${podiumColor}`}>
                            {res.rank}º
                          </span>
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="font-semibold text-white">{res.projectName}</div>
                          <div className="text-[11px] text-cyan-400 font-code">
                            #{String(res.teamNumber).padStart(2, '0')} {res.teamName} •{' '}
                            <span className="text-slate-400">{res.track}</span>
                          </div>
                        </td>
                        <td className="py-3.5 px-4 text-center font-code text-slate-300 tabular-nums">
                          {res.evaluationCount}
                        </td>
                        {criteria.map((c) => (
                          <td
                            key={c.key}
                            className="py-3.5 px-3 text-center font-code text-slate-300 tabular-nums"
                          >
                            {(res.averageCriteria?.[c.key] ?? 0).toFixed(2)}
                          </td>
                        ))}
                        <td className="py-3.5 px-4 text-right font-code font-bold text-base text-cyan-400 tabular-nums">
                          {res.finalScore.toFixed(2)}
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedProjectId((prev) =>
                                prev === res.projectId ? null : res.projectId
                              )
                            }
                            className="px-3 py-1.5 bg-navy-900 hover:bg-navy-700 border border-navy-600 rounded-lg text-[11px] font-code text-indigo-300"
                          >
                            {isExpanded ? 'Fechar' : `Ver notas (${projEvals.length})`}
                          </button>
                        </td>
                      </tr>

                      {isExpanded && (
                        <tr className="bg-navy-900/60">
                          <td colSpan={5 + criteria.length} className="p-4">
                            <div className="space-y-3">
                              <div className="text-[11px] font-code text-cyan-400 uppercase">
                                Avaliações Individuais dos Jurados — {res.projectName}
                              </div>
                              {projEvals.length === 0 ? (
                                <p className="text-xs text-slate-400">
                                  Nenhuma avaliação individual encontrada.
                                </p>
                              ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                  {projEvals.map((ev) => {
                                    const jurorWeighted = computeEvaluationWeightedScore(
                                      ev.scores,
                                      weightsMap
                                    );
                                    return (
                                      <div
                                        key={ev.id}
                                        className="bg-navy-800 border border-navy-600 rounded-xl p-4 space-y-2.5"
                                      >
                                        <div className="flex items-center justify-between border-b border-navy-700 pb-2">
                                          <span className="font-semibold text-white text-xs">
                                            {ev.jurorName}
                                          </span>
                                          <span className="font-code text-xs font-bold text-emerald-400 tabular-nums">
                                            Ponderada: {jurorWeighted.toFixed(2)}
                                          </span>
                                        </div>
                                        <div className="flex flex-wrap gap-2 font-code text-[11px]">
                                          {criteria.map((c) => (
                                            <span
                                              key={c.key}
                                              className="px-2 py-0.5 rounded bg-navy-900 border border-navy-700 text-slate-300"
                                            >
                                              {c.key}:{' '}
                                              <strong className="text-white">
                                                {tenthsToDecimal(ev.scores?.[c.key] ?? 0).toFixed(1)}
                                              </strong>
                                            </span>
                                          ))}
                                        </div>
                                        {ev.comment && (
                                          <p className="text-xs text-slate-300 italic leading-relaxed">
                                            “{ev.comment}”
                                          </p>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
