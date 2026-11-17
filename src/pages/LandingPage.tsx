import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getDashboardPathForRole, useAuth } from '../contexts/AuthContext';
import { useEventData } from '../hooks/useEventData';
import { getCountdownParts, useServerTimeOffset } from '../lib/serverTime';

export function LandingPage() {
  const { user, role, signOut } = useAuth();
  const { settings, stats, criteria, scheduleItems, rules, faqItems, publicJurors, loading, error, refetch } =
    useEventData();
  const offsetMs = useServerTimeOffset();
  const [tick, setTick] = useState(0);
  const [openAccordions, setOpenAccordions] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  // Re-evaluate countdown every second using tick
  void tick;
  const targetMs = settings?.startsAt ? settings.startsAt.toMillis() : null;
  const countdown = getCountdownParts(targetMs, offsetMs);

  const toggleAccordion = (id: string) => {
    setOpenAccordions((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-navy-900 text-slate-200">
        <div className="border-b border-navy-600 px-6 py-4 flex items-center justify-between">
          <div className="h-9 w-48 bg-navy-800 rounded-xl animate-pulse" />
          <div className="h-9 w-56 bg-navy-800 rounded-xl animate-pulse" />
        </div>
        <div className="max-w-5xl mx-auto px-6 py-20 space-y-6 text-center">
          <div className="h-6 w-64 bg-navy-800 rounded-full mx-auto animate-pulse" />
          <div className="h-14 w-3/4 bg-navy-800 rounded-2xl mx-auto animate-pulse" />
          <div className="h-24 max-w-lg bg-navy-800 rounded-2xl mx-auto animate-pulse" />
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 pt-12">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-36 bg-navy-800 border border-navy-600 rounded-2xl animate-pulse" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error || !settings) {
    return (
      <div className="min-h-screen bg-navy-900 bg-grid-pattern flex items-center justify-center p-6">
        <div className="bg-navy-800 border border-navy-600 rounded-2xl p-8 max-w-md w-full text-center space-y-4 shadow-2xl">
          <div className="w-12 h-12 rounded-full bg-rose-950/80 border border-rose-500/40 flex items-center justify-center text-rose-400 text-xl mx-auto">
            <i className="fa-solid fa-triangle-exclamation" />
          </div>
          <h1 className="font-heading font-bold text-lg text-white">
            {error ? 'Erro ao carregar evento' : 'Evento aguardando configuração'}
          </h1>
          <p className="text-xs text-slate-400 leading-relaxed">
            {error ||
              'Os dados iniciais da plataforma ainda não foram populados no Firestore. Acesse o painel da Organização (/admin) e clique em "Carregar conteúdo inicial".'}
          </p>
          <div className="flex flex-col sm:flex-row gap-3 pt-2 justify-center">
            <button
              type="button"
              onClick={() => void refetch()}
              className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold transition"
            >
              <i className="fa-solid fa-rotate-right me-1.5" />
              Tentar novamente
            </button>
            <Link
              to="/login"
              className="px-5 py-2.5 bg-navy-900 hover:bg-navy-700 text-slate-200 rounded-xl border border-navy-600 text-xs font-semibold transition"
            >
              Ir para Login
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const statColorClass: Record<string, string> = {
    indigo: 'text-indigo-400',
    cyan: 'text-cyan-400',
    emerald: 'text-emerald-400',
    amber: 'text-amber-400',
  };

  const stepBadgeClass: Record<string, string> = {
    indigo: 'bg-indigo-950 text-indigo-400 border-indigo-500/30',
    cyan: 'bg-cyan-950 text-cyan-400 border-cyan-500/30',
    emerald: 'bg-emerald-950 text-emerald-400 border-emerald-500/30',
    amber: 'bg-amber-950 text-amber-400 border-amber-500/30',
  };

  const criterionBadgeClass: Record<string, string> = {
    indigo: 'text-indigo-400 bg-indigo-950 border-indigo-500/30',
    cyan: 'text-cyan-400 bg-cyan-950 border-cyan-500/30',
    emerald: 'text-emerald-400 bg-emerald-950 border-emerald-500/30',
    amber: 'text-amber-400 bg-amber-950 border-amber-500/30',
    purple: 'text-purple-400 bg-purple-950 border-purple-500/30',
  };

  const jurorThemeClass: Record<string, { ring: string; text: string }> = {
    'indigo-cyan': { ring: 'from-indigo-500 to-cyan-400', text: 'text-cyan-300' },
    'cyan-emerald': { ring: 'from-cyan-400 to-emerald-400', text: 'text-emerald-300' },
    'purple-indigo': { ring: 'from-purple-500 to-indigo-500', text: 'text-purple-300' },
    'amber-rose': { ring: 'from-amber-400 to-rose-400', text: 'text-amber-300' },
  };

  const scheduleDotClass: Record<string, { dot: string; text: string; cardBorder: string }> = {
    indigo: { dot: 'bg-indigo-600', text: 'text-cyan-400', cardBorder: 'border-navy-600' },
    cyan: { dot: 'bg-cyan-400', text: 'text-cyan-400', cardBorder: 'border-navy-600' },
    amber: { dot: 'bg-amber-400', text: 'text-amber-400', cardBorder: 'border-navy-600 border-l-4 border-l-amber-400' },
    emerald: { dot: 'bg-emerald-400', text: 'text-emerald-400', cardBorder: 'border-navy-600' },
  };

  const spotsRemaining = Math.max(0, (settings.maxTeams ?? 25) - (stats?.teamCount ?? 0));

  return (
    <div className="min-h-screen bg-navy-900 text-slate-200 flex flex-col">
      {/* Navbar */}
      <nav className="sticky top-0 z-40 bg-navy-900/90 backdrop-blur-md border-b border-navy-600 px-6 py-4 flex items-center justify-between">
        <Link to="/" className="flex items-center space-x-3 shrink-0">
          <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center font-code font-bold text-white text-sm shadow-md">
            {'{IF}'}
          </div>
          <div>
            <span className="text-xs font-code text-indigo-400 font-semibold block">{settings.heroTag}</span>
            <span className="text-sm font-heading font-bold text-white">{settings.eventSubtitle}</span>
          </div>
        </Link>

        {/* Desktop Links */}
        <div className="hidden md:flex items-center space-x-6 text-xs font-medium text-slate-300">
          <a href="#sobre" className="hover:text-cyan-400 transition whitespace-nowrap">
            Sobre
          </a>
          <a href="#cronograma" className="hover:text-cyan-400 transition whitespace-nowrap">
            Cronograma
          </a>
          <a href="#regras" className="hover:text-cyan-400 transition whitespace-nowrap">
            Regras
          </a>
          <a href="#avaliacao" className="hover:text-cyan-400 transition whitespace-nowrap">
            Avaliação
          </a>
          <a href="#faq" className="hover:text-cyan-400 transition whitespace-nowrap">
            FAQ
          </a>
        </div>

        <div className="flex items-center space-x-3 shrink-0">
          {user && role ? (
            <>
              <Link
                to={getDashboardPathForRole(role)}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/20 transition whitespace-nowrap"
              >
                Acessar Painel
              </Link>
              <button
                type="button"
                onClick={() => void signOut()}
                className="px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-300 hover:text-white border border-navy-600 hover:border-slate-500 transition whitespace-nowrap"
              >
                Sair
              </button>
            </>
          ) : (
            <>
              <Link
                to="/login"
                className="px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-300 hover:text-white border border-navy-600 hover:border-slate-500 transition whitespace-nowrap"
              >
                Entrar
              </Link>
              <Link
                to="/registrar"
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/20 transition whitespace-nowrap"
              >
                Registrar equipe
              </Link>
            </>
          )}
        </div>
      </nav>

      {/* Hero Section */}
      <div className="relative px-6 py-16 sm:py-24 max-w-5xl mx-auto text-center bg-grid-pattern w-full">
        <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-indigo-950/80 border border-indigo-500/30 text-indigo-300 text-xs font-code mb-6">
          <i className="fa-solid fa-location-dot text-cyan-400" />
          <span>{settings.heroBadge}</span>
        </div>

        <h1 className="text-3xl sm:text-5xl lg:text-6xl font-heading font-extrabold text-white tracking-tight leading-tight mb-6">
          {settings.heroTitleLine1} <br className="hidden sm:inline" />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 via-cyan-400 to-emerald-400">
            {settings.heroTitleHighlight}
          </span>
        </h1>

        <p className="text-slate-300 text-sm sm:text-lg max-w-2xl mx-auto leading-relaxed mb-8">
          {settings.heroDescription}
        </p>

        {/* Countdown Component */}
        <div className="bg-navy-800/80 border border-navy-600 rounded-2xl p-4 sm:p-6 max-w-lg mx-auto mb-10 shadow-xl backdrop-blur">
          <div className="text-xs font-code text-cyan-400 mb-3 flex items-center justify-center space-x-2">
            <i className="fa-solid fa-stopwatch animate-pulse" />
            <span>{countdown.expired ? 'EVENTO EM ANDAMENTO' : 'CONTAGEM REGRESSIVA PARA O INÍCIO'}</span>
          </div>
          <div className="grid grid-cols-4 gap-2 text-center font-code tabular-nums">
            <div className="bg-navy-900 p-2 sm:p-3 rounded-xl border border-navy-600">
              <span className="block text-xl sm:text-3xl font-bold text-white">{countdown.days}</span>
              <span className="text-[10px] text-slate-400 uppercase">Dias</span>
            </div>
            <div className="bg-navy-900 p-2 sm:p-3 rounded-xl border border-navy-600">
              <span className="block text-xl sm:text-3xl font-bold text-white">{countdown.hours}</span>
              <span className="text-[10px] text-slate-400 uppercase">Horas</span>
            </div>
            <div className="bg-navy-900 p-2 sm:p-3 rounded-xl border border-navy-600">
              <span className="block text-xl sm:text-3xl font-bold text-white">{countdown.mins}</span>
              <span className="text-[10px] text-slate-400 uppercase">Min</span>
            </div>
            <div className="bg-navy-900 p-2 sm:p-3 rounded-xl border border-navy-600">
              <span className="block text-xl sm:text-3xl font-bold text-cyan-400">{countdown.secs}</span>
              <span className="text-[10px] text-slate-400 uppercase">Seg</span>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link
            to={user && role ? getDashboardPathForRole(role) : '/registrar'}
            className="w-full sm:w-auto px-8 py-4 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl shadow-xl shadow-indigo-600/30 transition text-sm flex items-center justify-center space-x-2"
          >
            <i className="fa-solid fa-users-rectangle" />
            <span>
              {user && role
                ? 'Ir para minha área'
                : spotsRemaining === 0
                  ? 'Vagas esgotadas'
                  : 'Registrar minha equipe'}
            </span>
          </Link>
          <a
            href="#regras"
            className="w-full sm:w-auto px-8 py-4 bg-navy-800 hover:bg-navy-700 text-slate-200 font-semibold rounded-xl border border-navy-600 transition text-sm flex items-center justify-center space-x-2"
          >
            <i className="fa-solid fa-book-bookmark text-cyan-400" />
            <span>Ver regras do evento</span>
          </a>
        </div>
      </div>

      {/* Stats Strip */}
      <div className="border-y border-navy-600 bg-navy-800/50 py-8 px-6">
        <div className="max-w-6xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
          {(settings.stats || []).map((st, idx) => (
            <div key={idx}>
              <div className={`font-heading font-bold text-2xl sm:text-3xl font-code ${statColorClass[st.color] || 'text-indigo-400'}`}>
                {st.value}
              </div>
              <div className="text-xs text-slate-400 mt-1">{st.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Como Funciona Section */}
      <div id="sobre" className="max-w-6xl mx-auto px-6 py-16 w-full">
        <div className="text-center mb-12">
          <span className="text-xs font-code text-cyan-400 font-semibold uppercase tracking-wider">PASSO A PASSO</span>
          <h2 className="text-2xl sm:text-3xl font-heading font-bold text-white mt-1">Como funciona a maratona</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          {(settings.steps || []).map((step, idx) => (
            <div
              key={idx}
              className="bg-navy-800 p-6 rounded-2xl border border-navy-600 relative hover:border-indigo-500/50 transition"
            >
              <div
                className={`w-10 h-10 rounded-xl font-code font-bold flex items-center justify-center mb-4 border ${
                  stepBadgeClass[step.color] || stepBadgeClass.indigo
                }`}
              >
                {step.number}
              </div>
              <h3 className="font-heading font-bold text-white text-base mb-2">{step.title}</h3>
              <p className="text-xs text-slate-400 leading-relaxed">{step.description}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Cronograma Section */}
      <div id="cronograma" className="bg-navy-800/30 border-y border-navy-600 py-16 px-6">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <span className="text-xs font-code text-indigo-400 font-semibold uppercase tracking-wider">LINHA DO TEMPO</span>
            <h2 className="text-2xl sm:text-3xl font-heading font-bold text-white mt-1">Cronograma do Evento</h2>
          </div>

          <div className="relative border-l-2 border-indigo-500/30 ml-4 sm:ml-32 space-y-8">
            {scheduleItems.map((item) => {
              const st = scheduleDotClass[item.accent] || scheduleDotClass.indigo;
              return (
                <div key={item.id} className="relative pl-6 sm:pl-8">
                  <div className={`absolute -left-[9px] top-1.5 w-4 h-4 rounded-full border-4 border-navy-900 ${st.dot}`} />
                  <div className={`sm:absolute sm:-left-36 sm:top-1 font-code text-xs font-semibold mb-1 sm:mb-0 ${st.text}`}>
                    {item.timeLabel}
                  </div>
                  <div className={`bg-navy-800 p-4 rounded-xl border ${st.cardBorder}`}>
                    <h4 className="font-heading font-bold text-white text-sm">{item.title}</h4>
                    <p className="text-xs text-slate-400 mt-1">{item.description}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Critérios de Avaliação Section */}
      <div id="avaliacao" className="max-w-6xl mx-auto px-6 py-16 w-full">
        <div className="text-center mb-12">
          <span className="text-xs font-code text-cyan-400 font-semibold uppercase tracking-wider">TRANSPARÊNCIA</span>
          <h2 className="text-2xl sm:text-3xl font-heading font-bold text-white mt-1">Critérios de Avaliação</h2>
          <p className="text-slate-400 text-xs sm:text-sm mt-2">
            Cada jurado atribuirá notas de 0 a 10 com os seguintes pesos definidos no regulamento.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {criteria.map((c, idx) => (
            <div
              key={c.key}
              className={`bg-navy-800 p-6 rounded-2xl border border-navy-600 ${
                idx === criteria.length - 1 && criteria.length % 3 === 2 ? 'md:col-span-2' : ''
              }`}
            >
              <div className="flex justify-between items-center mb-4">
                <span
                  className={`text-xs font-code font-bold px-2.5 py-1 rounded-lg border ${
                    criterionBadgeClass[c.color] || criterionBadgeClass.indigo
                  }`}
                >
                  Peso {c.weight}%
                </span>
                <span className="text-xs text-slate-400 font-code">Nota 0–10</span>
              </div>
              <h3 className="font-heading font-bold text-white text-lg mb-2">{c.name}</h3>
              <p className="text-xs text-slate-400 leading-relaxed">{c.description}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Jurados Section */}
      <div className="bg-navy-800/30 border-y border-navy-600 py-16 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <span className="text-xs font-code text-cyan-400 font-semibold uppercase tracking-wider">BANCA EXAMINADORA</span>
            <h2 className="text-2xl sm:text-3xl font-heading font-bold text-white mt-1">Jurados Confirmados</h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {publicJurors.map((juror) => {
              const theme = jurorThemeClass[juror.colorTheme] || jurorThemeClass['indigo-cyan'];
              return (
                <div key={juror.id} className="bg-navy-800 p-5 rounded-2xl border border-navy-600 text-center">
                  <div className={`w-20 h-20 rounded-full bg-gradient-to-tr ${theme.ring} p-1 mx-auto mb-4`}>
                    <div className={`w-full h-full rounded-full bg-navy-900 flex items-center justify-center text-xl font-bold font-code ${theme.text}`}>
                      {juror.initials}
                    </div>
                  </div>
                  <h4 className="font-heading font-bold text-white text-base">{juror.name}</h4>
                  <p className="text-xs text-indigo-400 mt-0.5">{juror.role}</p>
                  <span className="inline-block mt-3 px-2.5 py-1 rounded bg-navy-900 text-[11px] text-slate-400 font-code border border-navy-700">
                    {juror.institution}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Regras & FAQ Accordion Section */}
      <div id="regras" className="max-w-4xl mx-auto px-6 py-16 space-y-12 w-full">
        {/* Regras Accordion */}
        <div>
          <h2 className="text-xl sm:text-2xl font-heading font-bold text-white mb-6 flex items-center space-x-2">
            <i className="fa-solid fa-scroll text-indigo-400" />
            <span>Regulamento & Diretrizes</span>
          </h2>
          <div className="space-y-3">
            {rules.map((rule) => {
              const isOpen = !!openAccordions[`rule-${rule.id}`];
              return (
                <div key={rule.id} className="bg-navy-800 rounded-xl border border-navy-600 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => toggleAccordion(`rule-${rule.id}`)}
                    className="w-full p-4 text-left font-medium text-sm text-white flex justify-between items-center hover:bg-navy-700/50 transition"
                  >
                    <span>{rule.title}</span>
                    <i
                      className={`fa-solid fa-chevron-down text-slate-400 transition-transform ${
                        isOpen ? 'rotate-180' : ''
                      }`}
                    />
                  </button>
                  {isOpen && (
                    <div className="p-4 pt-3 text-xs text-slate-400 border-t border-navy-700/50 leading-relaxed">
                      {rule.content}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* FAQ Accordion */}
        <div id="faq">
          <h2 className="text-xl sm:text-2xl font-heading font-bold text-white mb-6 flex items-center space-x-2">
            <i className="fa-solid fa-circle-question text-cyan-400" />
            <span>Perguntas Frequentes (FAQ)</span>
          </h2>
          <div className="space-y-3">
            {faqItems.map((faq) => {
              const isOpen = !!openAccordions[`faq-${faq.id}`];
              return (
                <div key={faq.id} className="bg-navy-800 rounded-xl border border-navy-600 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => toggleAccordion(`faq-${faq.id}`)}
                    className="w-full p-4 text-left font-medium text-sm text-white flex justify-between items-center hover:bg-navy-700/50 transition"
                  >
                    <span>{faq.question}</span>
                    <i
                      className={`fa-solid fa-chevron-down text-slate-400 transition-transform ${
                        isOpen ? 'rotate-180' : ''
                      }`}
                    />
                  </button>
                  {isOpen && (
                    <div className="p-4 pt-3 text-xs text-slate-400 border-t border-navy-700/50 leading-relaxed">
                      {faq.answer}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Final CTA */}
      <div className="bg-gradient-to-r from-indigo-900/60 via-navy-800 to-cyan-950/60 border-t border-navy-600 py-16 px-6 text-center">
        <div className="max-w-2xl mx-auto">
          <h2 className="text-2xl sm:text-3xl font-heading font-bold text-white mb-4">{settings.ctaTitle}</h2>
          <p className="text-slate-300 text-xs sm:text-sm mb-8">{settings.ctaDescription}</p>
          <Link
            to={user && role ? getDashboardPathForRole(role) : '/registrar'}
            className="inline-block px-8 py-4 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl shadow-xl shadow-indigo-600/30 transition text-sm"
          >
            {user && role ? 'Acessar minha área' : 'Registrar equipe agora'}
          </Link>
        </div>
      </div>

      {/* Footer */}
      <footer className="bg-navy-950 border-t border-navy-600 py-12 px-6 text-xs text-slate-400 mt-auto">
        <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
          <div>
            <div className="flex items-center space-x-2 font-code font-bold text-white text-sm mb-3">
              <span className="text-indigo-400">{'{ IFPR }'}</span>
              <span>Hackathon CC</span>
            </div>
            <p className="text-slate-400 text-[11px] leading-relaxed">
              Realização do Curso de Ciência da Computação do Instituto Federal do Paraná (IFPR).
            </p>
          </div>

          <div>
            <h5 className="font-heading font-bold text-white mb-3">Apoio & Parceiros</h5>
            <div className="space-y-1.5 text-[11px] text-slate-400 font-code">
              {(settings.partners || []).map((partner, idx) => (
                <div key={idx}>• {partner}</div>
              ))}
            </div>
          </div>

          <div>
            <h5 className="font-heading font-bold text-white mb-3">Contato</h5>
            <p className="text-[11px]">{settings.contactEmail}</p>
            <p className="text-[11px] mt-1">{settings.contactLocation}</p>
          </div>

          <div>
            <h5 className="font-heading font-bold text-white mb-3">Links Rápidos</h5>
            <div className="space-y-1 text-[11px]">
              <div>
                <a href="#sobre" className="hover:text-cyan-400">
                  Sobre o evento
                </a>
              </div>
              <div>
                <a href="#regras" className="hover:text-cyan-400">
                  Regulamento oficial
                </a>
              </div>
              <div>
                <Link to="/login" className="hover:text-cyan-400">
                  Área do Participante
                </Link>
              </div>
            </div>
          </div>
        </div>

        <div className="max-w-6xl mx-auto border-t border-navy-800 pt-6 flex flex-col sm:flex-row justify-between items-center text-[11px] text-slate-500">
          <div>© 2026 IFPR - Instituto Federal do Paraná. Todos os direitos reservados.</div>
          <div className="font-code mt-2 sm:mt-0">Plataforma Oficial de Submissão e Avaliação</div>
        </div>
      </footer>
    </div>
  );
}
