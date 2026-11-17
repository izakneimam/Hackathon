import { doc, getDoc, serverTimestamp, Timestamp, writeBatch } from 'firebase/firestore';
import { db } from './firebase';
import { handleFirestoreError, OperationType } from './firestoreError';

export async function seedInitialContent(): Promise<{ createdStats: boolean }> {
  const nowMs = Date.now();
  const startsAt = Timestamp.fromMillis(nowMs + 14 * 24 * 60 * 60 * 1000);
  const submissionDeadline = Timestamp.fromMillis(nowMs + 16 * 24 * 60 * 60 * 1000);

  let statsExists = false;
  try {
    const statsSnap = await getDoc(doc(db, 'stats', 'public'));
    statsExists = statsSnap.exists();
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, 'stats/public');
  }

  const batch = writeBatch(db);

  // 1. Configurações do evento e conteúdo da Landing / Login
  batch.set(
    doc(db, 'settings', 'event'),
    {
      eventTitle: '1º Hackathon de Ciência da Computação – IFPR',
      eventSubtitle: 'Ciência da Computação IFPR',
      campusLabel: 'IFPR Campus Pinhais / Curitiba',
      heroBadge: 'Presencial • Campus IFPR • Maratona Acadêmica',
      heroTag: '1º HACKATHON',
      heroTitleLine1: '1º Hackathon de',
      heroTitleHighlight: 'Ciência da Computação',
      heroDescription:
        'Desenvolva soluções tecnológicas inovadoras, aprenda com mentores da indústria e apresente seu projeto para uma banca examinadora em 24 a 48 horas de imersão.',
      loginShowcaseHeadline: 'Construa. Entregue. Seja avaliado.',
      loginShowcaseDescription:
        'Maratona intensiva de programação e solução de problemas para alunos de Ciência da Computação e cursos correlatos do IFPR.',
      loginDurationLabel: '24–48h',
      loginTeamsRangeLabel: '15–25',
      startsAt,
      submissionDeadline,
      maxTeams: 25,
      teamMinMembers: 3,
      teamMaxMembers: 5,
      maxExternalMembers: 1,
      evaluationOpen: true,
      gradesReleased: false,
      stats: [
        { value: '15–25', label: 'Equipes Vagas Limitadas', color: 'indigo' },
        { value: '3–5', label: 'Integrantes por equipe', color: 'cyan' },
        { value: '24–48h', label: 'Duração da Maratona', color: 'emerald' },
        { value: 'R$ 5.000+', label: 'Prêmios & Certificados', color: 'amber' },
      ],
      steps: [
        {
          number: '01',
          title: '1. Registre a equipe',
          description: 'Monte seu time de 3 a 5 alunos e faça o cadastro oficial até a data limite.',
          color: 'indigo',
        },
        {
          number: '02',
          title: '2. Desenvolva o projeto',
          description: 'Crie protótipos de software ou hardware durante as horas de coding presencial no IFPR.',
          color: 'cyan',
        },
        {
          number: '03',
          title: '3. Envie a entrega',
          description: 'Submeta o repositório GitHub, link de demonstração e PDF da apresentação do pitch.',
          color: 'emerald',
        },
        {
          number: '04',
          title: '4. Seja avaliado',
          description: 'Apresente para os jurados e receba notas transparentes divididas por critérios.',
          color: 'amber',
        },
      ],
      partners: [
        'Diretoria de Pesquisa e Extensão',
        'Empresa Júnior de Tecnologia',
        'Comunidade Tech Local',
      ],
      contactEmail: 'hackathon.cc@ifpr.edu.br',
      contactLocation: 'Campus IFPR - Coordenação de Computação',
      ctaTitle: 'Sua equipe está pronta para o desafio?',
      ctaDescription:
        'As vagas são limitadas para garantir a melhor infraestrutura de laboratório para todos.',
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );

  // 2. Contador público (idempotente: não sobrescreve teamCount se já existir)
  if (!statsExists) {
    batch.set(doc(db, 'stats', 'public'), {
      teamCount: 0,
      updatedAt: serverTimestamp(),
    });
  }

  // 3. Critérios de avaliação (soma = 100)
  const criteriaData = [
    {
      key: 'inovacao',
      name: 'Inovação e Originalidade',
      description: 'Originalidade da proposta, criatividade na solução do problema e uso inteligente da tecnologia.',
      weight: 30,
      color: 'indigo',
      order: 1,
    },
    {
      key: 'tecnica',
      name: 'Qualidade Técnica',
      description: 'Arquitetura de código, boas práticas de desenvolvimento, segurança e utilização do repositório.',
      weight: 25,
      color: 'cyan',
      order: 2,
    },
    {
      key: 'demo',
      name: 'Funcionamento da Demo',
      description: 'Estabilidade do protótipo funcional ao vivo, ausência de falhas graves e navegabilidade da interface.',
      weight: 20,
      color: 'emerald',
      order: 3,
    },
    {
      key: 'impacto',
      name: 'Impacto e Utilidade',
      description: 'Potencial de aplicação real da solução, benefício para a comunidade ou relevância do problema resolvido.',
      weight: 15,
      color: 'amber',
      order: 4,
    },
    {
      key: 'pitch',
      name: 'Apresentação / Pitch',
      description: 'Clareza e objetividade na apresentação oral da equipe dentro do tempo limite de 3 minutos.',
      weight: 10,
      color: 'purple',
      order: 5,
    },
  ];
  for (const c of criteriaData) {
    batch.set(doc(db, 'criteria', c.key), c);
  }

  // 4. Cronograma (IDs fixos para idempotência)
  const scheduleData = [
    {
      id: 'item-1',
      timeLabel: '08:00 • Dia 1',
      title: 'Abertura e Check-in Presencial',
      description: 'Credenciamento no auditório principal, anúncio do tema surpresa e briefing inicial.',
      accent: 'indigo',
      order: 1,
    },
    {
      id: 'item-2',
      timeLabel: '10:00 • Dia 1',
      title: 'Início da Maratona de Código',
      description: 'Liberação dos laboratórios de informática e espaços colaborativos.',
      accent: 'indigo',
      order: 2,
    },
    {
      id: 'item-3',
      timeLabel: '15:00 • Dia 1',
      title: 'Sessão de Mentorias Técnicas',
      description: 'Professores e mentores de mercado tiram dúvidas de arquitetura e pitch.',
      accent: 'cyan',
      order: 3,
    },
    {
      id: 'item-4',
      timeLabel: '12:00 • Dia 2',
      title: 'Prazo Limite de Envio na Plataforma',
      description: 'Encerramento das submissões de código no sistema oficial.',
      accent: 'amber',
      order: 4,
    },
    {
      id: 'item-5',
      timeLabel: '14:00 • Dia 2',
      title: 'Apresentações dos Pitches & Avaliação',
      description: 'Apresentação de 3 minutos para a banca de jurados no auditório.',
      accent: 'emerald',
      order: 5,
    },
  ];
  for (const item of scheduleData) {
    const { id, ...rest } = item;
    batch.set(doc(db, 'scheduleItems', id), rest);
  }

  // 5. Jurados confirmados
  const jurorsData = [
    {
      id: 'juror-1',
      name: 'Prof. Dr. Ricardo Silva',
      initials: 'DR',
      role: 'Docente de IA & Algoritmos',
      institution: 'IFPR Campus Pinhais',
      colorTheme: 'indigo-cyan',
      order: 1,
    },
    {
      id: 'juror-2',
      name: 'Profa. Msc. Ana Mendes',
      initials: 'MS',
      role: 'Engenharia de Software',
      institution: 'IFPR Curitiba',
      colorTheme: 'cyan-emerald',
      order: 2,
    },
    {
      id: 'juror-3',
      name: 'Carlos Eduardo Santos',
      initials: 'TL',
      role: 'Tech Lead & Arquiteto Cloud',
      institution: 'Empresa Parceira Tech',
      colorTheme: 'purple-indigo',
      order: 3,
    },
    {
      id: 'juror-4',
      name: 'Beatriz Oliveira',
      initials: 'UX',
      role: 'Head de Produto & UX',
      institution: 'Polo Tecnológico',
      colorTheme: 'amber-rose',
      order: 4,
    },
  ];
  for (const j of jurorsData) {
    const { id, ...rest } = j;
    batch.set(doc(db, 'publicJurors', id), rest);
  }

  // 6. Regulamento
  const rulesData = [
    {
      id: 'rule-1',
      title: 'Quem pode participar do hackathon?',
      content:
        'O evento é voltado prioritariamente para alunos matriculados nos cursos de Ciência da Computação, Licenciatura em Computação e cursos técnicos correlatos do IFPR. Cada equipe pode ter até 1 membro convidado externo.',
      order: 1,
    },
    {
      id: 'rule-2',
      title: 'Código pré-existente e bibliotecas reutilizáveis',
      content:
        'Todo o código principal da aplicação deve ser escrito durante o período do hackathon. É permitido o uso de frameworks, bibliotecas open-source e APIs públicas pré-existentes.',
      order: 2,
    },
  ];
  for (const r of rulesData) {
    const { id, ...rest } = r;
    batch.set(doc(db, 'rules', id), rest);
  }

  // 7. FAQ
  const faqData = [
    {
      id: 'faq-1',
      question: 'O evento fornece alimentação no local?',
      answer:
        'Sim! Haverá infraestrutura com lanches, café contínuo e refeições organizadas para os participantes inscritos na maratona presencial.',
      order: 1,
    },
  ];
  for (const f of faqData) {
    const { id, ...rest } = f;
    batch.set(doc(db, 'faqItems', id), rest);
  }

  try {
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, 'settings/event');
  }

  return { createdStats: !statsExists };
}
