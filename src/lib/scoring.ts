import { Timestamp } from 'firebase/firestore';
import type {
  CriterionDoc,
  CriterionKey,
  EvaluationDoc,
  EvaluationScores,
  ProjectDoc,
  ResultDoc,
} from '../types/hackathon';

export const DEFAULT_CRITERIA_WEIGHTS: Record<CriterionKey, number> = {
  inovacao: 30,
  tecnica: 25,
  demo: 20,
  impacto: 15,
  pitch: 10,
};

export const CRITERION_KEYS: CriterionKey[] = ['inovacao', 'tecnica', 'demo', 'impacto', 'pitch'];

export function buildWeightsMap(criteria: CriterionDoc[]): Record<CriterionKey, number> {
  const weights: Record<CriterionKey, number> = { ...DEFAULT_CRITERIA_WEIGHTS };
  for (const c of criteria) {
    if (CRITERION_KEYS.includes(c.key)) {
      weights[c.key] = Number(c.weight);
    }
  }
  return weights;
}

/**
 * Converte nota decimal (0.0 a 10.0) em décimos inteiros (0 a 100).
 */
export function decimalToTenths(val: number): number {
  if (!Number.isFinite(val)) return 0;
  return Math.max(0, Math.min(100, Math.round(val * 10)));
}

/**
 * Converte décimos inteiros (0 a 100) em nota decimal (0.0 a 10.0).
 */
export function tenthsToDecimal(tenths: number): number {
  if (!Number.isFinite(tenths)) return 0;
  return Math.round(Math.max(0, Math.min(100, tenths))) / 10;
}

/**
 * Calcula a nota ponderada de uma avaliação (décimos 0..100) na escala 0.00 a 10.00.
 * Ex.: (95*30 + 90*25 + 100*20 + 90*15 + 90*10) / 1000 = 9.35
 */
export function computeEvaluationWeightedScore(
  scores: EvaluationScores,
  weights: Record<CriterionKey, number>
): number {
  const totalWeight = CRITERION_KEYS.reduce((acc, k) => acc + (weights[k] || 0), 0);
  if (totalWeight <= 0) return 0;

  const weightedTenthsSum = CRITERION_KEYS.reduce(
    (acc, key) => acc + (Number(scores[key] ?? 0) * (weights[key] || 0)),
    0
  );

  // weightedTenthsSum / (totalWeight * 10) => escala 0..10
  return Math.round((weightedTenthsSum / (totalWeight * 10)) * 100) / 100;
}

/**
 * Calcula médias por critério, nota final ponderada e ranking com desempate oficial:
 * 1) maior finalScore
 * 2) maior média em Inovação
 * 3) maior média em Qualidade Técnica
 * 4) menor submittedAt (quem enviou primeiro vence)
 */
export function computeAllProjectResults(params: {
  projects: ProjectDoc[];
  evaluations: EvaluationDoc[];
  criteria: CriterionDoc[];
}): ResultDoc[] {
  const weights = buildWeightsMap(params.criteria);
  const evalsByProject = new Map<string, EvaluationDoc[]>();

  for (const ev of params.evaluations) {
    const list = evalsByProject.get(ev.projectId) || [];
    list.push(ev);
    evalsByProject.set(ev.projectId, list);
  }

  interface ComputedRow {
    result: Omit<ResultDoc, 'rank'>;
    submittedAtMs: number;
  }

  const rows: ComputedRow[] = [];

  for (const proj of params.projects) {
    const projEvals = evalsByProject.get(proj.teamId) || [];
    if (projEvals.length === 0) continue;

    const count = projEvals.length;
    const avgTenths: Record<CriterionKey, number> = {
      inovacao: 0,
      tecnica: 0,
      demo: 0,
      impacto: 0,
      pitch: 0,
    };

    for (const key of CRITERION_KEYS) {
      const sum = projEvals.reduce((acc, ev) => acc + Number(ev.scores?.[key] ?? 0), 0);
      avgTenths[key] = sum / count;
    }

    const averageCriteria: EvaluationScores = {
      inovacao: Math.round((avgTenths.inovacao / 10) * 100) / 100,
      tecnica: Math.round((avgTenths.tecnica / 10) * 100) / 100,
      demo: Math.round((avgTenths.demo / 10) * 100) / 100,
      impacto: Math.round((avgTenths.impacto / 10) * 100) / 100,
      pitch: Math.round((avgTenths.pitch / 10) * 100) / 100,
    };

    const evalScores = projEvals.map((ev) => computeEvaluationWeightedScore(ev.scores, weights));
    const finalScore = Math.round((evalScores.reduce((a, b) => a + b, 0) / count) * 100) / 100;

    const comments = projEvals
      .map((ev) => (ev.comment || '').trim())
      .filter((c) => c.length > 0);

    const submittedAtMs = proj.submittedAt ? proj.submittedAt.toMillis() : Number.MAX_SAFE_INTEGER;

    rows.push({
      result: {
        projectId: proj.teamId,
        teamName: proj.teamName,
        teamNumber: proj.teamNumber,
        projectName: proj.name || `Projeto ${proj.teamName}`,
        track: proj.track,
        averageCriteria,
        finalScore,
        evaluationCount: count,
        comments,
        updatedAt: Timestamp.now(),
      },
      submittedAtMs,
    });
  }

  rows.sort((a, b) => {
    if (b.result.finalScore !== a.result.finalScore) {
      return b.result.finalScore - a.result.finalScore;
    }
    if (b.result.averageCriteria.inovacao !== a.result.averageCriteria.inovacao) {
      return b.result.averageCriteria.inovacao - a.result.averageCriteria.inovacao;
    }
    if (b.result.averageCriteria.tecnica !== a.result.averageCriteria.tecnica) {
      return b.result.averageCriteria.tecnica - a.result.averageCriteria.tecnica;
    }
    return a.submittedAtMs - b.submittedAtMs;
  });

  return rows.map((row, idx) => ({
    ...row.result,
    rank: idx + 1,
  }));
}
