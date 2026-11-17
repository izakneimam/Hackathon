import type { Timestamp } from 'firebase/firestore';

export type UserRoleType = 'participante' | 'jurado' | 'organizacao';

export type ProjectStatus = 'rascunho' | 'enviado' | 'avaliado' | 'encerrado';

export type CriterionKey = 'inovacao' | 'tecnica' | 'demo' | 'impacto' | 'pitch';

export interface StatItem {
  value: string;
  label: string;
  color: 'indigo' | 'cyan' | 'emerald' | 'amber';
}

export interface StepItem {
  number: string;
  title: string;
  description: string;
  color: 'indigo' | 'cyan' | 'emerald' | 'amber';
}

export interface EventSettings {
  eventTitle: string;
  eventSubtitle: string;
  campusLabel: string;
  heroBadge: string;
  heroTag: string;
  heroTitleLine1: string;
  heroTitleHighlight: string;
  heroDescription: string;
  loginShowcaseHeadline: string;
  loginShowcaseDescription: string;
  loginDurationLabel: string;
  loginTeamsRangeLabel: string;
  startsAt: Timestamp;
  submissionDeadline: Timestamp;
  maxTeams: number;
  teamMinMembers: number;
  teamMaxMembers: number;
  maxExternalMembers: number;
  evaluationOpen: boolean;
  gradesReleased: boolean;
  stats: StatItem[];
  steps: StepItem[];
  partners: string[];
  contactEmail: string;
  contactLocation: string;
  ctaTitle: string;
  ctaDescription: string;
  updatedAt?: Timestamp;
}

export interface PublicStats {
  teamCount: number;
  updatedAt?: Timestamp;
}

export interface CriterionDoc {
  key: CriterionKey;
  name: string;
  description: string;
  weight: number;
  color: 'indigo' | 'cyan' | 'emerald' | 'amber' | 'purple';
  order: number;
}

export interface ScheduleItemDoc {
  id: string;
  timeLabel: string;
  title: string;
  description: string;
  accent: 'indigo' | 'cyan' | 'amber' | 'emerald';
  order: number;
}

export interface RuleItemDoc {
  id: string;
  title: string;
  content: string;
  order: number;
}

export interface FaqItemDoc {
  id: string;
  question: string;
  answer: string;
  order: number;
}

export interface PublicJurorDoc {
  id: string;
  name: string;
  initials: string;
  role: string;
  institution: string;
  colorTheme: 'indigo-cyan' | 'cyan-emerald' | 'purple-indigo' | 'amber-rose';
  order: number;
}

export interface UserProfile {
  uid: string;
  name: string;
  email: string;
  pendingTeamName?: string;
  teamId?: string;
  lgpdAccepted: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface UserRoleDoc {
  role: UserRoleType;
  email: string;
  updatedAt: Timestamp;
}

export interface TeamDoc {
  id: string;
  name: string;
  number: number;
  leaderUid: string;
  leaderName: string;
  leaderEmail: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface TeamMemberDoc {
  id: string;
  name: string;
  email: string;
  normalizedEmail: string;
  course: string;
  semester: string;
  isExternal: boolean;
  isLeader: boolean;
  createdAt: Timestamp;
}

export interface ScreenshotItem {
  path: string;
  name: string;
  size: number;
}

export interface ProjectDoc {
  teamId: string;
  leaderUid: string;
  teamName: string;
  teamNumber: number;
  name: string;
  shortDescription: string;
  fullDescription: string;
  track: string;
  technologies: string[];
  githubUrl: string;
  isRepoPublicDeclared: boolean;
  demoUrl: string;
  slidesUrl?: string;
  slidesPath: string;
  slidesName: string;
  slidesSize: number;
  screenshots: ScreenshotItem[];
  status: ProjectStatus;
  submittedAt?: Timestamp;
  updatedAt: Timestamp;
}

export interface EvaluationScores {
  inovacao: number;
  tecnica: number;
  demo: number;
  impacto: number;
  pitch: number;
}

export interface EvaluationDoc {
  id: string;
  projectId: string;
  jurorUid: string;
  jurorName: string;
  scores: EvaluationScores;
  comment: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface ResultDoc {
  projectId: string;
  teamName: string;
  teamNumber: number;
  projectName: string;
  track: string;
  averageCriteria: EvaluationScores;
  finalScore: number;
  evaluationCount: number;
  rank: number;
  comments: string[];
  updatedAt: Timestamp;
}
