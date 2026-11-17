import React, { useEffect, useState } from 'react';
import { doc, serverTimestamp, setDoc, Timestamp } from 'firebase/firestore';
import { useToast } from '../../contexts/ToastContext';
import { db } from '../../lib/firebase';
import { handleFirestoreError, OperationType } from '../../lib/firestoreError';
import type { EventSettings, PublicStats, StatItem, StepItem } from '../../types/hackathon';

interface AdminEventTabProps {
  settings: EventSettings | null;
  stats: PublicStats | null;
  criteriaCount: number;
  scheduleCount: number;
  jurorsCount: number;
  rulesCount: number;
  faqCount: number;
  seeding: boolean;
  onSeedInitialContent: () => Promise<void>;
  onSaved: () => Promise<void>;
}

function timestampToSaoPauloInput(ts?: Timestamp): string {
  if (!ts) return '';
  const parts = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(ts.toDate());
  const map: Record<string, string> = {};
  for (const p of parts) map[p.type] = p.value;
  return `${map.year}-${map.month}-${map.day}T${map.hour}:${map.minute}`;
}

function saoPauloInputToTimestamp(val: string): Timestamp | null {
  if (!val) return null;
  const date = new Date(`${val}:00-03:00`);
  if (Number.isNaN(date.getTime())) return null;
  return Timestamp.fromDate(date);
}

