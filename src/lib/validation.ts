import { z } from 'zod';

export const IFPR_EMAIL_REGEX = /^[^\s@]+@(estudantes\.)?ifpr\.edu\.br$/i;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isIfprEmail(email: string): boolean {
  return IFPR_EMAIL_REGEX.test(email.trim());
}

export const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, 'Informe o e-mail institucional.')
    .email('Informe um e-mail válido.'),
  password: z
    .string()
    .min(6, 'A senha deve ter pelo menos 6 caracteres.'),
});

export const registerSchema = z
  .object({
    leaderName: z
      .string()
      .trim()
      .min(3, 'Informe seu nome completo (mínimo 3 caracteres).')
      .max(120, 'Nome muito longo (máximo 120 caracteres).'),
    teamName: z
      .string()
      .trim()
      .min(2, 'Informe o nome da equipe (mínimo 2 caracteres).')
      .max(80, 'Nome da equipe muito longo (máximo 80 caracteres).'),
    email: z
      .string()
      .trim()
      .email('Informe um e-mail válido.')
      .refine((val) => isIfprEmail(val), {
        message: 'Use um e-mail institucional @estudantes.ifpr.edu.br ou @ifpr.edu.br.',
      }),
    password: z
      .string()
      .min(6, 'A senha deve ter pelo menos 6 caracteres.')
      .max(72, 'A senha deve ter no máximo 72 caracteres.'),
    confirmPassword: z.string(),
    lgpdAccepted: z.boolean().refine((val) => val === true, {
      message: 'É necessário aceitar os termos de uso dos dados (LGPD).',
    }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'As senhas não conferem.',
    path: ['confirmPassword'],
  });

export const resetPasswordSchema = z
  .object({
    password: z
      .string()
      .min(6, 'A nova senha deve ter pelo menos 6 caracteres.')
      .max(72, 'A senha deve ter no máximo 72 caracteres.'),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'As senhas não conferem.',
    path: ['confirmPassword'],
  });

export const PROJECT_TRACKS = [
  'Inovação na Educação (EdTech)',
  'Sustentabilidade e Meio Ambiente',
  'Inteligência Artificial Aplicada',
  'Acessibilidade e Inclusão Digital',
] as const;

export const REPO_URL_REGEX = /^https:\/\/(github\.com|gitlab\.com)\/[^\s/]+\/[^\s/]+/i;
export const DEMO_URL_REGEX = /^https?:\/\/[^\s/$.?#].[^\s]*$/i;

export const teamMemberSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Informe o nome completo do integrante.')
    .max(120, 'Nome muito longo (máximo 120 caracteres).'),
  email: z
    .string()
    .trim()
    .email('Informe um e-mail válido.')
    .max(160, 'E-mail muito longo.'),
  course: z
    .string()
    .trim()
    .min(2, 'Informe o curso do integrante.')
    .max(120, 'Nome do curso muito longo.'),
  semester: z
    .string()
    .trim()
    .min(1, 'Informe o semestre ou vínculo.')
    .max(40, 'Semestre muito longo.'),
  isExternal: z.boolean(),
});

export interface SubmissionIssue {
  step: 1 | 2 | 3;
  message: string;
}

export function validateProjectForSubmission(params: {
  name: string;
  shortDescription: string;
  fullDescription: string;
  track: string;
  githubUrl: string;
  isRepoPublicDeclared: boolean;
  demoUrl: string;
  slidesUrl: string;
  screenshotsCount: number;
  membersCount: number;
  externalCount: number;
  minMembers?: number;
  maxMembers?: number;
  maxExternal?: number;
}): SubmissionIssue[] {
  const issues: SubmissionIssue[] = [];
  const minMembers = params.minMembers ?? 3;
  const maxMembers = params.maxMembers ?? 5;
  const maxExternal = params.maxExternal ?? 1;

  if (params.name.trim().length < 2 || params.name.trim().length > 140) {
    issues.push({ step: 1, message: 'Preencha o Nome do Projeto (2 a 140 caracteres).' });
  }
  if (params.shortDescription.trim().length < 10 || params.shortDescription.trim().length > 200) {
    issues.push({ step: 1, message: 'Preencha o Resumo Curto com 10 a 200 caracteres.' });
  }
  if (params.fullDescription.trim().length < 20 || params.fullDescription.trim().length > 4000) {
    issues.push({ step: 1, message: 'Preencha a Descrição Completa e Escopo (mínimo 20 caracteres).' });
  }
  if (!PROJECT_TRACKS.includes(params.track as (typeof PROJECT_TRACKS)[number])) {
    issues.push({ step: 1, message: 'Selecione uma Trilha / Tema Principal válida.' });
  }

  if (params.membersCount < minMembers || params.membersCount > maxMembers) {
    issues.push({
      step: 2,
      message: `A equipe deve possuir entre ${minMembers} e ${maxMembers} integrantes (atual: ${params.membersCount}).`,
    });
  }
  if (params.externalCount > maxExternal) {
    issues.push({
      step: 2,
      message: `Cada equipe pode ter no máximo ${maxExternal} integrante externo.`,
    });
  }

  if (!REPO_URL_REGEX.test(params.githubUrl.trim())) {
    issues.push({
      step: 3,
      message: 'Informe uma URL válida de repositório (https://github.com/... ou https://gitlab.com/...).',
    });
  }
  if (!params.isRepoPublicDeclared) {
    issues.push({
      step: 3,
      message: 'Marque a declaração confirmando que o repositório está público.',
    });
  }
  if (params.demoUrl.trim() && !DEMO_URL_REGEX.test(params.demoUrl.trim())) {
    issues.push({
      step: 3,
      message: 'O link da demonstração/vídeo informado não é uma URL válida (http:// ou https://).',
    });
  }
  if (!DEMO_URL_REGEX.test(params.slidesUrl.trim())) {
    issues.push({
      step: 3,
      message: 'Informe um link público válido para os slides do pitch (Google Drive, Canva, PDF, etc.).',
    });
  }
  if (params.screenshotsCount > 5) {
    issues.push({
      step: 3,
      message: 'São permitidos no máximo 5 screenshots.',
    });
  }

  return issues;
}

