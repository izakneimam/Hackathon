import React, { useEffect, useState } from 'react';
import { deleteDoc, doc, setDoc, writeBatch } from 'firebase/firestore';
import { useToast } from '../../contexts/ToastContext';
import { db } from '../../lib/firebase';
import { handleFirestoreError, OperationType } from '../../lib/firestoreError';
import type {
  CriterionDoc,
  FaqItemDoc,
  PublicJurorDoc,
  RuleItemDoc,
  ScheduleItemDoc,
} from '../../types/hackathon';
import { ConfirmModal } from './ConfirmModal';

interface AdminContentTabProps {
  criteria: CriterionDoc[];
  scheduleItems: ScheduleItemDoc[];
  publicJurors: PublicJurorDoc[];
  rules: RuleItemDoc[];
  faqItems: FaqItemDoc[];
  onRefresh: () => Promise<void>;
}

type ContentSection = 'criteria' | 'schedule' | 'jurors' | 'rules' | 'faq';

export function AdminContentTab({
  criteria,
  scheduleItems,
  publicJurors,
  rules,
  faqItems,
  onRefresh,
}: AdminContentTabProps) {
  const { showToast } = useToast();
  const [section, setSection] = useState<ContentSection>('criteria');

  // --- CRITÉRIOS ---
  const [editableCriteria, setEditableCriteria] = useState<CriterionDoc[]>([]);
  const [savingCriteria, setSavingCriteria] = useState(false);

  useEffect(() => {
    setEditableCriteria(criteria.map((c) => ({ ...c })));
  }, [criteria]);

  const totalWeight = editableCriteria.reduce((acc, c) => acc + Number(c.weight || 0), 0);

  const handleSaveCriteria = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editableCriteria.length === 0) return;

    if (totalWeight !== 100) {
      showToast(`A soma dos pesos deve ser exatamente 100% (atual: ${totalWeight}%).`, 'error');
      return;
    }

    for (const c of editableCriteria) {
      if (c.name.trim().length < 2 || c.description.trim().length < 5 || c.weight < 1) {
        showToast('Preencha nome (mín. 2 chars), descrição (mín. 5 chars) e peso >= 1% em todos os critérios.', 'error');
        return;
      }
    }

    setSavingCriteria(true);
    try {
      const batch = writeBatch(db);
      for (const c of editableCriteria) {
        batch.set(doc(db, 'criteria', c.key), {
          key: c.key,
          name: c.name.trim().slice(0, 100),
          description: c.description.trim().slice(0, 400),
          weight: Math.trunc(c.weight),
          color: c.color,
          order: c.order,
        });
      }
      await batch.commit();
      await onRefresh();
      showToast('Critérios de avaliação atualizados com sucesso!', 'success');
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'criteria');
      showToast('Erro ao salvar critérios.', 'error');
    } finally {
      setSavingCriteria(false);
    }
  };

  // --- CRONOGRAMA ---
  const [schedId, setSchedId] = useState<string | null>(null);
  const [schedTime, setSchedTime] = useState('');
  const [schedTitle, setSchedTitle] = useState('');
  const [schedDesc, setSchedDesc] = useState('');
  const [schedAccent, setSchedAccent] = useState<ScheduleItemDoc['accent']>('indigo');
  const [schedOrder, setSchedOrder] = useState(1);

  // --- JURADOS PÚBLICOS ---
  const [jurorId, setJurorId] = useState<string | null>(null);
  const [jurorName, setJurorName] = useState('');
  const [jurorInitials, setJurorInitials] = useState('');
  const [jurorRole, setJurorRole] = useState('');
  const [jurorInst, setJurorInst] = useState('');
  const [jurorTheme, setJurorTheme] = useState<PublicJurorDoc['colorTheme']>('indigo-cyan');
  const [jurorOrder, setJurorOrder] = useState(1);

  // --- REGULAMENTO ---
  const [ruleId, setRuleId] = useState<string | null>(null);
  const [ruleTitle, setRuleTitle] = useState('');
  const [ruleContent, setRuleContent] = useState('');
  const [ruleOrder, setRuleOrder] = useState(1);

  // --- FAQ ---
  const [faqId, setFaqId] = useState<string | null>(null);
  const [faqQuestion, setFaqQuestion] = useState('');
  const [faqAnswer, setFaqAnswer] = useState('');
  const [faqOrder, setFaqOrder] = useState(1);

  const [savingItem, setSavingItem] = useState(false);

  // Modal de confirmação de exclusão
  const [deleteTarget, setDeleteTarget] = useState<{
    collectionName: string;
    id: string;
    label: string;
  } | null>(null);
  const [deleting, setDeleting] = useState(false);

  const handleSaveSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    const docId = schedId || `item_${Date.now()}`;
    setSavingItem(true);
    try {
      await setDoc(doc(db, 'scheduleItems', docId), {
        timeLabel: schedTime.trim().slice(0, 50),
        title: schedTitle.trim().slice(0, 120),
        description: schedDesc.trim().slice(0, 400),
        accent: schedAccent,
        order: Math.trunc(schedOrder),
      });
      setSchedId(null);
      setSchedTime('');
      setSchedTitle('');
      setSchedDesc('');
      setSchedOrder(scheduleItems.length + 2);
      await onRefresh();
      showToast('Item do cronograma salvo!', 'success');
    } catch {
      showToast('Erro ao salvar item do cronograma.', 'error');
    } finally {
      setSavingItem(false);
    }
  };

  const handleSaveJuror = async (e: React.FormEvent) => {
    e.preventDefault();
    const docId = jurorId || `juror_${Date.now()}`;
    setSavingItem(true);
    try {
      await setDoc(doc(db, 'publicJurors', docId), {
        name: jurorName.trim().slice(0, 120),
        initials: jurorInitials.trim().toUpperCase().slice(0, 4),
        role: jurorRole.trim().slice(0, 120),
        institution: jurorInst.trim().slice(0, 120),
        colorTheme: jurorTheme,
        order: Math.trunc(jurorOrder),
      });
      setJurorId(null);
      setJurorName('');
      setJurorInitials('');
      setJurorRole('');
      setJurorInst('');
      setJurorOrder(publicJurors.length + 2);
      await onRefresh();
      showToast('Jurado público salvo!', 'success');
    } catch {
      showToast('Erro ao salvar jurado público.', 'error');
    } finally {
      setSavingItem(false);
    }
  };

  const handleSaveRule = async (e: React.FormEvent) => {
    e.preventDefault();
    const docId = ruleId || `rule_${Date.now()}`;
    setSavingItem(true);
    try {
      await setDoc(doc(db, 'rules', docId), {
        title: ruleTitle.trim().slice(0, 160),
        content: ruleContent.trim().slice(0, 1500),
        order: Math.trunc(ruleOrder),
      });
      setRuleId(null);
      setRuleTitle('');
      setRuleContent('');
      setRuleOrder(rules.length + 2);
      await onRefresh();
      showToast('Regra do regulamento salva!', 'success');
    } catch {
      showToast('Erro ao salvar regra.', 'error');
    } finally {
      setSavingItem(false);
    }
  };

  const handleSaveFaq = async (e: React.FormEvent) => {
    e.preventDefault();
    const docId = faqId || `faq_${Date.now()}`;
    setSavingItem(true);
    try {
      await setDoc(doc(db, 'faqItems', docId), {
        question: faqQuestion.trim().slice(0, 200),
        answer: faqAnswer.trim().slice(0, 1500),
        order: Math.trunc(faqOrder),
      });
      setFaqId(null);
      setFaqQuestion('');
      setFaqAnswer('');
      setFaqOrder(faqItems.length + 2);
      await onRefresh();
      showToast('Pergunta frequente salva!', 'success');
    } catch {
      showToast('Erro ao salvar FAQ.', 'error');
    } finally {
      setSavingItem(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteDoc(doc(db, deleteTarget.collectionName, deleteTarget.id));
      await onRefresh();
      showToast(`"${deleteTarget.label}" excluído.`, 'info');
      setDeleteTarget(null);
    } catch {
      showToast('Erro ao excluir registro.', 'error');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Sub-navegação de Conteúdo */}
      <div className="bg-navy-800 border border-navy-600 rounded-2xl p-2 flex flex-wrap gap-2">
        {(
          [
            { id: 'criteria', label: 'Critérios (Pesos)', icon: 'fa-scale-balanced' },
            { id: 'schedule', label: 'Cronograma', icon: 'fa-calendar-days' },
            { id: 'jurors', label: 'Jurados Públicos', icon: 'fa-user-tie' },
            { id: 'rules', label: 'Regulamento', icon: 'fa-book' },
            { id: 'faq', label: 'FAQ', icon: 'fa-circle-question' },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setSection(tab.id)}
            className={`px-4 py-2 rounded-xl text-xs font-semibold transition flex items-center space-x-2 ${
              section === tab.id
                ? 'bg-indigo-600 text-white shadow'
                : 'bg-navy-900 text-slate-400 hover:text-white border border-navy-700'
            }`}
          >
            <i className={`fa-solid ${tab.icon}`} />
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* 1. CRITÉRIOS */}
      {section === 'criteria' && (
        <form onSubmit={handleSaveCriteria} className="bg-navy-800 border border-navy-600 rounded-2xl p-6 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-navy-700 pb-3">
            <div>
              <h3 className="font-heading font-bold text-white text-base">Critérios de Avaliação</h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Edite nome, descrição e peso percentual dos 5 critérios. A soma total deve ser <strong>100%</strong>.
              </p>
            </div>
            <span
              className={`px-3 py-1 rounded-full text-xs font-code border tabular-nums ${
                totalWeight === 100
                  ? 'bg-emerald-950 border-emerald-500/40 text-emerald-300'
                  : 'bg-rose-950 border-rose-500/40 text-rose-300'
              }`}
            >
              Soma dos pesos: {totalWeight}%
            </span>
          </div>

          <div className="space-y-4">
            {editableCriteria.map((c, idx) => (
              <div key={c.key} className="bg-navy-900 border border-navy-600 rounded-xl p-4 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                  <div className="sm:col-span-2 flex items-center">
                    <span className="px-2.5 py-1 rounded bg-navy-800 border border-navy-600 font-code text-xs text-cyan-400">
                      {c.key}
                    </span>
                  </div>
                  <div className="sm:col-span-7">
                    <input
                      type="text"
                      required
                      maxLength={100}
                      value={c.name}
                      onChange={(e) =>
                        setEditableCriteria((prev) =>
                          prev.map((item, i) => (i === idx ? { ...item, name: e.target.value } : item))
                        )
                      }
                      className="w-full bg-navy-800 border border-navy-600 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div className="sm:col-span-3 flex items-center space-x-2">
                    <input
                      type="number"
                      min={1}
                      max={100}
                      required
                      value={c.weight}
                      onChange={(e) =>
                        setEditableCriteria((prev) =>
                          prev.map((item, i) =>
                            i === idx ? { ...item, weight: Number(e.target.value) } : item
                          )
                        )
                      }
                      className="w-full bg-navy-800 border border-navy-600 rounded-xl px-3 py-2 text-xs text-white font-code text-center focus:outline-none focus:border-indigo-500"
                    />
                    <span className="text-xs font-code text-slate-400">%</span>
                  </div>
                </div>
                <textarea
                  rows={2}
                  required
                  maxLength={400}
                  value={c.description}
                  onChange={(e) =>
                    setEditableCriteria((prev) =>
                      prev.map((item, i) =>
                        i === idx ? { ...item, description: e.target.value } : item
                      )
                    )
                  }
                  className="w-full bg-navy-800 border border-navy-600 rounded-xl p-2.5 text-xs text-slate-300 focus:outline-none focus:border-indigo-500"
                />
              </div>
            ))}
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={savingCriteria || totalWeight !== 100}
              className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-xl text-xs font-semibold shadow-lg shadow-indigo-600/30 transition"
            >
              {savingCriteria ? 'Salvando...' : 'Salvar Critérios'}
            </button>
          </div>
        </form>
      )}

      {/* 2. CRONOGRAMA */}
      {section === 'schedule' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <form onSubmit={handleSaveSchedule} className="lg:col-span-5 bg-navy-800 border border-navy-600 rounded-2xl p-5 space-y-4">
            <h3 className="font-heading font-bold text-white text-sm border-b border-navy-700 pb-2">
              {schedId ? 'Editar Item do Cronograma' : 'Novo Item do Cronograma'}
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-code text-slate-300 mb-1">Horário / Dia *</label>
                <input
                  type="text"
                  required
                  value={schedTime}
                  onChange={(e) => setSchedTime(e.target.value)}
                  placeholder="08:00 • Dia 1"
                  className="w-full bg-navy-900 border border-navy-600 rounded-xl px-3 py-2 text-xs text-white"
                />
              </div>
              <div>
                <label className="block text-[11px] font-code text-slate-300 mb-1">Ordem</label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={schedOrder}
                  onChange={(e) => setSchedOrder(Number(e.target.value))}
                  className="w-full bg-navy-900 border border-navy-600 rounded-xl px-3 py-2 text-xs text-white font-code"
                />
              </div>
            </div>
            <div>
              <label className="block text-[11px] font-code text-slate-300 mb-1">Título *</label>
              <input
                type="text"
                required
                value={schedTitle}
                onChange={(e) => setSchedTitle(e.target.value)}
                className="w-full bg-navy-900 border border-navy-600 rounded-xl px-3 py-2 text-xs text-white"
              />
            </div>
            <div>
              <label className="block text-[11px] font-code text-slate-300 mb-1">Descrição *</label>
              <textarea
                rows={3}
                required
                value={schedDesc}
                onChange={(e) => setSchedDesc(e.target.value)}
                className="w-full bg-navy-900 border border-navy-600 rounded-xl p-3 text-xs text-white"
              />
            </div>
            <div>
              <label className="block text-[11px] font-code text-slate-300 mb-1">Cor de Destaque</label>
              <select
                value={schedAccent}
                onChange={(e) => setSchedAccent(e.target.value as ScheduleItemDoc['accent'])}
                className="w-full bg-navy-900 border border-navy-600 rounded-xl px-3 py-2 text-xs text-white"
              >
                <option value="indigo">Índigo</option>
                <option value="cyan">Ciano</option>
                <option value="amber">Âmbar</option>
                <option value="emerald">Esmeralda</option>
              </select>
            </div>
            <div className="flex gap-2">
              {schedId && (
                <button
                  type="button"
                  onClick={() => {
                    setSchedId(null);
                    setSchedTime('');
                    setSchedTitle('');
                    setSchedDesc('');
                  }}
                  className="px-4 py-2 bg-navy-900 border border-navy-600 text-slate-300 rounded-xl text-xs"
                >
                  Cancelar
                </button>
              )}
              <button
                type="submit"
                disabled={savingItem}
                className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold"
              >
                {savingItem ? 'Salvando...' : schedId ? 'Atualizar Item' : 'Adicionar Item'}
              </button>
            </div>
          </form>

          <div className="lg:col-span-7 space-y-3">
            {scheduleItems.map((item) => (
              <div key={item.id} className="bg-navy-800 border border-navy-600 rounded-xl p-4 flex justify-between items-start gap-4">
                <div>
                  <span className="text-[11px] font-code text-cyan-400">
                    #{item.order} • {item.timeLabel}
                  </span>
                  <h4 className="font-heading font-bold text-sm text-white mt-0.5">{item.title}</h4>
                  <p className="text-xs text-slate-400 mt-1">{item.description}</p>
                </div>
                <div className="flex items-center space-x-2 flex-shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      setSchedId(item.id);
                      setSchedTime(item.timeLabel);
                      setSchedTitle(item.title);
                      setSchedDesc(item.description);
                      setSchedAccent(item.accent);
                      setSchedOrder(item.order);
                    }}
                    className="p-2 text-slate-400 hover:text-indigo-400 text-xs"
                  >
                    <i className="fa-solid fa-pen" />
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setDeleteTarget({ collectionName: 'scheduleItems', id: item.id, label: item.title })
                    }
                    className="p-2 text-slate-400 hover:text-rose-400 text-xs"
                  >
                    <i className="fa-solid fa-trash-can" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 3. JURADOS PÚBLICOS */}
      {section === 'jurors' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <form onSubmit={handleSaveJuror} className="lg:col-span-5 bg-navy-800 border border-navy-600 rounded-2xl p-5 space-y-4">
            <h3 className="font-heading font-bold text-white text-sm border-b border-navy-700 pb-2">
              {jurorId ? 'Editar Jurado Público' : 'Novo Jurado Público'}
            </h3>
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <label className="block text-[11px] font-code text-slate-300 mb-1">Nome *</label>
                <input
                  type="text"
                  required
                  value={jurorName}
                  onChange={(e) => setJurorName(e.target.value)}
                  className="w-full bg-navy-900 border border-navy-600 rounded-xl px-3 py-2 text-xs text-white"
                />
              </div>
              <div>
                <label className="block text-[11px] font-code text-slate-300 mb-1">Iniciais *</label>
                <input
                  type="text"
                  required
                  maxLength={4}
                  value={jurorInitials}
                  onChange={(e) => setJurorInitials(e.target.value)}
                  placeholder="DR"
                  className="w-full bg-navy-900 border border-navy-600 rounded-xl px-3 py-2 text-xs text-white font-code uppercase"
                />
              </div>
            </div>
            <div>
              <label className="block text-[11px] font-code text-slate-300 mb-1">Cargo / Especialidade *</label>
              <input
                type="text"
                required
                value={jurorRole}
                onChange={(e) => setJurorRole(e.target.value)}
                className="w-full bg-navy-900 border border-navy-600 rounded-xl px-3 py-2 text-xs text-white"
              />
            </div>
            <div>
              <label className="block text-[11px] font-code text-slate-300 mb-1">Instituição / Empresa *</label>
              <input
                type="text"
                required
                value={jurorInst}
                onChange={(e) => setJurorInst(e.target.value)}
                className="w-full bg-navy-900 border border-navy-600 rounded-xl px-3 py-2 text-xs text-white"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-code text-slate-300 mb-1">Tema</label>
                <select
                  value={jurorTheme}
                  onChange={(e) => setJurorTheme(e.target.value as PublicJurorDoc['colorTheme'])}
                  className="w-full bg-navy-900 border border-navy-600 rounded-xl px-3 py-2 text-xs text-white"
                >
                  <option value="indigo-cyan">Índigo / Ciano</option>
                  <option value="cyan-emerald">Ciano / Esmeralda</option>
                  <option value="purple-indigo">Roxo / Índigo</option>
                  <option value="amber-rose">Âmbar / Rosa</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-code text-slate-300 mb-1">Ordem</label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={jurorOrder}
                  onChange={(e) => setJurorOrder(Number(e.target.value))}
                  className="w-full bg-navy-900 border border-navy-600 rounded-xl px-3 py-2 text-xs text-white font-code"
                />
              </div>
            </div>
            <div className="flex gap-2">
              {jurorId && (
                <button
                  type="button"
                  onClick={() => {
                    setJurorId(null);
                    setJurorName('');
                    setJurorInitials('');
                    setJurorRole('');
                    setJurorInst('');
                  }}
                  className="px-4 py-2 bg-navy-900 border border-navy-600 text-slate-300 rounded-xl text-xs"
                >
                  Cancelar
                </button>
              )}
              <button
                type="submit"
                disabled={savingItem}
                className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold"
              >
                {savingItem ? 'Salvando...' : jurorId ? 'Atualizar Jurado' : 'Adicionar Jurado'}
              </button>
            </div>
          </form>

          <div className="lg:col-span-7 space-y-3">
            {publicJurors.map((j) => (
              <div key={j.id} className="bg-navy-800 border border-navy-600 rounded-xl p-4 flex justify-between items-center gap-4">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 rounded-full bg-indigo-950 border border-indigo-500/30 flex items-center justify-center font-code font-bold text-indigo-300 text-xs">
                    {j.initials}
                  </div>
                  <div>
                    <div className="font-heading font-bold text-sm text-white">{j.name}</div>
                    <div className="text-xs text-slate-400">
                      {j.role} • <span className="text-cyan-400">{j.institution}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={() => {
                      setJurorId(j.id);
                      setJurorName(j.name);
                      setJurorInitials(j.initials);
                      setJurorRole(j.role);
                      setJurorInst(j.institution);
                      setJurorTheme(j.colorTheme);
                      setJurorOrder(j.order);
                    }}
                    className="p-2 text-slate-400 hover:text-indigo-400 text-xs"
                  >
                    <i className="fa-solid fa-pen" />
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setDeleteTarget({ collectionName: 'publicJurors', id: j.id, label: j.name })
                    }
                    className="p-2 text-slate-400 hover:text-rose-400 text-xs"
                  >
                    <i className="fa-solid fa-trash-can" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 4. REGULAMENTO */}
      {section === 'rules' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <form onSubmit={handleSaveRule} className="lg:col-span-5 bg-navy-800 border border-navy-600 rounded-2xl p-5 space-y-4">
            <h3 className="font-heading font-bold text-white text-sm border-b border-navy-700 pb-2">
              {ruleId ? 'Editar Regra' : 'Nova Regra do Regulamento'}
            </h3>
            <div>
              <label className="block text-[11px] font-code text-slate-300 mb-1">Título *</label>
              <input
                type="text"
                required
                value={ruleTitle}
                onChange={(e) => setRuleTitle(e.target.value)}
                className="w-full bg-navy-900 border border-navy-600 rounded-xl px-3 py-2 text-xs text-white"
              />
            </div>
            <div>
              <label className="block text-[11px] font-code text-slate-300 mb-1">Conteúdo *</label>
              <textarea
                rows={4}
                required
                value={ruleContent}
                onChange={(e) => setRuleContent(e.target.value)}
                className="w-full bg-navy-900 border border-navy-600 rounded-xl p-3 text-xs text-white"
              />
            </div>
            <div>
              <label className="block text-[11px] font-code text-slate-300 mb-1">Ordem</label>
              <input
                type="number"
                min={0}
                max={100}
                value={ruleOrder}
                onChange={(e) => setRuleOrder(Number(e.target.value))}
                className="w-full bg-navy-900 border border-navy-600 rounded-xl px-3 py-2 text-xs text-white font-code"
              />
            </div>
            <div className="flex gap-2">
              {ruleId && (
                <button
                  type="button"
                  onClick={() => {
                    setRuleId(null);
                    setRuleTitle('');
                    setRuleContent('');
                  }}
                  className="px-4 py-2 bg-navy-900 border border-navy-600 text-slate-300 rounded-xl text-xs"
                >
                  Cancelar
                </button>
              )}
              <button
                type="submit"
                disabled={savingItem}
                className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold"
              >
                {savingItem ? 'Salvando...' : ruleId ? 'Atualizar Regra' : 'Adicionar Regra'}
              </button>
            </div>
          </form>

          <div className="lg:col-span-7 space-y-3">
            {rules.map((r) => (
              <div key={r.id} className="bg-navy-800 border border-navy-600 rounded-xl p-4 flex justify-between items-start gap-4">
                <div>
                  <span className="text-[11px] font-code text-cyan-400">#{r.order}</span>
                  <h4 className="font-heading font-bold text-sm text-white">{r.title}</h4>
                  <p className="text-xs text-slate-400 mt-1 leading-relaxed">{r.content}</p>
                </div>
                <div className="flex items-center space-x-2 flex-shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      setRuleId(r.id);
                      setRuleTitle(r.title);
                      setRuleContent(r.content);
                      setRuleOrder(r.order);
                    }}
                    className="p-2 text-slate-400 hover:text-indigo-400 text-xs"
                  >
                    <i className="fa-solid fa-pen" />
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setDeleteTarget({ collectionName: 'rules', id: r.id, label: r.title })
                    }
                    className="p-2 text-slate-400 hover:text-rose-400 text-xs"
                  >
                    <i className="fa-solid fa-trash-can" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 5. FAQ */}
      {section === 'faq' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <form onSubmit={handleSaveFaq} className="lg:col-span-5 bg-navy-800 border border-navy-600 rounded-2xl p-5 space-y-4">
            <h3 className="font-heading font-bold text-white text-sm border-b border-navy-700 pb-2">
              {faqId ? 'Editar Pergunta Frequente' : 'Nova Pergunta Frequente'}
            </h3>
            <div>
              <label className="block text-[11px] font-code text-slate-300 mb-1">Pergunta *</label>
              <input
                type="text"
                required
                value={faqQuestion}
                onChange={(e) => setFaqQuestion(e.target.value)}
                className="w-full bg-navy-900 border border-navy-600 rounded-xl px-3 py-2 text-xs text-white"
              />
            </div>
            <div>
              <label className="block text-[11px] font-code text-slate-300 mb-1">Resposta *</label>
              <textarea
                rows={4}
                required
                value={faqAnswer}
                onChange={(e) => setFaqAnswer(e.target.value)}
                className="w-full bg-navy-900 border border-navy-600 rounded-xl p-3 text-xs text-white"
              />
            </div>
            <div>
              <label className="block text-[11px] font-code text-slate-300 mb-1">Ordem</label>
              <input
                type="number"
                min={0}
                max={100}
                value={faqOrder}
                onChange={(e) => setFaqOrder(Number(e.target.value))}
                className="w-full bg-navy-900 border border-navy-600 rounded-xl px-3 py-2 text-xs text-white font-code"
              />
            </div>
            <div className="flex gap-2">
              {faqId && (
                <button
                  type="button"
                  onClick={() => {
                    setFaqId(null);
                    setFaqQuestion('');
                    setFaqAnswer('');
                  }}
                  className="px-4 py-2 bg-navy-900 border border-navy-600 text-slate-300 rounded-xl text-xs"
                >
                  Cancelar
                </button>
              )}
              <button
                type="submit"
                disabled={savingItem}
                className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold"
              >
                {savingItem ? 'Salvando...' : faqId ? 'Atualizar FAQ' : 'Adicionar FAQ'}
              </button>
            </div>
          </form>

          <div className="lg:col-span-7 space-y-3">
            {faqItems.map((f) => (
              <div key={f.id} className="bg-navy-800 border border-navy-600 rounded-xl p-4 flex justify-between items-start gap-4">
                <div>
                  <span className="text-[11px] font-code text-cyan-400">#{f.order}</span>
                  <h4 className="font-heading font-bold text-sm text-white">{f.question}</h4>
                  <p className="text-xs text-slate-400 mt-1 leading-relaxed">{f.answer}</p>
                </div>
                <div className="flex items-center space-x-2 flex-shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      setFaqId(f.id);
                      setFaqQuestion(f.question);
                      setFaqAnswer(f.answer);
                      setFaqOrder(f.order);
                    }}
                    className="p-2 text-slate-400 hover:text-indigo-400 text-xs"
                  >
                    <i className="fa-solid fa-pen" />
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setDeleteTarget({ collectionName: 'faqItems', id: f.id, label: f.question })
                    }
                    className="p-2 text-slate-400 hover:text-rose-400 text-xs"
                  >
                    <i className="fa-solid fa-trash-can" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <ConfirmModal
        open={Boolean(deleteTarget)}
        title="Excluir Item de Conteúdo?"
        description={`Tem certeza que deseja excluir "${deleteTarget?.label}"? Esta ação removerá o item da landing page imediatamente.`}
        confirmLabel="Sim, excluir"
        variant="rose"
        loading={deleting}
        onConfirm={() => void handleConfirmDelete()}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