export function AdminEventTab({
  settings,
  stats,
  criteriaCount,
  scheduleCount,
  jurorsCount,
  rulesCount,
  faqCount,
  seeding,
  onSeedInitialContent,
  onSaved,
}: AdminEventTabProps) {
  const { showToast } = useToast();

  const [eventTitle, setEventTitle] = useState('');
  const [eventSubtitle, setEventSubtitle] = useState('');
  const [campusLabel, setCampusLabel] = useState('');
  const [heroBadge, setHeroBadge] = useState('');
  const [heroTag, setHeroTag] = useState('');
  const [heroTitleLine1, setHeroTitleLine1] = useState('');
  const [heroTitleHighlight, setHeroTitleHighlight] = useState('');
  const [heroDescription, setHeroDescription] = useState('');
  const [loginShowcaseHeadline, setLoginShowcaseHeadline] = useState('');
  const [loginShowcaseDescription, setLoginShowcaseDescription] = useState('');
  const [loginDurationLabel, setLoginDurationLabel] = useState('');
  const [loginTeamsRangeLabel, setLoginTeamsRangeLabel] = useState('');
  const [startsAtInput, setStartsAtInput] = useState('');
  const [deadlineInput, setDeadlineInput] = useState('');
  const [maxTeams, setMaxTeams] = useState(25);
  const [teamMinMembers, setTeamMinMembers] = useState(3);
  const [teamMaxMembers, setTeamMaxMembers] = useState(5);
  const [maxExternalMembers, setMaxExternalMembers] = useState(1);
  const [contactEmail, setContactEmail] = useState('');
  const [contactLocation, setContactLocation] = useState('');
  const [ctaTitle, setCtaTitle] = useState('');
  const [ctaDescription, setCtaDescription] = useState('');
  const [partnersText, setPartnersText] = useState('');
  const [statItems, setStatItems] = useState<StatItem[]>([]);
  const [stepItems, setStepItems] = useState<StepItem[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!settings) return;
    setEventTitle(settings.eventTitle || '');
    setEventSubtitle(settings.eventSubtitle || '');
    setCampusLabel(settings.campusLabel || '');
    setHeroBadge(settings.heroBadge || '');
    setHeroTag(settings.heroTag || '');
    setHeroTitleLine1(settings.heroTitleLine1 || '');
    setHeroTitleHighlight(settings.heroTitleHighlight || '');
    setHeroDescription(settings.heroDescription || '');
    setLoginShowcaseHeadline(settings.loginShowcaseHeadline || '');
    setLoginShowcaseDescription(settings.loginShowcaseDescription || '');
    setLoginDurationLabel(settings.loginDurationLabel || '');
    setLoginTeamsRangeLabel(settings.loginTeamsRangeLabel || '');
    setStartsAtInput(timestampToSaoPauloInput(settings.startsAt));
    setDeadlineInput(timestampToSaoPauloInput(settings.submissionDeadline));
    setMaxTeams(Number(settings.maxTeams ?? 25));
    setTeamMinMembers(Number(settings.teamMinMembers ?? 3));
    setTeamMaxMembers(Number(settings.teamMaxMembers ?? 5));
    setMaxExternalMembers(Number(settings.maxExternalMembers ?? 1));
    setContactEmail(settings.contactEmail || '');
    setContactLocation(settings.contactLocation || '');
    setCtaTitle(settings.ctaTitle || '');
    setCtaDescription(settings.ctaDescription || '');
    setPartnersText((settings.partners || []).join('\n'));
    setStatItems(settings.stats || []);
    setStepItems(settings.steps || []);
  }, [settings]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settings) {
      showToast('Carregue o conteúdo inicial primeiro antes de editar.', 'warning');
      return;
    }

    const startsTs = saoPauloInputToTimestamp(startsAtInput);
    const deadlineTs = saoPauloInputToTimestamp(deadlineInput);
    if (!startsTs || !deadlineTs) {
      showToast('Informe datas válidas para início e prazo final (Horário de Brasília).', 'error');
      return;
    }
    if (teamMaxMembers < teamMinMembers) {
      showToast('O máximo de integrantes não pode ser menor que o mínimo.', 'error');
      return;
    }
    if (maxTeams < 1 || maxTeams > 500) {
      showToast('O limite de equipes deve estar entre 1 e 500.', 'error');
      return;
    }

    const partners = partnersText
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);

    setSaving(true);
    try {
      await setDoc(
        doc(db, 'settings', 'event'),
        {
          eventTitle: eventTitle.trim().slice(0, 150),
          eventSubtitle: eventSubtitle.trim().slice(0, 150),
          campusLabel: campusLabel.trim().slice(0, 120),
          heroBadge: heroBadge.trim().slice(0, 120),
          heroTag: heroTag.trim().slice(0, 80),
          heroTitleLine1: heroTitleLine1.trim().slice(0, 80),
          heroTitleHighlight: heroTitleHighlight.trim().slice(0, 80),
          heroDescription: heroDescription.trim().slice(0, 500),
          loginShowcaseHeadline: loginShowcaseHeadline.trim().slice(0, 200),
          loginShowcaseDescription: loginShowcaseDescription.trim().slice(0, 400),
          loginDurationLabel: loginDurationLabel.trim().slice(0, 30),
          loginTeamsRangeLabel: loginTeamsRangeLabel.trim().slice(0, 30),
          startsAt: startsTs,
          submissionDeadline: deadlineTs,
          maxTeams: Math.trunc(maxTeams),
          teamMinMembers: Math.trunc(teamMinMembers),
          teamMaxMembers: Math.trunc(teamMaxMembers),
          maxExternalMembers: Math.trunc(maxExternalMembers),
          evaluationOpen: Boolean(settings.evaluationOpen),
          gradesReleased: Boolean(settings.gradesReleased),
          stats: statItems,
          steps: stepItems,
          partners,
          contactEmail: contactEmail.trim().slice(0, 160),
          contactLocation: contactLocation.trim().slice(0, 160),
          ctaTitle: ctaTitle.trim().slice(0, 160),
          ctaDescription: ctaDescription.trim().slice(0, 300),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      ).catch((err) => handleFirestoreError(err, OperationType.WRITE, 'settings/event'));

      await onSaved();
      showToast('Configurações do evento atualizadas com sucesso!', 'success');
    } catch {
      showToast('Erro ao salvar configurações. Verifique os limites de campos.', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Banner / Carga inicial + Resumo */}
      <div className="bg-navy-800 border border-navy-600 rounded-2xl p-6 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-navy-700 pb-4">
          <div>
            <span className="text-xs font-code text-cyan-400 uppercase">Visão Geral & Carga Padrão</span>
            <h2 className="font-heading font-bold text-lg text-white mt-0.5">
              Estado Atual da Plataforma
            </h2>
          </div>
          <button
            type="button"
            onClick={() => void onSeedInitialContent()}
            disabled={seeding}
            className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white rounded-xl text-xs font-semibold shadow-lg shadow-indigo-600/30 transition flex items-center space-x-2"
          >
            {seeding ? (
              <>
                <i className="fa-solid fa-circle-notch fa-spin" />
                <span>Gravando conteúdo...</span>
              </>
            ) : (
              <>
                <i className="fa-solid fa-database" />
                <span>Carregar conteúdo inicial</span>
              </>
            )}
          </button>
        </div>

        <p className="text-xs text-slate-400 leading-relaxed">
          O botão <strong className="text-white">Carregar conteúdo inicial</strong> grava de forma idempotente os dados padrão da landing page sem zerar o contador de equipes inscritas.
        </p>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-navy-900 border border-navy-600 rounded-xl p-4">
            <div className="text-[11px] font-code text-slate-400">Evento (settings)</div>
            <div className={`text-sm font-bold mt-1 ${settings ? 'text-emerald-400' : 'text-amber-400'}`}>
              {settings ? 'Configurado' : 'Não carregado'}
            </div>
          </div>
          <div className="bg-navy-900 border border-navy-600 rounded-xl p-4">
            <div className="text-[11px] font-code text-slate-400">Equipes Inscritas</div>
            <div className="text-sm font-bold text-white font-code mt-1 tabular-nums">
              {stats?.teamCount ?? 0} / {settings?.maxTeams ?? 25}
            </div>
          </div>
          <div className="bg-navy-900 border border-navy-600 rounded-xl p-4">
            <div className="text-[11px] font-code text-slate-400">Critérios / Cronograma</div>
            <div className="text-sm font-bold text-cyan-400 font-code mt-1 tabular-nums">
              {criteriaCount} / {scheduleCount}
            </div>
          </div>
          <div className="bg-navy-900 border border-navy-600 rounded-xl p-4">
            <div className="text-[11px] font-code text-slate-400">Jurados / Regras / FAQ</div>
            <div className="text-sm font-bold text-indigo-400 font-code mt-1 tabular-nums">
              {jurorsCount} / {rulesCount} / {faqCount}
            </div>
          </div>
        </div>
      </div>

      {/* Formulário de Edição */}
      {settings && (
        <form onSubmit={handleSave} className="bg-navy-800 border border-navy-600 rounded-2xl p-6 space-y-6">
          <div className="border-b border-navy-700 pb-3">
            <h3 className="font-heading font-bold text-white text-base flex items-center space-x-2">
              <i className="fa-solid fa-sliders text-indigo-400" />
              <span>Configurações do Evento, Datas e Textos da Landing</span>
            </h3>
          </div>

          {/* Datas e Regras de Equipe */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-code text-slate-300 mb-1.5">
                Início do Evento (Horário de Brasília) *
              </label>
              <input
                type="datetime-local"
                required
                value={startsAtInput}
                onChange={(e) => setStartsAtInput(e.target.value)}
                className="w-full bg-navy-900 border border-navy-600 rounded-xl px-4 py-2.5 text-sm text-white font-code focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-code text-slate-300 mb-1.5">
                Prazo Limite de Envio (Horário de Brasília) *
              </label>
              <input
                type="datetime-local"
                required
                value={deadlineInput}
                onChange={(e) => setDeadlineInput(e.target.value)}
                className="w-full bg-navy-900 border border-navy-600 rounded-xl px-4 py-2.5 text-sm text-white font-code focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-code text-slate-300 mb-1.5">Máx. de Equipes</label>
              <input
                type="number"
                min={1}
                max={500}
                value={maxTeams}
                onChange={(e) => setMaxTeams(Number(e.target.value))}
                className="w-full bg-navy-900 border border-navy-600 rounded-xl px-3 py-2 text-sm text-white font-code focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-code text-slate-300 mb-1.5">Mín. Integrantes</label>
              <input
                type="number"
                min={1}
                max={10}
                value={teamMinMembers}
                onChange={(e) => setTeamMinMembers(Number(e.target.value))}
                className="w-full bg-navy-900 border border-navy-600 rounded-xl px-3 py-2 text-sm text-white font-code focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-code text-slate-300 mb-1.5">Máx. Integrantes</label>
              <input
                type="number"
                min={1}
                max={10}
                value={teamMaxMembers}
                onChange={(e) => setTeamMaxMembers(Number(e.target.value))}
                className="w-full bg-navy-900 border border-navy-600 rounded-xl px-3 py-2 text-sm text-white font-code focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-code text-slate-300 mb-1.5">Máx. Externos</label>
              <input
                type="number"
                min={0}
                max={5}
                value={maxExternalMembers}
                onChange={(e) => setMaxExternalMembers(Number(e.target.value))}
                className="w-full bg-navy-900 border border-navy-600 rounded-xl px-3 py-2 text-sm text-white font-code focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          {/* Hero e Identidade */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-navy-700">
            <div>
              <label className="block text-xs font-code text-slate-300 mb-1.5">Título Oficial do Evento</label>
              <input
                type="text"
                maxLength={150}
                value={eventTitle}
                onChange={(e) => setEventTitle(e.target.value)}
                className="w-full bg-navy-900 border border-navy-600 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-code text-slate-300 mb-1.5">Subtítulo / Curso</label>
              <input
                type="text"
                maxLength={150}
                value={eventSubtitle}
                onChange={(e) => setEventSubtitle(e.target.value)}
                className="w-full bg-navy-900 border border-navy-600 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-code text-slate-300 mb-1.5">Campus</label>
              <input
                type="text"
                maxLength={120}
                value={campusLabel}
                onChange={(e) => setCampusLabel(e.target.value)}
                className="w-full bg-navy-900 border border-navy-600 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-code text-slate-300 mb-1.5">Badge do Hero</label>
              <input
                type="text"
                maxLength={120}
                value={heroBadge}
                onChange={(e) => setHeroBadge(e.target.value)}
                className="w-full bg-navy-900 border border-navy-600 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-code text-slate-300 mb-1.5">Hero Linha 1</label>
              <input
                type="text"
                maxLength={80}
                value={heroTitleLine1}
                onChange={(e) => setHeroTitleLine1(e.target.value)}
                className="w-full bg-navy-900 border border-navy-600 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-code text-slate-300 mb-1.5">Hero Destaque Gradiente</label>
              <input
                type="text"
                maxLength={80}
                value={heroTitleHighlight}
                onChange={(e) => setHeroTitleHighlight(e.target.value)}
                className="w-full bg-navy-900 border border-navy-600 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-code text-slate-300 mb-1.5">Descrição do Hero</label>
            <textarea
              rows={2}
              maxLength={500}
              value={heroDescription}
              onChange={(e) => setHeroDescription(e.target.value)}
              className="w-full bg-navy-900 border border-navy-600 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-indigo-500"
            />
          </div>

          {/* Estatísticas (4 cards) */}
          {statItems.length > 0 && (
            <div className="space-y-3 pt-2 border-t border-navy-700">
              <div className="text-xs font-code text-cyan-400 uppercase">Cards de Estatísticas da Landing</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {statItems.map((st, idx) => (
                  <div key={idx} className="bg-navy-900 border border-navy-600 rounded-xl p-3 space-y-2">
                    <input
                      type="text"
                      value={st.value}
                      onChange={(e) =>
                        setStatItems((prev) =>
                          prev.map((item, i) => (i === idx ? { ...item, value: e.target.value } : item))
                        )
                      }
                      placeholder="Valor (ex: 24–48h)"
                      className="w-full bg-navy-800 border border-navy-600 rounded-lg px-2.5 py-1.5 text-xs text-white font-code"
                    />
                    <input
                      type="text"
                      value={st.label}
                      onChange={(e) =>
                        setStatItems((prev) =>
                          prev.map((item, i) => (i === idx ? { ...item, label: e.target.value } : item))
                        )
                      }
                      placeholder="Rótulo"
                      className="w-full bg-navy-800 border border-navy-600 rounded-lg px-2.5 py-1.5 text-xs text-slate-300"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Contato, CTA e Parceiros */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-navy-700">
            <div>
              <label className="block text-xs font-code text-slate-300 mb-1.5">E-mail de Contato</label>
              <input
                type="email"
                maxLength={160}
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
                className="w-full bg-navy-900 border border-navy-600 rounded-xl px-3.5 py-2 text-sm text-white font-code focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-code text-slate-300 mb-1.5">Local / Coordenação</label>
              <input
                type="text"
                maxLength={160}
                value={contactLocation}
                onChange={(e) => setContactLocation(e.target.value)}
                className="w-full bg-navy-900 border border-navy-600 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-code text-slate-300 mb-1.5">Título CTA Final</label>
              <input
                type="text"
                maxLength={160}
                value={ctaTitle}
                onChange={(e) => setCtaTitle(e.target.value)}
                className="w-full bg-navy-900 border border-navy-600 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-code text-slate-300 mb-1.5">Parceiros (1 por linha)</label>
              <textarea
                rows={3}
                value={partnersText}
                onChange={(e) => setPartnersText(e.target.value)}
                className="w-full bg-navy-900 border border-navy-600 rounded-xl p-2.5 text-xs text-white focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          <div className="flex justify-end pt-2 border-t border-navy-700">
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white rounded-xl text-xs font-semibold shadow-lg shadow-indigo-600/30 transition flex items-center space-x-2"
            >
              {saving ? (
                <i className="fa-solid fa-circle-notch fa-spin" />
              ) : (
                <i className="fa-solid fa-floppy-disk" />
              )}
              <span>{saving ? 'Salvando...' : 'Salvar Configurações do Evento'}</span>
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
